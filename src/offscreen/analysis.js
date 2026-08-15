export function estimateBpm(buffer) {
  const sampleRate = buffer.sampleRate;
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const hop = 2048;
  const start = Math.min(buffer.length, Math.floor(sampleRate * 4));
  const end = Math.min(buffer.length, start + Math.floor(sampleRate * 30));
  const frames = Math.floor((end - start) / hop);
  if (frames < 40) throw new Error("The stream sample was too short for tempo analysis.");
  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  const energy = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = start + frame * hop;
    let total = 0;
    for (let sample = 0; sample < hop; sample += 4) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[offset + sample] || 0;
      mixed /= channelCount;
      total += mixed * mixed;
    }
    energy[frame] = Math.sqrt(total / (hop / 4));
  }

  const onset = new Float32Array(frames);
  let average = 0;
  const smoothing = Math.max(4, Math.round(sampleRate / hop));
  for (let index = 0; index < frames; index += 1) {
    average += (energy[index] - average) / smoothing;
    onset[index] = Math.max(0, energy[index] - average * 1.08);
  }

  let bestBpm = 0;
  let bestScore = -Infinity;
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (60 * sampleRate) / (hop * bpm);
    const lagFloor = Math.floor(lag);
    const mix = lag - lagFloor;
    let score = 0;
    for (let index = lagFloor + 1; index < frames; index += 1) {
      const delayed = onset[index - lagFloor] * (1 - mix) + onset[index - lagFloor - 1] * mix;
      score += onset[index] * delayed;
    }
    const centered = bpm >= 75 && bpm <= 170 ? 1.025 : 1;
    if (score * centered > bestScore) {
      bestScore = score * centered;
      bestBpm = bpm;
    }
  }
  if (!Number.isFinite(bestBpm) || bestScore <= 0) throw new Error("No stable beat was found in this stream sample.");
  while (bestBpm < 70) bestBpm *= 2;
  while (bestBpm > 180) bestBpm /= 2;
  return Math.round(bestBpm * 10) / 10;
}

export function buildWaveform(buffer, pointCount = 180) {
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  const points = new Array(pointCount).fill(0);
  let largest = 0;
  for (let point = 0; point < pointCount; point += 1) {
    const start = Math.floor((point / pointCount) * buffer.length);
    const end = Math.max(start + 1, Math.floor(((point + 1) / pointCount) * buffer.length));
    const stride = Math.max(1, Math.floor((end - start) / 160));
    let sum = 0;
    let samples = 0;
    for (let offset = start; offset < end; offset += stride) {
      let mixed = 0;
      for (const channel of channels) mixed += Math.abs(channel[offset] || 0);
      sum += mixed / channelCount;
      samples += 1;
    }
    points[point] = samples ? Math.sqrt(sum / samples) : 0;
    largest = Math.max(largest, points[point]);
  }
  if (!largest) return points;
  return points.map((value) => Math.round(Math.min(1, value / largest) * 100));
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const KEY_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];

function profileScore(chroma, profile, tonic) {
  const chromaMean = chroma.reduce((sum, value) => sum + value, 0) / 12;
  const profileMean = profile.reduce((sum, value) => sum + value, 0) / 12;
  let numerator = 0;
  let chromaEnergy = 0;
  let profileEnergy = 0;
  for (let pitch = 0; pitch < 12; pitch += 1) {
    const chromaValue = chroma[(pitch + tonic) % 12] - chromaMean;
    const profileValue = profile[pitch] - profileMean;
    numerator += chromaValue * profileValue;
    chromaEnergy += chromaValue * chromaValue;
    profileEnergy += profileValue * profileValue;
  }
  return numerator / Math.sqrt(chromaEnergy * profileEnergy || 1);
}

export function estimateKey(buffer) {
  const data = buffer.getChannelData(0);
  const chroma = new Float64Array(12);
  const frameSize = Math.min(4096, 2 ** Math.floor(Math.log2(Math.max(1024, data.length))));
  const frameCount = Math.min(8, Math.max(6, Math.floor(data.length / frameSize)));
  const frequencies = Array.from({ length: 48 }, (_, index) => 65.406 * Math.pow(2, index / 12));
  for (let frame = 0; frame < frameCount; frame += 1) {
    const center = Math.floor(((frame + 0.5) / frameCount) * data.length);
    const start = Math.max(0, Math.min(data.length - frameSize, center - Math.floor(frameSize / 2)));
    const frameChroma = new Float64Array(12);
    for (let note = 0; note < frequencies.length; note += 1) {
      const coefficient = 2 * Math.cos((2 * Math.PI * frequencies[note]) / buffer.sampleRate);
      let previous = 0;
      let previousTwo = 0;
      for (let sample = 0; sample < frameSize; sample += 1) {
        const windowed = (data[start + sample] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * sample) / (frameSize - 1)));
        const current = windowed + coefficient * previous - previousTwo;
        previousTwo = previous;
        previous = current;
      }
      const power = Math.max(0, previousTwo * previousTwo + previous * previous - coefficient * previous * previousTwo);
      frameChroma[note % 12] += Math.sqrt(power);
    }
    const frameTotal = frameChroma.reduce((sum, value) => sum + value, 0) || 1;
    for (let pitch = 0; pitch < 12; pitch += 1) chroma[pitch] += frameChroma[pitch] / frameTotal;
  }

  const candidates = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    candidates.push({ tonic, mode: "major", score: profileScore(chroma, MAJOR_PROFILE, tonic) });
    candidates.push({ tonic, mode: "minor", score: profileScore(chroma, MINOR_PROFILE, tonic) });
  }
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || !Number.isFinite(best.score)) return null;
  return {
    name: `${KEY_NAMES[best.tonic]} ${best.mode}`,
    shortName: `${KEY_NAMES[best.tonic]} ${best.mode === "major" ? "maj" : "min"}`,
    camelot: (best.mode === "major" ? CAMELOT_MAJOR : CAMELOT_MINOR)[best.tonic],
    confidence: Math.max(0, Math.min(1, (best.score - (candidates[1]?.score || 0)) * 2.5))
  };
}
