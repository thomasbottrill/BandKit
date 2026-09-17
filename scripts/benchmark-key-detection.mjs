import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { estimateBpm, estimateBpmDetails, estimateKey } from "../src/offscreen/analysis.js";

// Reference keys were captured from the matching Beatport release/artist listings:
// https://www.beatport.com/release/which-way-is-up/4724296
// https://www.beatport.com/artist/terrain/506904/tracks
// https://www.beatport.com/release/fena-ep/5069309
// https://www.beatport.com/artist/jurango/496224/tracks
// https://www.beatport.com/release/a-moment-to-machine-ep/5463353
// https://www.beatport.com/release/isle-of-crass-ep/4252094
// https://www.beatport.com/release/rosa-rugosa-ep/4290387
const execFileAsync = promisify(execFile);
const SAMPLE_BYTES = Number(process.env.BANDKIT_KEY_SAMPLE_BYTES) || 524_288;
const SAMPLE_OFFSET = Number(process.env.BANDKIT_KEY_SAMPLE_OFFSET) || 0;
const SAMPLE_SEGMENTS = Math.max(1, Number(process.env.BANDKIT_KEY_SAMPLE_SEGMENTS) || 3);
const RELEASES = [
  {
    url: "https://pearsonsound.bandcamp.com/album/which-way-is-up",
    expected: {
      Hornet: { key: "G minor", bpm: 130 },
      Twister: { key: "A minor", bpm: 165 },
      Slingshot: { key: "F minor", bpm: 69 },
      "Which Way Is Up": { key: "A minor", bpm: 135 }
    }
  },
  {
    url: "https://forestdrivewest.bandcamp.com/album/scatter-ep",
    expected: {
      "Barossa Dub": { key: "Bb major", bpm: 80 },
      Nica: { key: "D major", bpm: 110 },
      Scatter: { key: "C major", bpm: 83 },
      Hive: { key: "Eb minor", bpm: 110 }
    }
  },
  {
    url: "https://imprieux.bandcamp.com/album/fena-ep",
    expected: {
      Fena: { key: "Db minor", bpm: 141 },
      Sickomode: { key: "C minor", bpm: 130 },
      Saat: { key: "Eb minor", bpm: 133 },
      Cawuso: { key: "Bb minor", bpm: 96 }
    }
  },
  {
    url: "https://jurango.bandcamp.com/album/tai-no-gold",
    expected: {
      "Black Torches": { key: "G minor", bpm: 128 },
      "Maybe It's Broken": { key: "Gb major", bpm: 110 },
      Inbosin: { key: "C minor", bpm: 117 },
      "Waiting For Trelawny": { key: "C minor", bpm: 102 },
      "Double Sevens": { key: "Ab major", bpm: 163 },
      Hibiscus: { key: "G major", bpm: 132 },
      "Taíno Gold": { key: "F minor", bpm: 134 },
      "Chalk On Trees": { key: "G major", bpm: 134 }
    }
  },
  {
    url: "https://surgeonsgirl1.bandcamp.com/album/a-moment-to-machine-ep",
    expected: {
      "Under This Space": { key: "A minor", bpm: 77 },
      "Steps Right": { key: "G major", bpm: 120 },
      "A Razor's Whip": { key: "F minor", bpm: 140 },
      "Silken Place": { key: "C minor", bpm: 136 },
      Rested: { key: "C minor", bpm: 120 }
    }
  },
  {
    url: "https://jurango.bandcamp.com/album/isle-of-crass-ep",
    expected: {
      "Slow Wheeze": { key: "F minor", bpm: 82 },
      "Sleeper Hold": { key: "G minor", bpm: 160 },
      PSI: { key: "Ab minor", bpm: 112 },
      "Isle of Crass": { key: "C major", bpm: 95 }
    }
  },
  {
    url: "https://olofdreijer.bandcamp.com/album/rosa-rugosa-ep",
    expected: {
      "Rosa Rugosa": { key: "F minor", bpm: 127 },
      Camelia: { key: "Bb minor", bpm: 95 },
      Cassia: { key: "F minor", bpm: 127 }
    }
  }
];

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function fetchWithRetry(url, options = {}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, options);
    if (response.status !== 429 || attempt === 5) return response;
    await new Promise((retry) => setTimeout(retry, Math.min(30_000, 4_000 * 2 ** attempt)));
  }
  throw new Error(`Could not request ${url}`);
}

async function releaseTracks(release) {
  const releaseName = new URL(release.url).pathname.split("/").at(-1);
  const cachePath = join(workDirectory, `${releaseName}.html`);
  let html = await readFile(cachePath, "utf8").catch(() => "");
  if (!html) {
    const response = await fetchWithRetry(release.url, { headers: { "User-Agent": "Bandkit analysis benchmark" } });
    assert.equal(response.ok, true, `Could not load ${release.url} (${response.status})`);
    html = await response.text();
    await writeFile(cachePath, html);
  }
  const encoded = html.match(/data-tralbum="([^"]+)"/)?.[1];
  assert.ok(encoded, `Bandcamp did not publish track data for ${release.url}`);
  const data = JSON.parse(decodeHtmlAttribute(encoded));
  const expectedByTitle = new Map(
    Object.entries(release.expected).map(([title, expected]) => [normalizedTitle(title), expected])
  );
  return data.trackinfo
    .filter((track) => expectedByTitle.has(normalizedTitle(track.title)) && track.file?.["mp3-128"])
    .map((track) => ({
      title: track.title,
      expected: expectedByTitle.get(normalizedTitle(track.title)),
      release: releaseName,
      duration: Number(track.duration) || 0,
      url: track.file["mp3-128"]
    }));
}

function normalizedTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en");
}

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

function normalizedKey(value) {
  return String(value || "")
    .replace(/^Db /, "C# ")
    .replace(/^D# /, "Eb ")
    .replace(/^Gb /, "F# ")
    .replace(/^G# /, "Ab ")
    .replace(/^A# /, "Bb ")
    .replaceAll("♯", "#")
    .replaceAll("♭", "b");
}

const workDirectory = resolve(".cache/bandkit-analysis-benchmark");
await mkdir(workDirectory, { recursive: true });
{
  const tracks = [];
  for (const release of RELEASES) tracks.push(...await releaseTracks(release));
  const expectedTrackCount = RELEASES.reduce((count, release) => count + Object.keys(release.expected).length, 0);
  assert.equal(tracks.length, expectedTrackCount, `The benchmark releases must expose all ${expectedTrackCount} referenced streams`);
  let exact = 0;
  let compatible = 0;
  let bpmExact = 0;
  let bpmClose = 0;
  let bpmOctave = 0;
  let bpmUnavailable = 0;
  let bpmEstimated = 0;
  let bpmEstimatedClose = 0;
  const detections = {};
  const references = {};
  const releaseScores = new Map();
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const maxOffset = Math.max(0, Math.floor(track.duration * 16_000) - SAMPLE_BYTES);
    const offsets = SAMPLE_SEGMENTS === 1
      ? [SAMPLE_OFFSET]
      : Array.from({ length: SAMPLE_SEGMENTS }, (_, segment) => Math.round(maxOffset * segment / (SAMPLE_SEGMENTS - 1)));
    const buffers = [];
    for (let segment = 0; segment < offsets.length; segment += 1) {
      const offset = offsets[segment];
      const mp3Path = join(workDirectory, `${index}-${segment}-${offset}-${SAMPLE_BYTES}.mp3`);
      const wavPath = join(workDirectory, `${index}-${segment}-${offset}-${SAMPLE_BYTES}.wav`);
      let mp3 = await readFile(mp3Path).catch(() => null);
      if (!mp3) {
        const response = await fetchWithRetry(track.url, { headers: { Range: `bytes=${offset}-${offset + SAMPLE_BYTES - 1}` } });
        assert.equal(response.ok, true, `Could not load ${track.title} (${response.status})`);
        mp3 = new Uint8Array(await response.arrayBuffer());
        await writeFile(mp3Path, mp3);
      }
      const wav = await readFile(wavPath).catch(async () => {
        await execFileAsync("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEF32@11025", mp3Path, wavPath]);
        return readFile(wavPath);
      });
      buffers.push(wavBuffer(await wav));
    }
    const detected = estimateKey(buffers);
    const windowKeys = buffers.map((buffer) => normalizedKey(estimateKey(buffer)?.name).split(" ")[0] || "none");
    const actual = normalizedKey(detected?.name);
    const expected = normalizedKey(track.expected.key);
    const actualTonic = actual.split(" ")[0];
    const expectedTonic = expected.split(" ")[0];
    const same = actual === expected;
    const sameTonic = actualTonic === expectedTonic;
    exact += Number(same);
    compatible += Number(same || sameTonic);
    detections[actualTonic || "none"] = (detections[actualTonic || "none"] || 0) + 1;
    references[expectedTonic] = (references[expectedTonic] || 0) + 1;
    const windowBpms = buffers.map((buffer) => {
      try {
        return estimateBpm(buffer);
      } catch {
        return null;
      }
    });
    let detectedBpm = null;
    try {
      detectedBpm = estimateBpm(buffers);
    } catch {}
    let estimatedBpm = null;
    let estimatedUncertain = false;
    try {
      const details = estimateBpmDetails(buffers);
      estimatedBpm = details.bpm;
      estimatedUncertain = details.uncertain;
    } catch {}
    const expectedBpm = track.expected.bpm;
    const bpmError = detectedBpm == null ? Infinity : Math.abs(detectedBpm - expectedBpm);
    const octaveError = detectedBpm == null
      ? Infinity
      : Math.min(Math.abs(detectedBpm * 2 - expectedBpm), Math.abs(detectedBpm / 2 - expectedBpm));
    const bpmResult = bpmError <= 1 ? "PASS" : bpmError <= 3 ? "NEAR" : octaveError <= 2 ? "OCTV" : detectedBpm == null ? "NONE" : "MISS";
    bpmExact += Number(bpmError <= 1);
    bpmClose += Number(bpmError <= 3);
    bpmOctave += Number(bpmError > 3 && octaveError <= 2);
    bpmUnavailable += Number(detectedBpm == null);
    bpmEstimated += Number(estimatedBpm != null);
    bpmEstimatedClose += Number(estimatedBpm != null && Math.abs(estimatedBpm - expectedBpm) <= 3);
    const releaseScore = releaseScores.get(track.release) || {
      exact: 0, compatible: 0, bpmExact: 0, bpmClose: 0, bpmOctave: 0, total: 0
    };
    releaseScore.exact += Number(same);
    releaseScore.compatible += Number(same || sameTonic);
    releaseScore.bpmExact += Number(bpmError <= 1);
    releaseScore.bpmClose += Number(bpmError <= 3);
    releaseScore.bpmOctave += Number(bpmError > 3 && octaveError <= 2);
    releaseScore.total += 1;
    releaseScores.set(track.release, releaseScore);
    console.log(`${same ? "PASS" : sameTonic ? "MODE" : "MISS"}  ${track.title.padEnd(18)} expected ${expected.padEnd(9)} detected ${(actual || "none").padEnd(9)} confidence ${Number(detected?.confidence || 0).toFixed(2)} windows ${windowKeys.join("/")}`);
    console.log(`${bpmResult}  ${"".padEnd(18)} expected ${String(expectedBpm).padEnd(9)} detected ${String(detectedBpm ?? "none").padEnd(9)} error ${Number.isFinite(bpmError) ? bpmError.toFixed(1) : "n/a"} windows ${windowBpms.map((value) => value ?? "none").join("/")}`);
    if (detectedBpm == null && estimatedBpm != null) console.log(`GUESS ${"".padEnd(18)} ${estimatedBpm}${estimatedUncertain ? "?" : ""} BPM`);
  }
  console.log(`\nExact: ${exact}/${tracks.length}; tonic-compatible: ${compatible}/${tracks.length}`);
  console.log(`BPM exact ±1: ${bpmExact}/${tracks.length}; close ±3: ${bpmClose}/${tracks.length}; octave-only: ${bpmOctave}/${tracks.length}; unavailable: ${bpmUnavailable}/${tracks.length}`);
  console.log(`BPM numeric coverage with marked estimates: ${bpmEstimated}/${tracks.length}; estimates close ±3: ${bpmEstimatedClose}/${tracks.length}`);
  for (const [release, score] of releaseScores) {
    console.log(`${release}: key exact ${score.exact}/${score.total}; tonic-compatible ${score.compatible}/${score.total}; BPM ±1 ${score.bpmExact}/${score.total}; ±3 ${score.bpmClose}/${score.total}; octave-only ${score.bpmOctave}/${score.total}`);
  }
  console.log(`Reference tonic distribution: ${JSON.stringify(references)}`);
  console.log(`Detected tonic distribution: ${JSON.stringify(detections)}`);
}
