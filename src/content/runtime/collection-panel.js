import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { emptyLibrary, normalizeLibraryQuery, filterLibrary, releaseLibraryTracks, libraryTrackMatches, libraryTags,
  libraryTagSuggestions, libraryFilterCount } from "../../shared/library.js";
import { createPanelEmptyState, createSavedCollectionCard } from "../components/collections.js";
import { createPanelToolbarButton } from "../components/actions.js";
import { createLibraryFilters, createTagSearch } from "../components/library-controls.js";
import { createArt, createButtonIcon, createElement } from "../core.js";
import { runtimeSeamless, runtimeState } from "./context.js";

const PAGE_SIZE = 40;
const accountIdOf = (r) => r.$collectionAccountId || r.$collectionCatalog.activeAccount;
const accountOf = (r) => r.$collectionCatalog.accounts[accountIdOf(r)];
const panelIsOpen = () => runtimeState.activeTab === "playlist" && runtimeState.playlistView === "collection";
const refreshView = (r) => { r.$collectionPanelDirty = true; if (panelIsOpen()) r.$render(); };
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const wishlistShown = (r) => r.$collectionQuery.scope === "wishlist";
const searching = (r) => Boolean(r.$collectionQuery.text || r.$collectionQuery.tag);
const filtered = (r) => searching(r) || libraryFilterCount(r.$collectionQuery) > 0;
function ownProfile(r) {
  const page = r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob");
  return page?.fan_data?.is_own_page ? `https://bandcamp.com/${location.pathname.split("/")[1]}` : accountOf(r)?.profileUrl || "";
}
async function libraryCommand(r, data) {
  const response = await r.$runtimeMessage({ type: MESSAGES.LIBRARY, accountId: accountIdOf(r), ...data });
  if (!response?.ok) throw new Error(response?.error || "Your collection could not be updated.");
  await r.$loadCollectionPanel();
}
async function refreshCollection(r) {
  if (r.$collectionRefreshing) return;
  r.$collectionRefreshing = true; refreshView(r);
  try {
    const response = await r.$runtimeMessage({ type: MESSAGES.LIBRARY, action: "refresh", profileUrl: ownProfile(r) });
    if (!response?.ok) throw new Error(response?.error || "Could not refresh your collection.");
    await r.$loadCollectionPanel(); r.$showToast("Collection and wishlist refreshed");
    if (response.indexing) void r.$followLibraryTags(accountIdOf(r), r.$collectionQuery.scope);
  } catch (error) { r.$showToast(error.message); }
  finally { r.$collectionRefreshing = false; refreshView(r); }
}
function activeRelease(r, item) {
  const tracks = r.$collectionReleaseCache.get(item.id) || item.tracks || [];
  return runtimeSeamless.enabled && runtimeSeamless.status !== "error" && tracks.some((track) => String(track.id) === String(runtimeSeamless.track?.id));
}
async function playRelease(r, item) {
  if (activeRelease(r, item)) { await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE); return; }
  const request = ++r.$collectionPlayRequest;
  try {
    let tracks = r.$collectionReleaseCache.get(item.id);
    if (!tracks?.length || tracks.some((track) => !r.$isReusableStreamUrl(track.url))) {
      const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_DISCOVER_RELEASE, pageUrl: item.pageUrl });
      if (!response?.ok) throw new Error(response?.error || "Could not load this release.");
      tracks = releaseLibraryTracks(item, response.release.tracks).filter((track) => r.$isReusableStreamUrl(track.url));
      r.$collectionReleaseCache.set(item.id, tracks);
    }
    if (request !== r.$collectionPlayRequest) return;
    const known = new Map((item.tracks || []).map((track) => [track.id, track]));
    const matching = tracks.filter((track) => libraryTrackMatches({ ...known.get(track.id), ...track }, r.$collectionQuery));
    if (!matching.length) throw new Error("No matching previewable tracks are available for this release.");
    await r.$playDiscoverReleaseTrack(matching[0], matching);
  } catch (error) { if (request === r.$collectionPlayRequest) r.$showToast(error.message); }
  finally {
    if (request === r.$collectionPlayRequest) r.$syncCollectionPanelPlayback();
  }
}
async function useResults(r, destination) {
  const items = filterLibrary(accountOf(r), r.$collectionQuery, runtimeState.activity);
  r.$showToast("Preparing tracks…");
  try { await r.$useLibraryResults(items, destination, r.$collectionQuery, r.$collectionCrateName); }
  catch (error) { r.$showToast(error.message || "Those releases could not be loaded."); }
}
function releaseCard(r, item) {
  const artwork = createElement("div", "hub-playlist-mosaic hub-collection-art");
  const image = createArt(item.art); image.loading = "lazy"; artwork.append(image);
  const card = createSavedCollectionCard({ title: item.title, total: "", summary: item.artist, artwork,
    ariaLabel: `Open ${item.title} on Bandcamp`, onOpen: () => window.open(item.pageUrl, "_blank", "noopener") });
  card.dataset.collectionId = item.id;
  card.classList.add("hub-collection-release");
  const play = createElement("button", "hub-saved-playlist-art-action"); play.type = "button";
  play.addEventListener("click", (event) => { event.stopPropagation(); void playRelease(r, item); });
  card.append(play);
  return card;
}
function countText(r, shown) {
  if (r.$collectionRefreshing) return "Refreshing…";
  const total = filterLibrary(accountOf(r), { scope: r.$collectionQuery.scope }).length;
  if (filtered(r)) return `${shown} of ${total}`;
  return wishlistShown(r) ? `${total} on wishlist` : plural(total, "release");
}
function updateResults(r) {
  const host = r.$content.querySelector(".hub-collection-results");
  if (!host) return;
  const account = accountOf(r);
  host.replaceChildren();
  if (!account) {
    host.append(createPanelEmptyState(ownProfile(r) ? "Connect your collection and wishlist to browse your music here." : "Open your own Bandcamp collection to connect your music."));
    if (ownProfile(r)) {
      const connect = createElement("button", "hub-text-button", r.$collectionRefreshing ? "Connecting…" : "Connect my collection");
      connect.type = "button"; connect.disabled = r.$collectionRefreshing;
      connect.addEventListener("click", () => void refreshCollection(r)); host.append(connect);
    }
    return;
  }
  const items = filterLibrary(account, r.$collectionQuery, runtimeState.activity);
  const count = r.$content.querySelector(".hub-collection-count");
  if (count) count.textContent = countText(r, items.length);
  for (const option of r.$content.querySelectorAll(".hub-collection-result-action")) option.hidden = !filtered(r) || !items.length;
  const list = createElement("div", "hub-stack hub-saved-playlist-stack hub-collection-stack");
  for (const item of items.slice(0, r.$collectionLimit)) list.append(releaseCard(r, item));
  host.append(list);
  if (!items.length) host.append(createPanelEmptyState(filtered(r) ? "No releases match. Try another tag or clear your filters." : "Nothing here yet."));
  if (items.length > r.$collectionLimit) {
    const more = createElement("button", "hub-text-button", `Show more (${items.length - r.$collectionLimit} remaining)`); more.type = "button";
    more.addEventListener("click", () => { r.$collectionLimit += PAGE_SIZE; updateResults(r); }); host.append(more);
  }
  r.$collectionTagSearch?.sync();
  r.$syncCollectionPanelPlayback();
}
function syncFilterButton(r) {
  const button = r.$content.querySelector(".hub-collection-filter-toggle");
  if (!button) return;
  const count = libraryFilterCount(r.$collectionQuery);
  const label = count ? `Filters, ${count} active` : "Filters";
  button.classList.toggle("is-active", Boolean(r.$collectionFiltersOpen || count || r.$collectionCrateId));
  button.title = label; button.setAttribute("aria-label", label);
}
function setQuery(r, query, crate = null) {
  r.$collectionQuery = normalizeLibraryQuery({ ...query, scope: r.$collectionQuery.scope });
  r.$collectionCrateId = crate?.id || ""; r.$collectionCrateName = crate?.name || "";
  r.$collectionSearchOpen ||= searching(r);
  r.$collectionLimit = PAGE_SIZE; refreshView(r);
}
function crates(r) {
  return Object.values(accountOf(r)?.crates || {}).filter((crate) => !crate.deleted).sort((a, b) => a.name.localeCompare(b.name));
}
async function saveCrate(r, task) {
  try { await task(); } catch (error) { r.$showToast(error.message); }
  refreshView(r);
}
function filtersRegion(r) {
  const region = createElement("div", "hub-collection-filters");
  region.id = "hub-collection-filters";
  region.hidden = !r.$collectionFiltersOpen;
  region.append(createLibraryFilters({
    query: r.$collectionQuery,
    crates: crates(r),
    activeCrateId: r.$collectionCrateId,
    onChange: (patch) => {
      r.$collectionQuery = normalizeLibraryQuery({ ...r.$collectionQuery, ...patch });
      r.$collectionLimit = PAGE_SIZE; updateResults(r); syncFilterButton(r);
    },
    onApplyCrate: (crate) => setQuery(r, crate.id === r.$collectionCrateId ? {} : crate.query, crate.id === r.$collectionCrateId ? null : crate),
    onDeleteCrate: (crate) => void saveCrate(r, async () => {
      await libraryCommand(r, { action: "crate", ...crate, deleted: true });
      if (crate.id === r.$collectionCrateId) { r.$collectionCrateId = ""; r.$collectionCrateName = ""; }
      r.$showToast(`Deleted ${crate.name}`);
    }),
    onSaveCrate: (name) => void saveCrate(r, async () => {
      const existing = crates(r).find((crate) => crate.name.toLowerCase() === name.toLowerCase());
      const id = existing?.id || crypto.randomUUID();
      await libraryCommand(r, { action: "crate", id, name, query: r.$collectionQuery });
      r.$collectionCrateId = id; r.$collectionCrateName = name;
      r.$showToast(existing ? `Updated ${name}` : `Saved ${name}`);
    }),
    onClear: () => setQuery(r, {})
  }));
  return region;
}
function searchRegion(r) {
  const region = createElement("div", "hub-collection-search");
  region.hidden = !r.$collectionSearchOpen;
  r.$collectionTagSearch = createTagSearch({
    label: wishlistShown(r) ? "Search wishlist" : "Search collection",
    placeholder: "Search or pick a tag",
    text: r.$collectionQuery.text,
    tags: libraryTags(r.$collectionQuery.tag),
    suggest: ({ text, tags }) => libraryTagSuggestions(accountOf(r), { ...r.$collectionQuery, text, tag: tags.join(",") }, runtimeState.activity, 24),
    onChange: ({ text, tags }) => {
      r.$collectionQuery.text = text; r.$collectionQuery.tag = tags.join(", ");
      r.$collectionLimit = PAGE_SIZE; updateResults(r);
    },
    note: () => r.$libraryTagNote(accountIdOf(r), accountOf(r), r.$collectionQuery.scope)
  });
  region.append(r.$collectionTagSearch.element);
  return region;
}
// One quiet row: the count, then icon toggles that reveal search and filters
// only when asked for. The wishlist is a filter on the same list rather than
// a second set of tabs under the panel's own.
function toolbar(r) {
  const row = createElement("div", "hub-cart-backup hub-collection-toolbar");
  const count = createElement("span", "hub-panel-count-summary hub-collection-count");
  count.setAttribute("role", "status");
  const actions = createElement("div", "hub-toolbar");
  row.append(count, actions);
  if (!accountOf(r)) return row;
  const search = createPanelToolbarButton("Search", "icon-search.svg", () => {
    r.$collectionSearchOpen = !r.$collectionSearchOpen;
    search.setAttribute("aria-expanded", String(r.$collectionSearchOpen));
    search.classList.toggle("is-active", r.$collectionSearchOpen);
    r.$content.querySelector(".hub-collection-search").hidden = !r.$collectionSearchOpen;
    if (r.$collectionSearchOpen) r.$collectionTagSearch.focus();
    else if (searching(r)) {
      // Closing search is done searching: it should not leave a hidden filter behind.
      r.$collectionQuery.text = ""; r.$collectionQuery.tag = "";
      refreshView(r); r.$content.querySelector(".hub-collection-search-toggle")?.focus();
    }
  });
  search.classList.add("hub-collection-search-toggle");
  search.setAttribute("aria-expanded", String(Boolean(r.$collectionSearchOpen)));
  search.classList.toggle("is-active", Boolean(r.$collectionSearchOpen));
  const wishlist = createPanelToolbarButton("Show wishlist", wishlistShown(r) ? "icon-wishlist-filled.svg" : "icon-wishlist.svg", () => {
    r.$collectionQuery.scope = wishlistShown(r) ? "owned" : "wishlist";
    r.$collectionLimit = PAGE_SIZE; refreshView(r);
    r.$content.querySelector(".hub-collection-wishlist-toggle")?.focus();
  });
  wishlist.classList.add("hub-collection-wishlist-toggle");
  wishlist.classList.toggle("is-active", wishlistShown(r));
  wishlist.setAttribute("aria-pressed", String(wishlistShown(r)));
  const filter = createPanelToolbarButton("Filters", "icon-filter.svg", () => {
    r.$collectionFiltersOpen = !r.$collectionFiltersOpen;
    r.$content.querySelector(".hub-collection-filters").hidden = !r.$collectionFiltersOpen;
    filter.setAttribute("aria-expanded", String(r.$collectionFiltersOpen));
    syncFilterButton(r);
  });
  filter.classList.add("hub-collection-filter-toggle");
  filter.setAttribute("aria-controls", "hub-collection-filters");
  filter.setAttribute("aria-expanded", String(Boolean(r.$collectionFiltersOpen)));
  const queue = r.$createToolbarMenuAction("Add to Now Playing", "icon-queue.svg", () => void useResults(r, "queue"));
  const playlist = r.$createToolbarMenuAction("Save as playlist", "icon-playlist.svg", () => void useResults(r, "playlist"));
  for (const option of [queue, playlist]) option.classList.add("hub-collection-result-action");
  playlist.hidden = !r.$playlistsFeatureEnabled();
  const refresh = r.$createToolbarMenuAction("Refresh collection and wishlist", "icon-retry.svg", () => void refreshCollection(r),
    { disabled: r.$collectionRefreshing || !ownProfile(r) });
  actions.append(search, wishlist, filter, r.$createToolbarOverflow("More collection actions", [queue, playlist, refresh]));
  return row;
}
export function registerCollectionPanel(r) {
  r.$collectionCatalog = emptyLibrary(); r.$collectionQuery = normalizeLibraryQuery({ scope: "owned" });
  r.$collectionLimit = PAGE_SIZE; r.$collectionPanelDirty = true; r.$collectionReleaseCache = new Map(); r.$collectionPlayRequest = 0;
  r.$loadCollectionPanel = async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.LIBRARY);
    r.$collectionCatalog = stored[STORAGE_KEYS.LIBRARY] || emptyLibrary();
    const page = r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob");
    r.$collectionAccountId = page?.fan_data?.is_own_page ? String(page.fan_data.fan_id) : "";
  };
  r.$syncCollectionPanelPlayback = () => {
    for (const card of r.$content.querySelectorAll(".hub-collection-release")) {
      const item = accountOf(r)?.items[card.dataset.collectionId]; if (!item) continue;
      const playing = activeRelease(r, item) && runtimeSeamless.isPlaying;
      // Same as saved playlists: play or pause only, with no loading state.
      const button = card.querySelector(".hub-saved-playlist-art-action");
      const label = `${playing ? "Pause" : "Play"} ${item.title}`;
      card.classList.toggle("is-playing", playing);
      if (button.getAttribute("aria-label") !== label) {
        button.title = label; button.setAttribute("aria-label", label);
        button.replaceChildren(createButtonIcon(playing ? "icon-pause.svg" : "icon-play.svg"));
      }
    }
  };
  r.$renderCollectionPanel = () => {
    r.$collectionPanelDirty = false;
    r.$collectionTagSearch = null;
    r.$content.append(toolbar(r));
    const body = createElement("div", "hub-collection-panel");
    if (accountOf(r)) body.append(searchRegion(r), filtersRegion(r));
    body.append(createElement("div", "hub-collection-results"));
    r.$content.append(body);
    updateResults(r); syncFilterButton(r);
  };
}
export function setupCollectionPanel(r) {
  void r.$loadCollectionPanel().then(() => refreshView(r)).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEYS.LIBRARY]) return;
    const hadAccount = Boolean(accountOf(r));
    r.$collectionCatalog = changes[STORAGE_KEYS.LIBRARY].newValue || emptyLibrary();
    if (panelIsOpen() && hadAccount === Boolean(accountOf(r))) updateResults(r);
    else refreshView(r);
  });
}
