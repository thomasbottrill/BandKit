import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { estimateBpmDiagnostics } from "../src/offscreen/analysis.js";

const execFileAsync = promisify(execFile);
const DATASET_REPOSITORY = "https://github.com/GiantSteps/giantsteps-tempo-dataset.git";
const DATASET_COMMIT = "d51ab2422e76abacfaa86616a57054bc222ec9fd";
const DATASET_AUDIO_BASE = "https://www.cp.jku.at/datasets/giantsteps/backup";
const DATASET_DIRECTORY = resolve(".cache/giantsteps-tempo-dataset");
const WORK_DIRECTORY = resolve(".cache/bandkit-bpm-benchmark");
const TRACKS_PER_FOLD = 10;
const TARGET_TRACK_COUNT = 100;
const TRAINING_FOLDS = 7;
const WINDOW_SECONDS = 40;
const EXCLUDED_GENRES = new Set(["hip-hop", "pop-rock"]);
const TRACKER_OVERRIDES = Object.fromEntries([
  ["bufferSize", Number(process.env.BPM_BUFFER_SIZE)],
  ["peakThreshold", Number(process.env.BPM_PEAK_THRESHOLD)],
  ["peakFindingWindow", Number(process.env.BPM_PEAK_WINDOW)]
].filter(([, value]) => Number.isFinite(value) && value > 0));

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

async function fileExists(path) {
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
  const tracks = [];
  for (let fold = 1; fold <= 10; fold += 1) {
    const foldName = `fold${String(fold).padStart(2, "0")}.txt`;
    const ids = (await readFile(join(DATASET_DIRECTORY, "splits", foldName), "utf8"))
      .trim()
      .split(/\s+/)
      .map((value) => value.replace(/\.LOFI(?:\.mp3)?$/, ""));
    const candidates = [];
    for (const id of ids) {
      const genre = (await readFile(join(DATASET_DIRECTORY, "annotations", "genre", `${id}.LOFI.genre`), "utf8")).trim();
      const bpm = Number(await readFile(join(DATASET_DIRECTORY, "annotations_v2", "tempo", `${id}.LOFI.bpm`), "utf8"));
      if (!bpm || EXCLUDED_GENRES.has(genre)) continue;
      const hash = createHash("sha256").update(`bandkit-bpm-v1:${id}`).digest("hex");
      candidates.push({ id: `${id}.LOFI`, bpm, genre, fold, partition: fold <= TRAINING_FOLDS ? "training" : "validation", hash });
    }
    candidates.sort((left, right) => left.hash.localeCompare(right.hash));
    tracks.push(...candidates.slice(0, TRACKS_PER_FOLD).map(({ hash: _hash, ...track }) => track));
  }
  assert.equal(tracks.length, TARGET_TRACK_COUNT, `Expected ${TARGET_TRACK_COUNT} fixed GiantSteps tracks`);
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
  const available = rows.filter((row) => row.detected != null);
  const exact = rows.filter((row) => row.error <= 1);
  const close = rows.filter((row) => row.error <= 3);
  const octave = rows.filter((row) => row.error > 3 && row.octaveError <= 2);
  return {
    tracks: rows.length,
    withinOne: exact.length,
    withinOneRate: exact.length / rows.length,
    withinThree: close.length,
    available: available.length,
    octaveErrors: octave.length,
    meanAbsoluteError: available.reduce((sum, row) => sum + row.error, 0) / Math.max(1, available.length)
  };
}

await mkdir(join(WORK_DIRECTORY, "audio"), { recursive: true });
await mkdir(join(WORK_DIRECTORY, "wav"), { recursive: true });
const prepared = await mapLimit(await referenceTracks(), 6, prepareTrack);
const results = prepared.map((track) => {
  let diagnostics = null;
  try { diagnostics = estimateBpmDiagnostics(track.buffers, TRACKER_OVERRIDES); } catch {}
  const details = diagnostics?.details || null;
  const detected = details?.bpm ?? null;
  const error = detected == null ? Infinity : Math.abs(detected - track.bpm);
  const octaveError = detected == null
    ? Infinity
    : Math.min(Math.abs(detected * 2 - track.bpm), Math.abs(detected / 2 - track.bpm));
  const mark = error <= 1 ? "PASS" : error <= 3 ? "NEAR" : octaveError <= 2 ? "OCTV" : detected == null ? "NONE" : "MISS";
  console.log(`${mark.padEnd(4)} ${track.id.padEnd(18)} ${track.genre.padEnd(24)} expected ${String(track.bpm).padStart(5)} detected ${String(detected ?? "none").padStart(6)}${details?.uncertain ? "?" : ""}`);
  return { ...track, detected, uncertain: Boolean(details?.uncertain), error, octaveError, diagnostics };
});

const groups = {
  overall: summary(results),
  training: summary(results.filter((row) => row.partition === "training")),
  validation: summary(results.filter((row) => row.partition === "validation")),
  genres: Object.fromEntries([...new Set(results.map((row) => row.genre))].sort().map((genre) => [genre, summary(results.filter((row) => row.genre === genre))]))
};
await writeFile(join(WORK_DIRECTORY, "latest-results.json"), `${JSON.stringify({ datasetCommit: DATASET_COMMIT, trackerOverrides: TRACKER_OVERRIDES, metric: "absolute BPM error <= 1.0", groups, results }, null, 2)}\n`);
for (const [name, group] of Object.entries({ overall: groups.overall, training: groups.training, validation: groups.validation })) {
  console.log(`${name}: ${group.withinOne}/${group.tracks} within ±1 BPM (${(group.withinOneRate * 100).toFixed(1)}%); ${group.withinThree}/${group.tracks} within ±3; ${group.octaveErrors} octave errors; MAE ${group.meanAbsoluteError.toFixed(2)}`);
}
assert.ok(groups.overall.withinOneRate >= 0.8, "BPM release gate failed: overall accuracy is below 80%");
assert.ok(groups.validation.withinOneRate >= 0.8, "BPM release gate failed: held-out accuracy is below 80%");
