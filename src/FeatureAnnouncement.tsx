import { useEffect, useRef } from "react";
import { AlarmIcon } from "./icons";

const SEEN_KEY = "remind-me-announcement:alarms:v1";

export function shouldShowAlarmAnnouncement(): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== "seen"; }
  catch { return false; }
}

export function FeatureAnnouncement({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // Mark it when shown, not just when acknowledged. Reopening or updating
    // again must not repeat this announcement.
    try { localStorage.setItem(SEEN_KEY, "seen"); }
    catch { /* Storage may be unavailable; keep the app usable. */ }
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={dialogRef} className="update-dialog feature-announcement" aria-labelledby="alarm-announcement-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="announcement-icon"><AlarmIcon size={27} /></div>
      <p className="update-eyebrow">New in Remind Me</p>
      <h2 id="alarm-announcement-title">Hey, you can now set an alarm!</h2>
      <p className="update-notes">Tap the clock button on any reminder and it will keep ringing until you stop it in the app. Choose a ringtone in Settings, or add up to five of your own songs.</p>
      <div className="update-actions"><button className="update-install" type="button" onClick={onClose}>Got it</button></div>
    </dialog>
  );
}
