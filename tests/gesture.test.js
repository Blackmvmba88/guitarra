import test from "node:test";
import assert from "node:assert/strict";
import { PickGestureDetector } from "../web/core/gesture.js";

test("one excursion produces at most one pick until reset", () => {
  const detector = new PickGestureDetector({ deadzone: 0.15, trigger: 0.65, reset: 0.25 });
  let now = 0;

  assert.equal(detector.update(0, now += 16), null);
  const first = detector.update(0.8, now += 16);
  assert.ok(first);
  assert.equal(first.direction, "RIGHT");

  assert.equal(detector.update(0.95, now += 16), null);
  assert.equal(detector.update(0.7, now += 16), null);

  assert.equal(detector.update(0.2, now += 16), null);
  const second = detector.update(-0.82, now += 16);
  assert.ok(second);
  assert.equal(second.direction, "LEFT");
});

test("deadzone noise never triggers", () => {
  const detector = new PickGestureDetector();
  let now = 0;
  for (const x of [0.01, -0.08, 0.12, -0.14, 0.03]) {
    assert.equal(detector.update(x, now += 8), null);
  }
});

test("strength remains normalized", () => {
  const detector = new PickGestureDetector();
  const gesture = detector.update(1, 16);
  assert.ok(gesture);
  assert.ok(gesture.strength >= 0 && gesture.strength <= 1);
  assert.ok(gesture.velocity >= 0 && gesture.velocity <= 1);
});
