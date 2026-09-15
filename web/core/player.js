export class SlicePlayer {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.buffer = null;
  }

  setBuffer(buffer) {
    this.buffer = buffer;
  }

  playSlice(slice, { strength = 0.7, semitones = 0 } = {}) {
    if (!this.buffer || !slice) return null;

    const source = this.audioContext.createBufferSource();
    const gain = this.audioContext.createGain();
    const rate = Math.pow(2, semitones / 12);
    const duration = Math.max(0.02, slice.end - slice.start);

    source.buffer = this.buffer;
    source.playbackRate.value = rate;
    gain.gain.value = 0.18 + 0.82 * Math.max(0, Math.min(1, strength));

    source.connect(gain);
    gain.connect(this.audioContext.destination);

    const scheduledAt = this.audioContext.currentTime;
    source.start(0, slice.start, duration);

    return {
      scheduledAt,
      rate,
      sourceStart: slice.start,
      sourceDuration: duration
    };
  }
}
