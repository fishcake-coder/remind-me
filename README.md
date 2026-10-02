# Remind Me

A compact Windows tray reminder built with Tauri 2, Rust, React, and TypeScript.

Press `Ctrl+Alt+R`, type a reminder, and place it on the timeline. Reminders stay on the device and use native Windows notifications. If the PC was asleep or the app was closed, overdue reminders stay available in a temporary Missed section until they are completed, deleted, or rescheduled.

Settings include start-on-login (enabled by default), light and dark appearance, 1, 5, or 15-minute timeline spacing, offline notification sounds, manual update checking, and app information. Preferences and reminders remain on the device across automatic updates.

Click the clock button on any upcoming reminder to enable its alarm. When due, it sends a notification and rings continuously in the native background process, even with the window closed. Open the app and choose **Stop alarm** to silence and complete it. Dismissing the notification does not stop the alarm. Multiple due alarms play one at a time until each is stopped. Alarm reminders missed while the computer was asleep or the app was quit ring when it resumes or starts again.

In **Settings → Alarm ringtone**, choose Classic clock, Digital pulse or Sunrise melody, or import up to five of your own MP3, WAV, OGG or FLAC songs (20 MB each). Imported audio is copied into local app storage; moving the original does not affect alarms. Preview stops after eight seconds or when Settings closes. Remove songs to make room; removing the selected song switches to Classic clock. If an imported file is unavailable, an active alarm uses a backup tone. Audio needs an available output device and audible system volume. The alarm announcement is shown once and remembered across later updates.

Closing the window releases the UI and its WebView2 processes. The native tray and reminder scheduler keep running, and login startup creates no browser window. Open the UI again with the tray, `Ctrl+Alt+R`, or the app shortcut; unfinished composer text is restored. Choose **Quit** in the tray menu to stop the app and its background reminders completely.

[![Download for Windows](https://img.shields.io/badge/Download_for_Windows-171717?style=for-the-badge&logo=windows11&logoColor=white)](https://github.com/fishcake-coder/remind-me/releases/latest/download/Remind.Me-setup.exe)

One installer automatically selects the native x64 or ARM64 version for your Windows computer.

## Development

Requirements: Node.js 22, Rust 1.77.2 or newer, and the Windows prerequisites for Tauri.

```powershell
npm install
npm run tauri dev
```

## Releases and automatic updates

The app checks for signed updates when the UI opens and every six hours while it remains open. Releases include a universal Windows installer plus signed native x64 and ARM64 update packages built by GitHub Actions.

To publish a release:

1. Set the same version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit and push the version change.
3. Tag that commit with `vMAJOR.MINOR.PATCH` and push the tag.

The release workflow validates the versions, builds both architectures, creates the universal installer, publishes the release, and updates the signed updater manifest.
