import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import thirdPartyLicenses from "./generated/thirdPartyLicenses.json";
import { CloseIcon } from "./icons";
import { NOTIFICATION_SOUNDS, SLOT_INTERVALS } from "./settings";
import type { AppSettings, NotificationSound, SlotInterval, Theme } from "./settings";

const REPOSITORY_URL = "https://github.com/fishcake-coder/remind-me";

type LicenceEntry = {
  ecosystem: string;
  name: string;
  version: string;
  license: string;
};

const licences = thirdPartyLicenses as LicenceEntry[];

export type ManualUpdateStatus = "idle" | "checking" | "upToDate" | "error";

type SettingsDialogProps = {
  settings: AppSettings;
  manualUpdateStatus: ManualUpdateStatus;
  soundSaving: boolean;
  onChange: (settings: AppSettings) => void;
  onSoundChange: (sound: NotificationSound) => void;
  onPreviewSound: (sound: NotificationSound) => void;
  onCheckForUpdates: () => void;
  onClose: () => void;
};

const SOUND_LABELS: Record<NotificationSound, string> = {
  default: "Default",
  gentle: "Gentle",
  bell: "Bell",
  chime: "Chime",
  none: "None",
};

const UPDATE_STATUS_TEXT: Record<ManualUpdateStatus, string> = {
  idle: "",
  checking: "Checking for updates…",
  upToDate: "You’re up to date",
  error: "Could not check for updates",
};

export function SettingsDialog({
  settings,
  manualUpdateStatus,
  soundSaving,
  onChange,
  onSoundChange,
  onPreviewSound,
  onCheckForUpdates,
  onClose,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [version, setVersion] = useState("Loading…");
  const [showLicenses, setShowLicenses] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    let disposed = false;
    if (!("__TAURI_INTERNALS__" in window)) {
      setVersion("Development");
      return;
    }
    void getVersion()
      .then((installedVersion) => {
        if (!disposed) setVersion(installedVersion);
      })
      .catch(() => {
        if (!disposed) setVersion("Unavailable");
      });
    return () => {
      disposed = true;
    };
  }, []);

  const setTheme = (theme: Theme) => onChange({ ...settings, theme });
  const setSlotInterval = (slotInterval: SlotInterval) => onChange({ ...settings, slotInterval });

  const openRepository = async () => {
    if ("__TAURI_INTERNALS__" in window) await openUrl(REPOSITORY_URL);
    else window.open(REPOSITORY_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        if (showLicenses) setShowLicenses(false);
        else onClose();
      }}
    >
      <div className="settings-heading">
        <div>
          <p className="settings-eyebrow">{showLicenses ? "About" : "Preferences"}</p>
          <h2 id="settings-title">{showLicenses ? "Open-source licences" : "Settings"}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
          <CloseIcon size={17} />
        </button>
      </div>

      {showLicenses ? (
        <section className="licences-view" aria-label="Third-party licences">
          <p>Remind Me includes the following third-party open-source packages.</p>
          <ul className="licences-list">
            {licences.map((item) => (
              <li key={`${item.ecosystem}:${item.name}:${item.version}`}>
                <span>{item.name}</span>
                <small>{item.version} · {item.license}</small>
              </li>
            ))}
          </ul>
          <button type="button" className="settings-secondary wide" onClick={() => setShowLicenses(false)}>
            Back to Settings
          </button>
        </section>
      ) : (
        <>
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

          <fieldset className="settings-group">
            <legend>Notification sound</legend>
            <div className="sound-control">
              <select
                value={settings.notificationSound}
                disabled={soundSaving}
                onChange={(event) => onSoundChange(event.target.value as NotificationSound)}
                aria-label="Notification sound"
              >
                {NOTIFICATION_SOUNDS.map((sound) => (
                  <option key={sound} value={sound}>{SOUND_LABELS[sound]}</option>
                ))}
              </select>
              <button
                type="button"
                className="settings-secondary"
                disabled={soundSaving || settings.notificationSound === "none"}
                onClick={() => onPreviewSound(settings.notificationSound)}
              >
                Preview
              </button>
            </div>
          </fieldset>

          <section className="about-section" aria-labelledby="about-title">
            <h3 id="about-title">About</h3>
            <div className="about-details">
              <span><strong>Remind Me</strong><small>Version {version}</small></span>
              <span><small>Publisher</small>Fishcake Software</span>
            </div>
            <div className="about-actions">
              <button type="button" className="settings-link" onClick={() => void openRepository()}>
                GitHub repository
              </button>
              <button type="button" className="settings-link" onClick={() => setShowLicenses(true)}>
                Open-source licences
              </button>
            </div>
            <button
              type="button"
              className="settings-secondary wide"
              disabled={manualUpdateStatus === "checking"}
              onClick={onCheckForUpdates}
            >
              Check for updates
            </button>
            <p className={`update-check-status is-${manualUpdateStatus}`} role="status" aria-live="polite">
              {UPDATE_STATUS_TEXT[manualUpdateStatus]}
            </p>
          </section>

          <p className="settings-note">Changes save automatically.</p>
        </>
      )}
    </dialog>
  );
}
