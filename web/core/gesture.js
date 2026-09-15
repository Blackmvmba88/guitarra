export class PickGestureDetector {
  constructor({ deadzone = 0.15, trigger = 0.65, reset = 0.25 } = {}) {
    this.deadzone = deadzone;
    this.trigger = trigger;
    this.reset = reset;
    this.armed = true;
    this.lastX = 0;
    this.lastTime = performance.now();
  }

  update(rawX, now = performance.now()) {
    const x = Math.abs(rawX) < this.deadzone ? 0 : rawX;
    const dt = Math.max(1, now - this.lastTime);
    const dx = x - this.lastX;
    const velocity = Math.min(1, Math.abs(dx) / dt * 18);
    let gesture = null;

    if (this.armed && Math.abs(x) >= this.trigger) {
      const direction = x > 0 ? "RIGHT" : "LEFT";
      const travelStrength = (Math.abs(x) - this.trigger) / Math.max(0.001, 1 - this.trigger);
      gesture = {
        type: "pick",
        direction,
        x,
        strength: clamp01(0.55 * travelStrength + 0.45 * velocity),
        velocity,
        timestamp: now
      };
      this.armed = false;
    }

    if (!this.armed && Math.abs(x) <= this.reset) {
      this.armed = true;
    }

    this.lastX = x;
    this.lastTime = now;
    return gesture;
  }

  resetState() {
    this.armed = true;
    this.lastX = 0;
    this.lastTime = performance.now();
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
