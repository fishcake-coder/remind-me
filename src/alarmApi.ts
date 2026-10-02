import { invoke } from "@tauri-apps/api/core";
import classicUrl from "../src-tauri/resources/sounds/classic-alarm.wav?url";
import digitalUrl from "../src-tauri/resources/sounds/digital-alarm.wav?url";
import sunriseUrl from "../src-tauri/resources/sounds/sunrise-alarm.wav?url";
import type { Reminder } from "./types";

export type AlarmSound = { id: string; name: string; custom: boolean };
type StoredSound = AlarmSound & { blob: Blob };
const inTauri = "__TAURI_INTERNALS__" in window;
const SELECTED_KEY = "remind-me-alarm-sound:v1";
const builtins: AlarmSound[] = [
  { id: "classic", name: "Classic clock", custom: false },
  { id: "digital", name: "Digital pulse", custom: false },
  { id: "sunrise", name: "Sunrise melody", custom: false },
];
const builtinUrls: Record<string, string> = { classic: classicUrl, digital: digitalUrl, sunrise: sunriseUrl };
let preview: HTMLAudioElement | undefined;
let previewUrl: string | undefined;
let previewTimer: number | undefined;
let ringing: HTMLAudioElement | undefined;
let ringingUrl: string | undefined;
let ringingKey = "";
let audioGeneration = 0;

async function library<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("remind-me-alarm-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("songs", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Song storage is unavailable"));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("songs", mode);
      const request = action(transaction.objectStore("songs"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(new Error("Could not save your song"));
    });
  } finally { database.close(); }
}

async function audioUrl(id: string) {
  if (builtinUrls[id]) return builtinUrls[id];
  const song = await library<StoredSound | undefined>("readonly", (store) => store.get(id));
  if (!song) throw new Error("Song is unavailable. Choose another sound.");
  return URL.createObjectURL(song.blob);
}

function stopPreview() {
  preview?.pause();
  preview = undefined;
  window.clearTimeout(previewTimer);
  if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
}

export const alarmApi = {
  async list(): Promise<AlarmSound[]> {
    if (inTauri) return invoke("list_alarm_sounds");
    const songs = await library<StoredSound[]>("readonly", (store) => store.getAll());
    return [...builtins, ...songs.map(({ id, name, custom }) => ({ id, name, custom }))];
  },
  async selected(): Promise<string> {
    return inTauri ? invoke("get_alarm_sound") : localStorage.getItem(SELECTED_KEY) ?? "classic";
  },
  async select(sound: string): Promise<void> {
    if (inTauri) await invoke("set_alarm_sound", { sound });
    else localStorage.setItem(SELECTED_KEY, sound);
  },
  async import(file: File): Promise<AlarmSound> {
    if (!/\.(mp3|wav|ogg|flac)$/i.test(file.name)) throw new Error("Choose an MP3, WAV, OGG or FLAC file");
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Choose an audio file under 20 MB");
    const bytes = await file.arrayBuffer();
    if (inTauri) return invoke("import_alarm_sound", { name: file.name, bytes: Array.from(new Uint8Array(bytes)) });
    const songs = await library<StoredSound[]>("readonly", (store) => store.getAll());
    if (songs.length >= 5) throw new Error("You can keep up to five songs. Remove one before adding another.");
    const context = new AudioContext();
    try { await context.decodeAudioData(bytes); }
    catch { throw new Error("This audio file cannot be played"); }
    finally { await context.close(); }
    const sound = { id: `custom:${crypto.randomUUID()}`, name: file.name, custom: true };
    await library("readwrite", (store) => store.put({ ...sound, blob: file }));
    return sound;
  },
  async remove(id: string): Promise<void> {
    if (inTauri) await invoke("remove_alarm_sound", { id });
    else {
      if (await this.selected() === id) await this.select("classic");
      await library("readwrite", (store) => store.delete(id));
    }
  },
  async preview(sound: string): Promise<void> {
    if (inTauri) return invoke("preview_alarm_sound", { sound });
    if (ringing) throw new Error("Stop the ringing alarm before previewing a sound");
    stopPreview();
    previewUrl = await audioUrl(sound);
    preview = new Audio(previewUrl);
    preview.volume = 0.8;
    await preview.play();
    previewTimer = window.setTimeout(stopPreview, 8000);
  },
  async stopPreview(): Promise<void> {
    if (inTauri) await invoke("stop_alarm_preview");
    else stopPreview();
  },
  async error(): Promise<string | null> {
    return inTauri ? invoke("get_alarm_audio_error") : null;
  },
  async syncBrowser(reminders: Reminder[]): Promise<void> {
    if (inTauri) return;
    const current = reminders.filter((item) => item.alarmStartedAt != null).sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    const sound = await this.selected();
    const key = current ? `${current.id}:${sound}` : "";
    if (key === ringingKey) return;
    ringingKey = key;
    const generation = ++audioGeneration;
    ringing?.pause();
    ringing = undefined;
    if (ringingUrl?.startsWith("blob:")) URL.revokeObjectURL(ringingUrl);
    if (!current) return;
    stopPreview();
    const url = await audioUrl(sound).catch(() => classicUrl);
    if (generation !== audioGeneration) { if (url.startsWith("blob:")) URL.revokeObjectURL(url); return; }
    ringingUrl = url;
    ringing = new Audio(url);
    ringing.loop = true;
    ringing.volume = 0.8;
    try { await ringing.play(); }
    catch { ringingKey = ""; throw new Error("Your browser blocked alarm audio. The desktop app rings in the background."); }
  },
};
