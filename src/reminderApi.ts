import { invoke } from "@tauri-apps/api/core";
import type { Reminder } from "./types";
import { FIVE_MINUTES, nextFiveMinuteSlot } from "./time";

const STORAGE_KEY = "remind-me-browser-preview:v2";
const inTauri = "__TAURI_INTERNALS__" in window;

function readPreview(): Reminder[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved) as Reminder[];

  const first = nextFiveMinuteSlot(Date.now()) + FIVE_MINUTES;
  const seeded: Reminder[] = [
    { id: crypto.randomUUID(), title: "Call Mum", scheduledAt: first, completed: false, notifiedAt: null },
  ];
  writePreview(seeded);
  return seeded;
}

function writePreview(reminders: Reminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

export const reminderApi = {
  isNative: inTauri,

  async list(): Promise<Reminder[]> {
    return inTauri ? invoke<Reminder[]>("list_reminders") : readPreview();
  },

  async create(title: string, scheduledAt: number): Promise<Reminder> {
    if (inTauri) return invoke<Reminder>("create_reminder", { title, scheduledAt });
    const reminders = readPreview();
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      title,
      scheduledAt,
      completed: false,
      notifiedAt: null,
    };
    writePreview([...reminders, reminder]);
    return reminder;
  },

  async move(id: string, scheduledAt: number): Promise<Reminder> {
    if (inTauri) return invoke<Reminder>("move_reminder", { id, scheduledAt });
    let changed: Reminder | undefined;
    const reminders = readPreview().map((reminder) => {
      if (reminder.id !== id) return reminder;
      changed = { ...reminder, scheduledAt, completed: false, notifiedAt: null };
      return changed;
    });
    if (!changed) throw new Error("Reminder not found");
    writePreview(reminders);
    return changed;
  },

  async complete(id: string): Promise<Reminder> {
    if (inTauri) return invoke<Reminder>("complete_reminder", { id });
    let changed: Reminder | undefined;
    const reminders = readPreview().map((reminder) => {
      if (reminder.id !== id) return reminder;
      changed = { ...reminder, completed: true };
      return changed;
    });
    if (!changed) throw new Error("Reminder not found");
    writePreview(reminders);
    return changed;
  },

  async remove(id: string): Promise<void> {
    if (inTauri) return invoke<void>("delete_reminder", { id });
    writePreview(readPreview().filter((reminder) => reminder.id !== id));
  },
};
