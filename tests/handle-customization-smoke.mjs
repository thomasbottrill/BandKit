import assert from "node:assert/strict";
import { normalizeHandleSize, defaultState } from "../src/content/state.js";
import { setHandleImageStyles } from "../src/content/custom-scrub-handle.js";
assert.equal(defaultState.scrubberHandleSize, 100);
for (const value of [undefined, null, "", "bad", Infinity]) assert.equal(normalizeHandleSize(value), 100);
assert.equal(normalizeHandleSize(0), 50);
assert.equal(normalizeHandleSize(900), 200);
assert.equal(normalizeHandleSize(123), 125);
const values = new Map();
const style = {
  getPropertyValue: (key) => values.get(key) || "",
  setProperty: (key, value) => values.set(key, value),
  removeProperty: (key) => values.delete(key)
};
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=";
setHandleImageStyles(style, "--hub-scrub-handle", "custom", { png }, false);
assert.match(values.get("--hub-scrub-handle-fill"), /data:image\/png/);
assert.equal(values.get("--hub-scrub-handle-fill-mask"), "none");
assert.equal(defaultState.retainPngHandleColors, true, "Existing PNG handles retain their appearance");
setHandleImageStyles(style, "--hub-scrub-handle", "custom", { png }, false, false);
assert.equal(values.get("--hub-scrub-handle-fill"), undefined,
  "Theme handles must resolve their fill on the handle itself, not the host accent");
assert.equal(values.get("--hub-scrub-handle-fill-mask"), "var(--hub-scrub-handle-mask)");
setHandleImageStyles(style, "--hub-scrub-handle", "pill", { png }, true);
assert.equal(values.get("--hub-scrub-handle-fill"), undefined);
assert.equal(values.get("--hub-scrub-handle-fill-mask"), "var(--hub-scrub-handle-mask)");
console.log("Handle size defaults, bounds and image/theme switching passed.");
