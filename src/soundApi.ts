import { invoke } from "@tauri-apps/api/core";
import type { NotificationSound } from "./settings";

const inTauri = "__TAURI_INTERNALS__" in window;

function previewTone(sound: NotificationSound) {
  if (sound === "none") return;
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = sound === "gentle" ? 523 : sound === "bell" ? 784 : 659;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.36);
  oscillator.addEventListener("ended", () => void context.close());
}

export const soundApi = {
  async get(): Promise<NotificationSound> {
    return inTauri ? invoke<NotificationSound>("get_notification_sound") : "default";
  },

  async set(sound: NotificationSound): Promise<void> {
    if (inTauri) await invoke("set_notification_sound", { sound });
  },

  async preview(sound: NotificationSound): Promise<void> {
    if (inTauri) await invoke("preview_notification_sound", { sound });
    else previewTone(sound);
  },
};
