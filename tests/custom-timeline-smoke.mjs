import assert from "node:assert/strict";
import { applyCustomTimeline, clearCustomTimeline, normalizeCustomTimeline, importCustomTimeline } from "../src/content/custom-timeline.js";
import { normalizeTimelineStyle, applyTimelinePath } from "../src/content/timeline-styles.js";
import { defaultState } from "../src/content/state.js";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=";
assert.equal(defaultState.customTimeline, null);
assert.equal(defaultState.retainTimelineColors, true);
assert.equal(normalizeTimelineStyle("custom"), "custom");
assert.equal(normalizeCustomTimeline({ png: "data:text/html,hello" }), null);
assert.equal(normalizeCustomTimeline({ png }).png, png);
class Element {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.style = {}; this.children = []; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  append(child) { this.children.push(child); child.parent = this; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  querySelector() { return this.children.find(child => child.tag === "defs"); }
  querySelectorAll() { return this.children.filter(child => child.tag === "path"); }
}
globalThis.document = { createElementNS: (_, tag) => new Element(tag) };
const svg = new Element("svg"); svg.append(new Element("path")); svg.append(new Element("path"));
const saved = { name: "art.png", png };
for (const width of [160, 640, 1280]) {
  assert.equal(applyCustomTimeline(svg, saved, true, width), true);
  const defs = svg.querySelector();
  assert.equal(defs.children[0].tag, "pattern");
  assert.equal(defs.children[0].children[0].attrs.preserveAspectRatio, "none");
  assert.equal(defs.children[0].children[0].attrs.width, String(width));
  assert.equal(svg.children[0].attrs.d, svg.children[1].attrs.d);
  assert.equal(svg.children[0].style.opacity, "0.4", "Retained artwork still shows playback progress");
  applyCustomTimeline(svg, saved, true, width);
  assert.equal(svg.querySelector(), defs, "Stable frames reuse their image definitions");
  applyCustomTimeline(svg, saved, false, width);
  assert.equal(svg.querySelector().children[0].tag, "mask");
  assert.equal(svg.querySelector().children[0].style.maskType, "alpha");
  assert.equal(svg.children[0].style.stroke, "", "Theme colours remain controlled by existing CSS");
}
clearCustomTimeline(svg);
assert.equal(svg.querySelector(), undefined);
assert.equal(svg.children[0].attrs.mask, undefined);
applyTimelinePath(svg, "test", 640, "custom", null);
assert.ok(svg.children[0].attrs.d.length > 0, "Missing artwork uses the normal waveform");

let closed = false, draw;
globalThis.window = { createImageBitmap: async () => ({ close() { closed = true; } }) };
const canvas = { getContext: () => ({ drawImage: (...args) => { draw = args; }, getImageData: () => ({ data: [0, 0, 0, 255] }) }), toDataURL: () => png };
globalThis.document.createElement = () => canvas;
const header = Buffer.from(png.split(",")[1], "base64").subarray(0, 24);
assert.equal((await importCustomTimeline({ name: "timeline.png", size: 100, slice: () => new Blob([header]) })).png, png);
assert.deepEqual(draw.slice(1), [0, 0, 2560, 48]);
assert.equal(closed, true);
delete globalThis.document; delete globalThis.window;
console.log("Custom timeline: PNG import, colour modes, sizing, cache, cleanup and fallback passed");
