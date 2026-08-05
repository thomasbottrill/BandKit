import assert from "node:assert/strict";

await import(`../cart-autosave.js?smoke=${Date.now()}`);
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
assert.equal(duplicates.some((snapshot) => snapshot.id === "empty"), false);

console.log("cart autosave smoke test passed");
