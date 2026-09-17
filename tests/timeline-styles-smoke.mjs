import assert from "node:assert/strict";
import { TIMELINE_STYLES, normalizeTimelineStyle, timelinePathData, applyTimelinePath } from "../src/content/timeline-styles.js";
import { waveformPathData } from "../src/content/waveform.js";
assert.equal(TIMELINE_STYLES.length, 15);
assert.equal(new Set(TIMELINE_STYLES.map(s => s.value)).size, 15);
assert.equal(normalizeTimelineStyle("invalid"), "waveform");
for (const [id, label] of [["skyline", "Stitches"], ["peaks", "Squiggle"], ["ribbon", "Pixels"], ["diamonds", "Capsules"]]) {
  assert.equal(TIMELINE_STYLES.find(s => s.value === id).label, label);
}
assert.equal(timelinePathData("a", 720, "peaks").pathData, timelinePathData("b", 720, "peaks").pathData,
  "Squiggle uses even loops rather than track-dependent peak heights");
const squiggle = timelinePathData("a", 720, "peaks").pathData;
assert.equal((squiggle.match(/M/g) || []).length, 1, "Squiggle is one continuous rounded zigzag");
assert.match(squiggle, /C/, "Squiggle is drawn from curve segments");
assert.ok(!/[LHV]/.test(squiggle), "Squiggle has no straight sections or flattened peaks");
const squiggleCurves = [...squiggle.matchAll(/C([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)]
  .map(([, , controlY1, , controlY2, , endY]) => ({
    controlY1: Number(controlY1), controlY2: Number(controlY2), endY: Number(endY)
  }));
assert.ok(squiggleCurves.length > 1, "Squiggle repeats across the timeline");
const squiggleMidline = squiggleCurves[0].endY;
assert.ok(squiggleCurves.every(curve => curve.endY === squiggleMidline),
  "Every loop returns to the same midline, so the zigzag never drifts");
assert.ok(squiggleCurves.every(curve => curve.controlY1 === curve.controlY2),
  "Each loop is a symmetric arc rather than a leaning curve");
const squiggleAmplitudes = squiggleCurves.map(curve => curve.controlY1 - squiggleMidline);
assert.ok(squiggleAmplitudes.every((amplitude, index) => (amplitude < 0) === (index % 2 === 0)),
  "Loops alternate strictly between peak and trough");
assert.equal(new Set(squiggleAmplitudes.map(amplitude => Math.abs(amplitude).toFixed(2))).size, 1,
  "Every rounded peak and trough has the same height, including the ends");
for (const width of [80, 180, 320, 720, 1440, 2560]) {
  const geometries = new Set();
  for (const { value } of TIMELINE_STYLES) {
    const geometry = timelinePathData("test-track", width, value);
    assert.ok(geometry.pathData.length > 0);
    assert.ok(!/NaN|Infinity|undefined/.test(geometry.pathData));
    assert.equal(geometry.pixelWidth, width);
    assert.deepEqual(geometry, timelinePathData("test-track", width, value), "Stable geometry between frames");
    assert.ok(geometry.pathData.length < 120000, "Bounded geometry on wide screens");
    geometries.add(geometry.pathData);
    const paths = [0, 1].map(() => ({ style: {}, setAttribute(key, val) { this[key] = val; } }));
    const svg = { setAttribute() {}, querySelectorAll() { return paths; } };
    applyTimelinePath(svg, "test-track", width, value);
    assert.equal(paths[0].d, paths[1].d, "Played and remaining layers align exactly");
    assert.equal(paths[0].style.strokeWidth, String(geometry.strokeWidth));
  }
  assert.equal(geometries.size, 15, "All styles look distinct at every tested width");
}
assert.equal(timelinePathData("legacy", 720).pathData, waveformPathData("legacy", 720).pathData);
console.log("15 distinct, deterministic timelines; progress alignment and legacy waveform checks passed.");
