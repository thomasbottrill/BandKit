import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { setInterval, clearInterval } from "node:timers";
import { buildWaveform, estimateBpmDetailsCooperatively, estimateKeyCooperatively } from "../src/offscreen/analysis.js";
import { createAnalysisWorkerClient } from "../src/offscreen/analysis-worker-client.js";
import { TestAnalysisWorker } from "./support/analysis-worker.mjs";

const sampleRate = 11025;
const samples = new Float32Array(sampleRate * 24);
for (let i = 0; i < samples.length; i += 1) {
  const beat = i % Math.round(sampleRate / 2);
  samples[i] = Math.sin(i / sampleRate * 2 * Math.PI * 261.63) * 0.14
    + (beat < 800 ? Math.sin(beat / sampleRate * 2 * Math.PI * 65) * Math.exp(-beat / 180) : 0);
}
const buffer = { sampleRate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples };
const input = [buffer, buffer, buffer];
const noWait = () => Promise.resolve();
let ticks = 0;
let lastTick = performance.now();
let gaps = [];
const timer = setInterval(() => { const now = performance.now(); gaps.push(now - lastTick); lastTick = now; ticks += 1; }, 16);
const start = performance.now();
const key = await estimateKeyCooperatively(input, noWait);
const bpm = await estimateBpmDetailsCooperatively(input, noWait);
const blockingMs = performance.now() - start;
assert.equal(ticks, 0, "Immediately resolved yield callbacks do not allow the visualizer timer to run");
await new Promise(resolve => setTimeout(resolve, 20));
ticks = 0;
gaps = [];
lastTick = performance.now();
const client = createAnalysisWorkerClient({ createWorker: () => new TestAnalysisWorker() });
try {
  const result = await client.analyze(input);
  assert.deepEqual(result.key, key, "Moving analysis off-thread must preserve the exact key result");
  assert.equal(result.bpm, bpm.bpm, "Moving analysis off-thread must preserve the exact tempo result");
  assert.equal(result.bpmUncertain, bpm.uncertain);
  assert.deepEqual(result.waveform, buildWaveform(buffer), "Waveform samples must remain identical");
  assert.equal(samples.length, sampleRate * 24, "Transfer must not detach the decoder's original channels");
  assert.ok(ticks >= 3, "The sampling timer must continue while the actual analysis algorithm runs in the worker");
  const deep = await client.analyze(input, { deep: true });
  assert.deepEqual(deep.key, await estimateKeyCooperatively(input, noWait, { targetFrameCount: 72 }), "Deep analysis must keep all 72 frames");
  console.log(JSON.stringify({ blockingAnalysisMs: Math.round(blockingMs), workerTimerTicks: ticks, workerTimerMaxGapMs: Math.round(Math.max(...gaps)) }));
} finally {
  client.dispose();
  clearInterval(timer);
}

const workers = [];
const queueClient = createAnalysisWorkerClient({ createWorker: () => {
  const worker = { sent: [], postMessage(data) { this.sent.push(data); }, terminate() {} };
  workers.push(worker);
  return worker;
} });
const first = queueClient.analyze(buffer);
const batch = queueClient.analyze(buffer);
const playing = queueClient.analyze(buffer, { priority: true });
assert.equal(workers[0].sent.length, 1, "Only one CPU analysis job may run at a time");
workers[0].onmessage({ data: { id: 1, result: "first" } });
assert.equal(workers[0].sent[1].id, 3, "The playing track must run before waiting playlist jobs");
workers[0].onmessage({ data: { id: 3, result: "playing" } });
workers[0].onmessage({ data: { id: 2, result: "batch" } });
assert.deepEqual(await Promise.all([first, batch, playing]), ["first", "batch", "playing"]);
const failed = queueClient.analyze(buffer);
const failedCheck = assert.rejects(failed, /stopped unexpectedly/);
workers[0].onerror(new Error("crashed"));
await failedCheck;
const recovered = queueClient.analyze(buffer);
assert.equal(workers.length, 2, "A failed worker must be replaced for later analysis");
workers[0].onerror(new Error("late error from terminated worker"));
workers[1].onmessage({ data: { id: 5, result: "recovered" } });
assert.equal(await recovered, "recovered");
queueClient.dispose();
console.log("Analysis worker fidelity, scheduling, and recovery checks passed.");
