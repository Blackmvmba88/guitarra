export function detectOnsets(audioBuffer, sensitivity = 1.6) {
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = 1024;
  const hopSize = 512;

  const mono = new Float32Array(length);
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mono[i] += data[i] / channelCount;
  }

  const energy = [];
  for (let start = 0; start + frameSize < length; start += hopSize) {
    let sum = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const sample = mono[start + i];
      sum += sample * sample;
    }
    energy.push(Math.sqrt(sum / frameSize));
  }

  const novelty = new Float32Array(energy.length);
  for (let i = 1; i < energy.length; i += 1) {
    novelty[i] = Math.max(0, energy[i] - energy[i - 1]);
  }

  const windowRadius = 10;
  const minGapSeconds = 0.055;
  const minGapFrames = Math.max(1, Math.round((minGapSeconds * sampleRate) / hopSize));
  const onsets = [];
  let lastAccepted = -minGapFrames;

  for (let i = 1; i < novelty.length - 1; i += 1) {
    const from = Math.max(0, i - windowRadius);
    const to = Math.min(novelty.length - 1, i + windowRadius);
    let mean = 0;
    let count = 0;
    for (let j = from; j <= to; j += 1) {
      mean += novelty[j];
      count += 1;
    }
    mean /= count;

    let variance = 0;
    for (let j = from; j <= to; j += 1) {
      const delta = novelty[j] - mean;
      variance += delta * delta;
    }
    const std = Math.sqrt(variance / count);
    const threshold = mean + sensitivity * std;
    const peak = novelty[i] >= novelty[i - 1] && novelty[i] > novelty[i + 1];

    if (peak && novelty[i] > threshold && i - lastAccepted >= minGapFrames) {
      onsets.push((i * hopSize) / sampleRate);
      lastAccepted = i;
    }
  }

  if (onsets.length === 0 || onsets[0] > 0.08) onsets.unshift(0);

  return buildSlices(onsets, audioBuffer.duration);
}

function buildSlices(onsets, duration) {
  const slices = [];
  const maxSlice = 1.25;
  const minSlice = 0.035;

  for (let i = 0; i < onsets.length; i += 1) {
    const start = onsets[i];
    const naturalEnd = i + 1 < onsets.length ? onsets[i + 1] : duration;
    const end = Math.min(duration, start + Math.min(maxSlice, Math.max(minSlice, naturalEnd - start)));
    if (end > start) {
      slices.push({ id: `event_${String(i + 1).padStart(4, "0")}`, start, end });
    }
  }

  return slices;
}
