// The page fans out several single-track ANALYZE_TRACKS requests at once, so the
// offscreen per-request concurrency cap bounded nothing. These checks pin the
// gate that actually serialises fetch/decode work across in-flight requests.
import assert from "node:assert/strict";
import { createAnalysisGate } from "../src/offscreen/analysis-gate.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function serialisesConcurrentJobs() {
  const gate = createAnalysisGate();
  let active = 0;
  let peak = 0;
  const order = [];
  const job = (label) => async () => {
    active += 1; peak = Math.max(peak, active);
    order.push(label);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return label;
  };
  const results = await Promise.all([
    gate.runExclusive(job("a")),
    gate.runExclusive(job("b")),
    gate.runExclusive(job("c"))
  ]);
  assert.equal(peak, 1, "Concurrent analysis requests must never decode more than one track at a time");
  assert.deepEqual(order, ["a", "b", "c"], "Queued analysis must run in the order it was requested");
  assert.deepEqual(results, ["a", "b", "c"], "Each caller must receive its own result");
}

async function oneFailureDoesNotStallTheQueue() {
  const gate = createAnalysisGate();
  const failing = gate.runExclusive(async () => { throw new Error("decode failed"); });
  await assert.rejects(failing, /decode failed/, "A failing analysis must reject its own caller");
  assert.equal(await gate.runExclusive(async () => "next"), "next", "A failed analysis must release the gate for the next track");
}

async function concurrentRequestsForOneTrackShareWork() {
  const gate = createAnalysisGate();
  let runs = 0;
  const job = async () => { runs += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return "analysed"; };
  const [first, second] = await Promise.all([gate.share("track-1", job), gate.share("track-1", job)]);
  assert.equal(runs, 1, "Two requests for the same track must not fetch and decode it twice");
  assert.equal(first, "analysed");
  assert.equal(second, "analysed", "Both callers must receive the shared result");

  // Once settled the entry must be released, or a later re-analysis is ignored.
  await tick();
  assert.equal(gate.pending(), 0, "A settled analysis must not stay in the in-flight map");
  await gate.share("track-1", job);
  assert.equal(runs, 2, "A later request for the same track must run again once the first has settled");
}

async function distinctTracksDoNotShare() {
  const gate = createAnalysisGate();
  let runs = 0;
  const job = async () => { runs += 1; return runs; };
  await Promise.all([gate.share("track-a", job), gate.share("track-b", job)]);
  assert.equal(runs, 2, "Different tracks must each be analysed");
}

async function sharedFailureIsReleased() {
  const gate = createAnalysisGate();
  await assert.rejects(gate.share("track-x", async () => { throw new Error("nope"); }), /nope/);
  await tick();
  assert.equal(gate.pending(), 0, "A rejected shared analysis must be released so it can be retried");
  assert.equal(await gate.share("track-x", async () => "recovered"), "recovered", "A track must be retryable after a failure");
}

await serialisesConcurrentJobs();
await oneFailureDoesNotStallTheQueue();
await concurrentRequestsForOneTrackShareWork();
await distinctTracksDoNotShare();
await sharedFailureIsReleased();

console.log("Analysis gate: cross-request serialisation, ordering, failure recovery and per-track sharing passed.");
