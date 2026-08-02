import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SNOOZE_DURATIONS, normalizeSnoozeDurations } from "../src/settings.ts";

test("snooze settings default to five, fifteen, and thirty minutes", () => {
  assert.deepEqual(DEFAULT_SNOOZE_DURATIONS, [5, 15, 30]);
});

test("invalid snooze settings fall back per option", () => {
  assert.deepEqual(normalizeSnoozeDurations([10, 0, 90]), [10, 15, 90]);
  assert.deepEqual(normalizeSnoozeDurations([1.5, "15", -3]), [5, 15, 30]);
});
