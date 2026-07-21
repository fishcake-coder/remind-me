import assert from "node:assert/strict";
import test from "node:test";
import { dragAutoScrollVelocity } from "../src/drag.ts";

test("dragging near the timeline edges scrolls in the expected direction", () => {
  assert.ok(dragAutoScrollVelocity(105, 100, 500) < 0);
  assert.equal(dragAutoScrollVelocity(300, 100, 500), 0);
  assert.ok(dragAutoScrollVelocity(495, 100, 500) > 0);
});

test("dragging just beyond an edge keeps scrolling but distant pointers do not", () => {
  assert.ok(dragAutoScrollVelocity(510, 100, 500) > 0);
  assert.equal(dragAutoScrollVelocity(540, 100, 500), 0);
});
