# Remind Me

A compact Windows tray reminder built with Tauri 2, Rust, React, and TypeScript.

Press `Ctrl+Alt+R`, type a reminder, and place it on the next 90 minutes. Reminders stay on the device and use native Windows notifications.

## Development

Requirements: Node.js 22, Rust 1.77.2 or newer, and the Windows prerequisites for Tauri.

```powershell
npm install
npm run tauri dev
```

## Releases and automatic updates

The app checks for signed updates when it starts and every six hours. Releases are built for Windows x64 and ARM64 by GitHub Actions.

To publish a release:

1. Set the same version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit and push the version change.
3. Tag that commit with `vMAJOR.MINOR.PATCH` and push the tag.

The release workflow validates the versions, builds both architectures, publishes the installers, and updates the signed updater manifest.
