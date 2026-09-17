import assert from "node:assert/strict";
import { MAX_BRIDGED_CART_ITEMS, normalizeBridgedCart } from "../src/content/cart-model.js";

// Anything that is not a cart payload is ignored outright.
for (const detail of [null, undefined, {}, { items: null }, { items: "a" }, { items: {} }]) {
  assert.equal(normalizeBridgedCart(detail), null, "only an items array may update the bridged cart");
}

const genuine = normalizeBridgedCart({
  items: [{
    id: 1, item_type: "a", item_id: 42, item_title: "Blue Hours", artist_name: "Bandkit Radio",
    unit_price: 7.5, currency: "GBP", url: "https://artist.bandcamp.com/album/blue-hours",
    releases: [{ item_type: "t", item_id: 9, title: "Open Water" }], unavailable: false
  }],
  summary: { subtotal: 7.5, total: 8.25, currency: "GBP" }
});
assert.equal(genuine.items.length, 1);
assert.equal(genuine.items[0].item_title, "Blue Hours", "allowlisted fields survive intact");
assert.equal(genuine.items[0].unit_price, 7.5);
assert.equal(genuine.items[0].releases[0].title, "Open Water", "nested releases survive intact");
assert.equal(genuine.items[0].unavailable, false);
assert.deepEqual(genuine.summary, { subtotal: 7.5, total: 8.25, currency: "GBP" });

// A forged event cannot smuggle unexpected fields or nested objects into a snapshot.
const forged = normalizeBridgedCart({
  items: [{
    item_type: "a", item_id: 1, item_title: "Real",
    evil: "<script>", nested: { deep: true }, callback: () => {},
    releases: [{ item_id: 2, title: "Track", evil: "x" }, { junk: 1 }]
  }],
  summary: { subtotal: "not a number", total: {}, currency: "gbp; DROP", extra: "ignored" }
});
assert.equal(forged.items[0].item_title, "Real");
for (const field of ["evil", "nested", "callback"]) {
  assert.ok(!(field in forged.items[0]), `${field} must not survive the bridge boundary`);
}
assert.ok(!("evil" in forged.items[0].releases[0]), "release fields are allowlisted too");
assert.equal(forged.items[0].releases.length, 1, "releases with no allowlisted fields are dropped");
assert.deepEqual(forged.summary, { subtotal: null, total: null, currency: null },
  "an unusable summary resolves to nulls rather than raw page values");
assert.ok(!("extra" in forged.summary), "summary fields are allowlisted");

// Unbounded payloads are capped rather than persisted wholesale.
const flood = normalizeBridgedCart({
  items: Array.from({ length: MAX_BRIDGED_CART_ITEMS + 50 }, (_, index) => ({
    item_type: "a", item_id: index, releases: Array.from({ length: 80 }, (_, i) => ({ item_id: i, title: `t${i}` }))
  })),
  summary: null
});
assert.equal(flood.items.length, MAX_BRIDGED_CART_ITEMS, "the cart item count is capped");
assert.equal(flood.items[0].releases.length, 25, "the per-item release count is capped");
assert.equal(flood.summary, null);

// Missing metadata degrades to a usable item rather than throwing.
const sparse = normalizeBridgedCart({ items: [{}, null] });
assert.equal(sparse.items.length, 2);
assert.deepEqual(sparse.items[1].releases, []);
assert.equal(sparse.items[1].unavailable, false);

console.log("Bridged cart normalization: allowlisting, forged-event rejection, caps and sparse items passed.");
