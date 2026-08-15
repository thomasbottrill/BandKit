import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

let activeMediaSource = null;
let messageListener;
let firstChunkAt = 0;
let finalChunkAt = 0;
let holdMetadata = false;
let releaseHeldMetadata = null;

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
  }

  async play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  load() {
    if (!this.src || !activeMediaSource || activeMediaSource.readyState !== "closed") return;
    queueMicrotask(() => activeMediaSource.open());
  }

  removeAttribute(name) {
    if (name !== "src") return;
    this.src = "";
    this.readyState = 0;
  }
}

const fakeAudio = new FakeAudio();

class FakeSourceBuffer extends EventTarget {
  appendBuffer() {
    queueMicrotask(() => {
      if (!fakeAudio.readyState) {
        const emitMetadata = () => {
          fakeAudio.readyState = 1;
          fakeAudio.dispatchEvent(new Event("loadedmetadata"));
        };
        if (holdMetadata) releaseHeldMetadata = emitMetadata;
        else emitMetadata();
      }
      this.dispatchEvent(new Event("updateend"));
    });
  }
}

class FakeMediaSource extends EventTarget {
  static isTypeSupported(type) { return type === "audio/mpeg"; }
  constructor() {
    super();
    this.readyState = "closed";
  }
  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("sourceopen"));
  }
  addSourceBuffer() { return new FakeSourceBuffer(); }
  endOfStream() { this.readyState = "ended"; }
}

class FakeAudioParam {
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

class FakeAudioNode {
  connect(target) { return target; }
}

globalThis.window = globalThis;
globalThis.document = { querySelector: () => fakeAudio };
globalThis.HTMLMediaElement = { HAVE_METADATA: 1 };
globalThis.MediaSource = FakeMediaSource;
globalThis.URL.createObjectURL = (value) => {
  activeMediaSource = value;
  return `blob:progressive-${Date.now()}`;
};
globalThis.URL.revokeObjectURL = () => {};
globalThis.fetch = async (_url, options = {}) => {
  let readIndex = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
            if (readIndex === 0) {
              readIndex += 1;
              firstChunkAt = performance.now();
              return { done: false, value: new Uint8Array(64 * 1024) };
            }
            if (readIndex === 1) {
              readIndex += 1;
              await new Promise((resolve) => setTimeout(resolve, 900));
              if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
              finalChunkAt = performance.now();
              return { done: false, value: new Uint8Array(64 * 1024) };
            }
            return { done: true };
          }
        };
      }
    },
    arrayBuffer: async () => new ArrayBuffer(128 * 1024)
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
  storage: { local: { async get() { return {}; }, async set() {} } },
  runtime: {
    onMessage: { addListener(listener) { messageListener = listener; } },
    sendMessage() { return Promise.resolve({ ok: true }); }
  }
};

await import(`../src/offscreen/index.js?progressive-smoke=${Date.now()}`);

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
const firstPlaybackAt = performance.now();
assert.equal(response.ok, true);
assert.equal(response.state.track.title, "One");
assert.equal(response.state.isPlaying, true);
assert.ok(firstChunkAt >= start);
assert.equal(finalChunkAt, 0, "playback must start before the full MP3 finishes downloading");
assert.ok(firstPlaybackAt - start < 250, `progressive playback took ${Math.round(firstPlaybackAt - start)}ms`);

const switchStart = performance.now();
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX", index: 1, autoplay: true });
const switchFinished = performance.now();
assert.equal(response.ok, true);
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.isPlaying, true);
assert.ok(switchFinished - switchStart < 250, `progressive track switch took ${Math.round(switchFinished - switchStart)}ms`);

await new Promise((resolve) => setTimeout(resolve, 1000));
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_GET_STATE" });
assert.equal(response.state.track.title, "Two");
assert.equal(response.state.isPlaying, true);
assert.equal(response.state.status, "playing");

holdMetadata = true;
releaseHeldMetadata = null;
const loadingPlayback = send({
  type: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
  queue,
  index: 0,
  currentTime: 0,
  autoplay: true,
  rate: 1,
  preservePitch: true
});
await new Promise((resolve) => setTimeout(resolve, 20));
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE" });
assert.equal(response.state.status, "loading");
assert.equal(response.state.isPlaying, false);
assert.ok(releaseHeldMetadata, "the fixture should still be holding the loading track's metadata");
holdMetadata = false;
releaseHeldMetadata();
response = await loadingPlayback;
assert.equal(response.state.track.title, "One");
assert.equal(response.state.status, "paused", "pausing during a load must cancel the pending autoplay intent");
assert.equal(response.state.isPlaying, false, "a completed background load must not resurrect paused playback");
await new Promise((resolve) => setTimeout(resolve, 950));
response = await send({ type: "BANDCAMP_HUB_OFFSCREEN_GET_STATE" });
assert.equal(response.state.status, "paused");
assert.equal(response.state.isPlaying, false, "the fully downloaded stream must remain paused");

console.log("offscreen progressive playback smoke test passed");
