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
  return {
    ok: true,
    status: 206,
    arrayBuffer: async () => new ArrayBuffer(524_288)
  };
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

await new Promise((resolve) => setTimeout(resolve, 300));
assert.ok(fetchRequests.every(([, options]) => options?.headers?.Range),
  "post-start analysis may use bounded range requests but playback must never duplicate the full stream fetch");
assert.equal(objectUrlCreations, 0);

console.log("offscreen single-request native playback smoke test passed");
