# Remind Me

A compact Windows tray reminder built with Tauri 2, Rust, React, and TypeScript.

Press `Ctrl+Alt+R`, type a reminder, and place it on the next 90 minutes. Reminders stay on the device and use native Windows notifications.

Settings include light and dark appearance plus 1, 5, or 15-minute timeline spacing. Preferences and reminders remain on the device across automatic updates.

[![Download for Windows](https://img.shields.io/badge/Download_for_Windows-171717?style=for-the-badge&logo=windows11&logoColor=white)](https://github.com/fishcake-coder/remind-me/releases/latest/download/Remind.Me-setup.exe)

One installer automatically selects the native x64 or ARM64 version for your Windows computer.

## Development

Requirements: Node.js 22, Rust 1.77.2 or newer, and the Windows prerequisites for Tauri.

```powershell
npm install
npm run tauri dev
```

## Releases and automatic updates

The app checks for signed updates when it starts and every six hours. Releases include a universal Windows installer plus signed native x64 and ARM64 update packages built by GitHub Actions.

To publish a release:

1. Set the same version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit and push the version change.
3. Tag that commit with `vMAJOR.MINOR.PATCH` and push the tag.

The release workflow validates the versions, builds both architectures, creates the universal installer, publishes the release, and updates the signed updater manifest.
