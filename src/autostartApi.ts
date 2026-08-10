import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

const inTauri = "__TAURI_INTERNALS__" in window;

export const autostartApi = {
  isNative: inTauri,

  async isEnabled(): Promise<boolean> {
    return inTauri ? isEnabled() : false;
  },

  async set(enabled: boolean): Promise<void> {
    if (!inTauri) return;
    if (enabled) await enable();
    else await disable();
  },
};
