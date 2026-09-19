import assert from "node:assert/strict";
import { discoverGenrePalette } from "../src/content/discover-colours.js";
const previousDocument = globalThis.document;
const previousComputed = globalThis.getComputedStyle;
let genre = "metal";
const tokens = {
  metal: ["linear-gradient(142deg, #210404 14.6%, #300404 50%)", "#fff", "#800102"],
  electronic: ["linear-gradient(145deg, #E9E9FF 13%, #FFF5F0 51%)", "#222", "#534AC9"]
};
globalThis.document = { querySelector: () => genre ? { getAttribute: () => `--native: var(--genre-${genre}-secondary-color);` } : null };
globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => name.endsWith("gradient") ? tokens[genre][0] : name === "--page-text-color" ? tokens[genre][1] : tokens[genre][2] });
try {
  assert.deepEqual(discoverGenrePalette(), { background: { r: 33, g: 4, b: 4, a: 1 }, text: { r: 255, g: 255, b: 255, a: 1 }, accent: { r: 128, g: 1, b: 2, a: 1 } });
  genre = "electronic";
  assert.deepEqual(discoverGenrePalette().background, { r: 233, g: 233, b: 255, a: 1 });
  assert.equal(discoverGenrePalette().text.r, 34);
  genre = "";
  assert.equal(discoverGenrePalette(), null);
} finally { globalThis.document = previousDocument; globalThis.getComputedStyle = previousComputed; }
console.log("Discover genre colours: native hex tokens, genre changes, and filter removal passed.");
