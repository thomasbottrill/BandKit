import { STORAGE_KEYS } from "../shared/contracts.js";
import { emptyLibrary, normalizeLibraryItem, mergeLibraryCatalog, libraryUrl, libraryTags, cleanLibraryText,
  normalizeLibraryQuery, releaseLibraryTracks, mergeLibraryBackup } from "../shared/library.js";
import { decodeHtmlAttribute } from "./metadata.js";
import { resolveDiscoverRelease } from "./discover-release.js";
import { bandcampPlaylistTracks, listBandcampPlaylists } from "./bandcamp-playlists.js";

export function libraryPageData(html) {
  const tag = String(html).match(/<[^>]+\bid=["']pagedata["'][^>]*>/i)?.[0] || "";
  const blob = tag.match(/\bdata-blob=(['"])([\s\S]*?)\1/i)?.[2];
  if (!blob) throw new Error("Open your own Bandcamp collection and try again.");
  const data = JSON.parse(decodeHtmlAttribute(blob));
  if (!data.fan_data?.is_own_page || !Number(data.fan_data?.fan_id)) throw new Error("Sign in to your own Bandcamp collection first.");
  return data;
}
export async function fetchLibraryCatalog(profileUrl, fetchImpl = fetch) {
  const url = libraryUrl(profileUrl);
  if (!/^https:\/\/bandcamp\.com\/[^/]+$/.test(url)) throw new Error("Open your own collection to connect Library.");
  const response = await fetchImpl(url, { credentials: "include", signal: globalThis.AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Bandcamp returned ${response.status}. Your saved library is unchanged.`);
  const page = libraryPageData(await response.text());
  const fanId = Number(page.fan_data.fan_id);
  const items = [];
  for (const scope of ["collection", "wishlist"]) {
    const data = page[`${scope}_data`];
    if (!data || !page.item_cache?.[scope]) throw new Error(`Bandcamp's ${scope} data is unavailable. Try refreshing later.`);
    const cache = page.item_cache[scope];
    // An inactive wishlist has an empty sequence but its first batch is
    // already cached (and last_token starts AFTER that batch).
    const initial = Object.values(cache);
    for (const entry of initial) {
      const item = normalizeLibraryItem(entry, scope, data.redownload_urls);
      if (item) items.push(item);
    }
    let count = initial.length;
    let token = String(data.last_token || "");
    const seen = new Set();
    let more = count < Number(data.item_count || 0);
    while (more) {
      if (!token || seen.has(token) || seen.size >= 500) throw new Error(`Bandcamp stopped paging ${scope}. Your saved library is unchanged.`);
      seen.add(token);
      const next = await fetchImpl(`https://bandcamp.com/api/fancollection/1/${scope}_items`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fan_id: fanId, older_than_token: token, count: 100 }), signal: globalThis.AbortSignal.timeout(20_000)
      });
      if (!next.ok) throw new Error(`Bandcamp returned ${next.status}. Try refreshing later; your saved library is unchanged.`);
      const batch = await next.json();
      if (batch.error || !Array.isArray(batch.items)) throw new Error(`Bandcamp could not read your ${scope}.`);
      for (const entry of batch.items) {
        const item = normalizeLibraryItem(entry, scope, batch.redownload_urls);
        if (item) items.push(item);
      }
      count += batch.items.length;
      more = Boolean(batch.more_available);
      token = String(batch.last_token || "");
    }
  }
  return { fanId: String(fanId), profileUrl: url, items };
}

// Serialize read/modify/write operations across all Bandcamp tabs. Long network
// reads happen outside this queue; their commits use the latest annotations.
const RATE_LIMITED = /\b(?:429|503)\b|rate|limit/i;
const UNREADABLE = /\b(?:404|410)\b|unavailable|invalid release/i;
export function createLibraryStore({ chromeApi = globalThis.chrome, fetchCatalog = fetchLibraryCatalog, resolveRelease = resolveDiscoverRelease,
  indexTiming = { gap: 250, backoff: 15_000 } } = {}) {
  let pending = Promise.resolve();
  let generation = 0;
  let refreshing = null;
  let indexing = null;
  const read = async () => (await chromeApi.storage.local.get(STORAGE_KEYS.LIBRARY))[STORAGE_KEYS.LIBRARY] || emptyLibrary();
  const mutate = (change) => {
    const epoch = generation;
    const operation = pending.then(async () => {
      if (epoch !== generation) return;
      const library = await read();
      const result = change(library);
      if (result !== false) await chromeApi.storage.local.set({ [STORAGE_KEYS.LIBRARY]: library });
      return result;
    });
    pending = operation.catch(() => {});
    return operation;
  };
  async function refresh(profileUrl) {
    if (refreshing) return refreshing;
    const epoch = generation;
    refreshing = (async () => {
      const catalog = await fetchCatalog(profileUrl);
      if (epoch !== generation) throw new Error("Library refresh was cancelled.");
      await mutate((library) => {
        const prior = library.accounts[catalog.fanId] || {};
        library.accounts[catalog.fanId] = { ...prior, profileUrl: catalog.profileUrl,
          items: mergeLibraryCatalog(prior.items, catalog.items), annotations: prior.annotations || {}, crates: prior.crates || {}, syncedAt: Date.now() };
        library.activeAccount = catalog.fanId;
      });
      // Once someone has had their tags read, new purchases and wishlist
      // additions are read as they arrive, so it never has to be asked again.
      const account = (await read()).accounts[catalog.fanId];
      const items = Object.values(account?.items || {});
      const reading = items.some((item) => item.indexedAt) && items.some((item) => !item.indexedAt);
      if (reading) void index({ accountId: catalog.fanId }).catch(() => {});
      return { ok: true, count: catalog.items.length, indexing: reading };
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function enrich(message) {
    const library = await read();
    const item = library.accounts[message.accountId]?.items?.[message.id];
    if (!item) throw new Error("Refresh Library to find this release.");
    const epoch = generation;
    const release = await resolveRelease(item.pageUrl);
    const [session, local] = await Promise.all([
      chromeApi.storage.session?.get(STORAGE_KEYS.TRACK_ANALYSIS_CACHE) || {}, chromeApi.storage.local.get(STORAGE_KEYS.BPM_CORRECTIONS)
    ]);
    const tracks = releaseLibraryTracks(item, release.tracks).map(({ url: _url, ...track }) => track);
    if (epoch !== generation) return { ok: false, error: "Library indexing was cancelled." };
    await mutate((latest) => {
      const current = latest.accounts[message.accountId]?.items?.[message.id];
      if (!current) return;
      const oldTracks = new Map((current.tracks || []).map((track) => [track.id, track]));
      Object.assign(current, { tags: libraryTags(release.tags), label: cleanLibraryText(release.label), releaseDate: release.releaseDate || "",
        tracks: tracks.map((track) => {
          const key = `id:${track.id}`;
          const cached = session[STORAGE_KEYS.TRACK_ANALYSIS_CACHE]?.[key];
          const correction = local[STORAGE_KEYS.BPM_CORRECTIONS]?.[key];
          return { bpm: oldTracks.get(track.id)?.bpm, key: oldTracks.get(track.id)?.key, ...track, ...(cached ? { bpm: correction || cached.bpm, key: cached.key } : {}) };
        }), indexedAt: Date.now() });
    });
    return { ok: true };
  }
  // Reading tags means opening every release page once. It runs here, so a
  // background tab cannot slow it and it carries on when the page changes.
  // Bandcamp rate-limits release pages quickly, so two are read at a time; a
  // limit pauses both and retries, and a page that no longer exists is marked
  // as read so it is not tried again. Whatever was read is kept if it stops.
  async function index(message) {
    if (message.stop) { if (indexing) indexing.cancelled = true; return { ok: true }; }
    if (message.status) return { ok: true, running: Boolean(indexing) };
    if (indexing) return indexing.promise;
    if (message.attach) return { ok: true, running: false };
    // Claimed before anything is awaited, so two tabs asking at once share one run.
    const run = indexing = { cancelled: false, done: 0, failed: 0, limited: false };
    run.promise = (async () => {
      const account = (await read()).accounts[message.accountId];
      if (!account) throw new Error("Connect your collection first.");
      const inScope = (item) => message.scope === "wishlist" ? item.wished : message.scope === "owned" ? item.owned : true;
      const missing = Object.values(account.items).filter((item) => !item.indexedAt);
      const ids = [...missing.filter(inScope), ...missing.filter((item) => !inScope(item))].map((item) => item.id);
      let next = 0; let holdUntil = 0; let strikes = 0;
      const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
      // Long waits make an extension call every 20 seconds so Chrome keeps
      // the worker alive through a back-off.
      const hold = async () => {
        while (!run.cancelled && Date.now() < holdUntil) {
          await sleep(Math.min(20_000, holdUntil - Date.now()));
          await chromeApi.storage.local.get("bandkitKeepAlive").catch(() => {});
        }
      };
      const worker = async () => {
        while (!run.cancelled && !run.limited && next < ids.length) {
          if (Date.now() < holdUntil) { await hold(); continue; }
          const id = ids[next++];
          try { await enrich({ accountId: message.accountId, id }); run.done += 1; strikes = 0; }
          catch (error) {
            const text = error?.message || "";
            if (RATE_LIMITED.test(text)) {
              ids.push(id);
              strikes += 1;
              if (strikes > 5) run.limited = true;
              else holdUntil = Math.max(holdUntil, Date.now() + Math.min(120_000, indexTiming.backoff * 2 ** (strikes - 1)));
            } else {
              run.failed += 1;
              if (UNREADABLE.test(text)) await markUnreadable(message.accountId, id);
            }
          }
          await sleep(indexTiming.gap);
        }
      };
      await Promise.all([worker(), worker()]);
      return { ok: true, done: run.done, failed: run.failed, limited: run.limited, stopped: run.cancelled };
    })().finally(() => { if (indexing === run) indexing = null; });
    return run.promise;
  }
  const markUnreadable = (accountId, id) => mutate((library) => {
    const item = library.accounts[accountId]?.items?.[id];
    if (!item) return false;
    Object.assign(item, { indexedAt: Date.now(), unreadable: true });
  });
  async function command(message) {
    if (message.action === "refresh") return refresh(message.profileUrl);
    if (message.action === "index") return index(message);
    if (message.action === "bandcamp-playlists") return { ok: true, playlists: await listBandcampPlaylists(message.fanId) };
    if (message.action === "bandcamp-playlist") return { ok: true, tracks: await bandcampPlaylistTracks(message.url) };
    if (message.action === "enrich") return enrich(message);
    if (message.action === "restore") {
      await mutate((library) => Object.assign(library, mergeLibraryBackup(library, message.library)));
      return { ok: true };
    }
    await mutate((library) => {
      const account = library.accounts[message.accountId];
      if (!account) throw new Error("Connect your collection first.");
      if (message.action === "annotate") {
        if (!account.items[message.id]) throw new Error("Release is no longer in this library.");
        account.annotations[message.id] = { tags: libraryTags(message.tags), notes: String(message.notes || "").slice(0, 5000), modifiedAt: Date.now() };
      } else if (message.action === "crate") {
        const id = /^[\w-]{1,100}$/.test(message.id || "") ? message.id : crypto.randomUUID();
        const name = cleanLibraryText(message.name, 100);
        if (!name) throw new Error("Give your crate a name.");
        account.crates[id] = { id, name, query: normalizeLibraryQuery(message.query), modifiedAt: Date.now(), deleted: message.deleted === true };
      } else throw new Error("Unknown library action.");
    });
    return { ok: true };
  }
  async function recordAnalysis(cache, corrections = {}) {
    if (!Object.keys(cache || {}).length && !Object.keys(corrections).length) return;
    await mutate((library) => {
      let changed = false;
      for (const account of Object.values(library.accounts)) {
        for (const item of Object.values(account.items || {})) for (const track of item.tracks || []) {
          const key = `id:${String(track.id).replace(/^track-/, "")}`;
          const result = cache?.[key];
          const bpm = Number(corrections[key]) || result?.bpm || track.bpm || null;
          const musicalKey = result?.key || track.key || null;
          if (track.bpm !== bpm || JSON.stringify(track.key) !== JSON.stringify(musicalKey)) {
            Object.assign(track, { bpm, key: musicalKey }); changed = true;
          }
        }
      }
      return changed;
    });
  }
  return { command, recordAnalysis, async reset() { generation += 1; if (indexing) indexing.cancelled = true; await pending; } };
}
