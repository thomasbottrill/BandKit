import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { headerMutationNeedsMount } from "../src/content/runtime/header-mutations.js";
import { syncVisualizerSurface } from "../src/content/runtime/visualizer-surface.js";

const ownedChild = {};
const root = { contains: (node) => node === ownedChild };
const native = { nodeType: 1, closest: () => null };
const style = { id: "bandkit-shadow-header-theme", nodeType: 1, closest: () => style };
const mutation = (target, addedNodes = [], removedNodes = []) => ({ target, addedNodes, removedNodes });
assert.equal(headerMutationNeedsMount(mutation(ownedChild, [{}]), root), false);
assert.equal(headerMutationNeedsMount(mutation(style, [{}], [{}]), root), false);
assert.equal(headerMutationNeedsMount(mutation(native, [root, style]), root), false);
assert.equal(headerMutationNeedsMount(mutation(native, [root, native]), root), true);
assert.equal(headerMutationNeedsMount(mutation(native, [], [root]), root), true);
assert.equal(headerMutationNeedsMount(mutation(native, [], [style]), root), true);
assert.equal(headerMutationNeedsMount(mutation(native, [native]), root), true);

// Execute the production page-action predicate: analysis updates aren't new
// tracks, but native text replacements and newly inserted rows still are.
const scanning = readFileSync(new URL("../src/content/runtime/live-scanning.js", import.meta.url), "utf8");
const predicate = scanning.slice(scanning.indexOf("r.$mutationAddsPageActionSource ="), scanning.indexOf("r.$observePageActionSources ="));
class Element {
  constructor(owned = false, source = false) { this.owned = owned; this.source = source; }
  matches(selector) { return selector === "native-source" ? this.source : this.owned; }
  closest(selector) { return this.matches(selector) ? this : null; }
  querySelector() { return null; }
}
const runtime = { $pageActionSourceSelector: "native-source" };
vm.runInNewContext(predicate, { r: runtime, Element });
assert.equal(runtime.$mutationAddsPageActionSource(mutation(new Element(true), [new Element()])), false);
assert.equal(runtime.$mutationAddsPageActionSource(mutation(new Element(false, true), [new Element(true)])), false);
assert.equal(runtime.$mutationAddsPageActionSource(mutation(new Element(), [new Element(false, true)])), true);
assert.equal(runtime.$mutationAddsPageActionSource(mutation(new Element(false, true), [{ nodeType: 3 }])), true);

let copies = 0;
const css = () => { const properties = new Map(); return {
  getPropertyValue: (name) => properties.get(name) || "",
  setProperty: (name, value) => properties.set(name, value)
}; };
const original = { width: 640, height: 100 };
const source = { querySelector: () => original, getBoundingClientRect: () => ({ left: 20, top: 300, width: 640, height: 100 }) };
const r = {
  $playerVisualizer: source, $playerSurfaceHost: { shadowRoot: {} },
  $visualizerSurface: { style: css(), hidden: false },
  $visualizerSurfaceBloom: { style: css() },
  $visualizerSurfaceCanvas: { width: 0, height: 0, style: css(), getContext: () => ({ clearRect() {}, drawImage() { copies++; } }) }
};
let blend = "normal";
let display = "block";
globalThis.getComputedStyle = () => ({ display, mixBlendMode: blend, opacity: "1", maskImage: "none", getPropertyValue: () => "none" });
syncVisualizerSurface(r);
for (let i = 0; i < 100; i++) syncVisualizerSurface(r);
assert.equal(copies, 1, "Geometry/settling must not re-present the same canvas frame");
blend = "screen";
syncVisualizerSurface(r);
assert.equal(r.$visualizerSurface.style.getPropertyValue("mix-blend-mode"), "screen", "Paused blend previews must still update");
assert.equal(copies, 1);
syncVisualizerSurface(r, false, true);
assert.equal(copies, 2, "A new FFT frame must be presented immediately");
original.width = 800;
syncVisualizerSurface(r);
assert.equal(copies, 3, "Resolution changes must invalidate the presented image");
display = "none";
syncVisualizerSurface(r, true, true);
assert.equal(copies, 3);
display = "block";
syncVisualizerSurface(r);
assert.equal(copies, 4, "Frames received while hidden must appear on re-entry");
delete globalThis.getComputedStyle;

const surfaceSource = readFileSync(new URL("../src/content/runtime/player-surface.js", import.meta.url), "utf8");
const scheduler = surfaceSource.slice(surfaceSource.indexOf("function surfaceSignature")).replace("export function", "function");
let now = 0;
const frames = [];
const surface = { hidden: false, style: { cssText: "width: 640px" } };
const state = { $player: { isConnected: true }, $playerSurfaceHost: { isConnected: true }, $playerSurface: surface, $playerSurfaceLayers: [] };
const sandbox = { performance: { now: () => now }, document: { body: {} }, paintSurface() {}, requestAnimationFrame(fn) { frames.push(fn); return frames.length; } };
vm.createContext(sandbox);
vm.runInContext(scheduler, sandbox);
sandbox.syncPlayerSurface(state);
for (now = 16; now < 1000; now += 16) {
  if (frames.length) frames.shift()();
  if (now % 80 === 0) sandbox.syncPlayerSurface(state);
}
assert.equal(frames.length, 0, "Unchanged playback updates must let the settling loop stop");
surface.style.cssText = "width: 800px";
sandbox.syncPlayerSurface(state);
assert.equal(frames.length, 1, "A real geometry change must restart settling");
console.log("Header/page mutation loops, canvas presentation and transition settling checks passed.");
