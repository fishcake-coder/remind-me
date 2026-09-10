import assert from "node:assert/strict";
import test from "node:test";
import { loadDraft, saveDraft } from "../src/draft.ts";

test("composer survives window destruction and clears after saving", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  const reminder = { id: "test", title: "Original", scheduledAt: 123, completed: false, notifiedAt: null, missedAt: null };
  saveDraft({ title: "Unfinished edit", editingReminder: reminder });
  assert.deepEqual(loadDraft(), { title: "Unfinished edit", editingReminder: reminder });
  saveDraft({ title: "", editingReminder: null });
  assert.deepEqual(loadDraft(), { title: "", editingReminder: null });
  values.set("remind-me-composer-draft:v1", "broken JSON");
  assert.deepEqual(loadDraft(), { title: "", editingReminder: null });
});
