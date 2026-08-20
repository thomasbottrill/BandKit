import assert from "node:assert/strict";
import { startProgressiveMp3Stream } from "../src/offscreen/progressive.js";

const CHUNK_DURATION = 30;
const CHUNK_BYTES = 64 * 1024;
const CHUNK_COUNT = 32;
let activeMediaSource = null;
let removals = 0;
let maximumBufferedSpan = 0;

class LongTrackAudio extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
    this.src = "";
  }
  load() {
    queueMicrotask(() => activeMediaSource?.open());
  }
}

const audio = new LongTrackAudio();

class QuotaSourceBuffer extends EventTarget {
  constructor() {
    super();
    this.startTime = 0;
    this.endTime = 0;
    this.buffered = {
      get length() { return this.owner.endTime > this.owner.startTime ? 1 : 0; },
      start() { return this.owner.startTime; },
      end() { return this.owner.endTime; },
      owner: this
    };
  }
  appendBuffer() {
    if (this.endTime - this.startTime >= 240) throw new DOMException("Audio quota exceeded", "QuotaExceededError");
    this.endTime += CHUNK_DURATION;
    maximumBufferedSpan = Math.max(maximumBufferedSpan, this.endTime - this.startTime);
    queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
  }
  remove(_start, end) {
    removals += 1;
    this.startTime = Math.max(this.startTime, end);
    queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
  }
}

class LongTrackMediaSource extends EventTarget {
  static isTypeSupported(type) { return type === "audio/mpeg"; }
  constructor() {
    super();
    this.readyState = "closed";
  }
  open() {
    if (this.readyState !== "closed") return;
    this.readyState = "open";
    this.dispatchEvent(new Event("sourceopen"));
  }
  addSourceBuffer() {
    this.sourceBuffer = new QuotaSourceBuffer();
    return this.sourceBuffer;
  }
  endOfStream() { this.readyState = "ended"; }
}

globalThis.MediaSource = LongTrackMediaSource;
globalThis.URL.createObjectURL = (mediaSource) => {
  activeMediaSource = mediaSource;
  return "blob:long-track";
};
globalThis.fetch = async () => {
  let cursor = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (cursor >= CHUNK_COUNT) return { done: true };
            cursor += 1;
            return { done: false, value: new Uint8Array(CHUNK_BYTES) };
          }
        };
      }
    }
  };
};

let current = true;
const playbackClock = setInterval(() => {
  audio.currentTime = Math.min(CHUNK_COUNT * CHUNK_DURATION, audio.currentTime + 30);
  audio.dispatchEvent(new Event("timeupdate"));
}, 1);

try {
  const stream = startProgressiveMp3Stream(audio, {
    url: "https://t4.bcbits.com/stream/twelve-minute-fixture",
    duration: CHUNK_COUNT * CHUNK_DURATION
  }, () => current);
  const [analysisBytes] = await Promise.all([stream.analysisPromise, stream.promise]);
  assert.equal(analysisBytes.byteLength, 1_048_576,
    "long playback must retain only the bounded analysis prefix");
  assert.ok(removals > 0, "long playback must evict already-played media from the rolling buffer");
  assert.ok(maximumBufferedSpan <= 240,
    `the rolling audio buffer grew beyond its quota-safe window (${maximumBufferedSpan}s)`);
  assert.equal(activeMediaSource.readyState, "ended");
} finally {
  current = false;
  clearInterval(playbackClock);
}

console.log("offscreen long-track playback smoke test passed");
