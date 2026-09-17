import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createVisualizerSignalGuard } from "../src/content/visualizer-signal.js";
import { createVisualizerFrameQueue } from "../src/content/visualizer-frame.js";

let now = 10000;
let playing = true;
let reconciliations = 0;
let release;
const states = [];
const guard = createVisualizerSignalGuard({
  isPlaying: () => playing, now: () => now, onState: (state) => states.push(state),
  reconcile: () => { reconciliations++; return new Promise((resolve) => { release = resolve; }); }
});
const idle = { playing: false, spectrum: new Array(320).fill(0) };
const active = { playing: true, spectrum: new Array(320).fill(64) };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
assert.equal(guard.accept(active), true);
assert.equal(guard.accept(idle), false);
await flush();
for (let i = 0; i < 40; i++) { now += 240; assert.equal(guard.accept(idle), false); }
assert.equal(reconciliations, 1, "A slow state query must remain single-flight");
assert.deepEqual(states, ["live", "idle-conflict"], "Repeated idle frames must not churn diagnostic attributes");
release(); await flush();
guard.accept(idle); await flush();
assert.equal(reconciliations, 2);
release(); await flush();
for (let i = 0; i < 10; i++) { now += 240; guard.accept(idle); await flush(); }
assert.equal(reconciliations, 2, "An idle stream must not create a query per frame");
playing = false;
assert.equal(guard.accept(idle), true, "Confirmed pause/end must still settle the visualizer");
assert.equal(guard.accept(active), true, "Fresh FFT must resume even before the playback snapshot arrives");
const failing = createVisualizerSignalGuard({ isPlaying: () => true, now: () => now,
  reconcile: () => { throw new Error("extension reconnecting"); } });
assert.equal(failing.accept(idle), false);
await flush();
now += 3001;
assert.equal(failing.accept(idle), false, "A failed query must not disable the guard or throw");
await flush();

// Exercise production registration, rendering and fallback together. This
// reproduces idle heartbeats while native playback still reports playing.
const source = readFileSync(new URL("../src/content/runtime/player-shell.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("function normalizedVisualizerSignal"),
  source.indexOf("function registerPlayerPresentation"));
const registration = source.slice(source.indexOf("r.$applyMusicBarVisualizerSignal ="),
  source.indexOf("r.$syncFrostedGlass ="));
const frames = [];
const draws = [];
const properties = new Map();
const live = { isPlaying: true };
const document = { hidden: false };
const settings = { musicBarVisualizer: "dna", musicBarVisualizerOpacity: 100 };
const r = { $playerVisualizer: { dataset: {}, style: { setProperty: (name, value) => properties.set(name, value) } },
  $player: { dataset: { visualizer: "dna" }, classList: { contains: () => false } },
  $syncSeamlessState: async () => {} };
const sandbox = { r, document, runtimeLive: live, runtimeState: settings,
  runtimeSeamless: { waveform: [0.4, 0.7], progress: 0.5 },
  Date: { now: () => now }, performance: { now: () => now },
  window: { matchMedia: () => ({ matches: false }) },
  createVisualizerSignalGuard: (options) => createVisualizerSignalGuard({ ...options, now: () => now }),
  createVisualizerFrameQueue: (options) => createVisualizerFrameQueue({ ...options,
    requestFrame: (callback) => { frames.push(callback); return frames.length; }, cancelFrame() {} }),
  drawSpectrumAnalyzer: (_r, bins, reactive) => draws.push({ bins, reactive }),
  syncVisualizerSurface() {}, VISUALIZER_BLOOM_INTERVAL_MS: 96
};
vm.createContext(sandbox);
vm.runInContext(functions + registration, sandbox);
const tick = () => { while (frames.length) frames.shift()(); };
r.$queueMusicBarVisualizerSignal(active);
r.$queueMusicBarVisualizerSignal(idle);
tick();
assert.equal(draws.length, 1);
assert.equal(draws[0].reactive, true, "Idle cannot overwrite an active FFT queued for the same display frame");
const lastGoodFrame = r.$visualizerSignalAt;
for (let i = 0; i < 20; i++) {
  now += 240;
  r.$queueMusicBarVisualizerSignal(idle);
  tick();
}
assert.equal(r.$visualizerSignalAt, lastGoodFrame, "Idle frames must not refresh last-good-audio time");
assert.equal(draws.length, 1, "A contradictory heartbeat must not repeatedly paint zero-spectrum frames");
vm.runInContext("syncVisualizerFallback(r, false)", sandbox);
assert.equal(properties.get("--hub-visualizer-level"), "0.700", "Missing-feed recovery must be reachable despite idle traffic");
live.isPlaying = false;
r.$bridgedMedia = { paused: false, ended: false };
const nativeDraws = draws.length;
r.$queueMusicBarVisualizerSignal(idle); tick();
assert.equal(draws.length, nativeDraws, "Native audio must be protected even before the offscreen handoff");
r.$bridgedMedia.paused = true;
r.$queueMusicBarVisualizerSignal(idle); tick();
assert.equal(draws.at(-1).reactive, false);
live.isPlaying = true;
r.$queueMusicBarVisualizerSignal(active); tick();
assert.equal(draws.at(-1).reactive, true);
const beforeHidden = draws.length;
document.hidden = true;
r.$queueMusicBarVisualizerSignal(idle); tick();
document.hidden = false;
settings.musicBarVisualizer = "off";
r.$queueMusicBarVisualizerSignal(active); tick();
assert.equal(draws.length, beforeHidden, "Hidden/disabled visualizers must schedule no rendering or recovery work");
await flush();
console.log("Idle/active conflicts, coalescing, fallback freshness, pause/resume and bounded reconciliation passed.");
