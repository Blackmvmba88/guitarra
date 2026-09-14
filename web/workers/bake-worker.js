import { detectOnsetsFromMono } from "../core/onset.js";

self.onmessage = (event) => {
  const message = event.data;
  if (!message || message.type !== "BAKE") return;

  const startedAt = performance.now();
  const channels = message.channels.map((buffer) => new Float32Array(buffer));
  const length = channels[0]?.length ?? 0;

  if (!length || !message.sampleRate || !message.duration) {
    self.postMessage({ type: "ERROR", generation: message.generation, error: "INVALID_AUDIO" });
    return;
  }

  const mono = new Float32Array(length);
  const divisor = Math.max(1, channels.length);

  for (let channel = 0; channel < channels.length; channel += 1) {
    const data = channels[channel];
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / divisor;
    }
  }

  const slices = detectOnsetsFromMono(
    mono,
    message.sampleRate,
    message.duration,
    message.sensitivity
  );

  self.postMessage({
    type: "BAKED",
    generation: message.generation,
    sourceHash: message.sourceHash,
    sensitivity: message.sensitivity,
    slices,
    elapsedMs: performance.now() - startedAt
  });
};
