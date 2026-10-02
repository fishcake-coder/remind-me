use crate::{write_json_atomically, ReminderState};
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{BufReader, Cursor},
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const MAX_AUDIO_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmSound {
    pub id: String,
    pub name: String,
    pub custom: bool,
    #[serde(default)]
    file: String,
}

enum AudioCommand {
    Sync(Option<(Uuid, String)>),
    Preview(String, mpsc::Sender<Result<(), String>>),
    StopPreview,
}

#[derive(Clone)]
pub struct AlarmState {
    sounds: Arc<Mutex<Vec<AlarmSound>>>,
    selected: Arc<Mutex<String>>,
    directory: PathBuf,
    sender: mpsc::Sender<AudioCommand>,
    error: Arc<Mutex<Option<String>>>,
}

impl AlarmState {
    pub fn start(app: AppHandle, directory: PathBuf) -> Self {
        let sounds = fs::read(directory.join("library.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let (sender, receiver) = mpsc::channel();
        let selected = fs::read(directory.join("selected.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_else(|| "classic".to_string());
        let state = Self {
            sounds: Arc::new(Mutex::new(sounds)),
            selected: Arc::new(Mutex::new(selected)),
            directory,
            sender,
            error: Arc::new(Mutex::new(None)),
        };
        let worker = state.clone();
        thread::spawn(move || audio_worker(app, worker, receiver));
        state
    }

    fn path(&self, id: &str) -> Result<PathBuf, String> {
        let builtin = match id {
            "classic" => Some("classic-alarm.wav"),
            "digital" => Some("digital-alarm.wav"),
            "sunrise" => Some("sunrise-alarm.wav"),
            _ => None,
        };
        if let Some(file) = builtin {
            return Ok(self.directory.join("builtins").join(file));
        }
        let sounds = self
            .sounds
            .lock()
            .map_err(|_| "Sound library is unavailable")?;
        let sound = sounds
            .iter()
            .find(|sound| sound.id == id)
            .ok_or("Choose an available alarm sound")?;
        // Only files within the imported library may be read by the audio worker.
        if sound.file.contains(['/', '\\']) || sound.file.starts_with('.') {
            return Err("Invalid sound file".into());
        }
        Ok(self.directory.join(&sound.file))
    }

    pub fn validate(&self, id: &str) -> Result<(), String> {
        let path = self.path(id)?;
        let file = File::open(path).map_err(|_| "Alarm sound is missing. Choose another sound.")?;
        let mut decoder =
            Decoder::try_from(file).map_err(|_| "This audio file cannot be played")?;
        if decoder.next().is_none() {
            return Err("This audio file is empty".into());
        }
        Ok(())
    }

    pub fn validate_selected(&self) -> Result<(), String> {
        let sound = self
            .selected
            .lock()
            .map_err(|_| "Alarm sound is unavailable")?
            .clone();
        self.validate(&sound)
    }

    pub fn sync(&self, reminders: &ReminderState) {
        // Read and send under the storage lock so stop/reschedule cannot enqueue
        // an older snapshot after a newer one and leave orphan audio playing.
        if let Ok(items) = reminders.reminders.lock() {
            let current = items
                .iter()
                .filter(|item| !item.completed && item.alarm_started_at.is_some())
                .min_by_key(|item| (item.scheduled_at, item.id))
                .map(|item| {
                    (
                        item.id,
                        self.selected
                            .lock()
                            .map(|sound| sound.clone())
                            .unwrap_or_else(|_| "classic".into()),
                    )
                });
            let _ = self.sender.send(AudioCommand::Sync(current));
        }
    }
}

fn set_error(app: &AppHandle, state: &AlarmState, error: Option<String>) {
    if let Ok(mut current) = state.error.lock() {
        if *current != error {
            *current = error;
            let _ = app.emit("alarm-audio-changed", ());
        }
    }
}

fn start_sound(
    state: &AlarmState,
    stream: &OutputStream,
    id: &str,
    looping: bool,
) -> Result<Sink, String> {
    let file = File::open(state.path(id)?).map_err(|_| "Audio file is unavailable")?;
    let sink = Sink::connect_new(stream.mixer());
    sink.set_volume(0.8);
    if looping {
        // LoopedDecoder rewinds the file rather than caching an entire decoded song.
        let decoder =
            Decoder::new_looped(BufReader::new(file)).map_err(|_| "Audio cannot be played")?;
        sink.append(decoder);
    } else {
        let decoder = Decoder::try_from(file).map_err(|_| "Audio cannot be played")?;
        sink.append(decoder.take_duration(Duration::from_secs(8)));
    }
    Ok(sink)
}

fn fallback_alarm(stream: &OutputStream) -> Sink {
    let samples: Vec<f32> = (0..22_050)
        .map(|index| {
            if index % 11_025 < 6_615 {
                (index as f32 * 880.0 * std::f32::consts::TAU / 22_050.0).sin() * 0.2
            } else {
                0.0
            }
        })
        .collect();
    let sink = Sink::connect_new(stream.mixer());
    sink.append(rodio::buffer::SamplesBuffer::new(1, 22_050, samples).repeat_infinite());
    sink
}

fn audio_worker(app: AppHandle, state: AlarmState, receiver: mpsc::Receiver<AudioCommand>) {
    let mut desired: Option<(Uuid, String)> = None;
    let mut playing: Option<(Uuid, String)> = None;
    let mut stream: Option<OutputStream> = None;
    let mut sink: Option<Sink> = None;
    let mut preview_until: Option<Instant> = None;
    let mut next_retry = Instant::now();
    let device_failed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    loop {
        match receiver.recv_timeout(Duration::from_millis(250)) {
            Ok(AudioCommand::Sync(current)) => {
                desired = current;
                if desired != playing && (desired.is_some() || playing.is_some()) {
                    #[cfg(debug_assertions)]
                    if let Some((id, _)) = &playing {
                        eprintln!("Alarm playback stopped: {id}");
                    }
                    if let Some(sink) = sink.take() {
                        sink.stop();
                    }
                    stream = None;
                    playing = None;
                    preview_until = None;
                    next_retry = Instant::now();
                }
            }
            Ok(AudioCommand::Preview(id, reply)) => {
                if desired.is_some() {
                    let _ = reply.send(Err(
                        "Stop the ringing alarm before previewing a sound".into()
                    ));
                    continue;
                }
                if let Some(sink) = sink.take() {
                    sink.stop();
                }
                stream = None;
                let result = OutputStreamBuilder::open_default_stream()
                    .map_err(|_| "No audio output device is available".to_string())
                    .and_then(|mut output| {
                        output.log_on_drop(false);
                        let preview = start_sound(&state, &output, &id, false)?;
                        sink = Some(preview);
                        stream = Some(output);
                        preview_until = Some(Instant::now() + Duration::from_secs(8));
                        Ok(())
                    });
                let _ = reply.send(result);
            }
            Ok(AudioCommand::StopPreview) => {
                if playing.is_none() {
                    if let Some(sink) = sink.take() {
                        sink.stop();
                    }
                    stream = None;
                    preview_until = None;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if device_failed.swap(false, std::sync::atomic::Ordering::Relaxed) {
            if let Some(sink) = sink.take() {
                sink.stop();
            }
            stream = None;
            playing = None;
            next_retry = Instant::now();
        }
        if let Some((_, id)) = desired
            .as_ref()
            .filter(|_| playing.is_none() && Instant::now() >= next_retry)
        {
            let failed = device_failed.clone();
            let output = OutputStreamBuilder::from_default_device().and_then(|builder| {
                builder
                    .with_error_callback(move |_| {
                        failed.store(true, std::sync::atomic::Ordering::Relaxed);
                    })
                    .open_stream()
            });
            match output {
                Ok(mut output) => {
                    output.log_on_drop(false);
                    let audio = match start_sound(&state, &output, id, true) {
                        Ok(audio) => {
                            set_error(&app, &state, None);
                            audio
                        }
                        Err(_) => {
                            set_error(
                                &app,
                                &state,
                                Some("Your sound is unavailable. Playing the backup alarm.".into()),
                            );
                            fallback_alarm(&output)
                        }
                    };
                    sink = Some(audio);
                    stream = Some(output);
                    playing = desired.clone();
                    #[cfg(debug_assertions)]
                    eprintln!("Alarm playback started: {}", playing.as_ref().unwrap().0);
                }
                Err(_) => {
                    set_error(&app, &state, Some("No audio output is available. Connect speakers or headphones; the alarm will retry.".into()));
                    next_retry = Instant::now() + Duration::from_secs(3);
                }
            }
        }
        if preview_until.is_some_and(|until| Instant::now() >= until)
            || (preview_until.is_some() && sink.as_ref().is_some_and(Sink::empty))
        {
            if let Some(sink) = sink.take() {
                sink.stop();
            }
            stream = None;
            preview_until = None;
        }
        if desired.is_none() {
            set_error(&app, &state, None);
        }
        // Keep the output device alive only while playing audio.
        let _ = &stream;
    }
}

#[tauri::command]
pub fn list_alarm_sounds(state: State<'_, AlarmState>) -> Result<Vec<AlarmSound>, String> {
    let mut sounds = vec![
        AlarmSound {
            id: "classic".into(),
            name: "Classic clock".into(),
            custom: false,
            file: String::new(),
        },
        AlarmSound {
            id: "digital".into(),
            name: "Digital pulse".into(),
            custom: false,
            file: String::new(),
        },
        AlarmSound {
            id: "sunrise".into(),
            name: "Sunrise melody".into(),
            custom: false,
            file: String::new(),
        },
    ];
    sounds.extend(
        state
            .sounds
            .lock()
            .map_err(|_| "Sound library is unavailable")?
            .clone(),
    );
    Ok(sounds)
}

#[tauri::command]
pub async fn import_alarm_sound(
    name: String,
    bytes: Vec<u8>,
    state: State<'_, AlarmState>,
) -> Result<AlarmSound, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if bytes.is_empty() || bytes.len() > MAX_AUDIO_BYTES {
            return Err("Choose an audio file under 20 MB".into());
        }
        let extension = std::path::Path::new(&name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !matches!(extension.as_str(), "mp3" | "wav" | "ogg" | "flac") {
            return Err("Choose an MP3, WAV, OGG or FLAC file".into());
        }
        let mut decoder = Decoder::new(Cursor::new(bytes.clone()))
            .map_err(|_| "This audio file cannot be played")?;
        if decoder.next().is_none() {
            return Err("This audio file is empty".into());
        }
        let id = Uuid::new_v4();
        let sound = AlarmSound {
            id: format!("custom:{id}"),
            name: name
                .chars()
                .filter(|char| !char.is_control())
                .take(120)
                .collect(),
            custom: true,
            file: format!("{id}.{extension}"),
        };
        let mut sounds = state
            .sounds
            .lock()
            .map_err(|_| "Sound library is unavailable")?;
        if sounds.len() >= 5 {
            return Err("You can keep up to five songs. Remove one before adding another.".into());
        }
        fs::create_dir_all(&state.directory).map_err(|error| error.to_string())?;
        let path = state.directory.join(&sound.file);
        fs::write(&path, bytes).map_err(|error| error.to_string())?;
        let mut updated = sounds.clone();
        updated.push(sound.clone());
        if let Err(error) = write_json_atomically(&state.directory.join("library.json"), &updated) {
            let _ = fs::remove_file(path);
            return Err(error);
        }
        *sounds = updated;
        Ok(sound)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn preview_alarm_sound(
    sound: String,
    state: State<'_, AlarmState>,
) -> Result<(), String> {
    let sender = state.sender.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (reply, receiver) = mpsc::channel();
        sender
            .send(AudioCommand::Preview(sound, reply))
            .map_err(|_| "Audio is unavailable")?;
        receiver
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "Audio preview timed out")?
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn stop_alarm_preview(state: State<'_, AlarmState>) {
    let _ = state.sender.send(AudioCommand::StopPreview);
}

#[tauri::command]
pub fn get_alarm_audio_error(state: State<'_, AlarmState>) -> Option<String> {
    state.error.lock().ok().and_then(|error| error.clone())
}

#[tauri::command]
pub fn get_alarm_sound(state: State<'_, AlarmState>) -> Result<String, String> {
    state
        .selected
        .lock()
        .map(|sound| sound.clone())
        .map_err(|_| "Alarm sound is unavailable".into())
}

#[tauri::command]
pub fn set_alarm_sound(
    sound: String,
    state: State<'_, AlarmState>,
    reminders: State<'_, ReminderState>,
) -> Result<(), String> {
    state.validate(&sound)?;
    let mut selected = state
        .selected
        .lock()
        .map_err(|_| "Alarm sound is unavailable")?;
    write_json_atomically(&state.directory.join("selected.json"), &sound)?;
    *selected = sound;
    drop(selected);
    state.sync(&reminders);
    Ok(())
}

#[tauri::command]
pub fn remove_alarm_sound(
    id: String,
    state: State<'_, AlarmState>,
    reminders: State<'_, ReminderState>,
) -> Result<(), String> {
    let mut sounds = state
        .sounds
        .lock()
        .map_err(|_| "Sound library is unavailable")?;
    let sound = sounds
        .iter()
        .find(|sound| sound.id == id)
        .ok_or("Song not found")?
        .clone();
    let mut selected = state
        .selected
        .lock()
        .map_err(|_| "Alarm sound is unavailable")?;
    if *selected == id {
        write_json_atomically(&state.directory.join("selected.json"), &"classic")?;
        *selected = "classic".into();
    }
    let updated: Vec<_> = sounds
        .iter()
        .filter(|sound| sound.id != id)
        .cloned()
        .collect();
    write_json_atomically(&state.directory.join("library.json"), &updated)?;
    *sounds = updated;
    // Library filenames are generated UUIDs; never accept a path supplied by the UI.
    if !sound.file.contains(['/', '\\']) && !sound.file.starts_with('.') {
        let _ = fs::remove_file(state.directory.join(sound.file));
    }
    drop(selected);
    drop(sounds);
    state.sync(&reminders);
    Ok(())
}
