import { useEffect, useRef, useState } from "react";
import { alarmApi } from "./alarmApi";
import type { AlarmSound } from "./alarmApi";
import { CloseIcon } from "./icons";

export function AlarmSettings() {
  const [sounds, setSounds] = useState<AlarmSound[]>([]);
  const [selected, setSelected] = useState("classic");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const songs = sounds.filter((sound) => sound.custom);

  useEffect(() => {
    let disposed = false;
    void Promise.all([alarmApi.list(), alarmApi.selected()]).then(([library, sound]) => {
      if (!disposed) { setSounds(library); setSelected(sound); }
    }).catch(() => { if (!disposed) setError("Could not load alarm sounds. Close and reopen Settings to retry."); });
    return () => {
      disposed = true;
      window.clearTimeout(timerRef.current);
      void alarmApi.stopPreview();
    };
  }, []);

  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await alarmApi.stopPreview();
      setPreviewing(false);
      window.clearTimeout(timerRef.current);
      await action();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  return (
    <fieldset className="settings-group alarm-settings">
      <legend>Alarm ringtone</legend>
      <p>Tap the clock on a reminder to enable its alarm. It rings until you stop it in the app.</p>
      <div className="sound-control">
        <select aria-label="Alarm ringtone" value={selected} disabled={busy || sounds.length === 0}
          onChange={(event) => {
            const sound = event.target.value;
            void perform(async () => {
              await alarmApi.select(sound);
              setSelected(sound);
            });
          }}>
          <optgroup label="Built-in sounds">
            {sounds.filter((sound) => !sound.custom).map((sound) => <option key={sound.id} value={sound.id}>{sound.name}</option>)}
          </optgroup>
          {songs.length > 0 && <optgroup label="Your songs">
            {songs.map((sound) => <option key={sound.id} value={sound.id}>{sound.name}</option>)}
          </optgroup>}
        </select>
        <button type="button" className="settings-secondary" disabled={busy || sounds.length === 0}
          onClick={() => void perform(async () => {
            if (previewing) return;
            await alarmApi.preview(selected);
            setPreviewing(true);
            timerRef.current = window.setTimeout(() => setPreviewing(false), 8000);
          })}>{previewing ? "Stop" : "Preview"}</button>
      </div>
      <div className="song-library-heading">
        <span>Your songs <small>{songs.length}/5</small></span>
        <button type="button" className="settings-secondary" disabled={busy || songs.length >= 5}
          onClick={() => fileRef.current?.click()}>{busy ? "Saving…" : "Add song"}</button>
      </div>
      <input ref={fileRef} type="file" hidden accept=".mp3,.wav,.ogg,.flac" aria-label="Import alarm song"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void perform(async () => {
            const sound = await alarmApi.import(file);
            setSounds(await alarmApi.list());
            await alarmApi.select(sound.id);
            setSelected(sound.id);
          });
        }} />
      {songs.length > 0 && <ul className="song-library">
        {songs.map((sound) => <li key={sound.id}>
          <span title={sound.name}>{sound.name}</span>
          <button type="button" className="chip-action is-delete" aria-label={`Remove song ${sound.name}`} disabled={busy}
            onClick={() => void perform(async () => {
              await alarmApi.remove(sound.id);
              setSounds(await alarmApi.list());
              setSelected(await alarmApi.selected());
            })}><CloseIcon size={14} /></button>
        </li>)}
      </ul>}
      <p className="song-library-note">MP3, WAV, OGG or FLAC · up to 20 MB each. Songs stay on this device.</p>
      <details className="sound-credits"><summary>Sound credits</summary>
        <p>Classic clock: “alarm_clock.wav” by xyzr_kx on Freesound (CC0). Digital pulse and Sunrise melody are original tones.</p>
      </details>
      {error && <p className="alarm-error" role="alert">{error}</p>}
    </fieldset>
  );
}
