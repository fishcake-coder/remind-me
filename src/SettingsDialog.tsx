import { useEffect, useRef } from "react";
import { CloseIcon } from "./icons";
import { SLOT_INTERVALS } from "./settings";
import type { AppSettings, SlotInterval, Theme } from "./settings";

type SettingsDialogProps = {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
};

export function SettingsDialog({ settings, onChange, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const setTheme = (theme: Theme) => onChange({ ...settings, theme });
  const setSlotInterval = (slotInterval: SlotInterval) => onChange({ ...settings, slotInterval });

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="settings-heading">
        <div>
          <p className="settings-eyebrow">Preferences</p>
          <h2 id="settings-title">Settings</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
          <CloseIcon size={17} />
        </button>
      </div>

      <fieldset className="settings-group">
        <legend>Appearance</legend>
        <div className="segmented-control" aria-label="Appearance">
          {(["light", "dark"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              className={settings.theme === theme ? "is-selected" : ""}
              aria-pressed={settings.theme === theme}
              onClick={() => setTheme(theme)}
            >
              {theme === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Timeline spacing</legend>
        <p>Choose how far apart new reminder times are.</p>
        <div className="segmented-control" aria-label="Timeline spacing">
          {SLOT_INTERVALS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={settings.slotInterval === minutes ? "is-selected" : ""}
              aria-pressed={settings.slotInterval === minutes}
              onClick={() => setSlotInterval(minutes)}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </fieldset>

      <p className="settings-note">Changes save automatically.</p>
    </dialog>
  );
}
