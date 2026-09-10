import type { Reminder } from "./types";

const DRAFT_KEY = "remind-me-composer-draft:v1";
export type ComposerDraft = { title: string; editingReminder: Reminder | null };

export function loadDraft(): ComposerDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (typeof saved?.title === "string") {
      return { title: saved.title, editingReminder: saved.editingReminder ?? null };
    }
  } catch { /* Storage may be unavailable or contain an incomplete draft. */ }
  return { title: "", editingReminder: null };
}

export function saveDraft(draft: ComposerDraft): void {
  try {
    if (draft.title || draft.editingReminder) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* A storage failure must not prevent scheduling a reminder. */ }
}
