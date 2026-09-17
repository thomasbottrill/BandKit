import assert from "node:assert/strict";
import { alphaBounds, importPngHandle, normalizePngHandle, pngDimensions } from "../src/content/png-scrub-handle.js";

const pixels = new Uint8ClampedArray(6 * 5 * 4);
assert.equal(alphaBounds(pixels, 6, 5), null);
pixels[(1 * 6 + 2) * 4 + 3] = 255;
pixels[(3 * 6 + 4) * 4 + 3] = 1;
assert.deepEqual(alphaBounds(pixels, 6, 5), { left: 2, top: 1, width: 3, height: 3 });
assert.equal(pixels[(2 * 6 + 3) * 4 + 3], 0, "Transparent holes are preserved");
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=";
assert.equal(normalizePngHandle({ name: "icon.png", png }).png, png);
assert.equal(normalizePngHandle({ png: "data:image/svg+xml,<svg/>" }), null);
assert.equal(normalizePngHandle({ png: "data:image/png;base64,AAAA" }), null);
assert.throws(() => pngDimensions(new Uint8Array(24)), /valid PNG/);
// The output canvas must copy the source image without a silhouette/recolor pass.
const draws = [];
let closed = false;
const bitmap = { width: 6, height: 5, close() { closed = true; } };
const sourceContext = { drawImage() {}, getImageData() { return { data: pixels }; } };
const outputContext = {
  drawImage(...args) { draws.push(args); },
  fillRect() { assert.fail("PNG colors must not be replaced"); },
  set globalCompositeOperation(_) { assert.fail("PNG alpha must not be recolored"); }
};
const source = { getContext() { return sourceContext; } };
const output = { getContext() { return outputContext; }, toDataURL() { return png; } };
const canvases = [source, output];
globalThis.window = { createImageBitmap: async () => bitmap };
globalThis.document = { createElement: () => canvases.shift() };
const header = Buffer.from(png.split(",")[1], "base64").subarray(0, 24);
const file = { name: "color-icon.png", size: 100, slice: () => new Blob([header]) };
assert.deepEqual(await importPngHandle(file), { name: file.name, png });
assert.deepEqual(draws[0].slice(0, 5), [source, 2, 1, 3, 3]);
assert.equal(closed, true);
delete globalThis.window;
delete globalThis.document;
console.log("PNG signature, alpha crop and saved handle checks passed.");
