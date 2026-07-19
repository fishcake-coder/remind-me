import { useEffect, useRef } from "react";

type UpdateDialogProps = {
  version: string;
  notes: string;
  installing: boolean;
  onInstall: () => void;
  onLater: () => void;
};

export function UpdateDialog({ version, notes, installing, onInstall, onLater }: UpdateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const installButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    installButtonRef.current?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="update-dialog"
      aria-labelledby="update-title"
      aria-describedby="update-notes"
      onCancel={(event) => {
        event.preventDefault();
        if (!installing) onLater();
      }}
    >
      <p className="update-eyebrow">Version {version}</p>
      <h2 id="update-title">Update available</h2>
      <p id="update-notes" className="update-notes">{notes}</p>
      <div className="update-actions">
        <button type="button" className="update-later" onClick={onLater} disabled={installing}>
          Later
        </button>
        <button
          ref={installButtonRef}
          type="button"
          className="update-install"
          onClick={onInstall}
          disabled={installing}
        >
          {installing ? "Installing…" : "Update now"}
        </button>
      </div>
    </dialog>
  );
}
