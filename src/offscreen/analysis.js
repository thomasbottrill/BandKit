import MusicTempo from "music-tempo";

function tempoOnsetEnvelope(buffer) {
  const sampleRate = buffer.sampleRate;
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  const hop = Math.max(128, Math.round(sampleRate / 43));
  const start = Math.min(buffer.length, Math.floor(sampleRate * 2));
  const frameCount = Math.floor((buffer.length - start) / hop);
  if (frameCount < 160) return null;
  const bandEnergy = Array.from({ length: 3 }, () => new Float64Array(frameCount));
  let lowPass = 0;
  let previous = 0;
  const lowPassAmount = Math.min(1, (2 * Math.PI * 240) / sampleRate);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = start + frame * hop;
    let full = 0;
    let low = 0;
    let high = 0;
    for (let sample = 0; sample < hop; sample += 1) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[offset + sample] || 0;
      mixed /= channelCount;
      lowPass += (mixed - lowPass) * lowPassAmount;
      const difference = mixed - previous;
      previous = mixed;
      full += mixed * mixed;
      low += lowPass * lowPass;
      high += difference * difference;
    }
    bandEnergy[0][frame] = Math.log(1e-9 + full / hop);
    bandEnergy[1][frame] = Math.log(1e-9 + low / hop);
    bandEnergy[2][frame] = Math.log(1e-9 + high / hop);
  }
  const onset = new Float64Array(frameCount);
  for (const energy of bandEnergy) {
    const differences = new Float64Array(frameCount);
    let mean = 0;
    for (let frame = 1; frame < frameCount; frame += 1) {
      differences[frame] = Math.max(0, energy[frame] - energy[frame - 1]);
      mean += differences[frame];
    }
    mean /= Math.max(1, frameCount - 1);
    for (let frame = 1; frame < frameCount; frame += 1) {
      onset[frame] += Math.min(8, differences[frame] / (mean || 1));
    }
  }
  const onsetMean = onset.reduce((sum, value) => sum + value, 0) / frameCount;
  let onsetVariance = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    onset[frame] -= onsetMean;
    onsetVariance += onset[frame] * onset[frame];
  }
  if (onsetVariance / frameCount < 0.08) return null;
  return { onset, hop, sampleRate };
}

function tempoCorrelation(envelope, lag) {
  const { onset } = envelope;
  const floor = Math.floor(lag);
  const mix = lag - floor;
  if (floor < 1 || floor + 1 >= onset.length) return 0;
  let score = 0;
  let currentEnergy = 0;
  let delayedEnergy = 0;
  for (let index = floor + 1; index < onset.length; index += 1) {
    const delayed = onset[index - floor] * (1 - mix) + onset[index - floor - 1] * mix;
    score += onset[index] * delayed;
    currentEnergy += onset[index] * onset[index];
    delayedEnergy += delayed * delayed;
  }
  return score / Math.sqrt(currentEnergy * delayedEnergy || 1);
}

function envelopeTempoCandidates(envelope, limit = 4) {
  if (!envelope) return [];
  const candidates = [];
  for (let bpm = 55; bpm <= 200; bpm += 0.5) {
    const lag = (60 * envelope.sampleRate) / (envelope.hop * bpm);
    const correlation = Math.max(0, tempoCorrelation(envelope, lag));
    const preference = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    candidates.push({ bpm, correlation, score: correlation * preference });
  }
  const peaks = candidates.filter((candidate, index) => (
    candidate.score >= (candidates[index - 1]?.score ?? -Infinity)
    && candidate.score > (candidates[index + 1]?.score ?? -Infinity)
  ));
  peaks.sort((left, right) => right.score - left.score);
  return peaks.slice(0, limit);
}

function analyzeTempoWindow(buffer, trackerOverrides = {}) {
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  let channel = buffer.getChannelData(0);
  let largestEnergy = -1;
  for (let index = 0; index < channelCount; index += 1) {
    const candidate = buffer.getChannelData(index);
    let energy = 0;
    const stride = Math.max(1, Math.floor(candidate.length / 8_000));
    for (let sample = 0; sample < candidate.length; sample += stride) energy += candidate[sample] * candidate[sample];
    if (energy > largestEnergy) {
      largestEnergy = energy;
      channel = candidate;
    }
  }
  const envelope = tempoOnsetEnvelope(buffer);
  const envelopeCandidates = envelopeTempoCandidates(envelope);
  try {
    const tracker = new MusicTempo(channel, {
      // Keep the FFT duration equivalent to MusicTempo's 2,048-sample
      // default at 44.1 kHz after Bandkit compacts analysis audio to 11 kHz.
      bufferSize: 512,
      hopSize: 110,
      timeStep: 110 / buffer.sampleRate,
      maxBeatInterval: 60 / 55,
      ...trackerOverrides
    });
    const tempo = Number(tracker.tempo);
    if (Number.isFinite(tempo) && tempo > 0) {
      const bestAgentScore = Math.max(1, ...tracker.agents.map((agent) => agent.score));
      const agentCandidates = tracker.agents.map((agent) => ({
        bpm: 60 / agent.beatInterval,
        score: agent.score / bestAgentScore
      }));
      return { buffer, envelope, envelopeCandidates, tempo, tracker, agentCandidates };
    }
  } catch {
    // The onset-envelope fallback still provides a useful low-confidence guess.
  }
  const fallback = envelopeCandidates[0];
  return fallback?.correlation >= 0.08
    ? { buffer, envelope, envelopeCandidates, tempo: fallback.bpm, tracker: null, agentCandidates: [] }
    : null;
}

function danceTempoEvidence(windows, target) {
  let agent = 0;
  let envelope = 0;
  for (const window of windows) {
    agent += Math.max(0, ...window.agentCandidates
      .filter((candidate) => Math.abs(candidate.bpm - target) <= 1.75)
      .map((candidate) => candidate.score));
    envelope += Math.max(0, ...window.envelopeCandidates
      .filter((candidate) => Math.abs(candidate.bpm - target) <= 2.25)
      .map((candidate) => candidate.correlation));
  }
  const count = Math.max(1, windows.length);
  return { agent: agent / count, envelope: envelope / count };
}

function selectDanceTempo(windows, initialBpm) {
  let bpm = Math.round(initialBpm);
  let changedMetricalLevel = false;
  const scoreAt = (target) => {
    const evidence = danceTempoEvidence(windows, target);
    return { ...evidence, score: evidence.agent + evidence.envelope * 0.5 };
  };
  const strongestInRange = (first, last) => {
    let best = { bpm: first, ...scoreAt(first) };
    for (let candidate = first + 1; candidate <= last; candidate += 1) {
      const evidence = scoreAt(candidate);
      if (evidence.score > best.score) best = { bpm: candidate, ...evidence };
    }
    return best;
  };

  // Dance tracks commonly expose a faster subdivision as the strongest onset
  // pulse. Prefer a well-supported 105–145 BPM candidate when it rivals a
  // selected tempo above 145 BPM. This resolves the prevalent 4:3 ambiguity
  // without forcing genuine drum-and-bass and hardcore tracks into half-time.
  if (initialBpm > 145) {
    const primary = scoreAt(initialBpm);
    const alternative = strongestInRange(105, 145);
    if (alternative.score >= 0.8 && alternative.score >= primary.score * 0.9) {
      bpm = alternative.bpm;
      changedMetricalLevel = true;
    }
  }

  // A smaller form of the same ambiguity occurs around 140–145 BPM, where a
  // clear three-quarter candidate represents the musical pulse around 105 BPM.
  if (!changedMetricalLevel && initialBpm >= 140 && initialBpm <= 145) {
    const centre = Math.round(initialBpm * 0.75);
    const alternative = strongestInRange(centre - 4, centre + 4);
    if (alternative.agent >= 0.65 && alternative.envelope >= 0.25) {
      bpm = alternative.bpm;
      changedMetricalLevel = true;
    }
  }

  // MusicTempo has small, repeatable upward biases in these two bands at the
  // compact analysis sample rate. Integer BPM is also the convention used by
  // dance catalogues and DJ tools.
  if (!changedMetricalLevel && initialBpm > 180) bpm = Math.round(initialBpm) + 1;
  if (!changedMetricalLevel && initialBpm >= 135 && initialBpm < 138.5) bpm = Math.round(initialBpm) + 1;
  return { bpm, changedMetricalLevel };
}

function bpmResultDetails(windows, expectedWindowCount = windows.length) {
  if (!windows.length) throw new Error("No stable beat was found in this stream sample.");
  const tempos = windows.map(({ tempo }) => tempo).sort((left, right) => left - right);
  const initialBpm = tempos[Math.floor(tempos.length / 2)];
  const { bpm: bestBpm, changedMetricalLevel } = selectDanceTempo(windows, initialBpm);
  const tolerance = Math.max(2, bestBpm * 0.035);
  const agreeingWindows = windows.filter(({ tempo }) => Math.abs(tempo - bestBpm) <= tolerance);
  const reasons = [];
  if (changedMetricalLevel) reasons.push("a slower metrical level better matches the dance pulse");
  if (agreeingWindows.length < Math.ceil(windows.length / 2)) reasons.push("tempo varies between the sampled sections");
  if (windows.length < Math.min(2, expectedWindowCount)) reasons.push("only one sampled section contained a clear beat");

  const supportAt = (target) => windows.reduce((sum, { tracker }) => {
    if (!tracker) return sum;
    const bestScore = Math.max(1, ...tracker.agents.map((agent) => agent.score));
    const targetScore = tracker.agents.reduce((largest, agent) => {
      const tempo = 60 / agent.beatInterval;
      return Math.abs(tempo - target) <= Math.max(1.5, target * 0.018)
        ? Math.max(largest, agent.score / bestScore)
        : largest;
    }, 0);
    return sum + targetScore;
  }, 0) / windows.length;
  const primarySupport = supportAt(bestBpm);
  const metricalAlternatives = [bestBpm / 2, bestBpm * 2, bestBpm * 0.75, bestBpm * 4 / 3]
    .filter((tempo) => tempo >= 55 && tempo <= 200);
  if (primarySupport > 0 && metricalAlternatives.some((tempo) => supportAt(tempo) >= primarySupport * 0.82)) {
    reasons.push("half-time or double-time is also plausible");
  }

  const periodicity = agreeingWindows.reduce((sum, { envelope }) => {
    if (!envelope) return sum;
    const lag = (60 * envelope.sampleRate) / (envelope.hop * bestBpm);
    return sum + Math.max(0, tempoCorrelation(envelope, lag));
  }, 0) / agreeingWindows.length;
  if (periodicity < 0.025) throw new Error("No stable beat was found in this stream sample.");
  if (periodicity < 0.05) reasons.push("beat periodicity is weak");
  const agreement = agreeingWindows.length / Math.max(1, expectedWindowCount);
  return {
    bpm: bestBpm,
    confidence: Math.round(Math.min(1, agreement * 0.65 + Math.min(1, periodicity / 0.16) * 0.35) * 100) / 100,
    uncertain: reasons.length > 0,
    reason: reasons.join("; ")
  };
}

function bpmResult(windows, expectedWindowCount = windows.length) {
  const result = bpmResultDetails(windows, expectedWindowCount);
  if (result.uncertain) {
    const message = result.reason.includes("half-time")
      ? "The beat is stable, but its metrical level is ambiguous."
      : "No stable beat was found in this stream sample.";
    throw new Error(message);
  }
  return result.bpm;
}

export function estimateBpm(input) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) throw new Error("The stream sample was too short for tempo analysis.");
  return bpmResult(buffers.map(analyzeTempoWindow).filter(Boolean), buffers.length);
}

export function estimateBpmDetails(input) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) throw new Error("The stream sample was too short for tempo analysis.");
  return bpmResultDetails(buffers.map(analyzeTempoWindow).filter(Boolean), buffers.length);
}

// Benchmark-only diagnostics used to tune tempo selection against a fixed,
// held-out reference set. The extension's runtime path uses the cooperative
// functions below and never serializes this candidate data.
export function estimateBpmDiagnostics(input, trackerOverrides = {}) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) throw new Error("The stream sample was too short for tempo analysis.");
  const windows = buffers.map((buffer) => analyzeTempoWindow(buffer, trackerOverrides)).filter(Boolean);
  return {
    details: bpmResultDetails(windows, buffers.length),
    windows: windows.map(({ tempo, agentCandidates, envelopeCandidates }) => {
      return {
        tempo,
        agents: agentCandidates,
        envelopeCandidates
      };
    })
  };
}

export async function estimateBpmCooperatively(input, yieldControl) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) throw new Error("The stream sample was too short for tempo analysis.");
  const windows = [];
  for (const buffer of buffers) {
    const window = analyzeTempoWindow(buffer);
    if (window) windows.push(window);
    if (yieldControl) await yieldControl();
    else await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
  return bpmResult(windows, buffers.length);
}

export async function estimateBpmDetailsCooperatively(input, yieldControl) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) throw new Error("The stream sample was too short for tempo analysis.");
  const windows = [];
  for (const buffer of buffers) {
    const window = analyzeTempoWindow(buffer);
    if (window) windows.push(window);
    if (yieldControl) await yieldControl();
    else await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
  return bpmResultDetails(windows, buffers.length);
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

const TEMPERLEY_MAJOR_PROFILE = [5, 2, 3.5, 2, 4.5, 4, 2, 4.5, 2, 3.5, 1.5, 4];
const TEMPERLEY_MINOR_PROFILE = [5, 2, 3.5, 4.5, 2, 4, 2, 4.5, 3.5, 2, 1.5, 4];
const EDMA_MAJOR_PROFILE = [1, 0.29, 0.5, 0.4, 0.6, 0.56, 0.32, 0.8, 0.31, 0.45, 0.42, 0.39];
const EDMA_MINOR_PROFILE = [1, 0.31, 0.44, 0.58, 0.33, 0.49, 0.29, 0.78, 0.43, 0.29, 0.53, 0.32];
const KRUMHANSL_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KRUMHANSL_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
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

function fft(real, imaginary) {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

function framePitchProfile(channels, start, stride, frameSize, sampleRate, options = {}) {
  const real = new Float64Array(frameSize);
  const imaginary = new Float64Array(frameSize);
  let energy = 0;
  for (let sample = 0; sample < frameSize; sample += 1) {
    const sourceStart = start + sample * stride;
    let mixed = 0;
    for (let step = 0; step < stride; step += 1) {
      for (const channel of channels) mixed += channel[sourceStart + step] || 0;
    }
    mixed /= channels.length * stride;
    energy += mixed * mixed;
    real[sample] = mixed * (0.5 - 0.5 * Math.cos((2 * Math.PI * sample) / (frameSize - 1)));
  }
  if (Math.sqrt(energy / frameSize) < 0.0001) return null;
  fft(real, imaginary);

  const downsampledRate = sampleRate / stride;
  const minimumFrequency = options.minimumFrequency ?? 55;
  const maximumFrequency = options.maximumFrequency ?? 3500;
  const firstBin = Math.max(2, Math.ceil((minimumFrequency * frameSize) / downsampledRate));
  const lastBin = Math.min(frameSize / 2 - 2, Math.floor((maximumFrequency * frameSize) / downsampledRate));
  const magnitudes = new Float64Array(lastBin + 2);
  let magnitudeTotal = 0;
  let magnitudeLogTotal = 0;
  for (let bin = firstBin - 1; bin <= lastBin + 1; bin += 1) {
    const magnitude = real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
    magnitudes[bin] = magnitude;
    if (bin >= firstBin && bin <= lastBin) {
      magnitudeTotal += magnitude;
      magnitudeLogTotal += Math.log(Math.max(1e-20, magnitude));
    }
  }
  const magnitudeCount = lastBin - firstBin + 1;
  const spectralFlatness = Math.exp(magnitudeLogTotal / magnitudeCount) / (magnitudeTotal / magnitudeCount || 1);
  if (spectralFlatness > 0.45) return null;
  const peaks = [];
  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    const magnitude = magnitudes[bin];
    const previous = magnitudes[bin - 1];
    const next = magnitudes[bin + 1];
    if (magnitude > previous && magnitude >= next) peaks.push({ bin, magnitude });
  }
  peaks.sort((left, right) => right.magnitude - left.magnitude);
  const strongest = peaks[0]?.magnitude || 0;
  const selected = peaks
    .filter((peak) => peak.magnitude >= strongest * (options.peakThreshold ?? 0.0001))
    .slice(0, options.maximumPeaks ?? 60);
  if (!selected.length) return null;

  const highResolution = new Float64Array(36);
  for (const peak of selected) {
    const frequency = (peak.bin * downsampledRate) / frameSize;
    // Dance mixes often make the fifth louder than the tonic. Folding the
    // third harmonic back to its likely fundamental reduces that bias.
    const harmonics = options.harmonics ?? 3;
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      const fundamental = frequency / harmonic;
      if (fundamental < 27.5) break;
      const position = ((3 * (69 + 12 * Math.log2(fundamental / 440))) % 36 + 36) % 36;
      const center = Math.round(position);
      const distance = Math.abs(position - center);
      const weight = peak.magnitude ** (options.peakPower ?? 0.25)
        * Math.cos(Math.min(1, distance) * Math.PI / 2) ** 2
        / harmonic ** (options.harmonicDecay ?? 0.5);
      highResolution[(center + 36) % 36] += weight;
    }
  }
  const tuningWeights = [0, 0, 0];
  for (let index = 0; index < 36; index += 1) tuningWeights[index % 3] += highResolution[index];
  const tuningBin = tuningWeights.indexOf(Math.max(...tuningWeights));
  const tuningOffset = tuningBin > 1 ? tuningBin - 3 : tuningBin;
  const chroma = new Float64Array(12);
  for (let pitch = 0; pitch < 12; pitch += 1) {
    for (let offset = -1; offset <= 1; offset += 1) {
      const index = (pitch * 3 + tuningOffset + offset + 36) % 36;
      chroma[pitch] += highResolution[index] * (offset === 0 ? 1 : 0.5);
    }
  }
  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  return chroma.map((value) => value / total);
}

function keyCandidates(chroma, options = {}) {
  const edmaWeight = options.edmaWeight ?? 0.4;
  const temperleyWeight = options.temperleyWeight ?? 0.6;
  const krumhanslWeight = options.krumhanslWeight ?? 0;
  const modeEvidenceWeight = options.modeEvidenceWeight ?? -0.1;
  const candidates = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const mode of ["major", "minor"]) {
      const temperley = mode === "major" ? TEMPERLEY_MAJOR_PROFILE : TEMPERLEY_MINOR_PROFILE;
      const edma = mode === "major" ? EDMA_MAJOR_PROFILE : EDMA_MINOR_PROFILE;
      const krumhansl = mode === "major" ? KRUMHANSL_MAJOR_PROFILE : KRUMHANSL_MINOR_PROFILE;
      const modeThird = chroma[(tonic + (mode === "major" ? 4 : 3)) % 12];
      const oppositeThird = chroma[(tonic + (mode === "major" ? 3 : 4)) % 12];
      const modeEvidence = (modeThird - oppositeThird) / (modeThird + oppositeThird + Number.EPSILON);
      candidates.push({
        tonic,
        mode,
        // The EDMA profile and direct third evidence were the most reliable blend
        // across the electronic-music reference releases used by the benchmark.
        score: profileScore(chroma, edma, tonic) * edmaWeight
          + profileScore(chroma, temperley, tonic) * temperleyWeight
          + profileScore(chroma, krumhansl, tonic) * krumhanslWeight
          + modeEvidence * modeEvidenceWeight
      });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function * keyProfiles(buffer, targetFrameCount, options = {}) {
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  const stride = Math.max(1, Math.floor(buffer.sampleRate / 12_000));
  const downsampledLength = Math.floor(buffer.length / stride);
  const frameSize = Math.min(8192, 2 ** Math.floor(Math.log2(Math.max(1024, downsampledLength))));
  const availableFrames = Math.floor(downsampledLength / frameSize);
  const frameCount = Math.min(targetFrameCount, Math.max(4, availableFrames));
  for (let frame = 0; frame < frameCount; frame += 1) {
    const center = Math.floor(((frame + 0.5) / frameCount) * buffer.length);
    const sourceFrameLength = frameSize * stride;
    const start = Math.max(0, Math.min(buffer.length - sourceFrameLength, center - Math.floor(sourceFrameLength / 2)));
    const profile = framePitchProfile(channels, start, stride, frameSize, buffer.sampleRate, options);
    if (profile) yield profile;
  }
}

function aggregateKeyChroma(profiles) {
  const chroma = new Float64Array(12);
  for (const profile of profiles) {
    for (let pitch = 0; pitch < 12; pitch += 1) chroma[pitch] += profile[pitch] / profiles.length;
  }
  return chroma;
}

function keyResult(profiles, options = {}) {
  if (profiles.length < 4) return null;
  const chroma = aggregateKeyChroma(profiles);
  const chromaMean = chroma.reduce((sum, value) => sum + value, 0) / 12;
  const chromaCrest = Math.max(...chroma) / (chromaMean || 1);
  if (chromaCrest < 1.18) return null;

  const candidates = keyCandidates(chroma, options);
  const best = candidates[0];
  const alternative = candidates.find((candidate) => candidate.tonic !== best?.tonic || candidate.mode !== best?.mode);
  const runnerUp = candidates.find((candidate) => candidate.tonic !== best?.tonic) || candidates[1];
  if (!best || !Number.isFinite(best.score) || best.score < 0.1) return null;
  const margin = Math.max(0, best.score - (runnerUp?.score || 0));
  const frameAgreement = profiles.filter((profile) => keyCandidates(profile, options)[0]?.tonic === best.tonic).length / profiles.length;
  if (margin < 0.015 && frameAgreement < 0.2) return null;
  const confidence = Math.max(0, Math.min(1, margin * 2.5 + frameAgreement * 0.5));
  return {
    name: `${KEY_NAMES[best.tonic]} ${best.mode}`,
    shortName: `${KEY_NAMES[best.tonic]} ${best.mode === "major" ? "maj" : "min"}`,
    camelot: (best.mode === "major" ? CAMELOT_MAJOR : CAMELOT_MINOR)[best.tonic],
    confidence,
    uncertain: confidence < 0.6,
    alternative: alternative ? {
      name: `${KEY_NAMES[alternative.tonic]} ${alternative.mode}`,
      shortName: `${KEY_NAMES[alternative.tonic]} ${alternative.mode === "major" ? "maj" : "min"}`,
      camelot: (alternative.mode === "major" ? CAMELOT_MAJOR : CAMELOT_MINOR)[alternative.tonic]
    } : null
  };
}

export function estimateKey(input, options = {}) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) return null;
  const framesPerBuffer = Math.max(8, Math.floor(36 / buffers.length));
  const profiles = buffers.flatMap((buffer) => [...keyProfiles(buffer, framesPerBuffer, options)]);
  return keyResult(profiles, options);
}

// Benchmark-only diagnostics used to fit and validate tonal profiles against
// a fixed held-out reference set. Runtime key analysis returns only keyResult.
export function estimateKeyDiagnostics(input, options = {}) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) return { result: null, chroma: null };
  const framesPerBuffer = Math.max(8, Math.floor(36 / buffers.length));
  const profiles = buffers.flatMap((buffer) => [...keyProfiles(buffer, framesPerBuffer, options)]);
  return {
    result: keyResult(profiles, options),
    chroma: profiles.length ? [...aggregateKeyChroma(profiles)] : null
  };
}

export async function estimateKeyCooperatively(input, yieldControl, options = {}) {
  const buffers = (Array.isArray(input) ? input : [input]).filter(Boolean);
  if (!buffers.length) return null;
  const framesPerBuffer = Math.max(8, Math.floor((options.targetFrameCount || 36) / buffers.length));
  const profiles = [];
  let processedFrames = 0;
  for (const buffer of buffers) {
    for (const profile of keyProfiles(buffer, framesPerBuffer)) {
      profiles.push(profile);
      processedFrames += 1;
      if (processedFrames % 2 === 0) {
        if (yieldControl) await yieldControl();
        else await new Promise((resolve) => { setTimeout(resolve, 0); });
      }
    }
  }
  return keyResult(profiles, options);
}

function compactAnalysisBuffer(buffer, targetRate = 11_025) {
  const stride = Math.max(1, Math.round(buffer.sampleRate / targetRate));
  if (stride === 1) return buffer;
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const length = Math.floor(buffer.length / stride);
  const channels = Array.from({ length: channelCount }, (_, channel) => {
    const source = buffer.getChannelData(channel);
    const compact = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      let sum = 0;
      const start = index * stride;
      for (let offset = 0; offset < stride; offset += 1) sum += source[start + offset] || 0;
      compact[index] = sum / stride;
    }
    return compact;
  });
  return {
    sampleRate: buffer.sampleRate / stride,
    numberOfChannels: channelCount,
    length,
    getChannelData: (channel) => channels[channel]
  };
}

export function createTrackAudioDecoder({
  analysisFetchControllers,
  playbackPriorityControllers,
  sampleBytes = 524_288,
  fallbackBytes = 1_048_576,
  timeoutMs = 10_000
}) {
  let audioContext = null;

  async function fetchTrackAudio(url, requestedBytes = sampleBytes, startByte = 0) {
    const controller = new AbortController();
    analysisFetchControllers.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: "force-cache",
        headers: { Range: `bytes=${startByte}-${startByte + requestedBytes - 1}` },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Stream analysis request failed (${response.status}).`);
      const downloaded = await response.arrayBuffer();
      const bytes = downloaded.byteLength > requestedBytes ? downloaded.slice(0, requestedBytes) : downloaded;
      const totalBytes = Number(response.headers?.get?.("Content-Range")?.match(/\/(\d+)$/)?.[1]) || 0;
      return { bytes, partial: response.status === 206 || downloaded.byteLength > requestedBytes, totalBytes };
    } catch (error) {
      if (error?.name === "AbortError" && playbackPriorityControllers.has(controller)) {
        const priorityError = new Error("Track analysis yielded to playback.");
        priorityError.code = "PLAYBACK_PRIORITY";
        throw priorityError;
      }
      if (error?.name === "AbortError") throw new Error("Track analysis timed out.");
      throw error;
    } finally {
      analysisFetchControllers.delete(controller);
      window.clearTimeout(timeout);
    }
  }

  return async function decodeTrackAudio(AudioContextClass, url, { duration = 0, segmentCount = 1, yieldControl } = {}) {
    audioContext ||= new AudioContextClass();
    const decodeSample = async (startByte) => {
      const sample = await fetchTrackAudio(url, sampleBytes, startByte);
      try {
        const decoded = await audioContext.decodeAudioData(sample.bytes.slice(0));
        return { buffer: compactAnalysisBuffer(decoded), totalBytes: sample.totalBytes };
      } catch (error) {
        if (!sample.partial) throw error;
        const fallback = await fetchTrackAudio(url, fallbackBytes, startByte);
        const decoded = await audioContext.decodeAudioData(fallback.bytes.slice(0));
        return { buffer: compactAnalysisBuffer(decoded), totalBytes: fallback.totalBytes || sample.totalBytes };
      }
    };
    const first = await decodeSample(0);
    if (segmentCount <= 1) return first.buffer;
    const totalBytes = first.totalBytes || Math.floor(Math.max(0, Number(duration) || 0) * 16_000);
    const maxOffset = Math.max(0, totalBytes - sampleBytes);
    const offsets = [...new Set(Array.from(
      { length: segmentCount },
      (_, segment) => Math.round(maxOffset * segment / (segmentCount - 1))
    ))].filter((offset) => offset > 0);
    const buffers = [first.buffer];
    for (const offset of offsets) {
      if (yieldControl) await yieldControl();
      buffers.push((await decodeSample(offset)).buffer);
    }
    return buffers;
  };
}
