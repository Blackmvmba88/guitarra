class PickDetector {
  constructor(options = {}) {
    this.triggerThreshold = options.triggerThreshold ?? 0.68;
    this.resetThreshold = options.resetThreshold ?? 0.24;
    this.verticalLimit = options.verticalLimit ?? 0.75;
    this.minIntervalMs = options.minIntervalMs ?? 35;

    this.armed = true;
    this.lastTimestampMs = null;
    this.lastRx = 0;
    this.lastSpeed = 0;
    this.lastPickAt = -Infinity;
  }

  push(frame) {
    if (!frame || frame.protocol !== "blackmamba.runtime.frame.v0") return null;

    const timestampMs = Number(frame.timestampMs ?? Date.now());
    const rx = Number(frame.axes?.RX?.value ?? 0);
    const ry = Number(frame.axes?.RY?.value ?? 0);

    const dtMs = this.lastTimestampMs == null
      ? 0
      : Math.max(1, timestampMs - this.lastTimestampMs);

    const speed = dtMs > 0 ? Math.abs(rx - this.lastRx) / (dtMs / 1000) : 0;
    const acceleration = dtMs > 0 ? (speed - this.lastSpeed) / (dtMs / 1000) : 0;

    if (Math.abs(rx) <= this.resetThreshold && Math.abs(ry) <= this.verticalLimit) {
      this.armed = true;
    }

    let event = null;
    const enoughTime = timestampMs - this.lastPickAt >= this.minIntervalMs;
    const horizontalStrike = Math.abs(rx) >= this.triggerThreshold;
    const verticalOk = Math.abs(ry) <= this.verticalLimit;

    if (this.armed && enoughTime && horizontalStrike && verticalOk) {
      event = {
        protocol: "blackmamba.guitarra.pick.v0",
        type: "pick",
        timestampMs,
        direction: rx < 0 ? "left" : "right",
        strength: Math.min(1, Math.abs(rx)),
        speed: Number(speed.toFixed(3)),
        acceleration: Number(acceleration.toFixed(3)),
        axes: { RX: rx, RY: ry }
      };

      this.armed = false;
      this.lastPickAt = timestampMs;
    }

    this.lastTimestampMs = timestampMs;
    this.lastRx = rx;
    this.lastSpeed = speed;

    return event;
  }
}

module.exports = { PickDetector };
