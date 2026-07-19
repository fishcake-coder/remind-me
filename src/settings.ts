export const SLOT_INTERVALS = [1, 5, 15] as const;

export type Theme = "light" | "dark";
export type SlotInterval = (typeof SLOT_INTERVALS)[number];

export type AppSettings = {
  theme: Theme;
  slotInterval: SlotInterval;
};

const STORAGE_KEY = "remind-me:settings:v1";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  slotInterval: 5,
};

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved) as Partial<AppSettings>;
    const theme = parsed.theme === "dark" ? "dark" : "light";
    const slotInterval = SLOT_INTERVALS.includes(parsed.slotInterval as SlotInterval)
      ? parsed.slotInterval as SlotInterval
      : DEFAULT_SETTINGS.slotInterval;
    return { theme, slotInterval };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
