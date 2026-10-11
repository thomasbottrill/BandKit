import assert from "node:assert/strict";
import { emptyLibrary, normalizeLibraryItem, mergeLibraryCatalog, filterLibrary, releaseLibraryTracks, portableLibrary, mergeLibraryBackup,
  libraryTagSuggestions, libraryFilterCount, normalizeLibraryQuery, libraryIndexState } from "../src/shared/library.js";
import { fetchLibraryCatalog, createLibraryStore } from "../src/background/library.js";
import { STORAGE_KEYS } from "../src/shared/contracts.js";
const entry = (id, extra = {}) => ({ item_id: id, item_type: "album", item_title: `Release ${id}`, band_name: "Ártist", item_url: "https://test.bandcamp.com/album/one", ...extra });
const a = normalizeLibraryItem(entry(1), "collection");
const b = normalizeLibraryItem(entry(2, { item_type: "track" }), "collection");
assert.notEqual(a.id, b.id, "Shared album URL must not collapse track purchases");
assert.equal(normalizeLibraryItem(entry(3, { hidden: true }), "collection"), null);
assert.equal(normalizeLibraryItem(entry(3, { item_url: "https://evil.test/album/x" }), "collection"), null);
const merged = mergeLibraryCatalog({ [a.id]: { ...a, tags: ["techno"] }, old: {} }, [a, { ...a, owned: false, wished: true }]);
assert.equal(merged[a.id].owned, true); assert.equal(merged[a.id].wished, true); assert.equal(merged.old, undefined); assert.deepEqual(merged[a.id].tags, ["techno"]);
const account = { items: { [a.id]: { ...a, tags: ["techno"], releaseDate: "2024-01-01", tracks: [
  { id: "4", title: "Midnight", pageUrl: "https://test.bandcamp.com/track/midnight", bpm: 128, key: { camelot: "8A" } },
  { id: "5", bpm: 145, key: { camelot: "2B" } }
] }, [b.id]: b }, annotations: { [a.id]: { tags: ["warm-up"], notes: "Opening set" } }, crates: {} };
assert.equal(filterLibrary(account, { text: "artist midnight opening" }).length, 1);
assert.equal(filterLibrary(account, { personalTag: "WARM-UP", tag: "techno", bpmMin: 125, bpmMax: 132, key: "8a" }).length, 1);
assert.equal(filterLibrary(account, { bpmMax: 132, key: "2B" }).length, 0, "BPM and key must match the same track");
assert.equal(filterLibrary(account, { after: "2023-01-01" }).length, 1, "Unknown dates excluded");
assert.equal(filterLibrary(account, { scope: "wishlist" }).length, 0);
assert.equal(filterLibrary(account, { unheard: true }, [{ action: "played", url: "https://test.bandcamp.com/track/midnight" }]).length, 1);
assert.deepEqual(releaseLibraryTracks(b, [{ id: "2" }, { id: "8" }]), [{ id: "2" }]);

// Tags: Discover genres lead, spellings merge, your own tags count, and a
// chosen tag only offers tags that narrow the results further.
const tagged = (id, tags, extra = {}) => ({ ...normalizeLibraryItem(entry(id), "collection"), tags, indexedAt: 1, ...extra });
const tagAccount = { items: {}, annotations: {}, crates: {} };
for (const item of [tagged(10, ["electronic", "techno", "trip hop"]), tagged(11, ["electronic", "triphop", "ambient"]),
  tagged(12, ["hip-hop", "boom bap"]), tagged(13, ["rap", "electronic"]), { ...tagged(14, []), indexedAt: 0 }]) tagAccount.items[item.id] = item;
tagAccount.annotations["a:12"] = { tags: ["warm-up"] };
const opening = libraryTagSuggestions(tagAccount, { scope: "owned" });
assert.deepEqual(opening.slice(0, 4).map((entry) => [entry.tag, entry.count]), [["electronic", 3], ["hip-hop/rap", 2], ["trip hop", 2], ["ambient", 1]],
  "Discover genres covering a real share of the library lead; rarer ones sort among the other tags by count");
assert.equal(opening.find((entry) => entry.tag === "trip hop")?.count, 2, "Spacing and hyphens never split one tag in two");
assert.ok(opening.some((entry) => entry.tag === "warm-up"), "Your own tags are offered beside Bandcamp's");
assert.equal(filterLibrary(tagAccount, { tag: "hip-hop/rap" }).length, 2, "A combined genre matches either half");
assert.equal(filterLibrary(tagAccount, { tag: "warm-up, boom bap" }).length, 1, "Your own and Bandcamp's tags combine");
assert.deepEqual(libraryTagSuggestions(tagAccount, { scope: "owned", tag: "electronic" }).map((entry) => entry.tag).sort(),
  ["ambient", "hip-hop/rap", "techno", "trip hop"].sort(), "A chosen tag only offers tags that narrow its results");
assert.deepEqual(libraryTagSuggestions(tagAccount, { scope: "owned", text: "TRIP" }).map((entry) => entry.tag), ["trip hop"], "Typing filters tag names");
tagAccount.items["a:11"].tags.push("rapcore", "rapcore live");
tagAccount.items["a:10"].tags.push("rapcore live");
assert.deepEqual(libraryTagSuggestions(tagAccount, { scope: "owned", text: "rapcore" }).map((entry) => entry.tag), ["rapcore", "rapcore live"],
  "An exact name comes first, so Enter picks what was typed");
assert.deepEqual(libraryTagSuggestions(tagAccount, { scope: "wishlist" }), [], "Suggestions follow the scope");
assert.equal(libraryIndexState(tagAccount, "owned").missing.length, 1);
const legacy = normalizeLibraryQuery({ personalTag: "warm-up", tag: "techno", artist: "Ártist", label: "Label" });
assert.deepEqual([legacy.tag, legacy.text], ["techno, warm-up", "Ártist Label"], "Older saved filters keep working");
assert.equal(libraryFilterCount({ after: "2020-01-01", before: "2024-12-31", bpmMin: 120, unheard: true, text: "x", tag: "y" }), 3,
  "The filter badge counts refinements, not search or tags");
const library = { ...emptyLibrary(), activeAccount: "9", accounts: { "9": { ...account, profileUrl: "https://bandcamp.com/test" } } };
library.accounts["9"].items[a.id].redownloadUrl = "https://bandcamp.com/download?sig=secret";
library.accounts["9"].items[a.id].tracks[0].url = "https://pop.bcbits.com/secret";
const portable = portableLibrary(library);
assert.ok(!JSON.stringify(portable).includes("secret"));
const incoming = structuredClone(portable); incoming.accounts["9"].annotations[a.id] = { tags: ["new"], notes: "newer", modifiedAt: 20 };
const restored = mergeLibraryBackup(library, incoming); assert.equal(restored.accounts["9"].annotations[a.id].notes, "newer");
assert.equal(restored.accounts["9"].items[a.id].redownloadUrl, library.accounts["9"].items[a.id].redownloadUrl);
const page = { fan_data: { is_own_page: true, fan_id: 9 }, collection_data: { sequence: ["a1"], last_token: "c1", item_count: 2 },
  wishlist_data: { sequence: [], last_token: "w1", item_count: 1 }, item_cache: { collection: { a1: entry(1) }, wishlist: {} } };
const html = `<div id="pagedata" data-blob="${JSON.stringify(page).replaceAll('"', '&quot;')}"></div>`;
const calls = [];
const fetchImpl = async (url, options) => {
  calls.push(url);
  if (!options.method) return { ok: true, text: async () => html };
  const wish = url.includes("wishlist_items");
  return { ok: true, json: async () => ({ items: [entry(wish ? 3 : 2)], more_available: false, last_token: "end" }) };
};
const catalog = await fetchLibraryCatalog("https://bandcamp.com/test", fetchImpl);
assert.equal(catalog.items.length, 3); assert.equal(calls.length, 3);
await assert.rejects(() => fetchLibraryCatalog("https://bandcamp.com/test", async (url, options) => {
  if (!options.method) return { ok: true, text: async () => html };
  return { ok: true, json: async () => ({ items: [], more_available: true, last_token: "c1" }) };
}), /stopped paging/);
let storage = { [STORAGE_KEYS.LIBRARY]: structuredClone(library) };
const chromeApi = { storage: { local: { get: async () => structuredClone(storage), set: async (value) => { storage = { ...storage, ...structuredClone(value) }; } } } };
const store = createLibraryStore({ chromeApi, fetchCatalog: async () => catalog });
await Promise.all([
  store.command({ action: "annotate", accountId: "9", id: a.id, tags: ["keep"], notes: "Concurrent edit" }),
  store.command({ action: "refresh", profileUrl: "https://bandcamp.com/test" })
]);
assert.equal(storage[STORAGE_KEYS.LIBRARY].accounts["9"].annotations[a.id].notes, "Concurrent edit");
await store.command({ action: "crate", accountId: "9", id: "crate-one", name: "Warm-up", query: { personalTag: "keep" } });
assert.equal(filterLibrary(storage[STORAGE_KEYS.LIBRARY].accounts["9"], { personalTag: "keep" }).length, 1);
await store.command({ action: "crate", accountId: "9", id: "crate-one", name: "Warm-up", deleted: true });
assert.equal(storage[STORAGE_KEYS.LIBRARY].accounts["9"].crates["crate-one"].deleted, true);
const before = JSON.stringify(storage);
const failing = createLibraryStore({ chromeApi, fetchCatalog: async () => { throw new Error("429"); } });
await assert.rejects(() => failing.command({ action: "refresh" }), /429/);
assert.equal(JSON.stringify(storage), before, "Failed refresh cannot delete membership or notes");
console.log("Library smoke passed: stable identity, combined queries, pagination, safe backup, concurrent edits and failed refresh.");

// Persist previously calculated analysis when details are first indexed, and
// avoid rewriting the entire catalogue for identical repeated analysis events.
let writes = 0;
const indexedStorage = { [STORAGE_KEYS.LIBRARY]: structuredClone(library), [STORAGE_KEYS.BPM_CORRECTIONS]: { 'id:4': 130 } };
const indexedApi = { storage: {
  local: { get: async () => structuredClone(indexedStorage), set: async (value) => { writes++; Object.assign(indexedStorage, structuredClone(value)); } },
  session: { get: async () => ({ [STORAGE_KEYS.TRACK_ANALYSIS_CACHE]: { 'id:4': { bpm: 128, key: { camelot: '8A' } } } }) }
} };
const indexing = createLibraryStore({ chromeApi: indexedApi, resolveRelease: async () => ({ tags: ['Electronic'], label: 'A label', releaseDate: '2024-01-01',
  tracks: [{ id: '4', title: 'Midnight', pageUrl: 'https://test.bandcamp.com/track/midnight', url: 'https://pop.bcbits.com/secret' }] }) });
await indexing.command({ action: 'enrich', accountId: '9', id: a.id });
assert.equal(indexedStorage[STORAGE_KEYS.LIBRARY].accounts['9'].items[a.id].tracks[0].bpm, 130);
assert.equal(indexedStorage[STORAGE_KEYS.LIBRARY].accounts['9'].items[a.id].tracks[0].url, undefined);
await indexing.recordAnalysis({ 'id:4': { bpm: 130, key: { camelot: '8A' } } });
assert.equal(writes, 1, 'Unchanged analysis should not rewrite the catalogue');
const { saveBackupFile, restoreBackupFile } = await import('../src/shared/backup-file.js');
let backupText = '';
const handle = { kind: 'file', queryPermission: async () => 'granted', getFile: async () => ({ text: async () => backupText }),
  createWritable: async () => ({ write: async (value) => { backupText = value; }, close: async () => {} }) };
await saveBackupFile(handle, { format: 'bandkit-backup', playlists: { saved: [] }, carts: { saved: [] }, library });
const result = await restoreBackupFile(handle, {});
assert.equal(result.library.accounts['9'].annotations[a.id].notes, 'Opening set');
assert.ok(!backupText.includes('secret'));
console.log('Library analysis persistence, no-op writes and portable backup round trip passed.');

const pendingPage = structuredClone(page);
pendingPage.wishlist_data.item_count = 2;
pendingPage.item_cache.wishlist = { a4: entry(4) };
const pendingHtml = `<div id="pagedata" data-blob="${JSON.stringify(pendingPage).replaceAll('"', '&quot;')}"></div>`;
const pendingCatalog = await fetchLibraryCatalog('https://bandcamp.com/test', async (url, options) => {
  if (!options.method) return { ok: true, text: async () => pendingHtml };
  return fetchImpl(url, options);
});
assert.equal(pendingCatalog.items.filter((item) => item.wished).length, 2, 'Inactive wishlist cache must be included before pagination');

// Tags are read in the background, a few releases at a time, and can stop.
const runItems = Object.fromEntries([1, 2, 3, 4, 5, 6].map((id) => {
  const item = normalizeLibraryItem(entry(id, { item_url: `https://test.bandcamp.com/album/r${id}` }), id < 5 ? "collection" : "wishlist");
  return [item.id, item];
}));
const runStorage = { [STORAGE_KEYS.LIBRARY]: { ...emptyLibrary(), accounts: { "9": { items: runItems, annotations: {}, crates: {} } } } };
const runApi = { storage: {
  local: { get: async () => structuredClone(runStorage), set: async (value) => { Object.assign(runStorage, structuredClone(value)); } },
  session: { get: async () => ({}) }
} };
let reading = 0; let peak = 0; const order = [];
let limitedOnce = false;
const runner = createLibraryStore({ chromeApi: runApi, indexTiming: { gap: 1, backoff: 20 }, resolveRelease: async (url) => {
  reading += 1; peak = Math.max(peak, reading); order.push(url);
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  reading -= 1;
  if (url.endsWith("r3") && !limitedOnce) { limitedOnce = true; throw new Error("Bandcamp returned 429"); }
  if (url.endsWith("r4")) throw new Error("Bandcamp returned 404");
  return { tags: ["Techno", "dub"], tracks: [] };
} });
const [first, second] = await Promise.all([runner.command({ action: "index", accountId: "9", scope: "wishlist" }),
  runner.command({ action: "index", accountId: "9", attach: true })]);
assert.deepEqual([first.done, first.failed, second.done], [5, 1, 5], "A second tab follows the run already in progress");
assert.equal(peak, 2, "Releases are read two at a time");
assert.ok(order.slice(0, 2).every((url) => /r[56]$/.test(url)), "The list on screen is read first");
assert.equal(order.filter((url) => url.endsWith("r3")).length, 2, "A rate-limited release is retried after a pause");
const runResult = runStorage[STORAGE_KEYS.LIBRARY].accounts["9"].items;
assert.ok(Object.values(runResult).every((item) => item.indexedAt), "Every release ends up read or marked unreadable");
assert.equal(runResult["a:4"].unreadable, true, "A release page that no longer exists is not retried");
assert.ok(runResult["a:3"].tags.includes("dub"));
assert.deepEqual(await runner.command({ action: "index", accountId: "9", attach: true }), { ok: true, running: false });
console.log("Library tag reading runs in the background, two at a time, backs off when limited and is shared across tabs.");
