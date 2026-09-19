import assert from "node:assert/strict";
import { createHelpReferenceShortcut } from "../src/content/help-reference-shortcut.js";
let card = null, opened = 0, time = 0;
const shortcut = createHelpReferenceShortcut({ getHelpCard: () => card, onOpen: () => opened++, now: () => time });
const key = (key, extra = {}) => { let prevented = false; shortcut({ key, composedPath: () => [], preventDefault() { prevented = true; }, stopPropagation() {}, ...extra }); return prevented; };
const type = value => { for (const char of value) { time += 30; key(char); } };
type("components"); assert.equal(opened, 0, "Only the open Help view can enable the command");
card = {}; type("components"); assert.equal(opened, 1);
type("comp"); time += 2001; type("onents"); assert.equal(opened, 1, "Abandoned sequences must expire");
type("comp"); card = {}; type("onents"); assert.equal(opened, 1, "Reopening Help starts a fresh sequence");
for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }, { defaultPrevented: true }, { composedPath: () => [{ isContentEditable: true }] }, { composedPath: () => [{ matches: () => true }] }]) {
  type("comp"); assert.equal(key("o", extra), false); type("nents"); assert.equal(opened, 1);
}
type("comp"); key("Escape"); type("onents"); assert.equal(opened, 1);
type("COMPONENTS"); assert.equal(opened, 2);
assert.equal(key("Tab"), false, "Normal keyboard navigation remains available");
console.log("Hidden Help sequence: view scope, timeouts, editing, modifiers, repeats, composition and keyboard navigation passed.");
