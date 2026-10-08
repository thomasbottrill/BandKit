import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Element {
  constructor(name = "") {
    this.name = name; this.children = []; this.events = {}; this.inert = false;
    this.style = { setProperty(key, value) { this[key] = value; }, getPropertyValue(key) { return this[key] || ""; }, overflow: "scroll" };
    this.classes = new Set();
    this.classList = { add: (c) => this.classes.add(c), remove: (c) => this.classes.delete(c), contains: (c) => this.classes.has(c), toggle: (c, value) => value ? this.classes.add(c) : this.classes.delete(c) };
  }
  append(...items) { items.forEach((item) => { item.parentNode?.removeChild(item); this.children.push(item); item.parentNode = this; }); }
  removeChild(item) { this.children = this.children.filter((child) => child !== item); item.parentNode = null; }
  before(item) { this.parentNode.append(item); }
  replaceWith(item) { this.parentNode.append(item); this.remove(); }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute() {}
  addEventListener(type, fn) { this.events[type] = fn; }
  removeEventListener(type) { delete this.events[type]; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { shadow.activeElement = this; }
  querySelector(selector) { return this.queries?.[selector] || null; }
}
const shadow = new Element("shadow"), body = new Element("body");
const document = new Element("document");
Object.assign(document, { body, documentElement: new Element(), createElement: (tag) => new Element(tag), createComment: () => new Element("marker") });
let timer = null, geometry = 0, visualizerSync = 0;
const player = new Element("player"), actions = new Element("actions"), tools = new Element("tools");
player.queries = { ".hub-player-actions": actions, ".hub-player-tools": tools };
shadow.append(player);
const surface = new Element("surface"); body.append(surface);
const r = { $shadow: shadow, $player: player, $playerSurfaceHost: surface, $playerMoreButton: new Element("more"),
  $closePlayerMoreMenu() {}, $syncMusicBarVisualizer() { visualizerSync++; },
  $schedulePlayerSectionGeometry() { geometry++; }, $syncPlayerPageSpace() {} };
const source = fs.readFileSync(new URL("../src/content/runtime/fullscreen-visualizer.js", import.meta.url), "utf8");
const menuSource = fs.readFileSync(new URL("../src/content/runtime/layout-cart-rendering.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/hub/fullscreen-visualizer.css", import.meta.url), "utf8");
assert.doesNotMatch(menuSource, /Experimental|experimental/, "fullscreen visualizer menu action should not carry an experimental label");
assert.match(menuSource, /hub-visualizer-menu-action[\s\S]*?<span>Visualizer<\/span>`;/,
  "fullscreen visualizer menu action should only contain the shared icon and label");
assert.match(css, /\.hub-visualizer-menu-action,\s*\.hub-pip-menu-action\s*\{[^}]*gap:\s*var\(--hub-control-gap\);[^}]*height:\s*34px;[^}]*padding:\s*0 8px;[^}]*font-size:\s*11px;/s,
  "fullscreen visualizer and mini player menu actions should match the other labeled menu controls");
assert.match(css, /\.hub-visualizer-exit\s*\{[^}]*width:\s*48px;[^}]*height:\s*48px;[^}]*border:\s*0;[^}]*border-radius:\s*0;/s,
  "fullscreen visualizer exit should keep its hit area without a circular outline");
const runtimeLive = { isPlaying: false };
const context = vm.createContext({ document, runtimeLive, asset: (name) => name, getComputedStyle: () => ({ getPropertyValue: () => "#171413" }),
  setTimeout: (fn) => { timer = fn; return 1; }, clearTimeout: () => { timer = null; } });
vm.runInContext(source.replace(/^import .*;\n/gm, "").replaceAll("export function", "function"), context);
context.openFullscreenVisualizer(r);
assert.equal(r.$fullscreenVisualizerStage, undefined, "cannot enter without playback");
runtimeLive.isPlaying = true;
context.openFullscreenVisualizer(r);
const stage = r.$fullscreenVisualizerStage;
assert.equal(stage.classes.has("is-frosted-glass"), false);
player.classList.add("is-frosted-glass");
player.style.setProperty("--hub-glass-surface-opacity", "45%");
player.style.setProperty("--hub-glass-blur", "23px");
context.syncFullscreenVisualizerGlass(r);
assert.equal(stage.classes.has("is-frosted-glass"), true);
assert.equal(stage.parentNode.classes.has("is-frosted-glass"), true);
assert.equal(stage.style["--hub-glass-surface-opacity"], "45%");
assert.equal(stage.style["--hub-glass-blur"], "23px");
player.classList.remove("is-frosted-glass");
context.syncFullscreenVisualizerGlass(r);
assert.equal(stage.classes.has("is-frosted-glass"), false);
assert.equal(stage.parentNode.classes.has("is-frosted-glass"), false);
for (const name of ["ink", "muted", "accent", "scrub-accent", "scrub-remaining"]) {
  assert.equal(stage.style[`--hub-fullscreen-${name}`], "#171413", "Fullscreen preserves the resolved player palette");
  assert.ok(css.includes(`--hub-${name}: var(--hub-fullscreen-${name}) !important`));
}
assert.equal(player.parentNode, stage, "reuse the live player instead of duplicating it");
assert.equal(document.documentElement.style.overflow, "hidden");
assert.equal(stage.parentNode.open, true);
assert.equal(r.$visualizerFullscreen, true);
context.openFullscreenVisualizer(r);
assert.equal(visualizerSync, 1, "repeated entry is a no-op");
timer();
assert.equal(stage.classes.has("is-idle"), true);
assert.equal(actions.inert, true, "hidden actions cannot receive focus");
stage.events.keydown({ key: "Tab" });
assert.equal(actions.inert, false);
assert.equal(stage.classes.has("is-idle"), false, "keyboard reveals controls before moving focus");
stage.events.pointermove();
assert.equal(stage.classes.has("is-idle"), false);
stage.queries = { ":focus-visible": actions }; shadow.activeElement = actions;
timer();
assert.equal(stage.classes.has("is-idle"), false, "keyboard-focused controls remain visible");
let prevented = false;
stage.events.keydown({ key: "Escape", preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(r.$visualizerFullscreen, false);
assert.equal(player.parentNode, shadow);
assert.equal(surface.parentNode, body);
assert.equal(document.documentElement.style.overflow, "scroll");
assert.equal(timer, null);
assert.equal(document.events.fullscreenchange, undefined);
assert.equal(geometry, 2);
assert.equal(visualizerSync, 2);
assert.equal(shadow.activeElement, r.$playerMoreButton);
assert.equal(source.includes("requestAnimationFrame"), false, "no second render loop");
console.log("Fullscreen visualizer: entry, idle, keyboard, duplicate-entry guard and cleanup passed");
