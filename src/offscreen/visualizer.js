import { MESSAGES } from "../shared/contracts.js";

function averageBins(values, start, end) {
  let total = 0;
  const first = Math.max(0, Math.min(values.length, start));
  const last = Math.max(first + 1, Math.min(values.length, end));
  for (let index = first; index < last; index += 1) total += values[index];
  return total / (last - first) / 255;
}

const SPECTRUM_BAND_COUNT = 320;
const ACTIVE_SAMPLE_INTERVAL_MS = 33;
const IDLE_SAMPLE_INTERVAL_MS = 240;

function spectrumBinRanges(binCount, sampleRate = 48000, bandCount = SPECTRUM_BAND_COUNT) {
  const nyquist = Math.max(1, sampleRate / 2);
  const minimumFrequency = 36;
  const maximumFrequency = Math.min(18000, nyquist * 0.94);
  const ratio = maximumFrequency / minimumFrequency;
  return Array.from({ length: bandCount }, (_, index) => {
    const startFrequency = minimumFrequency * Math.pow(ratio, index / bandCount);
    const endFrequency = minimumFrequency * Math.pow(ratio, (index + 1) / bandCount);
    const first = Math.max(1, Math.min(binCount - 1, Math.floor(startFrequency / nyquist * binCount)));
    const last = Math.max(first + 1, Math.min(binCount, Math.ceil(endFrequency / nyquist * binCount)));
    return [first, last];
  });
}

function logarithmicSpectrum(values, ranges, output) {
  for (let index = 0; index < ranges.length; index += 1) {
    const [first, last] = ranges[index];
    let squareTotal = 0;
    let peak = 0;
    for (let bin = first; bin < last; bin += 1) {
      const value = values[bin] / 255;
      squareTotal += value * value;
      peak = Math.max(peak, value);
    }
    const rms = Math.sqrt(squareTotal / Math.max(1, last - first));
    const measured = peak * 0.68 + rms * 0.32;
    const gated = Math.max(0, (measured - 0.04) / 0.96);
    output[index] = Math.min(1, Math.pow(gated, 1.08));
  }
  return output;
}

export function startVisualizerSignal({ analyser, audio, isPlaying }) {
  let level = 0;
  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  const smoothedSpectrum = new Float32Array(SPECTRUM_BAND_COUNT);
  const ranges = spectrumBinRanges(frequencies.length, analyser.context?.sampleRate);
  const measuredSpectrum = new Float64Array(SPECTRUM_BAND_COUNT);
  let nextSampleAt = performance.now();
  const sample = () => {
    const playing = isPlaying();
    let bass = 0, mid = 0, high = 0;
    if (playing) {
      analyser.getByteFrequencyData(frequencies);
      bass = averageBins(frequencies, 1, Math.ceil(frequencies.length * 0.12));
      mid = averageBins(frequencies, Math.ceil(frequencies.length * 0.12), Math.ceil(frequencies.length * 0.46));
      high = averageBins(frequencies, Math.ceil(frequencies.length * 0.46), frequencies.length);
    }
    if (playing) logarithmicSpectrum(frequencies, ranges, measuredSpectrum);
    else measuredSpectrum.fill(0);
    for (let index = 0; index < smoothedSpectrum.length; index += 1) {
      const target = measuredSpectrum[index];
      smoothedSpectrum[index] += (target - smoothedSpectrum[index]) * (target > smoothedSpectrum[index] ? 0.88 : 0.28);
    }
    const target = playing ? Math.min(1, bass * 0.5 + mid * 0.34 + high * 0.16) : 0;
    level += (target - level) * (target > level ? 0.68 : 0.12);
    chrome.runtime.sendMessage({
      target: "background",
      type: MESSAGES.OFFSCREEN_VISUALIZER,
      signal: {
        level, bass, mid, high, playing,
        spectrum: Array.from(smoothedSpectrum, (value) => Math.round(value * 255))
      }
    }).catch(() => {});
    // Fixed deadlines exclude sampling cost and timer drift. After a stall,
    // skip missed samples rather than producing a burst of obsolete frames.
    const interval = playing && !audio.ended ? ACTIVE_SAMPLE_INTERVAL_MS : IDLE_SAMPLE_INTERVAL_MS;
    const now = performance.now();
    nextSampleAt += interval;
    if (nextSampleAt <= now) nextSampleAt = now + interval;
    window.setTimeout(sample, Math.max(0, nextSampleAt - now));
  };
  sample();
}
