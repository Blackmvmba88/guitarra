import {
  buildSlicesFromOnsets,
  detectOnsetTimesFromMono
} from "../core/onset.js";
import {
  createBakeWindows,
  mergeOnsets,
  selectOwnedOnsets
} from "../core/progressive-bake.js";

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || message.type !== "BAKE") return;

  const startedAt = performance.now();
  const channels = message.channels.map((buffer) => new Float32Array(buffer));
  const length = channels[0]?.length ?? 0;

  if (!length || !message.sampleRate || !message.duration) {
    self.postMessage({ type: "ERROR", generation: message.generation, error: "INVALID_AUDIO" });
    return;
  }

  const windows = createBakeWindows(message.duration, {
    windowSeconds: message.windowSeconds ?? 12,
    overlapSeconds: message.overlapSeconds ?? 0.35
  });
  const divisor = Math.max(1, channels.length);
  let globalOnsets = [];

  for (const window of windows) {
    const startSample = Math.max(0, Math.floor(window.contextStart * message.sampleRate));
    const endSample = Math.min(length, Math.ceil(window.contextEnd * message.sampleRate));
    const mono = new Float32Array(Math.max(0, endSample - startSample));

    for (let channel = 0; channel < channels.length; channel += 1) {
      const data = channels[channel];
      for (let sourceIndex = startSample, localIndex = 0; sourceIndex < endSample; sourceIndex += 1, localIndex += 1) {
        mono[localIndex] += data[sourceIndex] / divisor;
      }
    }

    const localOnsets = detectOnsetTimesFromMono(
      mono,
      message.sampleRate,
      message.sensitivity,
      { includeOrigin: window.isFirst }
    );
    const owned = selectOwnedOnsets(localOnsets, window);
    globalOnsets = mergeOnsets(globalOnsets, owned);

    const provisional = buildSlicesFromOnsets(globalOnsets, window.ownEnd);
    const safeSlices = window.isLast ? provisional : provisional.slice(0, -1);
    const progress = window.ownEnd / message.duration;

    self.postMessage({
      type: "BAKE_PROGRESS",
      generation: message.generation,
      sourceHash: message.sourceHash,
      sensitivity: message.sensitivity,
      slices: safeSlices,
      bakedThrough: window.ownEnd,
      progress,
      windowIndex: window.index,
      totalWindows: windows.length,
      elapsedMs: performance.now() - startedAt
    });

    // Yield between windows so progress can reach the UI immediately.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const slices = buildSlicesFromOnsets(globalOnsets, message.duration);

  self.postMessage({
    type: "BAKED",
    generation: message.generation,
    sourceHash: message.sourceHash,
    sensitivity: message.sensitivity,
    slices,
    bakedThrough: message.duration,
    progress: 1,
    elapsedMs: performance.now() - startedAt
  });
};
