import assert from "node:assert/strict";

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.ended = false;
    this.readyState = 1;
    this.duration = 120;
    this.currentTime = 0;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.preservesPitch = true;
    this.volume = 1;
    this.src = "";
    this.error = null;
  }

  async play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  load() {}

  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
}

const fakeAudio = new FakeAudio();
let messageListener;
const reportedStates = [];
const fetchedUrls = [];
let fetchShouldFail = false;
let fetchOverride = null;

globalThis.window = globalThis;
globalThis.document = { querySelector: () => fakeAudio };
globalThis.HTMLMediaElement = { HAVE_METADATA: 1 };
const analysisSampleRate = 8000;
const analysisSamples = new Float32Array(analysisSampleRate * 24);
for (let beat = 0; beat < 48; beat += 1) {
  const offset = Math.floor(beat * analysisSampleRate * 0.5);
  for (let sample = 0; sample < 160; sample += 1) analysisSamples[offset + sample] = 1 - sample / 160;
}
const successfulFetch = () => ({ ok: true, status: 206, arrayBuffer: async () => new ArrayBuffer(8) });
globalThis.fetch = async (...args) => {
  fetchedUrls.push(args[0]);
  if (fetchOverride) return fetchOverride(...args);
  return fetchShouldFail
    ? { ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) }
    : successfulFetch();
};
class FakeAudioParam {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

class FakeAudioNode {
  connect(target) { return target; }
}

globalThis.AudioContext = class {
  constructor() {
    this.currentTime = 0;
    this.state = "running";
    this.destination = new FakeAudioNode();
  }
  createMediaElementSource() { return new FakeAudioNode(); }
  createBiquadFilter() {
    return Object.assign(new FakeAudioNode(), {
      type: "allpass",
      frequency: new FakeAudioParam(1000),
      Q: new FakeAudioParam(0.72),
      gain: new FakeAudioParam(0)
    });
  }
  createGain() { return Object.assign(new FakeAudioNode(), { gain: new FakeAudioParam(1) }); }
  async resume() { this.state = "running"; }
  async decodeAudioData() {
    return { sampleRate: analysisSampleRate, numberOfChannels: 1, length: analysisSamples.length, getChannelData: () => analysisSamples };
  }
  async close() {}
};
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.chrome = {
  storage: {
    local: {
      async get() { return {}; },
      async set() {}
    }
  },
  runtime: {
    onMessage: { addListener(listener) { messageListener = listener; } },
    sendMessage(message) {
      reportedStates.push(message.state);
      return Promise.resolve({ ok: true });
    }
  }
};

await import(`../offscreen.js?smoke=${Date.now()}`);

function send(message) {
  return new Promise((resolve) => {
    const keepsChannelOpen = messageListener({ ...message, target: "offscreen" }, {}, resolve);
    assert.equal(keepsChannelOpen, true);
  });
}

const queue = [
  { id: "one", title: "One", artist: "Fixture", url: "https://t4.bcbits.com/stream/one", duration: 120 },
  { id: "two", title: "Two", artist: "Fixture", url: "https://t4.bcbits.com/stream/two", duration: 240 }
];

let response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
  queue,
  index: 0,
  currentTime: 12,
  autoplay: true,
  rate: 1.055,
  preservePitch: true
});
assert.equal(response.ok, true);
assert.equal(response.state.isPlaying, true);
assert.equal(response.state.track.title, "One");
assert.equal(response.state.currentTime, 12);
assert.equal(response.state.rate, 1.055);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_GET_STATE" });
assert.equal(response.state.enabled, true);
assert.equal(response.state.isPlaying, true);
assert.equal(response.state.track.title, "One");
assert.equal(response.state.currentTime, 12);

reportedStates.length = 0;
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_NEXT" });
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.isPlaying, true);
const loadingState = reportedStates.find((state) => state.status === "loading" && state.track?.title === "Two");
assert.equal(loadingState?.currentTime, 0);
assert.equal(loadingState?.duration, 240);
assert.equal(loadingState?.progress, 0);

response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
  queue: [
    { ...queue[1], playlistItemId: "playlist-two" },
    { ...queue[0], playlistItemId: "playlist-one" }
  ]
});
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.index, 0);
assert.equal(response.state.isPlaying, true);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 1, autoplay: true });
assert.equal(response.state.track.title, "One");
assert.equal(response.state.isPlaying, true);

fakeAudio.currentTime = 33;
fetchShouldFail = true;
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 0, autoplay: true });
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.status, "error");
assert.equal(response.state.currentTime, 0);
assert.equal(response.state.duration, 240, "a detached failed stream must report the requested track's duration instead of stale media metadata");
assert.equal(fakeAudio.src, "", "a failed switch must detach the previous track's audio source");
fetchShouldFail = false;
response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
  queue: [
    { ...queue[1], playlistItemId: "playlist-two", url: "https://t4.bcbits.com/stream/two-refreshed" },
    { ...queue[0], playlistItemId: "playlist-one" }
  ]
});
assert.equal(response.state.status, "error");
assert.equal(response.state.track.url, "https://t4.bcbits.com/stream/two-refreshed");
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE" });
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.isPlaying, true, "play after an error must retry the requested track");
assert.equal(fetchedUrls.at(-1), "https://t4.bcbits.com/stream/two-refreshed",
  "retrying an error must use a refreshed queue URL instead of the failed stream");
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 1, autoplay: true });
assert.equal(response.state.track.title, "One");

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_RATE", rate: 0.94, preservePitch: false });
assert.equal(response.state.rate, 0.94);
assert.equal(response.state.preservePitch, false);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_RATE", rate: 0.35, preservePitch: true });
assert.equal(response.state.rate, 0.35);
assert.equal(response.state.preservePitch, true);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_BPM" });
assert.equal(response.state.bpmStatus, "ready");
assert.ok(response.state.detectedBpm >= 115 && response.state.detectedBpm <= 125, `detected ${response.state.detectedBpm} BPM`);
assert.equal(response.state.bpmSource, "auto");
assert.equal(response.state.waveform.length, 180);
assert.ok(response.state.waveform.some((point) => point > 0));
assert.ok(response.state.detectedKey?.camelot);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_BPM", bpm: 124.5 });
assert.equal(response.state.detectedBpm, 124.5);
assert.equal(response.state.bpmSource, "manual");

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_RESET_BPM" });
assert.notEqual(response.state.detectedBpm, 124.5);
assert.equal(response.state.detectedBpm, response.state.automaticBpm);
assert.equal(response.state.bpmSource, "auto");

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_BPM", bpm: 124.5 });
assert.equal(response.state.bpmSource, "manual");

response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_SET_DJ",
  rate: 1.02,
  preservePitch: true,
  filterValue: 0.65,
  gainDb: -6,
  eqLowDb: 4,
  eqMidDb: -3,
  eqHighDb: 2
});
assert.equal(response.state.rate, 1.02);
assert.equal(response.state.filterValue, 0.65);
assert.equal(response.state.gainDb, -6);
assert.equal(response.state.eqLowDb, 4);
assert.equal(response.state.eqMidDb, -3);
assert.equal(response.state.eqHighDb, 2);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SCRATCH", active: true, multiplier: 1.2 });
assert.equal(response.state.scratchActive, true);
assert.equal(response.state.rate, 1.02);
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SCRATCH", active: false, multiplier: 1 });
assert.equal(response.state.scratchActive, false);
assert.equal(response.state.rate, 1.02);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_LOOP", beats: 4, bpm: 120 });
assert.equal(response.state.loopBeats, 4);
assert.equal(response.state.loopStart, fakeAudio.currentTime);
assert.equal(response.state.loopEnd - response.state.loopStart, 2);
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_LOOP", beats: 0, bpm: 120 });
assert.equal(response.state.loopBeats, 0);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_LOOP", beats: 1 / 16, bpm: 120 });
assert.equal(response.state.loopBeats, 1 / 16);
assert.equal(response.state.loopEnd - response.state.loopStart, 0.03125);
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_LOOP", beats: 0, bpm: 120 });
assert.equal(response.state.loopBeats, 0);

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_BPM" });
assert.equal(response.state.bpmSource, "auto");
assert.notEqual(response.state.detectedBpm, 124.5);

fakeAudio.currentTime = 37;
response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
  queue: [
    { ...queue[0], playlistItemId: "playlist-one" },
    { ...queue[1], playlistItemId: "playlist-two" }
  ]
});
assert.equal(response.state.track.title, "One");
assert.equal(response.state.index, 0);
assert.equal(response.state.currentTime, 37);
assert.equal(response.state.isPlaying, true, "reordering the active item must not restart playback");

response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
  queue: [{ ...queue[1], playlistItemId: "playlist-two" }]
});
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.index, 0);
assert.equal(response.state.currentTime, 0);
assert.equal(response.state.isPlaying, true, "removing the active item must continue with the nearest remaining track");

response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
  queue: [
    { ...queue[1], playlistItemId: "playlist-two" },
    { ...queue[0], playlistItemId: "playlist-one" }
  ]
});
assert.equal(response.state.track.title, "Two");
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE" });
assert.equal(response.state.isPlaying, false);
response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
  queue: [{ ...queue[0], playlistItemId: "playlist-one" }]
});
assert.equal(response.state.track.title, "One");
assert.equal(response.state.currentTime, 0);
assert.equal(response.state.isPlaying, false, "removing the active item while paused must keep the replacement paused");
fakeAudio.currentTime = 45;
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PREVIOUS" });
assert.equal(response.state.currentTime, 0);
assert.equal(response.state.isPlaying, false, "previous on the first paused track must restart without forcing playback");
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_NEXT" });
assert.equal(response.state.status, "ended");
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE" });
assert.equal(response.state.status, "playing");
assert.equal(response.state.track.title, "One", "play after the end of a one-track queue must restart that track");

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE", queue: [] });
assert.equal(response.state.enabled, false);
assert.equal(response.state.track, null);
assert.equal(response.state.queue.length, 0);
assert.equal(response.state.error, "");
assert.equal(response.state.bpmStatus, "idle");
assert.equal(response.state.detectedBpm, null);
assert.equal(response.state.waveform.length, 0, "emptying the playable queue must clear analysis state from the removed track");

let resolveSlowFetch;
fetchOverride = () => new Promise((resolve) => { resolveSlowFetch = resolve; });
const interruptedEnable = send({
  type: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
  queue,
  index: 0,
  autoplay: true
});
await Promise.resolve();
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_DISABLE" });
assert.equal(response.state.enabled, false);
resolveSlowFetch(successfulFetch());
await interruptedEnable;
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_GET_STATE" });
assert.equal(response.state.enabled, false);
assert.equal(response.state.track, null);
assert.equal(fakeAudio.src, "", "clearing during a slow fetch must prevent the old stream from being reattached");
assert.equal(fakeAudio.paused, true, "clearing during a slow fetch must prevent ghost playback");

let rejectStaleFetch;
let racingFetchCount = 0;
fetchOverride = () => {
  racingFetchCount += 1;
  return racingFetchCount === 1
    ? new Promise((resolve, reject) => { rejectStaleFetch = reject; })
    : Promise.resolve(successfulFetch());
};
const staleLoad = send({
  type: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
  queue,
  index: 0,
  autoplay: true
});
await Promise.resolve();
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 1, autoplay: true });
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.status, "playing");
rejectStaleFetch(new Error("superseded stream failed"));
await staleLoad;
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_GET_STATE" });
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.status, "playing", "a superseded fetch failure must not overwrite the newer playback state");
fetchOverride = null;

const identityCollisionQueue = [
  { id: "shared-title", title: "Shared Title", artist: "First Artist", pageUrl: "https://first.bandcamp.com/track/shared-title", url: "https://t4.bcbits.com/stream/shared-first", duration: 120 },
  { id: "shared-title", title: "Shared Title", artist: "Second Artist", pageUrl: "https://second.bandcamp.com/track/shared-title", url: "https://t4.bcbits.com/stream/shared-second", duration: 120 }
];
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_ENABLE", queue: identityCollisionQueue, index: 0, autoplay: true });
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_BPM", bpm: 137 });
assert.equal(response.state.detectedBpm, 137);
assert.equal(response.state.bpmSource, "manual");
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 1, autoplay: true });
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_BPM" });
assert.notEqual(response.state.detectedBpm, 137);
assert.equal(response.state.bpmSource, "auto", "manual BPM corrections must not bleed across different releases with a shared synthetic id");

response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_DISABLE" });
assert.equal(response.state.enabled, false);
assert.equal(response.state.loopBeats, 0);
assert.equal(response.state.queue.length, 0);
assert.ok(reportedStates.length > 0);

console.log("offscreen playback smoke test passed");
