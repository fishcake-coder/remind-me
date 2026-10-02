# Alarm verification

Failure modes to cover before implementing the native audio worker:

- A normal reminder accidentally becomes an alarm when loading an older store.
- A due alarm is pruned as a delivered notification, or notification dismissal or snooze stops it.
- Audio stops when the WebView closes, or an active alarm is lost on restart or resume.
- Completing, deleting, or rescheduling races a scheduler tick and leaves orphan audio.
- Concurrent alarms overwrite each other or produce overlapping songs.
- Invalid, empty, oversized, unsupported, missing, or moved custom audio prevents delivery.
- Preview audio outlives its controls or interrupts an active alarm.
- No output device or a disconnected device silently loses the active alarm.
- A storage failure acknowledges a stop without actually saving it.
- First-open announcement appears again on reopening or a later update.

Verify through the desktop UI and native scheduler in a separate QA app-data directory. Record screenshots, a trace and a structured report outside the repository. Exercise ordinary and alarm reminders, preview/import validation, closed-window delivery, concurrent alarms, stop/delete/reschedule, restart recovery and one-time announcement persistence. Run the existing regression checks, frontend build and Rust checks before release. Hardware sleep and physical speaker listening require a manual check when unavailable in automation.
