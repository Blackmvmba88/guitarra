import test from "node:test";
import assert from "node:assert/strict";
import { detectOnsets } from "../web/core/onset.js";

function fakeBuffer({ sampleRate = 48000, duration = 1.0, attacks = [0.2, 0.5, 0.8] } = {}) {
  const length = Math.floor(sampleRate * duration);
  const data = new Float32Array(length);

  for (const attack of attacks) {
    const start = Math.floor(attack * sampleRate);
    const burstLength = Math.floor(sampleRate * 0.02);
    for (let i = 0; i < burstLength && start + i < length; i += 1) {
      const envelope = 1 - i / burstLength;
      data[start + i] += Math.sin((2 * Math.PI * 440 * i) / sampleRate) * envelope;
    }
  }

  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration,
    getChannelData(channel) {
      assert.equal(channel, 0);
      return data;
    }
  };
}

test("same audio and settings produce identical events", () => {
  const buffer = fakeBuffer();
  const a = detectOnsets(buffer, 1.2);
  const b = detectOnsets(buffer, 1.2);
  assert.deepEqual(a, b);
});

test("synthetic attacks create an ordered non-empty event map", () => {
  const events = detectOnsets(fakeBuffer(), 1.2);
  assert.ok(events.length >= 3);
  for (let i = 1; i < events.length; i += 1) {
    assert.ok(events[i].start >= events[i - 1].start);
    assert.ok(events[i].end > events[i].start);
  }
});
