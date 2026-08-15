import assert from "node:assert/strict";

await import(`../src/content/cart-autosave.js?smoke=${Date.now()}`);
const autosave = globalThis.BandKitCartAutosave;

const item = (id, quantity = 1) => ({
  id: `item-${id}`,
  title: `Album ${id}`,
  artist: "Fixture Artist",
  price: 9 * quantity,
  currency: "USD",
  url: `https://fixture.bandcamp.com/album/${id}`,
  restore: { item_type: "a", item_id: id, option_id: null, quantity, unit_price: 9, currency: "USD" }
});

let result = autosave.upsertAutoSavedCart([], [], { savedAt: "2026-08-04T00:00:00.000Z" });
assert.equal(result.savedCarts.length, 0, "empty carts must not create recovery entries");

result = autosave.upsertAutoSavedCart([], [item(1)], { savedAt: "2026-08-04T00:01:00.000Z" });
assert.equal(result.savedCarts.length, 1);
assert.equal(result.savedCarts[0].autoSaved, true);
assert.equal(result.savedCarts[0].id, autosave.AUTO_SAVED_CART_ID);

result = autosave.upsertAutoSavedCart(result.savedCarts, [item(1), item(2)], { savedAt: "2026-08-04T00:02:00.000Z" });
assert.equal(result.savedCarts.length, 1, "cart changes should update the rolling entry in place");
assert.equal(result.savedCarts[0].items.length, 2);

const unchanged = autosave.upsertAutoSavedCart(result.savedCarts, [item(2), item(1)], { savedAt: "2026-08-04T00:03:00.000Z" });
assert.equal(unchanged.changed, false, "item order alone should not create an autosave update");
assert.equal(unchanged.savedCarts[0].savedAt, "2026-08-04T00:02:00.000Z");

const named = autosave.saveNamedCart(result.savedCarts, [item(1), item(2)], "Friday picks", {
  id: "cart-named",
  savedAt: "2026-08-04T00:04:00.000Z"
});
assert.equal(named.savedCarts.length, 1, "naming the current cart should promote, not duplicate, its autosave");
assert.equal(named.savedCarts[0].autoSaved, false);
assert.equal(named.savedCarts[0].name, "Friday picks");

result = autosave.upsertAutoSavedCart(named.savedCarts, [item(1), item(2), item(3)], { savedAt: "2026-08-04T00:05:00.000Z" });
assert.equal(result.savedCarts.length, 2);
assert.equal(result.savedCarts.filter(autosave.isAutoSavedCart).length, 1);

for (let id = 4; id < 200; id += 1) {
  result = autosave.upsertAutoSavedCart(result.savedCarts, [item(id)], { savedAt: new Date(Date.UTC(2026, 7, 4, 0, id)).toISOString() });
}
assert.equal(result.savedCarts.length, 2, "repeated cart mutations must not accumulate ghost carts");
assert.equal(result.savedCarts.filter(autosave.isAutoSavedCart).length, 1);

const duplicates = autosave.normalizeSavedCarts([
  result.savedCarts.find(autosave.isAutoSavedCart),
  { ...result.savedCarts.find(autosave.isAutoSavedCart), id: "old-auto" },
  ...result.savedCarts.filter((snapshot) => !autosave.isAutoSavedCart(snapshot)),
  { id: "empty", name: "Ghost", items: [] }
]);
assert.equal(duplicates.filter(autosave.isAutoSavedCart).length, 1);
assert.equal(duplicates.some((snapshot) => snapshot.id === "empty"), true, "named empty carts must remain available as destinations");

const rejectedEmptyNamed = autosave.saveNamedCart([], [], "Empty without permission");
assert.equal(rejectedEmptyNamed.snapshot, null, "ordinary save actions should still reject an empty live cart");
const emptyNamed = autosave.saveNamedCart([], [], "Future purchases", {
  id: "cart-empty",
  savedAt: "2026-08-04T00:04:30.000Z",
  allowEmpty: true
});
assert.equal(emptyNamed.snapshot?.id, "cart-empty");
assert.deepEqual(emptyNamed.snapshot?.items, []);
assert.equal(autosave.normalizeSavedCarts(emptyNamed.savedCarts).length, 1);

const legacyDuplicates = autosave.normalizeSavedCarts([
  { id: "legacy-auto-older", name: "Auto saved cart", savedAt: "2026-08-01T00:00:00.000Z", items: [item(20)] },
  { id: "legacy-auto-newer", name: "Autosaved Cart", savedAt: "2026-08-03T00:00:00.000Z", items: [item(21)] },
  { id: "legacy-auto-empty", name: "Auto-saved cart", savedAt: "2026-08-04T00:00:00.000Z", items: [] },
  { id: "manual-cart", name: "Weekend picks", savedAt: "2026-08-02T00:00:00.000Z", items: [item(22)] }
]);
assert.equal(legacyDuplicates.filter(autosave.isAutoSavedCart).length, 1, "legacy autosaves must collapse into one entry");
assert.equal(legacyDuplicates[0].id, autosave.AUTO_SAVED_CART_ID, "the surviving autosave must use the canonical id");
assert.equal(legacyDuplicates[0].autoSaved, true);
assert.equal(legacyDuplicates[0].items[0].restore.item_id, 21, "the newest non-empty legacy autosave should survive");
assert.equal(legacyDuplicates.some((snapshot) => snapshot.id === "manual-cart"), true, "manual saved carts must remain untouched");

const emptyUpdate = autosave.upsertAutoSavedCart(legacyDuplicates, [], { savedAt: "2026-08-05T00:00:00.000Z" });
assert.equal(emptyUpdate.savedCarts.filter(autosave.isAutoSavedCart).length, 1);
assert.equal(emptyUpdate.savedCarts[0].savedAt, "2026-08-03T00:00:00.000Z", "an empty live cart must not update the autosave");

console.log("cart autosave smoke test passed");
