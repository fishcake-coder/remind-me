import assert from "node:assert/strict";
import test from "node:test";
import { buildTimeSlots, nextIntervalSlot, ONE_MINUTE } from "../src/time.ts";

const at = (hour: number, minute: number, second = 0) => Date.UTC(2026, 6, 19, hour, minute, second);

test("nextIntervalSlot is always a future boundary", () => {
  assert.equal(nextIntervalSlot(at(12, 5), 5), at(12, 10));
  assert.equal(nextIntervalSlot(at(12, 5, 1), 5), at(12, 10));
  assert.equal(nextIntervalSlot(at(12, 14, 59), 15), at(12, 15));
});

test("slots remain stable until the selected interval boundary", () => {
  const before = buildTimeSlots(at(12, 1), 5).map((slot) => slot.timestamp);
  const sameWindow = buildTimeSlots(at(12, 4, 59), 5).map((slot) => slot.timestamp);
  const advanced = buildTimeSlots(at(12, 5), 5).map((slot) => slot.timestamp);
  assert.equal(before[0], sameWindow[0]);
  assert.equal(advanced[0], at(12, 10));
  assert.ok(!advanced.includes(at(12, 5)));
});

test("slots contain only the upcoming 90-minute window", () => {
  const now = at(12, 3, 20);
  const slots = buildTimeSlots(now, 5, 90);
  assert.ok(slots.every((slot) => slot.timestamp > now));
  assert.ok(slots.every((slot) => slot.timestamp <= now + 90 * ONE_MINUTE));
});

test("an exact off-grid reminder stays attached to its scheduled time", () => {
  const now = at(12, 3);
  const reminderTime = at(12, 7, 30);
  const slots = buildTimeSlots(now, 5, 90, [reminderTime]);
  assert.ok(slots.some((slot) => slot.timestamp === reminderTime));
  assert.deepEqual(slots.map((slot) => slot.timestamp), [...slots].map((slot) => slot.timestamp).sort((a, b) => a - b));
});
