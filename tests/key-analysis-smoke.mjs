import assert from "node:assert/strict";

import { estimateBpm, estimateBpmDetails, estimateKey } from "../src/offscreen/analysis.js";

const SAMPLE_RATE = 11_025;
const KEY_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function fixtureBuffer(tonic, mode, detuneCents = 0) {
  const seconds = 16;
  const channels = [new Float32Array(SAMPLE_RATE * seconds), new Float32Array(SAMPLE_RATE * seconds)];
  const progression = mode === "major"
    ? [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]]
    : [[0, 3, 7], [5, 8, 0], [7, 11, 2], [0, 3, 7]];
  let noiseState = 123_456_789 + tonic;
  for (let sample = 0; sample < channels[0].length; sample += 1) {
    const section = Math.min(3, Math.floor(sample / (channels[0].length / 4)));
    const localTime = sample / SAMPLE_RATE;
    const sectionPhase = (sample % (channels[0].length / 4)) / (channels[0].length / 4);
    const envelope = Math.min(1, sectionPhase * 12, (1 - sectionPhase) * 12);
    let tonal = 0;
    for (const pitch of progression[section]) {
      const midi = 48 + ((tonic + pitch) % 12) + detuneCents / 100;
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      tonal += Math.sin(2 * Math.PI * frequency * localTime) * 0.18;
      tonal += Math.sin(2 * Math.PI * frequency * 2 * localTime + 0.2) * 0.07;
      tonal += Math.sin(2 * Math.PI * frequency * 3 * localTime + 0.4) * 0.035;
    }
    noiseState = (noiseState * 1_664_525 + 1_013_904_223) >>> 0;
    const noise = (noiseState / 0xffff_ffff - 0.5) * 0.006;
    const kickPhase = sample % Math.floor(SAMPLE_RATE / 2);
    const kick = kickPhase < 300 ? Math.sin(2 * Math.PI * 65 * kickPhase / SAMPLE_RATE) * (1 - kickPhase / 300) * 0.12 : 0;
    channels[0][sample] = tonal * envelope + noise + kick;
    channels[1][sample] = tonal * envelope * 0.94 + noise * 0.8 - kick * 0.9;
  }
  return {
    sampleRate: SAMPLE_RATE,
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: (channel) => channels[channel]
  };
}

function tempoFixture(bpm) {
  const samples = new Float32Array(SAMPLE_RATE * 20);
  const beatLength = (60 * SAMPLE_RATE) / bpm;
  let state = 42;
  for (let sample = 0; sample < samples.length; sample += 1) {
    const beatPhase = sample % beatLength;
    const eighthPhase = sample % (beatLength / 2);
    const kick = beatPhase < 650
      ? Math.sin(2 * Math.PI * 65 * beatPhase / SAMPLE_RATE) * Math.exp(-beatPhase / 170) * 0.8
      : 0;
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const hat = eighthPhase < 80 ? (state / 0xffff_ffff - 0.5) * Math.exp(-eighthPhase / 18) * 0.2 : 0;
    samples[sample] = kick + hat;
  }
  return { sampleRate: SAMPLE_RATE, numberOfChannels: 1, length: samples.length, getChannelData: () => samples };
}

for (let tonic = 0; tonic < 12; tonic += 1) {
  for (const mode of ["major", "minor"]) {
    const result = estimateKey(fixtureBuffer(tonic, mode, tonic % 2 ? 22 : -18));
    assert.equal(result?.name, `${KEY_NAMES[tonic]} ${mode}`, `${KEY_NAMES[tonic]} ${mode} was detected as ${result?.name || "nothing"}`);
    assert.match(result.camelot, /^\d{1,2}[AB]$/);
    assert.ok(result.alternative?.name && result.alternative?.camelot, "key analysis must retain its runner-up candidate");
  }
}

const silence = new Float32Array(SAMPLE_RATE * 8);
assert.equal(estimateKey({
  sampleRate: SAMPLE_RATE,
  numberOfChannels: 1,
  length: silence.length,
  getChannelData: () => silence
}), null, "silence must not be assigned an arbitrary key");

const noise = new Float32Array(SAMPLE_RATE * 12);
let noiseState = 98_765_432;
for (let index = 0; index < noise.length; index += 1) {
  noiseState = (noiseState * 1_664_525 + 1_013_904_223) >>> 0;
  noise[index] = (noiseState / 0xffff_ffff - 0.5) * 0.3;
}
assert.equal(estimateKey({
  sampleRate: SAMPLE_RATE,
  numberOfChannels: 1,
  length: noise.length,
  getChannelData: () => noise
}), null, "broadband noise must not be assigned an arbitrary key");
assert.throws(() => estimateBpm({
  sampleRate: SAMPLE_RATE,
  numberOfChannels: 1,
  length: noise.length,
  getChannelData: () => noise
}), /No stable beat|metrical level is ambiguous/, "broadband noise must not be assigned an arbitrary BPM");

for (const bpm of [110, 120, 130, 140, 160, 165]) {
  assert.ok(Math.abs(estimateBpm(tempoFixture(bpm)) - bpm) <= 1, `${bpm} BPM must remain within one BPM`);
}
for (const bpm of [69, 77, 82, 95]) {
  assert.throws(() => estimateBpm(tempoFixture(bpm)), /metrical level is ambiguous/,
    `${bpm} BPM with strong subdivisions must be marked uncertain instead of guessed at double time`);
  const estimate = estimateBpmDetails(tempoFixture(bpm));
  assert.equal(estimate.uncertain, true, `${bpm} BPM ambiguity must remain explicit`);
  assert.ok(estimate.bpm > 0, `${bpm} BPM ambiguity must retain an editable numeric estimate`);
}

console.log("Key analysis tuning, stereo, and ambiguity checks passed.");
