export const SLOT_INTERVALS = [1, 5, 15] as const;
export const NOTIFICATION_SOUNDS = ["default", "gentle", "bell", "chime", "none"] as const;
export const DEFAULT_SNOOZE_DURATIONS = [5, 15, 30] as const;
export const MIN_SNOOZE_MINUTES = 1;
export const MAX_SNOOZE_MINUTES = 7 * 24 * 60;

export type Theme = "light" | "dark";
export type SlotInterval = (typeof SLOT_INTERVALS)[number];
export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number];
export type SnoozeDurations = [number, number, number];

export type AppSettings = {
  theme: Theme;
  slotInterval: SlotInterval;
  notificationSound: NotificationSound;
  snoozeDurations: SnoozeDurations;
};

const STORAGE_KEY = "remind-me:settings:v1";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  slotInterval: 5,
  notificationSound: "default",
  snoozeDurations: [...DEFAULT_SNOOZE_DURATIONS],
};

export function normalizeSnoozeDurations(value: unknown): SnoozeDurations {
  const values = Array.isArray(value) ? value : [];
  return DEFAULT_SNOOZE_DURATIONS.map((fallback, index) => {
    const candidate = values[index];
    return typeof candidate === "number"
      && Number.isInteger(candidate)
      && candidate >= MIN_SNOOZE_MINUTES
      && candidate <= MAX_SNOOZE_MINUTES
      ? candidate
      : fallback;
  }) as SnoozeDurations;
}

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS, snoozeDurations: [...DEFAULT_SNOOZE_DURATIONS] };
    const parsed = JSON.parse(saved) as Partial<AppSettings>;
    const theme = parsed.theme === "dark" ? "dark" : "light";
    const slotInterval = SLOT_INTERVALS.includes(parsed.slotInterval as SlotInterval)
      ? parsed.slotInterval as SlotInterval
      : DEFAULT_SETTINGS.slotInterval;
    const notificationSound = NOTIFICATION_SOUNDS.includes(parsed.notificationSound as NotificationSound)
      ? parsed.notificationSound as NotificationSound
      : DEFAULT_SETTINGS.notificationSound;
    return { theme, slotInterval, notificationSound, snoozeDurations: normalizeSnoozeDurations(parsed.snoozeDurations) };
  } catch {
    return { ...DEFAULT_SETTINGS, snoozeDurations: [...DEFAULT_SNOOZE_DURATIONS] };
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
