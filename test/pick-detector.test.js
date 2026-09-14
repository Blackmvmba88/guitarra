const test = require("node:test");
const assert = require("node:assert/strict");
const { PickDetector } = require("../src/pick-detector");

function frame(timestampMs, rx, ry = 0) {
  return {
    protocol: "blackmamba.runtime.frame.v0",
    timestampMs,
    buttons: {},
    transitions: {},
    axes: {
      RX: { value: rx, raw: rx, source: "A2" },
      RY: { value: ry, raw: ry, source: "A3" }
    }
  };
}

test("one flick creates one pick and requires neutral rearm", () => {
  const detector = new PickDetector();

  assert.equal(detector.push(frame(0, 0)), null);
  const first = detector.push(frame(20, 0.9));
  assert.equal(first.type, "pick");
  assert.equal(first.direction, "right");

  assert.equal(detector.push(frame(30, 1.0)), null);
  assert.equal(detector.push(frame(45, 0.8)), null);

  assert.equal(detector.push(frame(70, 0.1)), null);
  const second = detector.push(frame(110, -0.9));
  assert.equal(second.direction, "left");
});

test("small stick noise does not trigger", () => {
  const detector = new PickDetector();
  for (let t = 0; t <= 100; t += 10) {
    assert.equal(detector.push(frame(t, 0.12)), null);
  }
});

test("vertical-only movement does not trigger a horizontal pick", () => {
  const detector = new PickDetector();
  assert.equal(detector.push(frame(0, 0, 0)), null);
  assert.equal(detector.push(frame(20, 0.1, 0.95)), null);
});

test("wrong protocol is ignored", () => {
  const detector = new PickDetector();
  assert.equal(detector.push({ protocol: "something.else" }), null);
});
