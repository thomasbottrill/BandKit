import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

import { estimateKeyDiagnostics } from "../src/offscreen/analysis.js";

const execFileAsync = promisify(execFile);
const DATASET_REPOSITORY = "https://github.com/GiantSteps/giantsteps-key-dataset.git";
const DATASET_COMMIT = "6bcd492c825ac9b8597bc650a5f6fd18b6c43d2b";
const DATASET_AUDIO_BASE = "https://www.cp.jku.at/datasets/giantsteps/backup";
const DATASET_DIRECTORY = resolve(".cache/giantsteps-key-dataset");
const WORK_DIRECTORY = resolve(".cache/bandkit-key-benchmark");
const TARGET_TRACK_COUNT = 100;
const VALIDATION_TRACK_COUNT = 30;
const WINDOW_SECONDS = 32;
const EXACT_GATE = Number(process.env.KEY_EXACT_GATE) || 0.55;
const COMPATIBLE_GATE = Number(process.env.KEY_COMPATIBLE_GATE) || 0.7;
const VALIDATION_EXACT_GATE = Number(process.env.KEY_VALIDATION_EXACT_GATE) || 0.5;
const VALIDATION_COMPATIBLE_GATE = Number(process.env.KEY_VALIDATION_COMPATIBLE_GATE) || 0.65;
const ENFORCE_GATE = process.env.KEY_ENFORCE_GATE !== "0";
const QUIET = process.env.KEY_QUIET === "1";
const DETECTOR_OPTIONS = Object.fromEntries([
  ["edmaWeight", Number(process.env.KEY_EDMA_WEIGHT)],
  ["temperleyWeight", Number(process.env.KEY_TEMPERLEY_WEIGHT)],
  ["krumhanslWeight", Number(process.env.KEY_KRUMHANSL_WEIGHT)],
  ["modeEvidenceWeight", Number(process.env.KEY_MODE_WEIGHT)],
  ["minimumFrequency", Number(process.env.KEY_MIN_FREQUENCY)],
  ["maximumFrequency", Number(process.env.KEY_MAX_FREQUENCY)],
  ["maximumPeaks", Number(process.env.KEY_MAX_PEAKS)],
  ["peakThreshold", Number(process.env.KEY_PEAK_THRESHOLD)],
  ["peakPower", Number(process.env.KEY_PEAK_POWER)],
  ["harmonics", Number(process.env.KEY_HARMONICS)],
  ["harmonicDecay", Number(process.env.KEY_HARMONIC_DECAY)]
].filter(([, value]) => Number.isFinite(value)));
const PITCH_CLASS = new Map([
  ["c", 0], ["b#", 0], ["c#", 1], ["db", 1], ["d", 2], ["d#", 3], ["eb", 3],
  ["e", 4], ["fb", 4], ["e#", 5], ["f", 5], ["f#", 6], ["gb", 6], ["g", 7],
  ["g#", 8], ["ab", 8], ["a", 9], ["a#", 10], ["bb", 10], ["b", 11], ["cb", 11]
]);

function wavBuffer(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  let offset = 12;
  let format;
  let dataOffset;
  let dataLength;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      format = {
        audioFormat: bytes.readUInt16LE(offset + 8),
        numberOfChannels: bytes.readUInt16LE(offset + 10),
        sampleRate: bytes.readUInt32LE(offset + 12),
        bitsPerSample: bytes.readUInt16LE(offset + 22)
      };
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataLength = length;
      break;
    }
    offset += 8 + length + (length % 2);
  }
  assert.deepEqual(
    { audioFormat: format?.audioFormat, bitsPerSample: format?.bitsPerSample },
    { audioFormat: 3, bitsPerSample: 32 },
    "Expected afconvert to produce 32-bit float PCM"
  );
  assert.ok(dataOffset && dataLength, "Converted WAV did not contain audio data");
  const frameCount = Math.floor(dataLength / (format.numberOfChannels * 4));
  const channels = Array.from({ length: format.numberOfChannels }, () => new Float32Array(frameCount));
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < format.numberOfChannels; channel += 1) {
      channels[channel][frame] = bytes.readFloatLE(dataOffset + (frame * format.numberOfChannels + channel) * 4);
    }
  }
  return {
    sampleRate: format.sampleRate,
    numberOfChannels: format.numberOfChannels,
    length: frameCount,
    getChannelData: (channel) => channels[channel]
  };
}

function sliceBuffer(buffer, start, length) {
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel).subarray(start, start + length)
  );
  return {
    sampleRate: buffer.sampleRate,
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: (channel) => channels[channel]
  };
}

function analysisWindows(buffer) {
  const windowLength = Math.min(buffer.length, Math.round(buffer.sampleRate * WINDOW_SECONDS));
  const maxStart = Math.max(0, buffer.length - windowLength);
  return [0, Math.round(maxStart / 2), maxStart]
    .filter((start, index, starts) => starts.indexOf(start) === index)
    .map((start) => sliceBuffer(buffer, start, windowLength));
}

function parseKey(value) {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("♯", "#").replaceAll("♭", "b");
  const match = normalized.match(/^([a-g](?:#|b)?)\s+(major|minor)$/);
  assert.ok(match, `Unsupported key annotation: ${value}`);
  const tonic = PITCH_CLASS.get(match[1]);
  assert.notEqual(tonic, undefined, `Unsupported tonic: ${match[1]}`);
  return { tonic, mode: match[2], name: `${match[1]} ${match[2]}` };
}

function keyClass(key) {
  return `${key.tonic}:${key.mode}`;
}

function relationship(expected, detected) {
  if (!detected) return "unavailable";
  if (expected.tonic === detected.tonic && expected.mode === detected.mode) return "exact";
  if (expected.mode !== detected.mode) {
    const relativeTonic = expected.mode === "major" ? (expected.tonic + 9) % 12 : (expected.tonic + 3) % 12;
    if (detected.tonic === relativeTonic) return "relative";
    if (detected.tonic === expected.tonic) return "parallel";
  }
  const interval = (detected.tonic - expected.tonic + 12) % 12;
  if (expected.mode === detected.mode && (interval === 5 || interval === 7)) return "fifth";
  return "other";
}

function fileExists(path) {
  return stat(path).then(() => true).catch(() => false);
}

async function ensureDataset() {
  if (!await fileExists(join(DATASET_DIRECTORY, ".git"))) {
    await mkdir(resolve(".cache"), { recursive: true });
    await execFileAsync("git", ["clone", DATASET_REPOSITORY, DATASET_DIRECTORY]);
  }
  const { stdout } = await execFileAsync("git", ["-C", DATASET_DIRECTORY, "rev-parse", "HEAD"]);
  if (stdout.trim() !== DATASET_COMMIT) {
    await execFileAsync("git", ["-C", DATASET_DIRECTORY, "fetch", "origin", DATASET_COMMIT, "--depth", "1"]);
    await execFileAsync("git", ["-C", DATASET_DIRECTORY, "checkout", "--detach", DATASET_COMMIT]);
  }
}

async function referenceTracks() {
  await ensureDataset();
  const filenames = (await readdir(join(DATASET_DIRECTORY, "annotations", "key"))).filter((name) => name.endsWith(".key"));
  const groups = new Map();
  for (const filename of filenames) {
    const id = basename(filename, ".key");
    const key = parseKey(await readFile(join(DATASET_DIRECTORY, "annotations", "key", filename), "utf8"));
    const genre = (await readFile(join(DATASET_DIRECTORY, "annotations", "genre", `${id}.genre`), "utf8")).trim();
    const hash = createHash("sha256").update(`bandkit-key-v1:${id}`).digest("hex");
    const rows = groups.get(keyClass(key)) || [];
    rows.push({ id, key, genre, hash });
    groups.set(keyClass(key), rows);
  }
  for (const rows of groups.values()) rows.sort((left, right) => left.hash.localeCompare(right.hash));
  assert.equal(groups.size, 24, "The GiantSteps benchmark must cover all 24 major/minor keys");

  const quotas = new Map([...groups].map(([name, rows]) => [name, Math.min(4, rows.length)]));
  let remaining = TARGET_TRACK_COUNT - [...quotas.values()].reduce((sum, value) => sum + value, 0);
  const expandable = [...groups].sort(([left], [right]) => left.localeCompare(right));
  while (remaining > 0) {
    let added = false;
    for (const [name, rows] of expandable) {
      if (remaining <= 0) break;
      const quota = quotas.get(name);
      if (quota >= rows.length) continue;
      quotas.set(name, quota + 1);
      remaining -= 1;
      added = true;
    }
    assert.equal(added, true, "Not enough annotated tracks to fill the fixed key benchmark");
  }

  const selectedGroups = [...groups].map(([name, rows]) => [name, rows.slice(0, quotas.get(name))]);
  const validationQuotas = new Map(selectedGroups.map(([name]) => [name, 1]));
  remaining = VALIDATION_TRACK_COUNT - validationQuotas.size;
  for (const [name, rows] of selectedGroups) {
    if (remaining <= 0) break;
    if (rows.length > 1) {
      validationQuotas.set(name, 2);
      remaining -= 1;
    }
  }
  assert.equal(remaining, 0, "Could not create the fixed 30-track validation partition");

  const tracks = selectedGroups.flatMap(([name, rows]) => rows.map((track, index) => ({
    ...track,
    hash: undefined,
    partition: index < validationQuotas.get(name) ? "validation" : "training"
  })));
  assert.equal(tracks.length, TARGET_TRACK_COUNT, `Expected ${TARGET_TRACK_COUNT} fixed GiantSteps tracks`);
  assert.equal(tracks.filter((track) => track.partition === "validation").length, VALIDATION_TRACK_COUNT);
  return tracks;
}

async function downloadTrack(track) {
  const audioPath = join(WORK_DIRECTORY, "audio", `${track.id}.mp3`);
  if (!await fileExists(audioPath)) {
    const response = await fetch(`${DATASET_AUDIO_BASE}/${track.id}.mp3`);
    assert.equal(response.ok, true, `Could not download ${track.id} (${response.status})`);
    await writeFile(audioPath, new Uint8Array(await response.arrayBuffer()));
  }
  const expectedMd5 = (await readFile(join(DATASET_DIRECTORY, "md5", `${track.id}.md5`), "utf8")).trim();
  const actualMd5 = createHash("md5").update(await readFile(audioPath)).digest("hex");
  assert.equal(actualMd5, expectedMd5, `${track.id} did not match the published dataset checksum`);
  return audioPath;
}

async function prepareTrack(track) {
  const wavPath = join(WORK_DIRECTORY, "wav", `${track.id}.wav`);
  if (!await fileExists(wavPath)) {
    const audioPath = await downloadTrack(track);
    await execFileAsync("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEF32@11025", audioPath, wavPath]);
  }
  return { ...track, buffers: analysisWindows(wavBuffer(await readFile(wavPath))) };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function summary(rows) {
  const count = (kind) => rows.filter((row) => row.relationship === kind).length;
  const exact = count("exact");
  const compatible = exact + count("relative") + count("fifth");
  const mirexScore = rows.reduce((sum, row) => sum + ({ exact: 1, fifth: 0.5, relative: 0.3, parallel: 0.2 }[row.relationship] || 0), 0);
  return {
    tracks: rows.length,
    exact,
    exactRate: exact / rows.length,
    compatible,
    compatibleRate: compatible / rows.length,
    mirexScore: mirexScore / rows.length,
    relationships: Object.fromEntries(["exact", "fifth", "relative", "parallel", "other", "unavailable"].map((kind) => [kind, count(kind)]))
  };
}

await mkdir(join(WORK_DIRECTORY, "audio"), { recursive: true });
await mkdir(join(WORK_DIRECTORY, "wav"), { recursive: true });
const prepared = await mapLimit(await referenceTracks(), 6, prepareTrack);
const results = prepared.map((track) => {
  const diagnostics = estimateKeyDiagnostics(track.buffers, DETECTOR_OPTIONS);
  const detectedResult = diagnostics.result;
  const detected = detectedResult ? parseKey(detectedResult.name) : null;
  const relation = relationship(track.key, detected);
  const mark = { exact: "PASS", fifth: "5TH", relative: "REL", parallel: "PAR", other: "MISS", unavailable: "NONE" }[relation];
  if (!QUIET) console.log(`${mark.padEnd(4)} ${track.partition.padEnd(10)} ${track.id.padEnd(18)} ${track.genre.padEnd(24)} expected ${track.key.name.padEnd(9)} detected ${(detected?.name || "none").padEnd(9)} confidence ${Number(detectedResult?.confidence || 0).toFixed(2)}`);
  return { id: track.id, genre: track.genre, partition: track.partition, expected: track.key, detected, confidence: detectedResult?.confidence ?? null, relationship: relation, chroma: diagnostics.chroma };
});

const groups = {
  overall: summary(results),
  training: summary(results.filter((row) => row.partition === "training")),
  validation: summary(results.filter((row) => row.partition === "validation")),
  genres: Object.fromEntries([...new Set(results.map((row) => row.genre))].sort().map((genre) => [genre, summary(results.filter((row) => row.genre === genre))]))
};
await writeFile(join(WORK_DIRECTORY, "latest-results.json"), `${JSON.stringify({
  datasetCommit: DATASET_COMMIT,
  detectorOptions: DETECTOR_OPTIONS,
  metric: "exact tonic and major/minor mode; compatible includes relative and perfect-fifth Camelot neighbours",
  gates: {
    exact: EXACT_GATE,
    compatible: COMPATIBLE_GATE,
    validationExact: VALIDATION_EXACT_GATE,
    validationCompatible: VALIDATION_COMPATIBLE_GATE
  },
  groups,
  results
}, null, 2)}\n`);
for (const [name, group] of Object.entries({ overall: groups.overall, training: groups.training, validation: groups.validation })) {
  console.log(`${name}: exact ${group.exact}/${group.tracks} (${(group.exactRate * 100).toFixed(1)}%); Camelot-compatible ${group.compatible}/${group.tracks} (${(group.compatibleRate * 100).toFixed(1)}%); MIREX ${(group.mirexScore * 100).toFixed(1)}`);
}
if (ENFORCE_GATE) {
  assert.ok(groups.overall.exactRate >= EXACT_GATE, `Key release gate failed: overall exact accuracy is below ${EXACT_GATE * 100}%`);
  assert.ok(groups.validation.exactRate >= VALIDATION_EXACT_GATE, `Key release gate failed: held-out exact accuracy is below ${VALIDATION_EXACT_GATE * 100}%`);
  assert.ok(groups.overall.compatibleRate >= COMPATIBLE_GATE, `Key release gate failed: overall compatible accuracy is below ${COMPATIBLE_GATE * 100}%`);
  assert.ok(groups.validation.compatibleRate >= VALIDATION_COMPATIBLE_GATE, `Key release gate failed: held-out compatible accuracy is below ${VALIDATION_COMPATIBLE_GATE * 100}%`);
}
