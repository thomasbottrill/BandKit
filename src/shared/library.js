// Private catalogue data and query rules; no DOM or Chrome dependencies.
export const LIBRARY_VERSION = 1;
export const emptyLibrary = () => ({ version: LIBRARY_VERSION, accounts: {}, activeAccount: "" });
export const cleanLibraryText = (value, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const libraryFold = (value) => cleanLibraryText(value, 10000).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const libraryTags = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split(","))
  .map((tag) => libraryFold(tag).slice(0, 60)).filter(Boolean))].slice(0, 40);
export function libraryUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !(url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com"))) return "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch { return ""; }
}
export function normalizeLibraryItem(entry, scope, links = {}) {
  const type = entry?.item_type === "track" || entry?.tralbum_type === "t" ? "track" : "album";
  const id = Number(entry?.item_id || entry?.tralbum_id);
  const pageUrl = libraryUrl(entry?.item_url);
  if (!Number.isSafeInteger(id) || id <= 0 || !pageUrl || entry.hidden) return null;
  return {
    id: `${type === "track" ? "t" : "a"}:${id}`, itemId: String(id), type, pageUrl,
    title: cleanLibraryText(entry.item_title || entry.album_title) || "Untitled",
    artist: cleanLibraryText(entry.band_name), art: Number(entry.item_art_id) ? `https://f4.bcbits.com/img/a${Number(entry.item_art_id)}_7.jpg` : "",
    owned: scope === "collection", wished: scope === "wishlist", addedAt: Date.parse(entry.purchased || "") || 0,
    redownloadUrl: scope === "collection" ? String(links[`${entry.sale_item_type}${entry.sale_item_id}`] || "") : ""
  };
}
export function mergeLibraryCatalog(previous, incoming) {
  const items = {};
  for (const item of incoming) {
    const prior = items[item.id];
    items[item.id] = { ...previous?.[item.id], ...item,
      owned: item.owned || prior?.owned || false, wished: item.wished || prior?.wished || false,
      redownloadUrl: item.redownloadUrl || prior?.redownloadUrl || "", addedAt: item.addedAt || prior?.addedAt || 0 };
  }
  return items;
}
export function normalizeLibraryQuery(value = {}) {
  const fields = ["text", "tag", "after", "before", "key"];
  const query = Object.fromEntries(fields.map((key) => [key, cleanLibraryText(value[key], 200)]));
  // Earlier saved filters kept personal tags, artist and label apart. Tags now
  // include your own, and search already covers artists and labels.
  if (value.personalTag) query.tag = libraryTags([...libraryTags(query.tag), ...libraryTags(value.personalTag)]).join(", ");
  const legacyText = [value.artist, value.label].map((text) => cleanLibraryText(text, 200)).filter(Boolean);
  if (legacyText.length) query.text = cleanLibraryText([query.text, ...legacyText].filter(Boolean).join(" "), 200);
  query.scope = ["all", "owned", "wishlist"].includes(value.scope) ? value.scope : "all";
  query.sort = ["title", "artist", "added", "released"].includes(value.sort) ? value.sort : "added";
  query.unheard = value.unheard === true;
  for (const key of ["bpmMin", "bpmMax"]) query[key] = Number(value[key]) > 0 ? Math.min(400, Number(value[key])) : 0;
  return query;
}
// Refinements beyond search and tags, counted the way the filter menu groups them.
export function libraryFilterCount(value) {
  const q = normalizeLibraryQuery(value);
  return [q.sort !== "added", q.after || q.before, q.bpmMin || q.bpmMax, q.key, q.unheard].filter(Boolean).length;
}
export function libraryTrackMatches(track, query) {
  const bpm = Number(track.bpm) || 0;
  if (query.bpmMin && (!bpm || bpm < query.bpmMin)) return false;
  if (query.bpmMax && (!bpm || bpm > query.bpmMax)) return false;
  const key = track.key;
  if (query.key && ![typeof key === "string" ? key : "", key?.camelot, key?.name].some((v) => libraryFold(v) === libraryFold(query.key))) return false;
  return true;
}
// Bandcamp's Discover genres. Release tags are free text, so the two combined
// genres also answer to their halves, and spacing or hyphens never split a tag.
export const DISCOVER_GENRES = ["electronic", "rock", "metal", "alternative", "hip-hop/rap", "experimental", "punk", "folk", "pop",
  "ambient", "soundtrack", "world", "jazz", "acoustic", "funk", "r&b/soul", "devotional", "classical", "reggae", "podcasts",
  "country", "spoken word", "comedy", "blues", "audiobooks", "latin"];
const GENRE_ALIASES = { "hip-hop/rap": ["hip-hop", "rap"], "r&b/soul": ["r&b", "rnb", "soul"] };
const tagKey = (tag) => libraryFold(tag).replace(/[\s_-]+/g, "");
const GENRE_KEYS = new Map(DISCOVER_GENRES.map((genre) => [tagKey(genre), [genre, ...(GENRE_ALIASES[genre] || [])].map(tagKey)]));
const keysForTag = (tag) => GENRE_KEYS.get(tagKey(tag)) || [tagKey(tag)];
const itemTagKeys = (item, personal) => new Set([...(item.tags || []), ...(personal?.tags || [])].map(tagKey));
export function filterLibrary(account, value, activity = []) {
  const q = normalizeLibraryQuery(value);
  const heard = new Set(activity.filter((e) => /play|listen/i.test(e.action || "")).map((e) => libraryUrl(e.url)));
  const matches = Object.values(account?.items || {}).filter((item) => {
    const personal = account?.annotations?.[item.id] || {};
    if (q.scope === "owned" && !item.owned || q.scope === "wishlist" && !item.wished) return false;
    if (q.tag) {
      const keys = itemTagKeys(item, personal);
      if (!libraryTags(q.tag).every((tag) => keysForTag(tag).some((key) => keys.has(key)))) return false;
    }
    if (q.after && (!item.releaseDate || item.releaseDate < q.after)) return false;
    if (q.before && (!item.releaseDate || item.releaseDate > q.before)) return false;
    const tracks = item.tracks || [];
    if ((q.bpmMin || q.bpmMax || q.key) && !tracks.some((track) => libraryTrackMatches(track, q))) return false;
    if (q.unheard && (heard.has(item.pageUrl) || tracks.some((track) => heard.has(libraryUrl(track.pageUrl))))) return false;
    const haystack = libraryFold([item.title, item.artist, item.label, ...(item.tags || []), ...(personal.tags || []), personal.notes,
      ...tracks.map((track) => track.title)].join(" "));
    return libraryFold(q.text).split(/\s+/).every((word) => haystack.includes(word));
  });
  return matches.sort((a, b) => {
    const order = q.sort === "title" ? libraryFold(a.title).localeCompare(libraryFold(b.title))
      : q.sort === "artist" ? libraryFold(a.artist).localeCompare(libraryFold(b.artist))
        : q.sort === "released" ? String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")) : b.addedAt - a.addedAt;
    return order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
// Tags to offer beside the search field. With nothing chosen, Discover genres
// that cover a real share of the library lead, then every other tag by how
// often it appears; once a tag is chosen, only tags that would narrow the
// results further. Typed text matches names.
export function libraryTagSuggestions(account, value, activity = [], limit = 12) {
  const q = normalizeLibraryQuery(value);
  const chosen = new Set(libraryTags(q.tag).flatMap(keysForTag));
  const items = filterLibrary(account, { ...q, text: "" }, activity);
  const itemKeys = items.map((item) => itemTagKeys(item, account?.annotations?.[item.id]));
  const genreKeys = new Set([...GENRE_KEYS.values()].flat());
  const tags = new Map();
  for (const item of items) {
    const seen = new Set();
    for (const tag of [...libraryTags(item.tags), ...libraryTags(account?.annotations?.[item.id]?.tags)]) {
      const key = tagKey(tag);
      if (genreKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      const entry = tags.get(key) || { tag, genre: false, count: 0 };
      entry.count += 1;
      tags.set(key, entry);
    }
  }
  const genres = DISCOVER_GENRES.map((tag) => ({ tag, genre: true, count: itemKeys.filter((keys) => keysForTag(tag).some((key) => keys.has(key))).length }));
  let list = [...genres, ...tags.values()]
    .filter((entry) => entry.count && !keysForTag(entry.tag).some((key) => chosen.has(key)));
  if (chosen.size) list = list.filter((entry) => entry.count < items.length);
  const needle = tagKey(q.text);
  if (needle) {
    list = list.filter((entry) => tagKey(entry.tag).includes(needle));
    const rank = (entry) => tagKey(entry.tag) === needle ? 2 : Number(tagKey(entry.tag).startsWith(needle));
    list.sort((a, b) => rank(b) - rank(a) || b.count - a.count);
  } else {
    const leads = (entry) => !chosen.size && entry.genre && entry.count >= Math.max(2, items.length * 0.05);
    list.sort((a, b) => Number(leads(b)) - Number(leads(a)) || b.count - a.count || a.tag.localeCompare(b.tag));
  }
  return list.slice(0, limit);
}
// How many releases in a scope exist, and which still need their tags read.
export function libraryIndexState(account, scope = "all") {
  const items = Object.values(account?.items || {}).filter((item) => scope === "owned" ? item.owned : scope === "wishlist" ? item.wished : true);
  return { total: items.length, missing: items.filter((item) => !item.indexedAt) };
}
export function releaseLibraryTracks(item, tracks) {
  return item.type === "track" ? tracks.filter((track) => String(track.id).replace(/^track-/, "") === item.itemId) : tracks;
}
export function portableLibrary(value) {
  const result = emptyLibrary();
  result.activeAccount = /^\d+$/.test(value?.activeAccount) ? value.activeAccount : "";
  for (const [id, account] of Object.entries(value?.accounts || {})) {
    if (!/^\d+$/.test(id)) continue;
    const annotations = Object.fromEntries(Object.entries(account.annotations || {}).filter(([key]) => /^[at]:\d+$/.test(key)).map(([key, v]) => [key, {
      tags: libraryTags(v.tags), notes: String(v.notes || "").slice(0, 5000), modifiedAt: Number(v.modifiedAt) || 0
    }]));
    const crates = Object.fromEntries(Object.entries(account.crates || {}).filter(([key]) => /^[\w-]{1,100}$/.test(key)).map(([key, v]) => [key, {
      id: key, name: cleanLibraryText(v.name, 100), query: normalizeLibraryQuery(v.query), deleted: v.deleted === true, modifiedAt: Number(v.modifiedAt) || 0
    }]));
    result.accounts[id] = { profileUrl: libraryUrl(account.profileUrl), annotations, crates, items: {} };
    for (const [key, item] of Object.entries(account.items || {})) {
      if (!/^[at]:\d+$/.test(key) || !libraryUrl(item.pageUrl)) continue;
      result.accounts[id].items[key] = {
        id: key, itemId: key.slice(2), type: key.startsWith("t:") ? "track" : "album", pageUrl: libraryUrl(item.pageUrl),
        title: cleanLibraryText(item.title), artist: cleanLibraryText(item.artist), art: /^https:\/\/[^/]+\.bcbits\.com\//.test(item.art) ? item.art : "",
        owned: item.owned === true, wished: item.wished === true, addedAt: Number(item.addedAt) || 0,
        tags: libraryTags(item.tags), label: cleanLibraryText(item.label), releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate) ? item.releaseDate : "",
        tracks: (item.tracks || []).slice(0, 1000).map((t) => ({ id: cleanLibraryText(t.id), title: cleanLibraryText(t.title),
          pageUrl: libraryUrl(t.pageUrl), artist: cleanLibraryText(t.artist), duration: Number(t.duration) || 0,
          bpm: Number(t.bpm) || null, key: typeof t.key === "object" ? { camelot: cleanLibraryText(t.key?.camelot), name: cleanLibraryText(t.key?.name) } : cleanLibraryText(t.key) }))
      };
    }
  }
  return result;
}
export function mergeLibraryBackup(local, incoming) {
  const next = structuredClone(local || emptyLibrary());
  const safe = portableLibrary(incoming);
  for (const [id, account] of Object.entries(safe.accounts)) {
    const existing = next.accounts[id] ||= { ...account, items: {}, annotations: {}, crates: {} };
    existing.items = { ...account.items, ...existing.items };
    for (const field of ["annotations", "crates"]) {
      existing[field] ||= {};
      for (const [key, item] of Object.entries(account[field])) {
        if (!existing[field][key] || item.modifiedAt > (Number(existing[field][key].modifiedAt) || 0)) existing[field][key] = item;
      }
    }
  }
  next.activeAccount ||= safe.activeAccount;
  return next;
}
