import assert from "node:assert/strict";
import vm from "node:vm";
import { MESSAGES } from "../src/shared/contracts.js";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find ${name} in content.js`);
  const start = match.index;
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") { quote = character; continue; }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name} from content.js`);
}

const queue = [
  { id: "101", title: "Tesseract", artist: "Anthorian", pageUrl: "https://fixture.bandcamp.com/track/tesseract", url: "stream-101" },
  { id: "102", title: "Pitch Haze", artist: "Acell", pageUrl: "https://fixture.bandcamp.com/track/pitch-haze", url: "stream-102" }
];
const row = {
  matches: (selector) => selector === ".track_row_view",
  getAttribute: (name) => name === "rel" ? "tracknum=2" : null,
  querySelector: () => ({ href: "https://fixture.bandcamp.com/track/pitch-haze" })
};
const control = { closest: (selector) => selector === ".track_row_view" ? row : null };
const calls = [];
const context = vm.createContext({
  MESSAGES,
  seamless: { enabled: false, queue: [] },
  classicPageHandoffRequest: 0,
  classicPageHandoffTrackKey: "",
  playlistPlayRequest: 0,
  buildSeamlessQueue: () => queue,
  getDailyPlayerState: () => null,
  getBandcampPageData: () => ({ tralbum: { trackinfo: [
    { track_id: 101, title: "Tesseract", artist: "Anthorian", file: { "mp3-128": "stream-101" } },
    { track_id: 102, title: "Pitch Haze", artist: "Acell", file: { "mp3-128": "stream-102" } }
  ] } }),
  elementText: () => "Acell - Pitch Haze",
  document: { querySelector: () => null },
  matchingQueueTrack: (tracks, requested) => tracks.find((track) => String(track.id) === String(requested.id || "")
    || String(track.url) === String(requested.url || "")
    || (track.title === requested.title && (!requested.artist || track.artist === requested.artist))) || null,
  playlistTrackKey: (track) => `${track.id}|${track.title}`,
  clearClassicPagePendingSeek: () => {},
  resetClassicPageHandoff: () => {},
  handoffPageAudio: async (_audio, track) => { calls.push({ type: "handoff", track }); return true; },
  seamlessCommand: async (type) => { calls.push({ type }); return null; }
});

vm.runInContext([
  extractFunction("classicPageTrackForControl"),
  extractFunction("requestClassicPagePlayback"),
  "globalThis.testApi = { classicPageTrackForControl, requestClassicPagePlayback };"
].join("\n"), context);

assert.equal(context.testApi.classicPageTrackForControl(control)?.id, "102",
  "compilation rows must resolve by Bandcamp track number when their visible title includes the artist");

const duplicateTitleQueue = queue.map((track) => ({ ...track, title: "Same title" }));
context.buildSeamlessQueue = () => duplicateTitleQueue;
assert.equal(context.testApi.classicPageTrackForControl(control)?.id, "102",
  "duplicate visible titles must still resolve to the exact Bandcamp track id");
context.buildSeamlessQueue = () => [queue[0]];
assert.equal(context.testApi.classicPageTrackForControl(control), null);
assert.equal(context.testApi.requestClassicPagePlayback(control), false,
  "an unavailable row must fall back to Bandcamp instead of hijacking a different playable track");
context.buildSeamlessQueue = () => queue;

assert.equal(context.testApi.requestClassicPagePlayback(control), true);
assert.equal(calls.at(-1)?.track?.id, "102",
  "a track-list click must directly hand the exact row track to seamless playback");

calls.length = 0;
context.seamless = { enabled: true, track: { ...queue[1] } };
assert.equal(context.testApi.requestClassicPagePlayback(control), true);
assert.equal(calls.at(-1)?.type, MESSAGES.SEAMLESS_PLAY_PAUSE,
  "the active compilation row must reliably toggle pause");

calls.length = 0;
context.seamless = { enabled: false, queue: [] };
context.classicPageHandoffTrackKey = context.playlistTrackKey(queue[1]);
assert.equal(context.testApi.requestClassicPagePlayback(control), true);
assert.equal(calls.at(-1)?.type, MESSAGES.SEAMLESS_DISABLE,
  "a second click while the same row is loading must cancel the pending play intent");

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

const timedQueue = queue.map((track, index) => ({ ...track, duration: (index + 1) * 100 }));
const prepareGates = [];
const enableGates = [];
const enableMessages = [];
const seekMessages = [];
let seekContext;
seekContext = vm.createContext({
  MESSAGES,
  state: { dj: {} },
  live: { title: "" },
  classicPageHandoffRequest: 0,
  classicPageHandoffTrackKey: "",
  classicPagePendingSeekFraction: null,
  classicPagePendingSeekRequest: 0,
  classicPagePendingSeekRevision: 0,
  classicPagePendingSeekTrackKey: "",
  playlistPlayRequest: 0,
  buildSeamlessQueue: () => timedQueue,
  document: { querySelector: () => null },
  matchingQueueTrack: (tracks, requested) => tracks.find((track) => track.id === requested.id) || null,
  playlistTrackKey: (track) => `${track.id}|${track.title}`,
  classicPageTrackForControl: () => null,
  prepareExternalNowPlaying: (track, sourceQueue) => {
    const gate = deferred();
    const request = ++seekContext.playlistPlayRequest;
    prepareGates.push({ gate, request, sourceQueue, track });
    return gate.promise.then(() => ({ queue: sourceQueue, index: sourceQueue.indexOf(track), request }));
  },
  runtimeMessage: (message) => {
    const gate = deferred();
    enableMessages.push(message);
    enableGates.push({ gate, message });
    return gate.promise;
  },
  applySeamlessState: () => {},
  renderPlayer: () => {},
  seamlessCommand: async (type, details = {}) => {
    seekMessages.push({ type, ...details });
    return {};
  }
});

vm.runInContext([
  extractFunction("clearClassicPagePendingSeek"),
  extractFunction("queueClassicPageSeek"),
  extractFunction("requestedPageQueue"),
  extractFunction("handoffPageAudio"),
  "globalThis.testApi = { clearClassicPagePendingSeek, queueClassicPageSeek, handoffPageAudio };"
].join("\n"), seekContext);
seekContext.resetClassicPageHandoff = (expectedRequest = 0) => {
  seekContext.classicPageHandoffTrackKey = "";
  seekContext.classicPageHandoffTrack = null;
  seekContext.clearClassicPagePendingSeek(expectedRequest);
};

const earlySeek = seekContext.testApi.handoffPageAudio(null, timedQueue[0]);
assert.equal(seekContext.testApi.queueClassicPageSeek(0.5), true);
prepareGates[0].gate.resolve();
for (let attempt = 0; attempt < 10 && enableMessages.length < 1; attempt += 1) await Promise.resolve();
assert.equal(enableMessages[0]?.currentTime, 50,
  "a midpoint seek made during preparation must be included in the initial enable request");
enableGates[0].gate.resolve({ ok: true, state: { duration: 100, track: timedQueue[0] } });
assert.equal(await earlySeek, true);
assert.equal(seekMessages.length, 0,
  "an early seek already included in the enable request must not be replayed unnecessarily");

const lateSeek = seekContext.testApi.handoffPageAudio(null, timedQueue[1]);
prepareGates[1].gate.resolve();
for (let attempt = 0; attempt < 10 && enableMessages.length < 2; attempt += 1) await Promise.resolve();
assert.equal(enableMessages[1]?.currentTime, 0);
assert.equal(seekContext.testApi.queueClassicPageSeek(0.5), true);
enableGates[1].gate.resolve({ ok: true, state: { duration: 200, track: timedQueue[1] } });
assert.equal(await lateSeek, true);
assert.deepEqual(seekMessages.at(-1), { type: MESSAGES.SEAMLESS_SEEK, currentTime: 100 },
  "a seek made while enable is in flight must be reconciled against the resolved track duration");

const staleSeek = seekContext.testApi.handoffPageAudio(null, timedQueue[0]);
assert.equal(seekContext.testApi.queueClassicPageSeek(0.75), true);
const replacement = seekContext.testApi.handoffPageAudio(null, timedQueue[1]);
prepareGates[3].gate.resolve();
for (let attempt = 0; attempt < 10 && enableMessages.length < 3; attempt += 1) await Promise.resolve();
assert.equal(enableMessages[2]?.queue[enableMessages[2].index]?.id, timedQueue[1].id);
assert.equal(enableMessages[2]?.currentTime, 0,
  "a seek queued for the superseded row must not leak into its replacement");
enableGates[2].gate.resolve({ ok: true, state: { duration: 200, track: timedQueue[1] } });
assert.equal(await replacement, true);
prepareGates[2].gate.resolve();
assert.equal(await staleSeek, false);
assert.equal(enableMessages.length, 3,
  "a superseded row must not emit a late enable request after its replacement starts");

console.log("classic compilation track-list playback checks passed.");
