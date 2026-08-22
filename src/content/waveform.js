function waveformSeed(value) {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

export function waveformPathData(signature, width) {
  const pixelWidth = Math.max(80, Math.round(width));
  const barCount = Math.max(28, Math.min(180, Math.round(pixelWidth / 4)));
  const step = pixelWidth / barCount;
  const amplitudes = waveformAmplitudes(signature, barCount);
  const path = amplitudes.map((height, index) => {
    const x = (index + 0.5) * step;
    return `M${x.toFixed(2)} ${(12 - height / 2).toFixed(2)}V${(12 + height / 2).toFixed(2)}`;
  });
  return { pathData: path.join(""), pixelWidth };
}

export function waveformAmplitudes(signature, barCount) {
  let randomState = waveformSeed(signature || "bandkit-waveform") || 1;
  const samples = [];
  for (let index = 0; index < barCount + 4; index += 1) {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    samples.push((randomState >>> 0) / 4294967295);
  }
  const amplitudes = [];
  for (let index = 0; index < barCount; index += 1) {
    const localEnergy = samples[index] * 0.2 + samples[index + 1] * 0.45 + samples[index + 2] * 0.35;
    const phrase = 0.78 + 0.22 * Math.sin((index / barCount) * Math.PI * 7 + samples[0] * Math.PI);
    const edgeEnvelope = Math.min(1, (index + 3) / 9, (barCount - index + 2) / 9);
    const height = Math.max(3, Math.min(20, (4 + localEnergy * 16) * phrase * edgeEnvelope));
    amplitudes.push(height);
  }
  return amplitudes;
}
