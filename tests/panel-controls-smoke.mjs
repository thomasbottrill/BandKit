import assert from "node:assert/strict";
import { createColourField } from "../src/content/components/colour-field.js";
import { createArtworkUpload } from "../src/content/components/artwork-upload.js";
import { createSettingsRowCopy } from "../src/content/components/settings.js";
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, handler) { this.events[event] = handler; }
  click() { return this.events.click?.(); }
}
// createColourField overrides the native input `value` accessor so the swatch and the
// hex field mirror each other, so the harness needs a real prototype accessor to wrap.
class InputElement extends Element {
  constructor(tag) { super(tag); this._value = ""; }
}
Object.defineProperty(InputElement.prototype, "value", {
  configurable: true,
  get() { return this._value; },
  set(next) { this._value = String(next); }
});
globalThis.HTMLInputElement = InputElement;
globalThis.document = {
  activeElement: null,
  createElement: tag => (tag === "input" ? new InputElement(tag) : new Element(tag))
};
const copy = createSettingsRowCopy("Source", "  Choose a theme.  ");
assert.equal(copy.children[0].attributes["aria-label"], "Source. Choose a theme.");
assert.equal(copy.children[0].tabIndex, 0);
assert.equal(copy.children[1].textContent, "  Choose a theme.  ");
for (const overridden of [false, true]) {
  const colour = createColourField({ label: "Accent", tooltip: "Pick an accent.", id: "accent", value: "#aabbcc", sourceLabel: "Theme colour", resetLabel: "Reset to theme", overridden });
  assert.equal(colour.label.htmlFor, colour.input.id);
  assert.equal(colour.input.attributes["aria-label"], "Accent colour");
  assert.equal(colour.source.hidden, overridden);
  assert.equal(colour.reset.hidden, !overridden);
  colour.setOverridden(!overridden);
  assert.equal(colour.source.hidden, !overridden);
  assert.equal(colour.reset.hidden, overridden);
  assert.equal(colour.input.value, "#aabbcc", "presentation must not resolve/reset application colours");
}
let complete;
const files = [], errors = [];
const upload = createArtworkUpload({ ariaLabel: "Upload sample", onFile: file => { files.push(file); return new Promise(resolve => { complete = resolve; }); }, onError: error => errors.push(error) });
await upload.input.events.change();
assert.equal(files.length, 0, "cancelled file selection must have no side effects");
const file = { name: "sample.svg" };
upload.input.files = [file]; upload.input.value = "sample.svg";
const pending = upload.input.events.change();
assert.equal(upload.button.disabled, true);
assert.deepEqual(files, [file]);
complete(); await pending;
assert.equal(upload.button.disabled, false);
assert.equal(upload.input.value, "");
assert.equal(errors.length, 0);
const failure = new Error("Invalid artwork");
const rejected = createArtworkUpload({ ariaLabel: "Upload sample", onFile: async () => { throw failure; }, onError: error => errors.push(error) });
rejected.input.files = [file]; rejected.input.value = "sample.svg";
await rejected.input.events.change();
assert.deepEqual(errors, [failure]);
assert.equal(rejected.button.disabled, false);
assert.equal(rejected.input.value, "", "failed uploads must allow retrying the same file");
console.log("Panel controls: construction-time labels, colour inheritance, upload cancellation, pending, success and failure passed.");
