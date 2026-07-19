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
    AppHandle, Manager, State, WindowEvent,
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

#[derive(Clone)]
struct ReminderState {
    reminders: Arc<Mutex<Vec<Reminder>>>,
    data_file: PathBuf,
}

impl ReminderState {
    fn load(data_file: PathBuf) -> Self {
        let reminders = read_reminders(&data_file).unwrap_or_default();
        Self {
            reminders: Arc::new(Mutex::new(reminders)),
            data_file,
        }
    }

    fn persist(&self, reminders: &[Reminder]) -> Result<(), String> {
        if let Some(parent) = self.data_file.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let json = serde_json::to_vec_pretty(reminders).map_err(|error| error.to_string())?;
        let mut file = atomic_write_file::AtomicWriteFile::open(&self.data_file)
            .map_err(|error| error.to_string())?;
        file.write_all(&json).map_err(|error| error.to_string())?;
        file.commit().map_err(|error| error.to_string())
    }
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
        .map(|items| items.clone())
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
    reminders.push(reminder.clone());
    reminders.sort_by_key(|item| item.scheduled_at);
    state.persist(&reminders)?;
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
    let reminder = reminders
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| "Reminder not found".to_string())?;
    reminder.scheduled_at = scheduled_at;
    reminder.completed = false;
    reminder.notified_at = None;
    let updated = reminder.clone();
    reminders.sort_by_key(|item| item.scheduled_at);
    state.persist(&reminders)?;
    Ok(updated)
}

#[tauri::command]
fn complete_reminder(id: Uuid, state: State<'_, ReminderState>) -> Result<Reminder, String> {
    let mut reminders = state
        .reminders
        .lock()
        .map_err(|_| "Reminder storage is unavailable".to_string())?;
    let reminder = reminders
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| "Reminder not found".to_string())?;
    reminder.completed = true;
    let updated = reminder.clone();
    state.persist(&reminders)?;
    Ok(updated)
}

#[tauri::command]
fn delete_reminder(id: Uuid, state: State<'_, ReminderState>) -> Result<(), String> {
    let mut reminders = state
        .reminders
        .lock()
        .map_err(|_| "Reminder storage is unavailable".to_string())?;
    let before = reminders.len();
    reminders.retain(|item| item.id != id);
    if reminders.len() == before {
        return Err("Reminder not found".into());
    }
    state.persist(&reminders)
}

fn start_scheduler(app: AppHandle, state: ReminderState) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(3));
        let now = Utc::now().timestamp_millis();
        let due = {
            let mut reminders = match state.reminders.lock() {
                Ok(reminders) => reminders,
                Err(_) => continue,
            };
            let mut due = Vec::new();
            for reminder in reminders.iter_mut() {
                if !reminder.completed
                    && reminder.notified_at.is_none()
                    && reminder.scheduled_at <= now
                {
                    reminder.completed = true;
                    reminder.notified_at = Some(now);
                    due.push(reminder.clone());
                }
            }
            if !due.is_empty() {
                let _ = state.persist(&reminders);
            }
            due
        };

        for reminder in due {
            let _ = app
                .notification()
                .builder()
                .title("Remind Me")
                .body(&reminder.title)
                .show();
        }
    });
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_file = app.path().app_data_dir()?.join("reminders.json");
            let state = ReminderState::load(data_file);
            app.manage(state.clone());
            start_scheduler(app.handle().clone(), state);

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
            delete_reminder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Remind Me");
}

#[cfg(test)]
mod tests {
    use super::*;

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

        let expected = Reminder {
            id: Uuid::new_v4(),
            title: "Check oven".into(),
            scheduled_at: 123_456,
            completed: false,
            notified_at: None,
        };
        state.persist(std::slice::from_ref(&expected)).unwrap();

        let saved = read_reminders(&data_file).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].id, expected.id);
        fs::remove_dir_all(directory).unwrap();
    }
}
