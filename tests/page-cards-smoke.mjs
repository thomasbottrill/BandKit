import assert from "node:assert/strict";
import { createPlaylistArtwork } from "../src/content/components/playlist-artwork.js";
import { createCollectionActionRow, setPageCardActionRow, createPagePlaylistCard } from "../src/content/components/page-cards.js";
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {}; this.style = { setProperty() {} }; this.classes = new Set(); }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
  get classList() { return { add: value => this.classes.add(value), toggle: (value, on) => on ? this.classes.add(value) : this.classes.delete(value) }; }
}
globalThis.document = { createElement: tag => new Element(tag) };
globalThis.chrome = { runtime: { getURL: path => `chrome-extension://test/${path}` } };
globalThis.location = { href: "https://bandcamp.com/test" };
const items = [{ art: "javascript:alert(1)" }, { art: "//example.com/0.jpg" }, { art: "https://example.com/0.jpg" }, ...Array.from({ length: 6 }, (_, n) => ({ art: `https://example.com/${n + 1}.jpg` }))];
for (const [variant, limit] of [["panel", 4], ["page", 5]]) {
  const mosaic = createPlaylistArtwork(items, variant);
  assert.equal(mosaic.children.length, limit);
  assert.equal(new Set(mosaic.children.map(image => image.src)).size, limit, "Resolved duplicate artwork must not use two slots");
  assert.equal(mosaic.children[0].src, "https://example.com/0.jpg", "Unsafe artwork must not reach the DOM");
  assert(mosaic.children.every(image => image.alt === ""));
  assert(mosaic.children.every(image => (image.loading === "lazy") === (variant === "page")), "Retain each surface's loading policy");
  const empty = createPlaylistArtwork([], variant);
  assert.equal(empty.children.length, 1);
  assert.equal(empty.children[0].tagName, variant === "page" ? "img" : "span");
}
const row = createCollectionActionRow(), native = new Element("a");
let clicked = 0;
native.addEventListener("click", () => clicked++); row.append(native);
setPageCardActionRow(row, true, true);
assert(row.classes.has("bandkit-feed-sidebar-actions"));
setPageCardActionRow(row, false, true);
assert(!row.classes.has("bandkit-feed-action-row")); assert(!row.classes.has("bandkit-feed-sidebar-actions"));
assert.equal(row.children[0], native); native.events.click(); assert.equal(clicked, 1, "Styling a native row must preserve its controls and listeners");
const card = createPagePlaylistCard({ id: "sample", title: "<b>Literal title</b>", date: "Saved locally", subtitle: "0 tracks", ariaLabel: "Open sample", artwork: createPlaylistArtwork([], "page"), onOpen: () => clicked++ });
const open = card.children[0].children[0];
assert.equal(open.type, "button"); assert.equal(open.attributes["aria-label"], "Open sample");
assert.equal(open.children[1].children[1].textContent, "<b>Literal title</b>");
open.events.click(); assert.equal(clicked, 2);
console.log("Page cards: safe unique artwork, per-surface limits/loading, empty states, native controls and literal card labels passed.");
