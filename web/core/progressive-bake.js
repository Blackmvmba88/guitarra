export const DEFAULT_WINDOW_SECONDS = 12;
export const DEFAULT_OVERLAP_SECONDS = 0.35;
export const ONSET_DEDUPE_SECONDS = 0.03;

export function createBakeWindows(
  duration,
  {
    windowSeconds = DEFAULT_WINDOW_SECONDS,
    overlapSeconds = DEFAULT_OVERLAP_SECONDS
  } = {}
) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new Error("windowSeconds must be > 0");
  }
  if (!Number.isFinite(overlapSeconds) || overlapSeconds < 0) {
    throw new Error("overlapSeconds must be >= 0");
  }

  const windows = [];
  let ownStart = 0;
  let index = 0;

  while (ownStart < duration) {
    const ownEnd = Math.min(duration, ownStart + windowSeconds);
    const contextStart = Math.max(0, ownStart - overlapSeconds);
    const contextEnd = Math.min(duration, ownEnd + overlapSeconds);

    windows.push({
      index,
      ownStart,
      ownEnd,
      contextStart,
      contextEnd,
      isFirst: index === 0,
      isLast: ownEnd >= duration
    });

    ownStart = ownEnd;
    index += 1;
  }

  return windows;
}

export function selectOwnedOnsets(localOnsets, window) {
  const epsilon = 1e-6;
  return localOnsets
    .map((localTime) => localTime + window.contextStart)
    .filter((globalTime) => {
      if (globalTime < window.ownStart - epsilon) return false;
      if (window.isLast) return globalTime <= window.ownEnd + epsilon;
      return globalTime < window.ownEnd - epsilon;
    });
}

export function mergeOnsets(
  existing,
  incoming,
  dedupeSeconds = ONSET_DEDUPE_SECONDS
) {
  const ordered = [...existing, ...incoming]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (!ordered.length) return [];

  const merged = [ordered[0]];
  for (let i = 1; i < ordered.length; i += 1) {
    const value = ordered[i];
    const previous = merged[merged.length - 1];
    if (value - previous >= dedupeSeconds) merged.push(value);
  }

  return merged;
}
