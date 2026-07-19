import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

export type AvailableUpdate = {
  version: string;
  notes: string;
  install: () => Promise<void>;
};

export const updateApi = {
  async check(): Promise<AvailableUpdate | null> {
    const update = await check();
    if (!update) return null;

    return {
      version: update.version,
      notes: update.body?.trim() || "A new version of Remind Me is ready.",
      install: async () => {
        await update.downloadAndInstall();
        await relaunch();
      },
    };
  },
};
