import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { interfaceScale } from "../src/content/scale.js";

const source = readFileSync(new URL("../src/content/runtime/dock-chevron.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replaceAll("export function", "function").replaceAll("export const", "const");
const handles = [];
const compactCss = readFileSync(new URL("../src/styles/hub/compact-panel.css", import.meta.url), "utf8");
assert.match(compactCss, /> :not\(\.hub-compact-panel-button\):not\(\.hub-chevron-drag-handle\)/,
  "Single-chevron layout must not hide its drag handles");
const playerCss = readFileSync(new URL("../src/styles/hub/player.css", import.meta.url), "utf8");
assert.match(playerCss, /translate: var\(--hub-dock-chevron-gap, 0px\) 0;/,
  "The saved gap must move the docked chevron to the right of its anchor");
assert.match(playerCss, /\.hub-player\[data-player-style="docked"\]:is\(\[data-content-width="wide"\], \[data-content-width="custom"\], \[data-content-width="full"\]\) \.hub-player-content \{\s*max-width: calc\(100% - var\(--hub-dock-chevron-reserve, 136px\)\);/,
  "Only the docked widths that scale with the viewport reserve the chevron's resting slot");
assert.doesNotMatch(playerCss, /\.hub-player\[data-player-style="docked"\] \.hub-player-content \{[^}]*max-width:/,
  "The chevron reserve must not override the fixed Tight and Default content widths");
const styles = new Map();
const panelStyles = new Map();
const state = { dockChevronGap: 0 };
let saves = 0;
const r = {
  $player: {
    getBoundingClientRect: () => ({ left: 0 }),
    style: { setProperty: (k, v) => styles.set(k, v), getPropertyValue: (k) => styles.get(k) }
  },
  $panel: {
    offsetWidth: 420,
    style: { setProperty: (k, v) => panelStyles.set(k, v) }
  },
  $playerSections: { append: (h) => handles.push(h), querySelectorAll: () => handles }
};
const context = vm.createContext({ interfaceScale, runtimeState: state, runtimeSaveState: () => saves++, window: { innerWidth: 1200 }, document: {
  documentElement: { clientWidth: 1200 },
  createElement: () => ({ events: {}, attrs: {}, classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; }, setPointerCapture() {} })
} });
vm.runInContext(source, context);

// The chevron rests just past the right edge of the music bar content, the same
// relationship the fade and float bars use, instead of hugging the viewport.
const geometry = context.dockChevronGeometry({ left: 0 }, { width: 800, right: 800 });
assert.equal(geometry.center, 832, "The chevron anchors beside the timeline");
assert.equal(geometry.maxGap, 332, "The chevron can travel to the viewport edge");
const widened = context.dockChevronGeometry({ left: 0 }, { width: 1000, right: 1000 });
assert.equal(widened.center, 1032, "A wider timeline pushes the chevron along");
assert.equal(widened.maxGap, 132, "A wider timeline shrinks the remaining travel");

const sync = () => {
  r.$dockChevronMaxGap = geometry.maxGap;
  context.syncDockChevron(r, geometry.center, true);
};
r.$syncPlayerSectionGeometry = sync;
r.$playerSectionGeometrySignature = "";
context.bindDockChevron(r);
sync();
const handle = handles[0];
const event = (x) => ({ button: 0, pointerId: 1, clientX: x, preventDefault() {}, stopPropagation() {} });
handle.events.pointerdown(event(900));
handle.events.pointermove(event(850));
assert.equal(state.dockChevronGap, 0, "Dragging left stops where the timeline ends");
handle.events.pointermove(event(950));
assert.equal(state.dockChevronGap, 50, "Dragging right moves the chevron away from the timeline");
assert.equal(panelStyles.get("--hub-context-panel-left"), "672px", "The open panel follows the chevron position");
handle.events.pointermove(event(2000));
assert.equal(state.dockChevronGap, 332, "Keep the handle within the viewport");
assert.equal(panelStyles.get("--hub-context-panel-left"), "768px", "The following panel stays within the viewport");
handle.events.pointerup();
assert.equal(saves, 1);
handle.events.keydown({ key: "Home", preventDefault() {} });
assert.equal(state.dockChevronGap, 0, "Home returns the chevron to the timeline edge");
handle.events.keydown({ key: "End", preventDefault() {} });
assert.equal(state.dockChevronGap, 332, "End moves the chevron to the far edge");
assert.equal(handles.length, 2);

// A timeline that grows into the chevron's slot pushes it back, and the saved
// gap is restored when the timeline shrinks again.
r.$dockChevronMaxGap = widened.maxGap;
context.syncDockChevron(r, widened.center, true);
assert.equal(styles.get("--hub-dock-chevron-gap"), "132px", "The widened timeline pushes the chevron back");
assert.equal(state.dockChevronGap, 332, "The preferred gap survives the push");
sync();
assert.equal(styles.get("--hub-dock-chevron-gap"), "332px", "Narrowing the timeline restores the chosen gap");
console.log("Dock chevron drag checks passed.");
