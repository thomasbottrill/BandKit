import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resumeVisualizer } from "../src/content/visualizer-frame.js";

const source = readFileSync(new URL("../src/content/runtime/player-shell.js", import.meta.url), "utf8");
const fallback = source.slice(source.indexOf("function syncVisualizerFallback("), source.indexOf("function registerPlayerPresentation("));
let now = 10000;
const painted = [];
let cancelled = 0;
const r = { $visualizerSignalAt: 100, $spectrumColourPhase: 1.3,
  $visualizerFrameQueue: { cancel() { cancelled++; } },
  $applyMusicBarVisualizerSignal: (signal) => painted.push(signal) };
const live = { isPlaying: true };
const sandbox = { Date: { now: () => now }, runtimeLive: live, runtimeSeamless: { waveform: [1], progress: 0 } };
vm.createContext(sandbox);
vm.runInContext(fallback, sandbox);
resumeVisualizer(r, now);
assert.equal(cancelled, 1);
assert.equal(r.$spectrumColourPhase, 1.3, "Tab resumption must not reset the colour animation phase");
sandbox.syncVisualizerFallback(r, false);
now += 600;
sandbox.syncVisualizerFallback(r, false);
assert.equal(painted.length, 0, "Stale FFT on tab return must not inject a full-scale waveform glow");
r.$visualizerSignalAt = now;
now += 200;
sandbox.syncVisualizerFallback(r, false);
assert.equal(painted.length, 0, "Fresh audio must take over without triggering fallback");
now += 701;
sandbox.syncVisualizerFallback(r, false);
assert.equal(painted.length, 1, "A genuinely missing FFT feed must retain the existing fallback");
resumeVisualizer(r, now);
live.isPlaying = false;
sandbox.syncVisualizerFallback(r, false);
assert.equal(painted.at(-1).reactive, false, "Pause must still settle immediately during the resume window");
const lifecycle = readFileSync(new URL("../src/content/runtime/lifecycle.js", import.meta.url), "utf8");
assert.match(lifecycle, /const resumePageRuntime = \(event\) => \{\s*resumeVisualizer\(r\)/);
assert.match(lifecycle, /visibilitychange[\s\S]*?if \(!document.hidden\) \{\s*resumeVisualizer\(r\)/);
console.log("Visualizer tab resume: no fallback surge, fresh FFT takeover and pause/fallback preservation passed.");
