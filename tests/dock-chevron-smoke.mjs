import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/content/runtime/dock-chevron.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/, "").replaceAll("export function", "function");
const handles = [];
const compactCss = readFileSync(new URL("../src/styles/hub/compact-panel.css", import.meta.url), "utf8");
assert.match(compactCss, /> :not\(\.hub-compact-panel-button\):not\(\.hub-chevron-drag-handle\)/,
  "Single-chevron layout must not hide its drag handles");
const styles = new Map();
const panelStyles = new Map();
const state = { dockChevronOffset: 0 };
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
const context = vm.createContext({ runtimeState: state, runtimeSaveState: () => saves++, window: { innerWidth: 1200 }, document: {
  documentElement: { clientWidth: 1200 },
  createElement: () => ({ events: {}, attrs: {}, classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; }, setPointerCapture() {} })
} });
vm.runInContext(source, context);
context.bindDockChevron(r);
context.syncDockChevron(r, 900);
const handle = handles[0];
const event = (x) => ({ button: 0, pointerId: 1, clientX: x, preventDefault() {}, stopPropagation() {} });
handle.events.pointerdown(event(900));
handle.events.pointermove(event(950));
assert.equal(state.dockChevronOffset, 0, "Cannot move beyond original right edge");
handle.events.pointermove(event(800));
assert.equal(state.dockChevronOffset, 100, "Dragging left moves the chevron left");
assert.equal(panelStyles.get("--hub-context-panel-left"), "590px", "The open panel follows the chevron position");
handle.events.pointermove(event(-1000));
assert.equal(state.dockChevronOffset, 864, "Keep the handle within the viewport");
assert.equal(panelStyles.get("--hub-context-panel-left"), "12px", "The following panel stays within the viewport");
handle.events.pointerup();
assert.equal(saves, 1);
handle.events.keydown({ key: "End", preventDefault() {} });
assert.equal(state.dockChevronOffset, 0, "End restores rightmost position");
assert.equal(handles.length, 2);
console.log("Dock chevron drag checks passed.");
