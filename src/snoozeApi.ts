import { invoke } from "@tauri-apps/api/core";
import { loadSettings, normalizeSnoozeDurations } from "./settings";
import type { SnoozeDurations } from "./settings";

const inTauri = "__TAURI_INTERNALS__" in window;

export const snoozeApi = {
  async get(): Promise<SnoozeDurations> {
    if (!inTauri) return loadSettings().snoozeDurations;
    const durations = await invoke<unknown>("get_snooze_durations");
    return normalizeSnoozeDurations(durations);
  },

  async set(durations: SnoozeDurations): Promise<void> {
    if (inTauri) await invoke("set_snooze_durations", { durations });
  },
};
