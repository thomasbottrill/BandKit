import assert from "node:assert/strict";
import { HANDLE_OUTLINE_CSS } from "../src/content/handle-outline-style.js";

const positions = HANDLE_OUTLINE_CSS.match(/\n  mask-position: ([^;]+);/)[1];
const offsets = [...positions.matchAll(/calc\(50% \+ ([-\d.]+)px\) calc\(50% \+ ([-\d.]+)px\)/g)];
assert.equal(offsets.length, 16, "Every shape uses the same circular outline samples");
for (const [, x, y] of offsets) {
  assert.ok(Math.abs(Math.hypot(Number(x), Number(y)) - 2) < 0.001,
    "Every outline sample is exactly two pixels from the fill silhouette");
}
assert.match(HANDLE_OUTLINE_CSS, /mask-size: calc\(100% - 6px\) calc\(100% - 6px\)/);
assert.match(HANDLE_OUTLINE_CSS, /::after \{\s+inset: 3px;/,
  "Outline and fill must use the same-sized silhouette");
assert.match(HANDLE_OUTLINE_CSS, /--hub-scrub-surface: var\(--hub-panel\)/);
assert.match(HANDLE_OUTLINE_CSS, /--hub-scrub-surface: var\(--hub-zune-surface\)/);
assert.match(HANDLE_OUTLINE_CSS, /--hub-scrub-surface: var\(--hub-docked-surface\)/);
console.log("Uniform handle outline and dynamic surface checks passed.");
