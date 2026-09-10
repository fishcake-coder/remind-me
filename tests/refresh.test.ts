import assert from "node:assert/strict";
import test from "node:test";
import { nextTimelineRefresh, ONE_MINUTE } from "../src/time.ts";

test("idle timeline wakes on the next minute rather than every second", () => {
  assert.equal(nextTimelineRefresh(60_000, 90, []), 60_000);
  assert.equal(nextTimelineRefresh(61_234, 90, []), 58_766);
});

test("off-grid reminders enter and leave the timeline at their exact times", () => {
  assert.equal(nextTimelineRefresh(60_000, 90, [65_123]), 5_123);
  assert.equal(nextTimelineRefresh(60_000, 90, [65_123 + 90 * ONE_MINUTE]), 5_123);
  assert.equal(nextTimelineRefresh(65_123, 90, [65_123]), 54_877);
});
