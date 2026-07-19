use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reminder {
    id: Uuid,
    title: String,
    scheduled_at: i64,
    completed: bool,
    notified_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum NotificationSound {
    #[default]
    Default,
    Gentle,
    Bell,
    Chime,
    None,
}

impl NotificationSound {
    fn file_name(self) -> Option<&'static str> {
        match self {
            Self::Gentle => Some("gentle.wav"),
            Self::Bell => Some("bell.wav"),
            Self::Chime => Some("chime.wav"),
            Self::Default | Self::None => None,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsFile {
    notification_sound: NotificationSound,
}

#[derive(Clone)]
struct ReminderState {
    reminders: Arc<Mutex<Vec<Reminder>>>,
    data_file: PathBuf,
}

impl ReminderState {
    fn load(data_file: PathBuf) -> Self {
        let reminders = read_reminders(&data_file).unwrap_or_default();
        let state = Self {
            reminders: Arc::new(Mutex::new(reminders)),
            data_file,
        };
        let _ = prune_delivered(&state);
        state
    }

    fn persist(&self, reminders: &[Reminder]) -> Result<(), String> {
        write_json_atomically(&self.data_file, reminders)
    }
}

#[derive(Clone)]
struct SoundState {
    selected: Arc<Mutex<NotificationSound>>,
    data_file: PathBuf,
    resource_dir: PathBuf,
}

impl SoundState {
    fn load(data_file: PathBuf, resource_dir: PathBuf) -> Self {
        let selected = fs::read(&data_file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<SettingsFile>(&bytes).ok())
            .map(|settings| settings.notification_sound)
            .unwrap_or_default();
        Self {
            selected: Arc::new(Mutex::new(selected)),
            data_file,
            resource_dir,
        }
    }

    fn current(&self) -> Result<NotificationSound, String> {
        self.selected
            .lock()
            .map(|sound| *sound)
            .map_err(|_| "Notification sound is unavailable".into())
    }

    fn set(&self, sound: NotificationSound) -> Result<(), String> {
        let settings = SettingsFile {
            notification_sound: sound,
        };
        write_json_atomically(&self.data_file, &settings)?;
        *self
            .selected
            .lock()
            .map_err(|_| "Notification sound is unavailable".to_string())? = sound;
        Ok(())
    }
}

fn write_json_atomically<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let mut file =
        atomic_write_file::AtomicWriteFile::open(path).map_err(|error| error.to_string())?;
    file.write_all(&json).map_err(|error| error.to_string())?;
    file.commit().map_err(|error| error.to_string())
}

fn read_reminders(path: &Path) -> Result<Vec<Reminder>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn clean_title(title: String) -> Result<String, String> {
    let title = title.trim().to_owned();
    if title.is_empty() {
        return Err("Type something to remember".into());
    }
    if title.chars().count() > 160 {
        return Err("Reminder is too long".into());
    }
    Ok(title)
}

#[tauri::command]
fn list_reminders(state: State<'_, ReminderState>) -> Result<Vec<Reminder>, String> {
    state
        .reminders
        .lock()
        .map(|items| {
            items
                .iter()
                .filter(|item| !item.completed)
                .cloned()
                .collect()
        })
        .map_err(|_| "Reminder storage is unavailable".into())
}

#[tauri::command]
fn create_reminder(
    title: String,
    scheduled_at: i64,
    state: State<'_, ReminderState>,
) -> Result<Reminder, String> {
    if scheduled_at < Utc::now().timestamp_millis() - 1_000 {
        return Err("Choose a time that has not passed".into());
    }
    let reminder = Reminder {
        id: Uuid::new_v4(),
        title: clean_title(title)?,
        scheduled_at,
        completed: false,
        notified_at: None,
    };
    let mut reminders = state
        .reminders
        .lock()
        .map_err(|_| "Reminder storage is unavailable".to_string())?;
    let mut updated = reminders.clone();
    updated.push(reminder.clone());
    updated.sort_by_key(|item| item.scheduled_at);
    state.persist(&updated)?;
    *reminders = updated;
    Ok(reminder)
}

#[tauri::command]
fn move_reminder(
    id: Uuid,
    scheduled_at: i64,
    state: State<'_, ReminderState>,
) -> Result<Reminder, String> {
    if scheduled_at < Utc::now().timestamp_millis() - 1_000 {
        return Err("Choose a time that has not passed".into());
    }
    let mut reminders = state
        .reminders
        .lock()
        .map_err(|_| "Reminder storage is unavailable".to_string())?;
    let mut updated = reminders.clone();
    let reminder = updated
        .iter_mut()
        .find(|item| item.id == id && !item.completed)
        .ok_or_else(|| "Reminder not found".to_string())?;
    reminder.scheduled_at = scheduled_at;
    reminder.completed = false;
    reminder.notified_at = None;
    let moved = reminder.clone();
    updated.sort_by_key(|item| item.scheduled_at);
    state.persist(&updated)?;
    *reminders = updated;
    Ok(moved)
}

fn remove_reminder(id: Uuid, state: &ReminderState) -> Result<(), String> {
    let mut reminders = state
        .reminders
        .lock()
        .map_err(|_| "Reminder storage is unavailable".to_string())?;
    let mut updated = reminders.clone();
    let before = updated.len();
    updated.retain(|item| item.id != id);
    if updated.len() == before {
        return Err("Reminder not found".into());
    }
    state.persist(&updated)?;
    *reminders = updated;
    Ok(())
}

#[tauri::command]
fn complete_reminder(id: Uuid, state: State<'_, ReminderState>) -> Result<(), String> {
    remove_reminder(id, &state)
}

#[tauri::command]
fn delete_reminder(id: Uuid, state: State<'_, ReminderState>) -> Result<(), String> {
    remove_reminder(id, &state)
}

#[tauri::command]
fn get_notification_sound(state: State<'_, SoundState>) -> Result<NotificationSound, String> {
    state.current()
}

#[tauri::command]
fn set_notification_sound(
    sound: NotificationSound,
    state: State<'_, SoundState>,
) -> Result<(), String> {
    state.set(sound)
}

#[tauri::command]
fn preview_notification_sound(
    sound: NotificationSound,
    state: State<'_, SoundState>,
) -> Result<(), String> {
    play_notification_sound(sound, &state.resource_dir)
}

fn persist_due_tombstones(state: &ReminderState, now: i64) -> Result<Vec<Reminder>, String> {
    let mut reminders = state
        .reminders
        .lock()
        .map_err(|_| "Reminder storage is unavailable".to_string())?;
    let due: Vec<Reminder> = reminders
        .iter()
        .filter(|item| !item.completed && item.notified_at.is_none() && item.scheduled_at <= now)
        .cloned()
        .collect();
    if due.is_empty() {
        return Ok(Vec::new());
    }

    let due_ids: std::collections::HashSet<Uuid> = due.iter().map(|item| item.id).collect();
    let mut tombstoned = reminders.clone();
    for reminder in &mut tombstoned {
        if due_ids.contains(&reminder.id) {
            reminder.completed = true;
            reminder.notified_at = Some(now);
        }
    }
    state.persist(&tombstoned)?;
    *reminders = tombstoned;
    Ok(due)
}

fn prune_delivered(state: &ReminderState) -> Result<bool, String> {
    let mut reminders = state
        .reminders
        .lock()
        .map_err(|_| "Reminder storage is unavailable".to_string())?;
    let pending: Vec<Reminder> = reminders
        .iter()
        .filter(|item| !item.completed)
        .cloned()
        .collect();
    if pending.len() == reminders.len() {
        return Ok(false);
    }
    state.persist(&pending)?;
    *reminders = pending;
    Ok(true)
}

fn start_scheduler(app: AppHandle, reminder_state: ReminderState, sound_state: SoundState) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(3));
        if prune_delivered(&reminder_state).unwrap_or(false) {
            let _ = app.emit("reminders-changed", ());
        }

        let now = Utc::now().timestamp_millis();
        let due = match persist_due_tombstones(&reminder_state, now) {
            Ok(due) => due,
            Err(_) => continue,
        };
        if due.is_empty() {
            continue;
        }

        let _ = app.emit("reminders-changed", ());
        let sound = sound_state.current().unwrap_or_default();
        for reminder in &due {
            let builder = app
                .notification()
                .builder()
                .title("Remind Me")
                .body(&reminder.title);
            if sound == NotificationSound::Default {
                let _ = builder.sound("Default").show();
            } else {
                let _ = builder.show();
                let _ = play_notification_sound(sound, &sound_state.resource_dir);
            }
        }

        if prune_delivered(&reminder_state).unwrap_or(false) {
            let _ = app.emit("reminders-changed", ());
        }
    });
}

#[cfg(target_os = "windows")]
fn play_notification_sound(sound: NotificationSound, resource_dir: &Path) -> Result<(), String> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt};
    use windows_sys::Win32::Media::Audio::{
        PlaySoundW, SND_ALIAS, SND_FILENAME, SND_NODEFAULT, SND_SYNC,
    };

    if sound == NotificationSound::None {
        return Ok(());
    }
    let (source, flags) = if sound == NotificationSound::Default {
        (
            PathBuf::from("SystemNotification"),
            SND_ALIAS | SND_NODEFAULT | SND_SYNC,
        )
    } else {
        let path = resource_dir.join("sounds").join(
            sound
                .file_name()
                .ok_or_else(|| "Notification sound file is unavailable".to_string())?,
        );
        if !path.is_file() {
            return Err(format!(
                "Notification sound file is missing: {}",
                path.display()
            ));
        }
        (path, SND_FILENAME | SND_NODEFAULT | SND_SYNC)
    };

    thread::spawn(move || {
        let wide: Vec<u16> = OsStr::new(&source)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            PlaySoundW(wide.as_ptr(), std::ptr::null_mut(), flags);
        }
    });
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn play_notification_sound(_sound: NotificationSound, _resource_dir: &Path) -> Result<(), String> {
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window
            .eval("window.setTimeout(() => document.getElementById('reminder-title')?.focus(), 0)");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("ctrl+alt+r")
                .expect("valid global shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        show_main_window(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let reminder_state = ReminderState::load(app_data_dir.join("reminders.json"));
            let sound_state = SoundState::load(
                app_data_dir.join("settings.json"),
                app.path().resource_dir()?,
            );
            app.manage(reminder_state.clone());
            app.manage(sound_state.clone());
            start_scheduler(app.handle().clone(), reminder_state, sound_state);

            let open = MenuItem::with_id(
                app,
                "open",
                "Open Remind Me (Ctrl+Alt+R)",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app icon").clone())
                .tooltip("Remind Me")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            show_main_window(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_reminders,
            create_reminder,
            move_reminder,
            complete_reminder,
            delete_reminder,
            get_notification_sound,
            set_notification_sound,
            preview_notification_sound
        ])
        .run(tauri::generate_context!())
        .expect("error while running Remind Me");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_reminder(scheduled_at: i64) -> Reminder {
        Reminder {
            id: Uuid::new_v4(),
            title: "Check oven".into(),
            scheduled_at,
            completed: false,
            notified_at: None,
        }
    }

    #[test]
    fn trims_valid_titles() {
        assert_eq!(clean_title("  Check oven  ".into()).unwrap(), "Check oven");
    }

    #[test]
    fn rejects_empty_titles() {
        assert!(clean_title("   ".into()).is_err());
    }

    #[test]
    fn atomically_overwrites_existing_store() {
        let directory = std::env::temp_dir().join(format!("remind-me-test-{}", Uuid::new_v4()));
        let data_file = directory.join("reminders.json");
        let state = ReminderState::load(data_file.clone());
        state.persist(&[]).unwrap();

        let expected = test_reminder(123_456);
        state.persist(std::slice::from_ref(&expected)).unwrap();

        let saved = read_reminders(&data_file).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].id, expected.id);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn due_reminders_are_tombstoned_before_delivery() {
        let directory = std::env::temp_dir().join(format!("remind-me-test-{}", Uuid::new_v4()));
        let data_file = directory.join("reminders.json");
        let reminder = test_reminder(100);
        let state = ReminderState {
            reminders: Arc::new(Mutex::new(vec![reminder.clone()])),
            data_file: data_file.clone(),
        };

        let due = persist_due_tombstones(&state, 200).unwrap();
        assert_eq!(due.len(), 1);
        let saved = read_reminders(&data_file).unwrap();
        assert!(saved[0].completed);
        assert_eq!(saved[0].notified_at, Some(200));

        assert!(prune_delivered(&state).unwrap());
        assert!(read_reminders(&data_file).unwrap().is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_tombstone_save_keeps_reminder_pending() {
        let directory = std::env::temp_dir().join(format!("remind-me-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let blocked_parent = directory.join("not-a-directory");
        fs::write(&blocked_parent, b"blocked").unwrap();
        let state = ReminderState {
            reminders: Arc::new(Mutex::new(vec![test_reminder(100)])),
            data_file: blocked_parent.join("reminders.json"),
        };

        assert!(persist_due_tombstones(&state, 200).is_err());
        let reminders = state.reminders.lock().unwrap();
        assert!(!reminders[0].completed);
        assert_eq!(reminders[0].notified_at, None);
        drop(reminders);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn load_prunes_legacy_completed_records() {
        let directory = std::env::temp_dir().join(format!("remind-me-test-{}", Uuid::new_v4()));
        let data_file = directory.join("reminders.json");
        let mut completed = test_reminder(100);
        completed.completed = true;
        completed.notified_at = Some(100);
        write_json_atomically(&data_file, &[completed]).unwrap();

        let state = ReminderState::load(data_file.clone());
        assert!(state.reminders.lock().unwrap().is_empty());
        assert!(read_reminders(&data_file).unwrap().is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_prune_cannot_redeliver_a_tombstoned_reminder() {
        let directory = std::env::temp_dir().join(format!("remind-me-test-{}", Uuid::new_v4()));
        let data_file = directory.join("reminders.json");
        let state = ReminderState {
            reminders: Arc::new(Mutex::new(vec![test_reminder(100)])),
            data_file: data_file.clone(),
        };
        assert_eq!(persist_due_tombstones(&state, 200).unwrap().len(), 1);

        let blocked_parent = directory.join("not-a-directory");
        fs::write(&blocked_parent, b"blocked").unwrap();
        let blocked_state = ReminderState {
            reminders: state.reminders.clone(),
            data_file: blocked_parent.join("reminders.json"),
        };
        assert!(prune_delivered(&blocked_state).is_err());
        assert!(persist_due_tombstones(&blocked_state, 300)
            .unwrap()
            .is_empty());

        let restarted = ReminderState::load(data_file.clone());
        assert!(restarted.reminders.lock().unwrap().is_empty());
        assert!(persist_due_tombstones(&restarted, 300).unwrap().is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_manual_delete_keeps_the_in_memory_reminder() {
        let directory = std::env::temp_dir().join(format!("remind-me-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let blocked_parent = directory.join("not-a-directory");
        fs::write(&blocked_parent, b"blocked").unwrap();
        let reminder = test_reminder(100);
        let state = ReminderState {
            reminders: Arc::new(Mutex::new(vec![reminder.clone()])),
            data_file: blocked_parent.join("reminders.json"),
        };

        assert!(remove_reminder(reminder.id, &state).is_err());
        assert_eq!(state.reminders.lock().unwrap().len(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_sound_save_keeps_the_previous_selection() {
        let directory = std::env::temp_dir().join(format!("remind-me-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let blocked_parent = directory.join("not-a-directory");
        fs::write(&blocked_parent, b"blocked").unwrap();
        let state = SoundState {
            selected: Arc::new(Mutex::new(NotificationSound::Default)),
            data_file: blocked_parent.join("settings.json"),
            resource_dir: directory.clone(),
        };

        assert!(state.set(NotificationSound::Bell).is_err());
        assert_eq!(state.current().unwrap(), NotificationSound::Default);
        fs::remove_dir_all(directory).unwrap();
    }
}
