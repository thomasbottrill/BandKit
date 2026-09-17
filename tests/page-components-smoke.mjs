import assert from "node:assert/strict";
import { createPageAddButton, createPageMenuOption } from "../src/content/components/page-actions.js";
import { createPageWaveform, createPageTransportButton } from "../src/content/components/page-playback.js";
import { createPageAnalysisBadge } from "../src/content/components/page-analysis.js";

// Behavioral contracts only. The real-site checks cover browser layout and focus.
class Element {
  constructor(tag, namespace = null) {
    this.tagName = tag; this.namespaceURI = namespace; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {};
    this.style = { setProperty() {} };
    this.classes = new Set();
    this.classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
}
globalThis.document = { createElement: tag => new Element(tag), createElementNS: (namespace, tag) => new Element(tag, namespace) };
globalThis.chrome = { runtime: { getURL: path => `chrome-extension://test/${path}` } };
const button = createPageAddButton(), link = createPageAddButton("a");
assert.equal(button.type, "button", "Add controls must not submit a surrounding form");
assert.equal(link.href, "#"); assert.equal(link.attributes.role, "button", "Native track rows retain their anchor-compatible action");
assert.notEqual(createPageAddButton(), button, "Callers must receive independent controls");
let invoked = 0, stopped = false;
const menuItem = createPageMenuOption("＋ <b>Literal playlist</b>", () => { assert(stopped); invoked++; }, false, "is-prominent");
assert.equal(menuItem.children[0].attributes["aria-hidden"], "true");
assert.equal(menuItem.children[1].textContent, "<b>Literal playlist</b>", "Destination names must remain literal text");
assert.equal(menuItem.attributes["aria-label"], "＋ <b>Literal playlist</b>");
menuItem.events.click({ stopPropagation() { stopped = true; } }); assert.equal(invoked, 1);
assert.equal(createPageMenuOption("Already added", () => {}, true).disabled, true);
for (const [direction, label] of [["previous", "Previous track"], ["next", "Next track"]]) {
  const control = createPageTransportButton(direction);
  assert.equal(control.dataset.bandkitTrackNavigation, direction); assert.equal(control.attributes["aria-label"], label);
}
const waveform = createPageWaveform();
assert.equal(waveform.attributes["aria-hidden"], "true");
assert.equal(waveform.attributes.focusable, "false");
assert.equal(waveform.children.length, 2);
assert(waveform.children.every(path => path.namespaceURI === "http://www.w3.org/2000/svg"));
for (const uncertain of [true, false]) for (const unavailable of [true, false]) {
  const badge = createPageAnalysisBadge("key", "Key?", uncertain, unavailable);
  assert.equal(badge.textContent, "Key?");
  assert.equal(badge.classes.has("is-uncertain"), uncertain); assert.equal(badge.classes.has("is-unavailable"), unavailable);
}
console.log("Shared page controls: native anchor variants, literal labels, menu callbacks, transport accessibility and uncertain analysis passed.");
