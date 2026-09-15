import test from "node:test";
import assert from "node:assert/strict";
import {
  createBakeWindows,
  mergeOnsets,
  selectOwnedOnsets
} from "../web/core/progressive-bake.js";

test("progressive windows cover the song exactly once while context overlaps", () => {
  const windows = createBakeWindows(25, {
    windowSeconds: 12,
    overlapSeconds: 0.35
  });

  assert.equal(windows.length, 3);
  assert.deepEqual(
    windows.map(({ ownStart, ownEnd }) => [ownStart, ownEnd]),
    [[0, 12], [12, 24], [24, 25]]
  );

  assert.deepEqual(
    windows.map(({ contextStart, contextEnd }) => [contextStart, contextEnd]),
    [[0, 12.35], [11.65, 24.35], [23.65, 25]]
  );

  assert.equal(windows[0].isFirst, true);
  assert.equal(windows[2].isLast, true);
});

test("ownership removes duplicate events from overlap boundaries", () => {
  const [first, second] = createBakeWindows(24, {
    windowSeconds: 12,
    overlapSeconds: 0.35
  });

  const firstOwned = selectOwnedOnsets([0, 11.95, 12.02], first);
  const secondOwned = selectOwnedOnsets([0.30, 0.37, 0.75], second);

  assert.deepEqual(firstOwned, [0, 11.95]);
  assert.ok(Math.abs(secondOwned[0] - 12.02) < 1e-9);
  assert.ok(Math.abs(secondOwned[1] - 12.4) < 1e-9);
});

test("mergeOnsets is ordered and rejects near-identical boundary detections", () => {
  const merged = mergeOnsets(
    [0, 4.2, 11.995],
    [12.004, 12.4, 18.0],
    0.03
  );

  assert.deepEqual(merged, [0, 4.2, 11.995, 12.4, 18]);
});

test("invalid progressive window configuration fails explicitly", () => {
  assert.throws(() => createBakeWindows(10, { windowSeconds: 0 }), /windowSeconds/);
  assert.throws(() => createBakeWindows(10, { overlapSeconds: -1 }), /overlapSeconds/);
});
