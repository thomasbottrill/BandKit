import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { emptyLibrary, normalizeLibraryQuery, filterLibrary, libraryTrackMatches, releaseLibraryTracks, libraryTags,
  libraryTagSuggestions, libraryIndexState, libraryFilterCount } from "../../shared/library.js";
import { createPageMenuOption } from "../components/page-actions.js";
import { createLibraryFilters, createTagSearch } from "../components/library-controls.js";
import { setupCollectionLibraryPage, syncLibraryNativeGrid, bindLibraryNotes } from "./collection-library-page.js";

import { createButtonIcon, createElement } from "../core.js";
import { MAX_PLAYLIST_ITEMS } from "../state.js";
import { runtimeState } from "./context.js";

const PAGE_SIZE = 40;
const accountOf = (r) => r.$library.accounts[r.$libraryAccountId];
const rerender = (r) => { if (r.$libraryContent?.isConnected) r.$renderLibrary(); };
const action = (label, fn) => { const b = createElement("button", "bandkit-library-text-action", label); b.type = "button"; b.addEventListener("click", fn); return b; };
const icon = (label, name, fn) => {
  const button = action("", fn); button.classList.add("bandkit-library-icon");
  button.setAttribute("aria-label", label); button.title = label; button.append(createButtonIcon(name)); return button;
};
const emptyState = (text) => createElement("p", "bandkit-library-empty", text);
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// A disclosure that closes on Escape or a click elsewhere, returning focus to
// its trigger. Used for the filter sheet and the options menu.
function disclosure(className, label, iconName, onToggle) {
  const details = createElement("details", className);
  const summary = createElement("summary", "bandkit-library-icon");
  summary.setAttribute("aria-label", label); summary.title = label;
  summary.append(createButtonIcon(iconName));
  details.append(summary);
  details.addEventListener("toggle", () => onToggle?.(details.open));
  details.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !details.open) return;
    event.preventDefault(); details.open = false; summary.focus();
  });
  return { details, summary };
}
function field(label, value, type = "text") {
  const wrapper = createElement("label", "bandkit-library-field");
  wrapper.append(createElement("span", "", label));
  const input = createElement(type === "textarea" ? "textarea" : "input", "bandkit-library-input");
  if (type !== "textarea") input.type = type;
  input.value = value || "";
  input.setAttribute("aria-label", label);
  wrapper.append(input);
  return { wrapper, input };
}
async function command(r, data) {
  const response = await r.$runtimeMessage({ type: MESSAGES.LIBRARY, accountId: r.$libraryAccountId, ...data });
  if (!response?.ok) throw new Error(response?.error || "Library could not be updated.");
  await r.$loadLibrary();
  return response;
}
async function run(r, task) {
  if (r.$libraryBusy) return;
  r.$libraryBusy = true;
  try { await task(); } catch (error) { r.$showToast(error.message || "Library could not complete that action."); }
  finally { r.$libraryBusy = false; rerender(r); }
}
function ownProfile(r) {
  const blob = r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob");
  return blob?.fan_data?.is_own_page ? `https://bandcamp.com/${location.pathname.split("/")[1]}` : accountOf(r)?.profileUrl || "";
}
async function refresh(r) {
  await run(r, async () => {
    r.$libraryStatus = "Refreshing collection and wishlist…"; rerender(r);
    const response = await command(r, { action: "refresh", profileUrl: ownProfile(r) });
    if (response.indexing) void findTags(r, r.$libraryAccountId, r.$libraryScope, { attach: true });
    r.$libraryStatus = "";
    r.$showToast("Collection and wishlist refreshed");
  });
  r.$libraryStatus = ""; rerender(r);
}
function updateStatus(r) {
  const node = r.$libraryContent.querySelector(".bandkit-library-status");
  if (node) node.textContent = r.$libraryStatus || "";
}

// Tags are read once per release by the background worker, which keeps
// going across tabs; this tab only starts, stops or follows that run.
async function findTags(r, accountId, scope, { attach = false } = {}) {
  const index = r.$libraryTagIndex;
  if (index.running && !attach) {
    index.running = false; r.$syncLibraryTagNotes();
    await r.$runtimeMessage({ type: MESSAGES.LIBRARY, action: "index", accountId, stop: true }).catch(() => null);
    return;
  }
  index.running = true; r.$syncLibraryTagNotes();
  const response = await r.$runtimeMessage({ type: MESSAGES.LIBRARY, action: "index", accountId, scope, attach }).catch(() => null);
  const wasRunning = index.running;
  index.running = false; r.$syncLibraryTagNotes();
  if (!wasRunning || response?.running === false || response?.stopped) return;
  if (!response?.ok) r.$showToast(response?.error || "Bandkit could not read your tags. Try again later.");
  else if (response.limited) r.$showToast("Bandcamp is limiting requests. Find the rest again in a few minutes.");
  else if (response.failed) r.$showToast(`Found tags for ${response.done} releases; ${response.failed} could not be read.`);
  else if (response.done) r.$showToast("Tags found for your collection and wishlist");
}
function tagNote(r, accountId, account, scope) {
  const { total, missing } = libraryIndexState(account, scope);
  const found = total - missing.length;
  const note = createElement("p", "bandkit-tag-search-status");
  if (r.$libraryTagIndex.running) {
    if (!missing.length) return null;
    note.append(document.createTextNode(`Finding tags · ${found} of ${total}`), action("Stop", () => void findTags(r, accountId, scope)));
    return note;
  }
  if (!missing.length) return null;
  note.append(document.createTextNode(found ? `Tags from ${found} of ${plural(total, "release")}.` : "Tags appear once Bandkit reads your releases. It only needs to happen once."),
    action(found ? "Find the rest" : "Find tags", () => void findTags(r, accountId, scope)));
  return note;
}

async function resolveTracks(r, items, query) {
  const output = [];
  for (const item of items) {
    const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_DISCOVER_RELEASE, pageUrl: item.pageUrl });
    if (!response?.ok) throw new Error(response?.error || `Could not load ${item.title}. Try narrowing your search.`);
    const known = new Map((item.tracks || []).map((t) => [t.id, t]));
    const tracks = releaseLibraryTracks(item, response.release.tracks)
      .map((t) => ({ ...known.get(t.id), ...t })).filter((t) => libraryTrackMatches(t, query) && r.$isReusableStreamUrl(t.url));
    output.push(...tracks);
    if (new Set(output.map((t) => t.id || t.pageUrl)).size > MAX_PLAYLIST_ITEMS) {
      throw new Error(`Bandkit queues and playlists hold ${MAX_PLAYLIST_ITEMS} tracks. Narrow your search first.`);
    }
  }
  return [...new Map(output.map((t) => [t.id || t.pageUrl, t])).values()];
}
const selectionName = (query, crateName) => crateName || libraryTags(query.tag).join(", ") || query.text || "Collection selection";
async function useResults(r, items, destination) {
  await run(r, async () => {
    r.$libraryStatus = "Preparing tracks…"; updateStatus(r);
    await r.$useLibraryResults(items, destination, r.$libraryQuery, r.$libraryCrateName);
  });
  r.$libraryStatus = ""; updateStatus(r);
}

function results(r) { return filterLibrary(accountOf(r), r.$libraryQuery, runtimeState.activity); }
// Search, tags and the filter sheet replace Bandcamp's grid with matching
// releases; actions on "the results" only make sense once that has happened.
function moreOptions(r, close) {
  const option = (label, fn, disabled = false) => createPageMenuOption(label, () => { close(); fn(); }, disabled);
  const items = syncLibraryNativeGrid(r) && !r.$libraryDetail ? results(r) : [];
  const buttons = [];
  if (items.length && runtimeState.appearance.hideBandcampPlayer !== false) buttons.push(option(`Add ${plural(items.length, "release")} to Now Playing`, () => void useResults(r, items, "queue")));
  if (items.length && r.$playlistsFeatureEnabled()) buttons.push(option("Save as playlist", () => void useResults(r, items, "playlist")));
  buttons.push(option("Refresh collection and wishlist", () => void refresh(r), r.$libraryBusy));
  return buttons;
}
function renderMore(r) {
  const { details } = disclosure("bandkit-library-menu", "Collection options", "icon-more.svg", (open) => {
    if (open) options.replaceChildren(...moreOptions(r, () => { details.open = false; }));
  });
  const options = createElement("div", "bandkit-library-menu-options");
  options.setAttribute("role", "menu");
  details.append(options);
  return details;
}

function crates(r) {
  return Object.values(accountOf(r)?.crates || {}).filter((crate) => !crate.deleted).sort((a, b) => a.name.localeCompare(b.name));
}
function syncFilterSummary(r) {
  const summary = r.$libraryControls?.querySelector(".bandkit-library-filters > summary");
  if (!summary) return;
  const count = libraryFilterCount(r.$libraryQuery);
  const label = count ? `Filters, ${count} active` : "Filters";
  summary.setAttribute("aria-label", label); summary.title = label;
  summary.classList.toggle("is-active", Boolean(count || r.$libraryCrateId));
  summary.querySelector(".bandkit-library-badge")?.remove();
  if (count) summary.append(createElement("span", "bandkit-library-badge", String(count)));
}
function setQuery(r, query, crate = null) {
  r.$libraryQuery = normalizeLibraryQuery({ ...query, scope: r.$libraryScope });
  r.$libraryCrateId = crate?.id || ""; r.$libraryCrateName = crate?.name || "";
  r.$libraryLimit = PAGE_SIZE;
  rerender(r);
}
function renderFilters(r) {
  const { details } = disclosure("bandkit-library-filters", "Filters", "icon-filter.svg", (open) => { r.$libraryFiltersOpen = open; });
  details.open = r.$libraryFiltersOpen;
  const panel = createElement("div", "bandkit-library-filter-panel");
  panel.append(createLibraryFilters({
    query: r.$libraryQuery,
    crates: crates(r),
    activeCrateId: r.$libraryCrateId,
    onChange: (patch) => {
      r.$libraryQuery = normalizeLibraryQuery({ ...r.$libraryQuery, ...patch });
      r.$libraryLimit = PAGE_SIZE; updateResults(r); syncFilterSummary(r);
    },
    onApplyCrate: (crate) => setQuery(r, crate.id === r.$libraryCrateId ? {} : crate.query, crate.id === r.$libraryCrateId ? null : crate),
    onDeleteCrate: (crate) => void run(r, async () => {
      await command(r, { action: "crate", ...crate, deleted: true });
      if (crate.id === r.$libraryCrateId) { r.$libraryCrateId = ""; r.$libraryCrateName = ""; }
      r.$showToast(`Deleted ${crate.name}`);
    }),
    onSaveCrate: (name) => void run(r, async () => {
      const existing = crates(r).find((crate) => crate.name.toLowerCase() === name.toLowerCase());
      const id = existing?.id || crypto.randomUUID();
      await command(r, { action: "crate", id, name, query: r.$libraryQuery });
      r.$libraryCrateId = id; r.$libraryCrateName = name;
      r.$showToast(existing ? `Updated ${name}` : `Saved ${name}`);
    }),
    onClear: () => setQuery(r, {})
  }));
  details.append(panel);
  return details;
}

function renderRow(r, item) {
  const row = createElement("article", "bandkit-library-row");
  const art = createElement("a", "bandkit-library-art"); art.href = item.pageUrl; art.setAttribute("aria-label", `Open ${item.title} on Bandcamp`);
  const img = createElement("img"); img.src = item.art; img.alt = ""; img.loading = "lazy"; art.append(img);
  const link = createElement("a", "bandkit-library-title", item.title); link.href = item.pageUrl;
  const copy = createElement("div", "bandkit-library-copy"); copy.append(link, createElement("span", "", `by ${item.artist}`));
  const actions = createElement("div", "bandkit-library-row-actions");
  if (runtimeState.appearance.hideBandcampPlayer !== false) actions.append(icon(`Play ${item.title}`, "icon-play.svg", () => void useResults(r, [item], "play")));
  actions.append(icon(`Notes and tags for ${item.title}`, "icon-edit.svg", () => r.$openLibraryDetail(item.id)));
  row.append(art, copy, actions);
  r.$decorateLibraryDownloadRow?.(row, art, item);
  return row;
}
function updateResultToolbar(r) {
  const bar = r.$libraryContent.querySelector(".bandkit-library-results-toolbar");
  if (!bar) return;
  const count = results(r).length;
  bar.replaceChildren(createElement("span", "hub-meta", plural(count, "release")));
  bar.hidden = !syncLibraryNativeGrid(r);
}
function updateResults(r) {
  const host = r.$libraryContent.querySelector(".bandkit-library-results");
  if (!host) return;
  const items = results(r);
  updateResultToolbar(r);
  const filtered = syncLibraryNativeGrid(r);
  host.hidden = !filtered;
  host.replaceChildren();
  r.$libraryTagSearch?.sync();
  if (!filtered) { r.$syncCollectionDownloadSelection?.(); return; }
  if (!items.length) host.append(emptyState("No releases match. Try another tag or clear your filters."));
  for (const item of items.slice(0, r.$libraryLimit)) host.append(renderRow(r, item));
  if (items.length > r.$libraryLimit) host.append(action(`Show more (${items.length - r.$libraryLimit} remaining)`, () => {
    r.$libraryLimit += PAGE_SIZE; updateResults(r);
  }));
  r.$syncCollectionDownloadSelection?.();
}
function renderDetail(r, item) {
  const accountId = r.$libraryAccountId;
  const draftKey = `${accountId}/${item.id}`;
  const personal = r.$libraryDrafts[draftKey] || accountOf(r).annotations?.[item.id] || {};
  const box = createElement("div", "bandkit-library-detail");
  box.append(action("Back to music", () => { r.$libraryDetail = null; rerender(r); }));
  const link = r.$createPageLink(item.title, item.pageUrl, "bandkit-library-detail-title hub-inline-link");
  box.append(link, createElement("p", "hub-meta", [item.artist, item.owned ? "In your collection" : "On your wishlist", item.releaseDate].filter(Boolean).join(" · ")));
  if (item.tags?.length) box.append(createElement("p", "hub-meta", item.tags.join(" · ")));
  if (item.label) box.append(createElement("p", "hub-meta", `Label: ${item.label}`));
  const tags = field("Your tags", (personal.tags || []).join(", "));
  tags.input.placeholder = "warm-up, favourites, late night";
  const notes = field("Private notes", personal.notes, "textarea"); notes.input.maxLength = 5000; notes.input.rows = 4;
  const remember = () => { r.$libraryDrafts[draftKey] = { tags: libraryTags(tags.input.value), notes: notes.input.value }; };
  tags.input.addEventListener("input", remember); notes.input.addEventListener("input", remember);
  box.append(tags.wrapper, notes.wrapper, createElement("p", "hub-meta", "Separate tags with commas. Your tags appear beside Bandcamp's in search, and stay in Bandkit."));
  box.append(action("Save", () => void run(r, async () => {
    await command(r, { action: "annotate", accountId, id: item.id, tags: libraryTags(tags.input.value), notes: notes.input.value }); delete r.$libraryDrafts[draftKey]; r.$showToast("Notes and tags saved");
  })));
  if (!item.indexedAt) box.append(action("Find tags and tracks", () => void run(r, async () => { await command(r, { action: "enrich", id: item.id }); })));
  for (const track of item.tracks || []) {
    const line = createElement("div", "bandkit-library-track");
    line.append(r.$createPageLink(track.title, track.pageUrl, "hub-inline-link"),
      createElement("span", "hub-meta", [track.bpm ? `${Math.round(track.bpm)} BPM` : "", track.key?.camelot || track.key?.name || ""].filter(Boolean).join(" · ")));
    box.append(line);
  }
  r.$libraryContent.append(box);
}
// The search row lives in Bandcamp's pinned tab bar, in the open tab's own
// control row, so it stays in reach however far down the grid you scroll.
function controlsHost(_r) {
  const tab = document.querySelector("#grid-tabs > li.active")?.dataset.tab;
  return document.querySelector(tab === "wishlist" ? "#wishlist-controls" : tab === "collection" ? "#owner-controls" : "");
}
function renderSearch(r) {
  const controls = createElement("div", "bandkit-library bandkit-library-search");
  r.$libraryControls?.remove();
  r.$libraryControls = controls;
  const wishlist = r.$libraryScope === "wishlist";
  r.$libraryTagSearch = createTagSearch({
    label: wishlist ? "Search wishlist" : "Search collection",
    placeholder: "Search or pick a tag",
    text: r.$libraryQuery.text,
    tags: libraryTags(r.$libraryQuery.tag),
    suggest: ({ text, tags }) => libraryTagSuggestions(accountOf(r), { ...r.$libraryQuery, text, tag: tags.join(",") }, runtimeState.activity),
    onChange: ({ text, tags }) => {
      r.$libraryQuery.text = text; r.$libraryQuery.tag = tags.join(", ");
      r.$libraryLimit = PAGE_SIZE; updateResults(r);
    },
    note: () => tagNote(r, r.$libraryAccountId, accountOf(r), r.$libraryScope)
  });
  r.$libraryTagSearch.element.classList.add("bandkit-library-search-field");
  controls.append(r.$libraryTagSearch.element, renderFilters(r), renderMore(r));
  const host = controlsHost(r);
  if (host) host.prepend(controls); else r.$libraryContent.append(controls);
  syncFilterSummary(r);
  r.$syncCollectionDownloadSelection?.();
  const status = createElement("p", "hub-meta bandkit-library-status", r.$libraryStatus || ""); status.setAttribute("role", "status");
  r.$libraryContent.append(status);
}
export function registerLibraryView(r) {
  r.$libraryDrafts = {};
  r.$library = emptyLibrary(); r.$libraryQuery = normalizeLibraryQuery();
  r.$libraryLimit = PAGE_SIZE;
  r.$libraryTagIndex = { running: false, done: 0, total: 0, token: 0 };
  r.$loadLibrary = async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.LIBRARY);
    r.$library = stored[STORAGE_KEYS.LIBRARY] || emptyLibrary();
  };
  // Shared with the panel's Collection view.
  r.$libraryTagNote = (accountId, account, scope) => tagNote(r, accountId, account, scope);
  r.$followLibraryTags = (accountId, scope) => findTags(r, accountId, scope, { attach: true });
  r.$syncLibraryTagNotes = () => { r.$libraryTagSearch?.sync(); r.$collectionTagSearch?.sync(); };
  r.$useLibraryResults = async (items, destination, query, crateName = "") => {
    const tracks = await resolveTracks(r, items, query);
    if (!tracks.length) throw new Error("No matching previewable tracks. Open the release on Bandcamp to check availability.");
    if (destination === "playlist") r.$createSavedPlaylistWithTracks(tracks, selectionName(query, crateName));
    else if (destination === "play") await r.$playDiscoverReleaseTrack(tracks[0], tracks);
    else r.$addTracksToPlaylist(tracks);
  };
  // The releases shown in place of Bandcamp's grid, or null while it is unfiltered.
  r.$libraryFilteredResults = () => r.$libraryContent?.isConnected && !r.$libraryDetail && syncLibraryNativeGrid(r) ? results(r) : null;
  r.$openLibraryDetail = (id) => { r.$libraryDetail = id; rerender(r); r.$libraryContent.scrollIntoView({ block: "start", behavior: "smooth" }); };
  r.$renderLibrary = () => {
    r.$libraryContent.replaceChildren();
    r.$libraryControls?.remove();
    r.$libraryControls = null;
    r.$libraryTagSearch = null;
    const account = accountOf(r);
    if (!account) {
      r.$libraryQuery = normalizeLibraryQuery({ scope: r.$libraryScope }); r.$libraryDetail = null; r.$libraryCrateId = "";
      syncLibraryNativeGrid(r);
      const connect = action(r.$libraryBusy ? "Loading your music…" : "Search your collection and filter by tag", () => void refresh(r));
      connect.disabled = r.$libraryBusy;
      r.$libraryContent.append(connect);
      return;
    }
    renderSearch(r);
    const detail = account.items[r.$libraryDetail];
    if (detail) { renderDetail(r, detail); syncLibraryNativeGrid(r); return; }
    r.$libraryContent.append(createElement("div", "bandkit-library-results-toolbar"), createElement("div", "bandkit-library-results"));
    updateResults(r);
    bindLibraryNotes(r);
  };
  r.$updateLibraryResults = () => { updateResults(r); updateStatus(r); bindLibraryNotes(r); };
}
export function setupLibraryView(r) {
  setupCollectionLibraryPage(r);
  // Pick up a run another tab started, so this one shows its progress too.
  void r.$runtimeMessage({ type: MESSAGES.LIBRARY, action: "index", status: true }).then((response) => {
    if (response?.running) void findTags(r, "", "", { attach: true });
  }).catch(() => {});
  document.addEventListener("pointerdown", (event) => {
    for (const details of r.$libraryControls?.querySelectorAll(":is(.bandkit-library-filters, .bandkit-library-menu)[open]") || []) {
      if (!event.composedPath().includes(details)) details.open = false;
    }
  }, true);
}
