import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

let messageListener;
let holdMetadata = false;
let releaseHeldMetadata = null;
let interruptedPlayAttempts = 0;
let nativeLoads = 0;
let objectUrlCreations = 0;
const fetchRequests = [];

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.ended = false;
    this.readyState = 0;
    this.duration = 180;
    this.currentTime = 0;
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.preservesPitch = true;
    this.volume = 1;
    this.src = "";
    this.error = null;
    this.buffered = { length: 0, start: () => 0, end: () => 0 };
  }

  async play() {
    if (interruptedPlayAttempts > 0) {
      interruptedPlayAttempts -= 1;
      throw new DOMException("The play() request was interrupted by a call to pause().", "AbortError");
    }
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  load() {
    if (!this.src) return;
    nativeLoads += 1;
    this.paused = true;
    this.readyState = 0;
    queueMicrotask(() => {
      const emitMetadata = () => {
        this.readyState = 1;
        this.dispatchEvent(new Event("loadedmetadata"));
      };
      if (holdMetadata) releaseHeldMetadata = emitMetadata;
      else emitMetadata();
    });
  }

  removeAttribute(name) {
    if (name !== "src") return;
    this.src = "";
    this.readyState = 0;
  }
}

class FakeAudioParam {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

class FakeAudioNode {
  connect(target) { return target; }
}

const fakeAudio = new FakeAudio();
globalThis.window = globalThis;
globalThis.document = { querySelector: () => fakeAudio };
globalThis.HTMLMediaElement = { HAVE_METADATA: 1 };
globalThis.URL.createObjectURL = () => {
  objectUrlCreations += 1;
  return "blob:unexpected";
};
globalThis.URL.revokeObjectURL = () => {};
globalThis.fetch = async (...args) => {
  fetchRequests.push(args);
  return new Promise((_resolve, reject) => {
    args[1]?.signal?.addEventListener("abort", () => {
      reject(Object.assign(new Error("analysis yielded to playback"), { name: "AbortError" }));
    }, { once: true });
  });
};
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
  async resume() {}
  async decodeAudioData() { throw new Error("analysis is outside this playback-start test"); }
  async close() {}
};
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.chrome = {
  runtime: {
    onMessage: { addListener(listener) { messageListener = listener; } },
    sendMessage(message) {
      if (message.type === "BANDCAMP_HUB_OFFSCREEN_GET_ANALYSIS_STORAGE") {
        return Promise.resolve({ ok: true, bpmCorrections: {}, trackAnalysisCache: {} });
      }
      return Promise.resolve({ ok: true });
    }
  }
};

await import(`../src/offscreen/index.js?native-start-smoke=${Date.now()}`);
assert.equal(fakeAudio.crossOrigin, "anonymous",
  "native Bandcamp streams must remain audible through the Web Audio effects graph");

function send(message) {
  return new Promise((resolve) => {
    const keepsChannelOpen = messageListener({ ...message, target: "offscreen" }, {}, resolve);
    assert.equal(keepsChannelOpen, true);
  });
}

const queue = [
  { id: "one", title: "One", artist: "Fixture", url: "https://t4.bcbits.com/stream/one", duration: 180 },
  { id: "two", title: "Two", artist: "Fixture", url: "https://t4.bcbits.com/stream/two", duration: 210 }
];

const start = performance.now();
let response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
  queue,
  index: 0,
  currentTime: 0,
  autoplay: true,
  rate: 1,
  preservePitch: true
});
assert.equal(response.ok, true);
assert.equal(response.state.track.title, "One");
assert.equal(response.state.isPlaying, true);
assert.equal(fakeAudio.src, queue[0].url);
assert.ok(performance.now() - start < 250, "initial native playback must start without a metadata gate");

const switchStart = performance.now();
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 1, autoplay: true });
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.isPlaying, true);
assert.equal(fakeAudio.src, queue[1].url);
assert.ok(performance.now() - switchStart < 250, "native queue switches must start immediately");
assert.equal(nativeLoads, 2, "each requested track must attach its Bandcamp URL exactly once");
assert.equal(objectUrlCreations, 0, "playback must not detour through a MediaSource object URL");

holdMetadata = true;
releaseHeldMetadata = null;
const slowMetadataStart = performance.now();
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 0, autoplay: true });
assert.equal(response.state.isPlaying, true);
assert.ok(performance.now() - slowMetadataStart < 250,
  "autoplay must not wait for a separate loadedmetadata round trip");
holdMetadata = false;
releaseHeldMetadata?.();

interruptedPlayAttempts = 1;
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 1, autoplay: true });
assert.equal(response.state.isPlaying, true);
assert.equal(interruptedPlayAttempts, 0, "a transient interrupted native play must be retried");

holdMetadata = true;
releaseHeldMetadata = null;
const loadingEnable = send({
  type: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
  queue,
  index: 0,
  currentTime: 5,
  autoplay: true,
  rate: 1,
  preservePitch: true
});
await Promise.resolve();
await Promise.resolve();
const loadingSeek = await send({ type: "BANDCAMP_HUB_OFFSCREEN_SEEK", currentTime: 90 });
assert.equal(loadingSeek.state.status, "loading");
assert.equal(loadingSeek.state.currentTime, 90,
  "a seek during initial loading must immediately become the visible playback intent");
releaseHeldMetadata?.();
response = await loadingEnable;
holdMetadata = false;
assert.equal(response.state.isPlaying, true);
assert.equal(response.state.currentTime, 90,
  "the in-flight media load must start from the newest pending seek instead of resetting to its original time");

await new Promise((resolve) => setTimeout(resolve, 850));
assert.equal(fetchRequests.length, 0,
  "automatic analysis must not compete with a newly started stream before playback has buffer headroom");
fakeAudio.buffered = { length: 1, start: () => 0, end: () => 45 };
await new Promise((resolve) => setTimeout(resolve, 650));
assert.equal(fetchRequests.length, 0,
  "automatic analysis must remain delayed even when startup buffering quickly reaches thirty seconds");
fakeAudio.paused = true;
for (let attempt = 0; attempt < 10 && !fetchRequests.length; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(fetchRequests.length, 1,
  "automatic analysis may begin without delaying playback once the listener pauses");
assert.equal(fetchRequests[0][1]?.headers?.Range, "bytes=0-524287",
  "post-start analysis must remain a bounded range request");
fakeAudio.paused = false;
fakeAudio.buffered = { length: 0, start: () => 0, end: () => 0 };
fakeAudio.dispatchEvent(new Event("waiting"));
await Promise.resolve();
assert.equal(fetchRequests[0][1]?.signal.aborted, true,
  "a playback underrun must immediately abort competing automatic analysis");
await send({ type: "BANDCAMP_HUB_OFFSCREEN_DISABLE" });
assert.equal(objectUrlCreations, 0);

console.log("offscreen single-request native playback smoke test passed");
