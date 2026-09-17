import assert from "node:assert/strict";
import fs from "node:fs";
import { syncOverflowTooltip } from "../src/content/runtime/overflow-tooltips.js";

function fakeElement({
  clientHeight = 20,
  clientWidth = 100,
  scrollHeight = 20,
  scrollWidth = 100,
  text = "A complete track title",
  title = null
} = {}) {
  const attributes = new Map();
  if (title !== null) attributes.set("title", title);
  return {
    clientHeight,
    clientWidth,
    dataset: {},
    scrollHeight,
    scrollWidth,
    textContent: text,
    getAttribute: (name) => attributes.get(name) ?? null,
    hasAttribute: (name) => attributes.has(name),
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, String(value))
  };
}

const clipped = fakeElement({ clientWidth: 90, scrollWidth: 180, text: "  A very long\n track title  " });
assert.equal(syncOverflowTooltip(clipped), true, "Clipped text should receive an overflow tooltip");
assert.equal(clipped.getAttribute("title"), "A very long track title", "Overflow tooltips should expose the normalized full label");
assert.equal(clipped.getAttribute("data-bandkit-overflow-title"), "true", "Bandkit-owned titles should be identifiable");

clipped.scrollWidth = 90;
assert.equal(syncOverflowTooltip(clipped), false, "Text that fits should not keep an overflow tooltip");
assert.equal(clipped.hasAttribute("title"), false, "A Bandkit-owned tooltip should be removed after the text fits");

const purposeful = fakeElement({ clientWidth: 80, scrollWidth: 180, title: "Purposeful control help" });
assert.equal(syncOverflowTooltip(purposeful), false, "Existing purposeful titles should be preserved");
assert.equal(purposeful.getAttribute("title"), "Purposeful control help");

const source = fs.readFileSync(new URL("../src/content/runtime/overflow-tooltips.js", import.meta.url), "utf8");
assert.match(source, /document\.addEventListener\("pointerover"/, "Page labels should be checked lazily when hovered");
assert.match(source, /\$shadow\.addEventListener\("pointerover"/, "Bandkit panel and music-bar labels should be checked lazily when hovered");
assert.match(source, /scrollWidth[\s\S]*clientWidth[\s\S]*scrollHeight[\s\S]*clientHeight/, "Both horizontal and multi-line clipping should be detected");
assert.match(source, /\.track-title[\s\S]*\.artist-name[\s\S]*\.hub-player-secondary/, "Track, artist, and music-bar metadata must use the shared pattern");

console.log("Overflow tooltip smoke checks passed.");
