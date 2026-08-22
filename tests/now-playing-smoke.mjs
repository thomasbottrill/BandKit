import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { MESSAGES } from "../src/shared/contracts.js";
import { playlistAlbumLabel } from "../src/content/runtime/collection-views.js";
import { readContentSource, readHubStyles } from "./support/source.mjs";

const source = readContentSource();
const hubCss = readHubStyles();

assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Shuffle Progression - Fears EP" }), "Fears EP");
assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Fears EP — Shuffle Progression" }), "Fears EP");
assert.equal(playlistAlbumLabel({ title: "Fears EP", artist: "Shuffle Progression", album: "Fears EP" }), "");
assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Shuffle Progression" }), "");
assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Fears EP" }), "Fears EP");

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find ${name} in content.js`);
  const start = match.index;
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not parse ${name} from content.js`);
}

assert.match(extractFunction("renderPlaylistTrack"), /hub-playlist-media-toggle/,
  "Now Playing rows must use the artwork slot as their play and pause control");
assert.match(extractFunction("syncCurrentPlaylistAnalysisUi"), /current\.replaceWith\(next\)/,
  "analysis updates must patch a Now Playing card in place instead of replacing the hovered card");
assert.match(extractFunction("renderPlaylistTrack"), /findIndex\(\(track\) => track\.playlistItemId === item\.playlistItemId\)[\s\S]*?playPlaylistAt\(currentIndex\)/,
  "Now Playing row playback must resolve its live item position instead of retaining a stale rendered index");
assert.match(extractFunction("applySeamlessState"), /playlistAnalysisChanged[\s\S]*?syncCurrentPlaylistAnalysisUi\(\)[\s\S]*?syncCurrentPlaylistPlaybackUi\(\)[\s\S]*?else\s*\{\s*render\(\)/,
  "routine playback analysis updates must preserve Now Playing card DOM identity");
assert.doesNotMatch(extractFunction("renderPlaylistTrack"), /hub-playlist-position-play/,
  "Now Playing rows must not retain a separate play column before the artwork");
assert.doesNotMatch(extractFunction("renderPlaylistTrack"), /is-play-action|createTrackActionControls|createPlaylistDestinationControl/,
  "Now Playing rows must not restore the legacy right-side play, add, wishlist, or cart action cluster");
assert.match(extractFunction("renderPlaylistTrack"), /createNowPlayingTrackActions\(card, item\)/,
  "each Now Playing row must install its shared ellipsis and context-menu actions");
assert.match(extractFunction("renderPlaylistTrack"), /hub-playlist-detail-row[\s\S]*?playlistAlbumLabel\(item\)[\s\S]*?detailRow\.append\(analysisMeta\)/,
  "Now Playing cards must show a deduplicated album/time and analysis on one compact metadata row");
assert.match(hubCss, /\.hub-playlist-detail-row\s*\{[^}]*display:\s*flex;[^}]*margin-top:\s*2px;/s,
  "Now Playing cards must keep album, duration, BPM, and key on one compact line");
const nowPlayingActionsSource = extractFunction("createNowPlayingTrackActions");
assert.match(nowPlayingActionsSource, /hub-playlist-track-more[\s\S]*?aria-haspopup[\s\S]*?icon-more\.svg/,
  "each Now Playing row must expose a single accessible ellipsis menu trigger");
assert.match(nowPlayingActionsSource, /addEventListener\("contextmenu"[\s\S]*?preventDefault\(\)[\s\S]*?openMenu\(\)/,
  "right-clicking a Now Playing row must open the same action menu as its ellipsis trigger");
const destinationMenuSource = extractFunction("populatePlaylistDestinationMenu");
for (const label of ["Add to playlist", "Add to cart", "Add to wishlist", "Remove from Now Playing"]) {
  assert.ok(destinationMenuSource.includes(label), `Now Playing menus must include ${label}`);
}
assert.match(hubCss, /\.hub-playlist-track\s*\{[\s\S]*?grid-template-columns:\s*40px minmax\(0, 1fr\) auto;[\s\S]*?padding:\s*12px;/,
  "Now Playing rows must use a padded three-column layout with a 40px media slot");
assert.match(hubCss, /\.hub-saved-playlist-track\s*\{[^}]*grid-template-columns:\s*28px 40px minmax\(0, 1fr\) auto;/s,
  "saved playlist rows must reserve separate columns for position, artwork, copy, and actions");
assert.match(hubCss, /\.hub-playlist-track:hover \.hub-playlist-media-art[\s\S]*?display:\s*none;/,
  "hovering a Now Playing row must remove its artwork from the media slot");
assert.match(hubCss, /\.hub-playlist-track:hover \.hub-playlist-media-icon[\s\S]*?display:\s*flex;/,
  "hovering a Now Playing row must replace its artwork with the playback control");
assert.match(hubCss, /\.hub-playlist-media-toggle:hover \.hub-playlist-media-icon,[\s\S]*?background:\s*var\(--hub-accent-soft\);[^}]*border-color:\s*var\(--hub-accent\);[^}]*box-shadow:\s*none;[^}]*color:\s*var\(--hub-accent\);/s,
  "Now Playing play and pause controls must use the shared subtle, glow-free hover treatment");
assert.doesNotMatch(hubCss, /\.hub-playlist-media-toggle:(?:hover|active)[^{]*\{[^}]*transform:/s,
  "Now Playing play and pause controls must not move when hovered or pressed");
assert.doesNotMatch(hubCss, /\.hub-playlist-track\.is-playing \.hub-playlist-media-(?:art|icon)/,
  "the active Now Playing row must keep its artwork until hover or keyboard focus");
assert.match(hubCss, /\.hub-playlist-track:not\(\.is-playing\):is\(:hover, :focus-within\)\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--hub-card-ink\) 3%, var\(--hub-card\)\)/s,
  "Now Playing rows must expose only a subtle foreground-derived hover surface");
assert.match(hubCss, /\.hub-cart-view-tab\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*700;[^}]*letter-spacing:\s*normal;[^}]*line-height:\s*20px;/s,
  "Cart, Saved, Now Playing, and Playlists view headings must match the primary section-title typography");
assert.match(hubCss, /\.hub-now-playing-toolbar \.hub-playlist-toolbar-icon\s*\{[^}]*transition:\s*none;/s,
  "Now Playing toolbar hover colours must not restart a transition when playback refreshes the panel");
assert.match(hubCss, /\.hub-now-playing-toolbar \.hub-playlist-toolbar-icon > \*\s*\{[^}]*pointer-events:\s*none;/s,
  "Now Playing toolbar icons must leave the button as the single stable hover target");
assert.match(extractFunction("renderCurrentPlaylist"), /actions\.append\(addPage, moreWrap\)/,
  "Now Playing must expose only Add page and an overflow menu in its toolbar");
assert.match(extractFunction("renderCurrentPlaylist"), /classList\.toggle\("is-empty-now-playing", songCount === 0\)/,
  "an empty Now Playing render must expose a stable layout state for its header inset");
assert.match(extractFunction("render"), /renderPanelContent\(\);/,
  "the main render must use the shared panel-content refresh path");
const panelContentSource = extractFunction("renderPanelContent");
assert.match(panelContentSource, /classList\.remove\("is-section-layout", "is-empty-now-playing"\);\s*content\.replaceChildren\(\);/,
  "each panel-content refresh must restore its base inset before rebuilding a section");
assert.match(panelContentSource, /mountPanelClose\(\);[\s\S]*?organizePanelContentScrolling\(\);/,
  "each panel-content refresh must restore the fixed heading and scrolling body");
const panelScrollingSource = extractFunction("organizePanelContentScrolling");
assert.match(panelScrollingSource, /hub-cart-view-header, \.hub-saved-cart-detail-toolbar, \.hub-section-heading/,
  "Cart, playlist detail, Activity, and Settings headings must share the fixed header region");
assert.match(panelScrollingSource, /matches\("\.hub-cart-backup"\)[\s\S]*?hub-content-pinned[\s\S]*?hub-content-scroll/,
  "section toolbars must remain pinned with their heading while lists and cards move into the scroll body");
assert.match(hubCss, /\.hub-content\.is-section-layout\s*\{[^}]*overflow:\s*hidden;[^}]*padding:\s*0;/s,
  "the outer section panel must not scroll once its fixed and scrolling regions are organized");
assert.match(hubCss, /\.hub-content-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s,
  "only the section content body must own scrolling");
assert.doesNotMatch(hubCss, /\.hub-content\.is-empty-now-playing[^\{]*\{/,
  "empty and populated Now Playing must share the same inset rules");
for (const functionName of ["scanLivePlayer", "applySeamlessState"]) {
  const functionSource = extractFunction(functionName);
  assert.doesNotMatch(functionSource, /content\.replaceChildren\(\);\s*renderPlaylist\(\);/,
    `${functionName} must not bypass the shared panel-content layout refresh`);
  assert.match(functionSource, /renderPanelContent\(\)/,
    `${functionName} must restore the pinned header after playback-driven content updates`);
}
assert.doesNotMatch(extractFunction("recordListeningActivity"), /renderActivity\(\)/,
  "live Activity updates must use the complete panel render so the pinned header structure is preserved");
assert.match(extractFunction("renderCurrentPlaylist"), /createToolbarOverflow\("More Now Playing actions", \[save, download, share, clear\]/,
  "Now Playing must retain save, download, share, and clear inside the overflow menu");
assert.match(extractFunction("renderPlayer"), /: live\.hasPlaybackStarted\s*\? 1 \+ \(Array\.isArray\(live\.tracks\)/,
  "the footer count must not treat a latent page queue as Now Playing before playback starts");
assert.match(extractFunction("renderCurrentPlaylist"), /: live\.hasPlaybackStarted\s*\? pageTracks\s*: \[\]/,
  "the Now Playing toolbar must not count or export a latent page queue before playback starts");
assert.match(extractFunction("renderPlaylist"), /const currentCount = state\.playlist\.length\s*\|\| \(live\.hasPlaybackStarted \? buildSeamlessQueue\(\)\.length : 0\)/,
  "the Now Playing view header must not count a latent page queue before playback starts");
assert.match(hubCss, /\.hub-toolbar-actions-menu\s*\{[^}]*min-width:\s*180px;/s,
  "toolbar overflows must present readable labeled actions");
assert.match(extractFunction("renderCurrentCart"), /createToolbarOverflow\("More cart actions", \[exportButton, shareButton, importButton\]/,
  "Cart must keep download, share, and import in its overflow menu");
assert.match(extractFunction("renderPlaylist"), /createPlaylistToolbarButton\("Import playlist"[\s\S]*createPlaylistToolbarButton\("New playlist"/,
  "saved playlist import and create actions must use standard icon buttons");
assert.match(extractFunction("renderSavedPlaylistDetail"), /hub-saved-playlist-track-remove[\s\S]*removeSavedPlaylistItem\(snapshot, item\)/,
  "saved playlist details must let a user remove an individual track");
assert.match(extractFunction("hasSavedPlaylistCapacity"), /MAX_SAVED_PLAYLISTS[\s\S]*Delete one before creating another/,
  "saved playlist creation must refuse the limit instead of silently deleting the oldest playlist");
for (const functionName of ["savePlaylistSnapshot", "createSavedPlaylistWithTracks", "createEmptySavedPlaylist", "importPlaylist"]) {
  assert.match(extractFunction(functionName), /hasSavedPlaylistCapacity\(\)/,
    `${functionName} must enforce the saved-playlist limit before inserting`);
}
assert.match(extractFunction("renderActivity"), /createPlaylistToolbarButton\("Download activity"/,
  "Activity download must use the standard icon button");
assert.match(extractFunction("renderSavedCartList"), /createPlaylistToolbarButton\("New cart", "icon-plus\.svg"/,
  "saved carts must use the same standard icon-only create action as other panels");

const playlistViewTabsSource = extractFunction("renderPlaylistViewTabs");
assert.ok(
  playlistViewTabsSource.indexOf('label: "Now Playing"') < playlistViewTabsSource.indexOf('label: "Playlists"'),
  "the combined playlist panel must put Now Playing before Playlists"
);
assert.match(playlistViewTabsSource, /hub-cart-view-header hub-playlist-view-header/,
  "the combined playlist panel must reuse the Cart/Saved tab structure");
assert.doesNotMatch(playlistViewTabsSource, /hub-cart-view-count|\.count/,
  "Now Playing and Playlists tabs must not include visual count badges");
assert.doesNotMatch(extractFunction("renderCartViewTabs"), /hub-cart-view-count|\.count/,
  "Cart and Saved tabs must not include visual count badges");
assert.match(extractFunction("renderCurrentCart"), /itemCount[\s\S]*?Auto-saved/,
  "the current cart item count must move into the autosave status line");
assert.match(extractFunction("renderPlaylist"), /renderPlaylistViewTabs[\s\S]*state\.playlistView === "current"[\s\S]*renderCurrentPlaylist\(\)/,
  "the playlist section must route its first internal tab to Now Playing");
assert.match(source, /id: "playlist", label: "Now Playing & Playlists", icon: "icon-playlist\.svg"/,
  "the combined primary section must use the list-and-note icon for queues and playlists");
assert.doesNotMatch(source, /toggleSectionPanel\("nowPlaying"\)/,
  "Now Playing must no longer open a separate section panel");
assert.match(extractFunction("persistNowPlayingSession"), /MESSAGES\.SET_NOW_PLAYING/,
  "Now Playing must be persisted through the browser-session queue channel");
assert.match(source, /MESSAGES\.GET_NOW_PLAYING/,
  "startup must restore Now Playing from session storage rather than durable app state");

const context = vm.createContext({
  MESSAGES,
  URL,
  Date,
  Math,
  window: { confirm: () => true },
  MAX_PLAYLIST_ITEMS: 500,
  MAX_SAVED_PLAYLISTS: 30,
  state: { activeTab: "nowPlaying", playlist: [], playlistMode: "browse", dj: {} },
  seamless: { enabled: false, queue: [] },
  pendingPlaylistItemId: "",
  playlistPlayRequest: 0,
  playlistPlaybackStarting: false,
  playlistPlaybackStartingRequest: 0,
  suppressedFeedTrackId: "",
  toastMessages: [],
  runtimeCalls: [],
  normalizedTrackTitle(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  },
  resolvedTrackPageUrl(track) {
    try { return new URL(track?.pageUrl || "").href; } catch { return ""; }
  },
  normalizePlaylistItem(track) { return track ? { ...track } : null; },
  normalizePlaylist(items) { return items.slice(0, 500).map((item) => ({ ...item })); },
  isReusableStreamUrl(value) { return Boolean(value); },
  async hydratePlaylist(items) { return { items: items.map((item) => ({ ...item })), failed: 0, error: "" }; },
  releaseExplicitPlaybackClear() {},
  isNowPlayingView() { return context.state.activeTab === "playlist" && context.state.playlistView === "current"; },
  saveState() {},
  render() {},
  injectPlaylistButtons() {},
  async syncActivePlaylistQueue() {},
  syncCurrentPlaylistPlaybackUi() {},
  playlistIsActive() { return false; },
  async seamlessCommand() { return null; },
  showToast(message) { context.toastMessages.push(message); },
  stopModernPagePlayer() {},
  pageMediaCommand() {},
  getAudio() { return null; },
  applySeamlessState() {},
  async runtimeMessage(message) { context.runtimeCalls.push(message); return { ok: true, state: {} }; }
});

vm.runInContext([
  extractFunction("canonicalPlaylistPageUrl"),
  extractFunction("stablePlaylistTrackId"),
  extractFunction("playlistTrackKey"),
  extractFunction("playlistTracksMatch"),
  extractFunction("normalizePlaylistBpm"),
  extractFunction("normalizePlaylistKey"),
  extractFunction("activePlaylistAnalysis"),
  extractFunction("capturePlaylistAnalysis"),
  extractFunction("mergeHydratedPlaylist"),
  `function matchingQueueTrack(queue, requested) { return queue.find((track) => playlistTracksMatch(track, requested)) || null; }`,
  extractFunction("addTracksToPlaylist"),
  extractFunction("recordActivePlaylistAnalysis"),
  extractFunction("consumeCompletedNowPlayingItems"),
  extractFunction("prepareExternalNowPlaying"),
  extractFunction("playPlaylistAt"),
  extractFunction("navigatePlayerQueue"),
  extractFunction("hasSavedPlaylistCapacity"),
  extractFunction("removeSavedPlaylistItem"),
  `globalThis.testApi = { playlistTrackKey, playlistTracksMatch, mergeHydratedPlaylist, addTracksToPlaylist, recordActivePlaylistAnalysis, consumeCompletedNowPlayingItems, prepareExternalNowPlaying, playPlaylistAt, navigatePlayerQueue, hasSavedPlaylistCapacity, removeSavedPlaylistItem };`
].join("\n"), context);

const { playlistTracksMatch, mergeHydratedPlaylist, addTracksToPlaylist, recordActivePlaylistAnalysis, consumeCompletedNowPlayingItems, prepareExternalNowPlaying, playPlaylistAt, navigatePlayerQueue, hasSavedPlaylistCapacity, removeSavedPlaylistItem } = context.testApi;

context.state.savedPlaylists = Array.from({ length: 30 }, (_, index) => ({ id: `saved-${index}`, items: [] }));
assert.equal(hasSavedPlaylistCapacity(), false);
assert.match(context.toastMessages.at(-1), /save up to 30 playlists/);
context.state.savedPlaylists = [];
assert.equal(hasSavedPlaylistCapacity(), true);

const removableSnapshot = {
  id: "saved-removal",
  name: "Removal fixture",
  items: [
    { playlistItemId: "saved-one", id: "saved-one", title: "Saved One", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/saved-one" },
    { playlistItemId: "saved-two", id: "saved-two", title: "Saved Two", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/saved-two" }
  ]
};
context.window.confirm = () => false;
assert.equal(removeSavedPlaylistItem(removableSnapshot, removableSnapshot.items[0]), false,
  "cancelling a saved-track removal must preserve the playlist");
assert.equal(removableSnapshot.items.length, 2);
context.window.confirm = () => true;
assert.equal(removeSavedPlaylistItem(removableSnapshot, removableSnapshot.items[0]), true,
  "a confirmed saved-track removal must report success");
assert.deepEqual(Array.from(removableSnapshot.items, (item) => item.title), ["Saved Two"],
  "removing a saved track must preserve the remaining order");
assert.equal(context.toastMessages.at(-1), "Removed “Saved One” from “Removal fixture”");

assert.equal(playlistTracksMatch(
  {
    id: "https://artist.bandcamp.com/album/release?from=discover_page|Gradient 12",
    title: "Gradient 12",
    artist: "Fixture",
    pageUrl: "https://artist.bandcamp.com/album/release?from=discover_page"
  },
  {
    id: "https://artist.bandcamp.com/album/release?from=discover_page&ui_context=results_grid|Gradient 12",
    title: "Gradient 12",
    artist: "Fixture",
    pageUrl: "https://artist.bandcamp.com/album/release?from=discover_page&ui_context=results_grid"
  }
), true, "tracking parameters must not create duplicate queue identities");

assert.equal(playlistTracksMatch(
  { id: "24680", title: "Honey Be", artist: "Micah Jey", pageUrl: "https://artist.bandcamp.com/album/head-above-the-clouds" },
  { id: "24680", title: "Honey Be", artist: "Micah Jey", pageUrl: "https://artist.bandcamp.com/track/honey-be" }
), true, "a stable Bandcamp track id must survive album/track URL aliases");

assert.equal(playlistTracksMatch(
  { id: "24680", title: "Honey Be", artist: "Micah Jey", pageUrl: "https://artist.bandcamp.com/album/head-above-the-clouds" },
  { id: "track-24680", title: "Honey Be", artist: "Micah Jey", pageUrl: "https://artist.bandcamp.com/track/honey-be" }
), true, "numeric Bandcamp ids and track-prefixed aliases must resolve to the same queue item");

assert.equal(playlistTracksMatch(
  { id: "24680", title: "Honey Be", artist: "Micah Jey", pageUrl: "https://artist.bandcamp.com/album/head-above-the-clouds" },
  { id: "album-card-honey", title: "Honey Be", artist: "Micah Jey", pageUrl: "https://artist.bandcamp.com/album/head-above-the-clouds?from=collection" }
), true, "hydrated numeric ids and page-card ids must still resolve to one queue item");

assert.equal(playlistTracksMatch(
  { id: "track-100", title: "Intro", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/album/same-title-release" },
  { id: "track-200", title: "Intro", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/album/same-title-release" }
), false, "distinct stable track ids must not collapse when an album contains repeated titles");

const mergedDuringRefresh = mergeHydratedPlaylist(
  [
    { playlistItemId: "b", id: "b", title: "B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/b", url: "old-b" },
    { playlistItemId: "c", id: "c", title: "C", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/c", url: "stream-c" }
  ],
  [
    { playlistItemId: "a", id: "a", title: "A", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/a", url: "fresh-a" },
    { playlistItemId: "b", id: "b", title: "B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/b", url: "fresh-b" }
  ]
);
assert.deepEqual(Array.from(mergedDuringRefresh, (item) => `${item.title}:${item.url}`), ["B:fresh-b", "C:stream-c"],
  "hydration must refresh retained tracks without re-adding removed tracks or dropping newly added tracks");

const analyzedTrack = {
  id: "analyzed",
  title: "Analyzed",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/analyzed",
  url: "stream-analyzed"
};
context.state = { activeTab: "nowPlaying", playlist: [], playlistMode: "browse", savedPlaylists: [], recordPlaylistMetadata: true, dj: {} };
context.seamless = {
  enabled: true,
  track: analyzedTrack,
  queue: [analyzedTrack],
  detectedBpm: 124,
  detectedKey: { camelot: "8A", shortName: "A min", name: "A minor" }
};
assert.equal(addTracksToPlaylist([analyzedTrack], { quiet: true }), 1);
assert.equal(context.state.playlist[0].bpm, 124);
assert.equal(context.state.playlist[0].key.camelot, "8A", "adding the analyzed track must capture its BPM and key");

context.state.playlist[0].bpm = null;
context.state.playlist[0].key = null;
context.state.savedPlaylists = [{ id: "saved-analysis", items: [{ ...context.state.playlist[0] }] }];
assert.equal(recordActivePlaylistAnalysis(), true);
assert.equal(context.state.playlist[0].bpm, 124);
assert.equal(context.state.savedPlaylists[0].items[0].key.name, "A minor", "later analysis must update matching saved playlist tracks");

context.state.recordPlaylistMetadata = false;
context.seamless.detectedBpm = 132;
assert.equal(recordActivePlaylistAnalysis(), false);
assert.equal(context.state.playlist[0].bpm, 124, "disabling playlist metadata must stop later analysis updates");

context.state.playlist = [];
let resolveExternalHydration;
context.hydratePlaylist = () => new Promise((resolve) => { resolveExternalHydration = resolve; });
const cancelledExternalPlay = prepareExternalNowPlaying({
  id: "cancelled-external",
  title: "Cancelled External",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/cancelled-external",
  url: "stream-cancelled-external"
});
context.playlistPlayRequest += 1;
context.state.playlist = [];
resolveExternalHydration({
  items: [{ id: "cancelled-external", title: "Cancelled External", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/cancelled-external", url: "stream-cancelled-external" }],
  failed: 0,
  error: ""
});
const cancelledExternalResult = await cancelledExternalPlay;
assert.equal(cancelledExternalResult.cancelled, true);
assert.equal(context.state.playlist.length, 0, "clearing or replacing playback must prevent a stale page handoff from repopulating the queue");
context.hydratePlaylist = async (items) => ({ items: items.map((item) => ({ ...item })), failed: 0, error: "" });

const original = [
  { playlistItemId: "a", id: "a", title: "A", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/a", url: "stream-a" },
  { playlistItemId: "b", id: "b", title: "B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/b?from=feed", url: "stream-b" },
  { playlistItemId: "c", id: "c", title: "C", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/c", url: "stream-c" }
];
context.state.playlist = original.map((item) => ({ ...item }));
context.state.playlistMode = "manual";
context.pendingPlaylistItemId = "stale-row-request";
let prepared = await prepareExternalNowPlaying({
  id: "b-from-page",
  title: "B",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/b?from=discover_page",
  url: "stream-b"
});
assert.equal(context.pendingPlaylistItemId, "", "a page playback request must clear obsolete queue-row loading state");
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["B"]);
assert.equal(prepared.index, 0, "normal page playback must replace a manually built queue");

prepared = await prepareExternalNowPlaying({
  id: "d",
  title: "D",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/d",
  url: "stream-d"
});
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["D"]);
assert.equal(prepared.index, 0, "a new page track must replace prior Now Playing history");

context.state.playlistMode = "browse";
prepared = await prepareExternalNowPlaying({
  id: "browse-replacement",
  title: "Browse Replacement",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/browse-replacement",
  url: "stream-browse-replacement"
});
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Browse Replacement"],
  "ordinary page playback must replace browse history instead of accumulating it");

const browseSourceQueue = [
  { id: "page-a", title: "Page A", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/page-a", url: "stream-page-a" },
  { id: "page-b", title: "Page B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/page-b", url: "stream-page-b" },
  { id: "page-c", title: "Page C", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/page-c", url: "stream-page-c" }
];
prepared = await prepareExternalNowPlaying(browseSourceQueue[1], browseSourceQueue, { trustProvidedStreams: true });
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page B", "Page C"],
  "page-derived playback must replace prior history with the selected track and the tracks that follow it");
assert.equal(prepared.index, 0);

context.state.playlist = browseSourceQueue.map((item, index) => ({ ...item, playlistItemId: `advance-${index}` }));
context.seamless = { enabled: true, status: "playing", track: { ...context.state.playlist[1] } };
let completedQueueSyncs = 0;
context.syncActivePlaylistQueue = async () => { completedQueueSyncs += 1; };
assert.equal(consumeCompletedNowPlayingItems(), true);
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page B", "Page C"],
  "automatic advancement must remove completed tracks and preserve Up Next order");
assert.equal(completedQueueSyncs, 1,
  "automatic advancement must remove completed tracks from the offscreen queue as well as the visible queue");
context.seamless = { enabled: true, status: "ended", track: { ...context.state.playlist.at(-1) } };
assert.equal(consumeCompletedNowPlayingItems(), true);
assert.equal(context.state.playlist.length, 0, "finishing the last track must leave a clean temporary queue");
context.syncActivePlaylistQueue = async () => {};

const oversizedSourceQueue = Array.from({ length: 501 }, (_, index) => ({
  id: `oversized-${index}`,
  title: `Oversized ${index}`,
  artist: "Fixture",
  pageUrl: `https://fixture.bandcamp.com/track/oversized-${index}`,
  url: `stream-oversized-${index}`
}));
context.state.playlist = [];
context.state.playlistMode = "browse";
prepared = await prepareExternalNowPlaying(oversizedSourceQueue[500], oversizedSourceQueue);
assert.equal(context.state.playlist.length, 1);
assert.equal(prepared.queue[prepared.index]?.title, "Oversized 500",
  "browse playback must retain only the selected track even when a page exposes a large source queue");

assert.doesNotMatch(extractFunction("handoffPageAudio"), /MESSAGES\.SEAMLESS_PLAY_INDEX/,
  "classic Bandcamp page playback must rebuild queue provenance instead of bypassing it");
assert.doesNotMatch(extractFunction("handoffPageAudio"), /silenceNativePagePlayback\(\)/,
  "classic page audio must remain audible until offscreen playback is ready");
assert.match(extractFunction("handoffPageAudio"), /currentTime:[\s\S]*?handoffStartedAt: Date\.now\(\)/,
  "classic page handoff must compensate for the native playback time spent starting offscreen audio");
assert.doesNotMatch(extractFunction("handoffModernPlayer"), /MESSAGES\.SEAMLESS_PLAY_INDEX/,
  "modern Bandcamp page playback must rebuild queue provenance instead of bypassing it");
assert.doesNotMatch(extractFunction("handoffModernPlayer"), /silenceNativePagePlayback\(\)/,
  "modern page audio must remain audible until offscreen playback is ready");
const discoverHandoffSource = extractFunction("handoffDiscoverPlayer");
assert.match(discoverHandoffSource, /prepareExternalNowPlaying\(discover\.track, \[\], \{ trustProvidedStreams: true \}\)/,
  "Discover playback must use its captured stream immediately instead of delaying the handoff for hydration");
assert.match(discoverHandoffSource, /const latestDiscover = getDiscoverPlayerState\(\);[\s\S]*?const handoffCurrentTime =[\s\S]*?currentTime: handoffCurrentTime/,
  "Discover playback must re-read the live playhead at the handoff boundary so seamless playback cannot rewind");
assert.match(extractFunction("getModernPlayerState"), /floating-player:has\(\.track-meta\[streamurl\]\)/,
  "playlist pages must expose their stream queue even when Bandcamp omits the legacy has-track class");
assert.match(extractFunction("getModernPlayerState"), /\.outline, \.outline-opaque/,
  "playlist page and floating-player play controls must resolve the same tracklist key");
assert.match(extractFunction("getModernPlaylistSeed"), /#PlaylistPage\[data-blob\]/,
  "playlist pages must read Bandcamp's paginated tracklist payload instead of only rendered rows");
assert.match(extractFunction("loadModernPlaylistQueue"), /\/api\/player\/2\/player_data_web/,
  "playlist playback must fetch every available page of tracks before building Now Playing");
assert.match(extractFunction("prepareExternalNowPlaying"), /state\.playlist = normalizePlaylist\(replacement\)/,
  "all normal page playback must replace an unrelated queue with the source context");

context.seamless = { enabled: false, queue: [] };
context.hydratePlaylist = async (items) => ({ items: items.map((item) => ({ ...item })), failed: 0, error: "" });
context.runtimeCalls.length = 0;

context.state = {
  activeTab: "nowPlaying",
  playlistMode: "manual",
  playlist: browseSourceQueue.map((item, index) => ({ ...item, playlistItemId: `loaded-${index}` })),
  dj: {}
};
context.seamless = {
  enabled: true,
  index: 0,
  track: { ...context.state.playlist[0] },
  queue: context.state.playlist.map((item) => ({ ...item }))
};
context.playlistIsActive = () => true;
let loadedQueueHydrations = 0;
const loadedQueueCommands = [];
context.hydratePlaylist = async (items) => {
  loadedQueueHydrations += 1;
  return { items: items.map((item) => ({ ...item })), failed: 0, error: "" };
};
context.seamlessCommand = async (type, details) => {
  loadedQueueCommands.push({ type, ...details });
  if (type === "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE") {
    context.seamless.queue = details.queue;
    context.seamless.index = details.queue.findIndex((track) => track.playlistItemId === details.selectedPlaylistItemId);
  } else {
    context.seamless.index = details.index;
  }
  context.seamless.track = context.seamless.queue[context.seamless.index];
  return { ...context.seamless, status: "playing", isPlaying: true };
};
assert.equal(await playPlaylistAt(1), true);
assert.equal(loadedQueueHydrations, 0,
  "selecting a track already loaded in the player must not re-fetch its playlist from Bandcamp");
assert.equal(loadedQueueCommands[0]?.type, "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE");
assert.equal(loadedQueueCommands[0]?.selectedPlaylistItemId, "loaded-1",
  "the selected Now Playing track must be addressed by stable identity rather than a shifting queue index");
assert.deepEqual(Array.from(loadedQueueCommands[0]?.queue || [], (item) => item.title), ["Page B", "Page C"],
  "selecting a later row must atomically install the consumed queue in its exact remaining order");
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page B", "Page C"]);
assert.equal(await playPlaylistAt(1), true);
assert.equal(loadedQueueCommands[1]?.selectedPlaylistItemId, "loaded-2");
assert.deepEqual(Array.from(loadedQueueCommands[1]?.queue || [], (item) => item.title), ["Page C"],
  "repeated selections must calculate against the latest queue rather than the original rendered order");
context.playlistIsActive = () => false;
context.seamlessCommand = async () => null;
context.syncActivePlaylistQueue = async () => {};

context.state = { activeTab: "nowPlaying", playlistMode: "browse", playlist: browseSourceQueue.map((item, index) => ({ ...item, playlistItemId: `browse-${index}` })), dj: {} };
assert.equal(await playPlaylistAt(1, { forceRefresh: true }), true);
assert.equal(context.state.playlistMode, "browse", "playing a page-derived row must not turn it into a manual queue");
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page B", "Page C"],
  "playing within a page-derived queue must discard the tracks before the selection");

context.runtimeCalls.length = 0;
context.state = { activeTab: "nowPlaying", playlistMode: "manual", playlist: browseSourceQueue.map((item, index) => ({ ...item, playlistItemId: `manual-${index}` })), dj: {} };
assert.equal(await playPlaylistAt(2, { forceRefresh: true }), true);
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page C"],
  "playing within an explicit queue must consume prior items without reordering or retaining them");

context.state.playlist = Array.from({ length: 500 }, (_, index) => ({
  playlistItemId: `limit-${index}`,
  id: `limit-${index}`,
  title: `Limit ${index}`,
  artist: "Fixture",
  pageUrl: `https://fixture.bandcamp.com/track/limit-${index}`,
  url: `stream-limit-${index}`
}));
context.state.playlistMode = "manual";
prepared = await prepareExternalNowPlaying({
  id: "over-limit",
  title: "Over Limit",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/over-limit",
  url: "stream-over-limit"
});
assert.equal(prepared.index, 0);
assert.equal(context.state.playlist.length, 1);
assert.equal(context.state.playlist[0].title, "Over Limit", "normal playback must replace even a full explicit queue");
context.state.playlist = Array.from({ length: 500 }, (_, index) => ({
  playlistItemId: `limit-${index}`,
  id: `limit-${index}`,
  title: `Limit ${index}`,
  artist: "Fixture",
  pageUrl: `https://fixture.bandcamp.com/track/limit-${index}`,
  url: `stream-limit-${index}`
}));
context.toastMessages.length = 0;
assert.equal(addTracksToPlaylist([{
  id: "also-over-limit",
  title: "Also Over Limit",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/also-over-limit",
  url: "stream-also-over-limit"
}]), 0);
assert.equal(context.state.playlist.length, 500);
assert.ok(context.toastMessages.at(-1).includes("up to 500 tracks"));

context.state = {
  activeTab: "nowPlaying",
  playlistMode: "manual",
  playlist: [
    { playlistItemId: "saved-active", id: "saved-active", title: "Saved Active", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/saved-active", url: "old-saved-active" },
    { playlistItemId: "saved-next", id: "saved-next", title: "Saved Next", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/saved-next", url: "old-saved-next" }
  ],
  dj: {}
};
context.seamless = { enabled: true, index: 0, track: { ...context.state.playlist[0] }, queue: context.state.playlist.map((item) => ({ ...item })) };
context.playlistIsActive = () => true;
let savedPlaylistHydrations = 0;
context.hydratePlaylist = async (items) => {
  savedPlaylistHydrations += 1;
  return { items: items.map((item) => ({ ...item, url: `fresh-${item.id}` })), failed: 0, error: "" };
};
context.runtimeCalls.length = 0;
context.suppressedFeedTrackId = "saved-active";
assert.equal(await playPlaylistAt(0, { forceRefresh: true }), true);
assert.equal(context.suppressedFeedTrackId, "", "explicitly playing a removed Feed track from Now Playing must release its stale-event suppression");
assert.equal(savedPlaylistHydrations, 1, "playing a restored saved playlist must refresh it even when its first item is already active");
assert.equal(context.runtimeCalls.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX"), false);
assert.equal(context.runtimeCalls.find((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE")?.queue?.[1]?.url, "fresh-saved-next");
context.playlistIsActive = () => false;

context.state = {
  activeTab: "nowPlaying",
  playlistMode: "manual",
  playlist: [
    { playlistItemId: "available", id: "available", title: "Available", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/available", url: "stream-available" },
    { playlistItemId: "unavailable", id: "unavailable", title: "Unavailable", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/unavailable", url: "expired-stream" }
  ],
  dj: {}
};
context.hydratePlaylist = async (items) => ({
  items: items.map((item) => item.playlistItemId === "unavailable"
    ? { ...item, url: "", restoreError: "Unavailable" }
    : { ...item, url: "fresh-stream" }),
  failed: 1,
  error: ""
});
context.runtimeCalls.length = 0;
context.toastMessages.length = 0;
const unavailablePlayed = await playPlaylistAt(1);
assert.equal(unavailablePlayed, false);
assert.equal(context.runtimeCalls.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE"), false,
  "selecting an unavailable track must never fall back to another playable queue item");
assert.ok(context.toastMessages.at(-1).includes("None of these tracks are currently streamable"));

context.state = {
  activeTab: "nowPlaying",
  playlistMode: "manual",
  playlist: [
    { playlistItemId: "rapid-a", id: "rapid-a", title: "Rapid A", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/rapid-a", url: "" },
    { playlistItemId: "rapid-b", id: "rapid-b", title: "Rapid B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/rapid-b", url: "" }
  ],
  dj: {}
};
const hydrationResolvers = [];
context.hydratePlaylist = () => new Promise((resolve) => hydrationResolvers.push(resolve));
context.runtimeCalls.length = 0;
const firstRapidPlay = playPlaylistAt(0);
const secondRapidPlay = playPlaylistAt(1);
const refreshedRapidItems = context.state.playlist.map((item, index) => ({ ...item, url: `fresh-rapid-${index}` }));
hydrationResolvers[1]({ items: refreshedRapidItems, failed: 0, error: "" });
await secondRapidPlay;
hydrationResolvers[0]({ items: refreshedRapidItems, failed: 0, error: "" });
await firstRapidPlay;
const rapidEnables = context.runtimeCalls.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE");
assert.equal(rapidEnables.length, 1, "a superseded hydration must not start stale playback");
assert.equal(rapidEnables[0].index, 0, "the final rapid selection must win at the front of the manual queue");
assert.equal(rapidEnables[0].queue[0].title, "Rapid B");

context.state = {
  activeTab: "nowPlaying",
  playlistMode: "manual",
  playlist: [
    { playlistItemId: "skip-a", id: "skip-a", title: "Skip A", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-a", url: "stream-skip-a" },
    { playlistItemId: "skip-b", id: "skip-b", title: "Skip B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-b", url: "" },
    { playlistItemId: "skip-c", id: "skip-c", title: "Skip C", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-c", url: "stream-skip-c" }
  ],
  dj: {}
};
context.seamless = {
  enabled: true,
  index: 0,
  track: { ...context.state.playlist[0] },
  queue: [{ ...context.state.playlist[0] }, { ...context.state.playlist[2] }]
};
context.hydratePlaylist = async (items) => ({
  items: items.map((item) => item.playlistItemId === "skip-b" ? { ...item, url: "", restoreError: "Unavailable" } : { ...item }),
  failed: 1,
  error: ""
});
context.runtimeCalls.length = 0;
context.runtimeMessage = async (message) => {
  context.runtimeCalls.push(message);
  return { ok: true, state: { enabled: true, index: message.index, queue: message.queue, track: message.queue?.[message.index] } };
};
assert.equal(await navigatePlayerQueue(1), true);
const skippedEnable = context.runtimeCalls.findLast((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE");
assert.equal(skippedEnable?.queue?.[skippedEnable.index]?.title, "Skip C",
  "footer navigation must skip a track that remains unavailable after refresh");
context.state.playlist = [
  { playlistItemId: "skip-a", id: "skip-a", title: "Skip A", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-a", url: "stream-skip-a" },
  { playlistItemId: "skip-b", id: "skip-b", title: "Skip B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-b", url: "" },
  { playlistItemId: "skip-c", id: "skip-c", title: "Skip C", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-c", url: "stream-skip-c" }
];
context.seamless = {
  enabled: true,
  index: 1,
  track: { ...context.state.playlist[2] },
  queue: [{ ...context.state.playlist[0] }, { ...context.state.playlist[2] }]
};
context.runtimeCalls.length = 0;
assert.equal(await navigatePlayerQueue(-1), true);
const skippedBackwardEnable = context.runtimeCalls.findLast((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE");
assert.equal(skippedBackwardEnable?.queue?.[skippedBackwardEnable.index]?.title, "Skip A",
  "footer Previous must also skip an unavailable refreshed track");

context.state = {
  activeTab: "nowPlaying",
  playlistMode: "manual",
  playlist: [
    { playlistItemId: "overlap-a", id: "overlap-a", title: "Overlap A", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/overlap-a", url: "stream-overlap-a" },
    { playlistItemId: "overlap-b", id: "overlap-b", title: "Overlap B", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/overlap-b", url: "stream-overlap-b" }
  ],
  dj: {}
};
context.hydratePlaylist = async (items) => ({ items: items.map((item) => ({ ...item })), failed: 0, error: "" });
context.seamless = { enabled: false, queue: [] };
context.runtimeCalls.length = 0;
const enableResolvers = [];
context.runtimeMessage = async (message) => {
  context.runtimeCalls.push(message);
  if (message.type !== "BANDCAMP_HUB_SEAMLESS_ENABLE") return { ok: true, state: {} };
  return new Promise((resolve) => enableResolvers.push(resolve));
};
const overlappingFirst = playPlaylistAt(0);
for (let attempt = 0; attempt < 10 && enableResolvers.length < 1; attempt += 1) await Promise.resolve();
const overlappingSecond = playPlaylistAt(1);
for (let attempt = 0; attempt < 10 && enableResolvers.length < 2; attempt += 1) await Promise.resolve();
assert.equal(enableResolvers.length, 2);
assert.equal(context.playlistPlaybackStarting, true);
enableResolvers[0]({ ok: true, state: { enabled: true, index: 0, queue: context.state.playlist } });
assert.equal(await overlappingFirst, false);
assert.equal(context.playlistPlaybackStarting, true,
  "a superseded runtime response must not clear the newer playback-starting guard");
enableResolvers[1]({ ok: true, state: { enabled: true, index: 0, queue: context.state.playlist } });
assert.equal(await overlappingSecond, true);
assert.equal(context.playlistPlaybackStarting, false);

console.log("now playing identity and ordering smoke test passed");
