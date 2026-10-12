import assert from "node:assert/strict";
import vm from "node:vm";
import { MESSAGES } from "../src/shared/contracts.js";
import { readContentSource } from "./support/source.mjs";
const source = readContentSource();
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
const context = vm.createContext({
  MESSAGES,
  URL,
  Date,
  Math,
  window: { confirm: () => true, setTimeout },
  MAX_PLAYLIST_ITEMS: 500,
  MAX_SAVED_PLAYLISTS: 30,
  state: { activeTab: "nowPlaying", playlist: [], playlistMode: "browse", playlistShuffleEnabled: false, playlistShuffleOrder: [], dj: {} },
  seamless: { enabled: false, queue: [] },
  pendingPlaylistItemId: "",
  playlistPlayRequest: 0,
  playlistPlaybackStarting: false,
  playlistPlaybackStartingRequest: 0,
  savedPlaylistPlayRequest: 0,
  savedPlaylistReplacementRequest: 0,
  savedPlaylistReplacementGuardUntil: 0,
  playlistShuffleSyncTimer: 0,
  playlistShuffleConsumptionGuardUntil: 0,
  nowPlayingTransitionTrackKey: "",
  nowPlayingTransitionExpiresAt: 0,
  suppressedFeedTrackId: "",
  classicPageHandoffTrack: null,
  pendingQueueStep: null,
  playAdjacentPageTrack() { return false; },
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
  beginNowPlayingSessionRevision() {},
  persistNowPlayingSession() {},
  saveLayoutState() {},
  render() {},
  injectPlaylistButtons() {},
  showCompactPanelNotice() {},
  async syncActivePlaylistQueue() {},
  schedulePlaylistShuffleQueueSync() {},
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
  extractFunction("resetPlaylistShuffle"),
  extractFunction("enablePlaylistShuffle"),
  extractFunction("togglePlaylistShuffle"),
  extractFunction("restoreSavedPlaylist"),
  extractFunction("playSavedPlaylist"),
  `function matchingQueueTrack(queue, requested) { return queue.find((track) => playlistTracksMatch(track, requested)) || null; }`,
  extractFunction("addTracksToPlaylist"),
  extractFunction("recordActivePlaylistAnalysis"),
  extractFunction("consumeCompletedNowPlayingItems"),
  extractFunction("prepareExternalNowPlaying"),
  extractFunction("playPlaylistAt"),
  extractFunction("navigatePlayerQueue"),
  extractFunction("hasSavedPlaylistCapacity"),
  extractFunction("removeSavedPlaylistItem"),
  `globalThis.testApi = { playlistTrackKey, playlistTracksMatch, mergeHydratedPlaylist, resetPlaylistShuffle, enablePlaylistShuffle, togglePlaylistShuffle, restoreSavedPlaylist, playSavedPlaylist, addTracksToPlaylist, recordActivePlaylistAnalysis, consumeCompletedNowPlayingItems, prepareExternalNowPlaying, playPlaylistAt, navigatePlayerQueue, hasSavedPlaylistCapacity, removeSavedPlaylistItem };`
].join("\n"), context);
const { playlistTracksMatch, mergeHydratedPlaylist, enablePlaylistShuffle, togglePlaylistShuffle, playSavedPlaylist, addTracksToPlaylist, recordActivePlaylistAnalysis, consumeCompletedNowPlayingItems, prepareExternalNowPlaying, playPlaylistAt, navigatePlayerQueue, hasSavedPlaylistCapacity, removeSavedPlaylistItem } = context.testApi;
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
context.state = {
  activeTab: "nowPlaying",
  playlist: original.map((item) => ({ ...item })).concat({ playlistItemId: "d", id: "d", title: "D", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/d", url: "stream-d" }),
  playlistMode: "manual",
  playlistShuffleEnabled: false,
  playlistShuffleOrder: [],
  savedPlaylists: [],
  recordPlaylistMetadata: true,
  dj: {}
};
assert.equal(togglePlaylistShuffle(() => 0), true);
assert.equal(context.state.playlistShuffleEnabled, true);
assert.deepEqual(Array.from(context.state.playlistShuffleOrder), ["a", "b", "c", "d"]);
assert.equal(context.state.playlist[0].title, "A", "enabling Shuffle must keep the current/top track anchored");
assert.notDeepEqual(Array.from(context.state.playlist, (item) => item.title), ["A", "B", "C", "D"],
  "enabling Shuffle must rearrange Up Next");
context.state.playlist = context.state.playlist.filter((item) => item.playlistItemId !== "a");
addTracksToPlaylist([{ playlistItemId: "e", id: "e", title: "E", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/e", url: "stream-e" }], { quiet: true });
assert.equal(togglePlaylistShuffle(), true);
assert.equal(context.state.playlistShuffleEnabled, false);
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["B", "C", "D", "E"],
  "disabling Shuffle must restore surviving tracks and later additions to their original relative order");
context.state.playlist = original.map((item) => ({ ...item }));
context.state.playlistShuffleEnabled = false;
context.state.playlistShuffleOrder = [];
assert.equal(enablePlaylistShuffle({ keepFirst: false, random: () => 0 }), true);
assert.equal(context.state.playlistShuffleEnabled, true);
assert.deepEqual(Array.from(context.state.playlistShuffleOrder), ["a", "b", "c"]);
assert.notEqual(context.state.playlist[0].title, "A", "Play shuffled must randomize the first track as well as Up Next");
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
const originalPersistSession = context.persistNowPlayingSession;
let releaseSlowPersistence;
context.persistNowPlayingSession = () => new Promise((resolve) => { releaseSlowPersistence = resolve; });
const fastPreparation = prepareExternalNowPlaying(browseSourceQueue[1], browseSourceQueue, { trustProvidedStreams: true });
const fastResult = await Promise.race([
  fastPreparation,
  new Promise((resolve) => setTimeout(() => resolve(null), 100))
]);
releaseSlowPersistence();
assert.ok(fastResult?.usedFreshStreams, "album playback must be ready while cross-tab persistence is still pending");
context.persistNowPlayingSession = () => Promise.reject(new Error("Storage unavailable"));
assert.equal((await prepareExternalNowPlaying(browseSourceQueue[1], browseSourceQueue, { trustProvidedStreams: true })).index, 1,
  "a failed queue save must not prevent a fresh album stream from playing");
context.persistNowPlayingSession = originalPersistSession;
prepared = await prepareExternalNowPlaying(browseSourceQueue[1], browseSourceQueue, { trustProvidedStreams: true });
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page A", "Page B", "Page C"],
  "page-derived playback must preserve the complete tracklist around the selected track");
assert.equal(prepared.index, 1);
context.state.playlist = browseSourceQueue.map((item, index) => ({ ...item, playlistItemId: `advance-${index}` }));
context.nowPlayingTransitionTrackKey = "";
context.nowPlayingTransitionExpiresAt = 0;
context.seamless = {
  enabled: true,
  status: "playing",
  index: 1,
  track: { ...context.state.playlist[1] },
  queue: context.state.playlist.map((item) => ({ ...item }))
};
let completedQueueSyncs = 0;
context.syncActivePlaylistQueue = async () => { completedQueueSyncs += 1; };
assert.equal(consumeCompletedNowPlayingItems(), false);
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page A", "Page B", "Page C"],
  "page-derived browse queues must retain played tracks for Previous and the Up shortcut");
context.state.playlistMode = "manual";
assert.equal(consumeCompletedNowPlayingItems(), true);
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page B", "Page C"],
  "manually assembled Now Playing queues must still remove completed tracks and preserve Up Next order");
assert.equal(completedQueueSyncs, 1,
  "automatic advancement must remove completed tracks from the offscreen queue as well as the visible queue");
context.seamless = {
  enabled: true,
  status: "ended",
  index: 1,
  track: { ...context.state.playlist.at(-1) },
  queue: context.state.playlist.map((item) => ({ ...item }))
};
assert.equal(consumeCompletedNowPlayingItems(), true);
assert.equal(context.state.playlist.length, 0, "finishing the last track must leave a clean temporary queue");
context.syncActivePlaylistQueue = async () => {};
context.state.playlist = browseSourceQueue.map((item, index) => ({ ...item, playlistItemId: `replacement-${index}` }));
context.nowPlayingTransitionTrackKey = context.testApi.playlistTrackKey(context.state.playlist[0]);
context.nowPlayingTransitionExpiresAt = Date.now() + 30_000;
context.seamless = {
  enabled: true,
  status: "playing",
  index: 0,
  track: { ...context.state.playlist[2] },
  queue: [{ ...context.state.playlist[2] }]
};
assert.equal(consumeCompletedNowPlayingItems(), false,
  "a previous track snapshot must not consume a newly selected page queue during its handoff");
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Page A", "Page B", "Page C"],
  "the 4→2→4 race must preserve the selected track and everything after it");
context.seamless.status = "ended";
assert.equal(consumeCompletedNowPlayingItems(), false,
  "a stale ended snapshot must not clear a newly selected page queue");
context.nowPlayingTransitionTrackKey = "";
context.nowPlayingTransitionExpiresAt = 0;
context.state.playlistMode = "browse";
const oversizedSourceQueue = Array.from({ length: 501 }, (_, index) => ({
  id: `oversized-${index}`,
  title: `Oversized ${index}`,
  artist: "Fixture",
  pageUrl: `https://fixture.bandcamp.com/track/oversized-${index}`,
  url: `stream-oversized-${index}`
}));
context.state.playlist = [];
context.state.playlistMode = "browse";
prepared = await prepareExternalNowPlaying(oversizedSourceQueue[500], oversizedSourceQueue, { trustProvidedStreams: true });
assert.equal(context.state.playlist.length, 500);
assert.equal(context.state.playlist[0].title, "Oversized 1");
assert.equal(prepared.queue[prepared.index]?.title, "Oversized 500",
  "browse playback must retain a bounded tracklist window that includes the selected track");
assert.doesNotMatch(extractFunction("handoffPageAudio"), /MESSAGES\.SEAMLESS_PLAY_INDEX/,
  "classic Bandcamp page playback must rebuild queue provenance instead of bypassing it");
assert.doesNotMatch(extractFunction("handoffPageAudio"), /silenceNativePagePlayback\(\)/,
  "classic page audio must remain audible until offscreen playback is ready");
assert.match(extractFunction("handoffPageAudio"), /currentTime:[\s\S]*?handoffStartedAt: Date\.now\(\)/,
  "classic page handoff must compensate for the native playback time spent starting offscreen audio");
assert.match(extractFunction("handoffPageAudio"), /handoffRequest !== classicPageHandoffRequest[\s\S]*?prepared\.request !== playlistPlayRequest/,
  "classic page handoff must reject work superseded by a later row click");
assert.match(source, /if \(seamless\.enabled && \(previous \|\| next \|\| progress\)\)[\s\S]*?if \(!requestClassicPagePlayback\(control\)\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopImmediatePropagation\(\);/,
  "classic page track-list controls must hand off directly even before seamless playback is enabled");
assert.doesNotMatch(extractFunction("handoffModernPlayer"), /MESSAGES\.SEAMLESS_PLAY_INDEX/,
  "modern Bandcamp page playback must rebuild queue provenance instead of bypassing it");
assert.doesNotMatch(extractFunction("handoffModernPlayer"), /silenceNativePagePlayback\(\)/,
  "modern page audio must remain audible until offscreen playback is ready");
const discoverHandoffSource = extractFunction("handoffDiscoverPlayer");
assert.match(source, /function resolveDiscoverHandoffQueue[\s\S]*?matchingPagePlaybackTrack[\s\S]*?resolveFeedReleaseTracks/,
  "Discover artwork playback must resolve the native preview against the selected release");
assert.match(discoverHandoffSource, /resolveDiscoverHandoffQueue\(r, discover\.track\)[\s\S]*?prepareExternalNowPlaying\(releaseTrack \|\| discover\.track, releaseQueue, \{ trustProvidedStreams: true \}\)/,
  "Discover artwork playback must resolve and retain the selected release queue before handoff");
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
assert.match(extractFunction("playPlaylistAt"), /queueChanged && isNowPlayingView\(\)[\s\S]*?forcePlaylistPanelRefresh = true[\s\S]*?render\(\)[\s\S]*?forcePlaylistPanelRefresh = false/,
  "selecting a later visible Now Playing row must immediately render the consumed queue despite the clicked card remaining hovered");
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
  activeTab: "playlist", playlistMode: "browse", playlistView: "saved", playlistShuffleEnabled: true,
  playlistShuffleOrder: ["previous-now-playing"],
  playlist: [{
    playlistItemId: "previous-now-playing", id: "previous-now-playing", title: "Previous Now Playing", artist: "Fixture",
    pageUrl: "https://fixture.bandcamp.com/track/previous-now-playing",
    url: "stream-previous-now-playing"
  }],
  dj: {}
};
context.hydratePlaylist = async (items) => ({
  items: items.map((item) => ({ ...item, url: "", restoreError: "Temporary Bandcamp failure" })),
  failed: items.length,
  error: ""
});
context.runtimeCalls.length = 0;
context.toastMessages.length = 0;
assert.equal(await playSavedPlaylist({
  name: "Saved failure fixture",
  items: [{
    playlistItemId: "saved-failure", id: "saved-failure", title: "Saved Failure", artist: "Fixture",
    pageUrl: "https://fixture.bandcamp.com/track/saved-failure",
    url: ""
  }]
}), false);
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["Previous Now Playing"],
  "a saved-playlist refresh failure must preserve the queue that was already in Now Playing");
assert.equal(context.state.playlistMode, "browse");
assert.equal(context.state.playlistView, "saved");
assert.equal(context.state.playlistShuffleEnabled, true);
assert.deepEqual(Array.from(context.state.playlistShuffleOrder), ["previous-now-playing"]);
assert.equal(context.runtimeCalls.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE"), false);
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
const rapidQueue = ["One", "Two", "Three", "Four"].map((title) => ({ id: title, title, artist: "Fixture", url: `stream-${title}` }));
context.state = { activeTab: "nowPlaying", playlistMode: "browse", playlist: rapidQueue.map((item) => ({ ...item })), dj: {} };
context.seamless = { enabled: true, index: 0, track: { ...rapidQueue[0] }, queue: rapidQueue };
const rapidIndexes = [];
const seamlessCommand = context.seamlessCommand;
context.seamlessCommand = async (type, details) => { if (type === MESSAGES.SEAMLESS_PLAY_INDEX) rapidIndexes.push(details.index); return {}; };
await Promise.all([navigatePlayerQueue(1), navigatePlayerQueue(1), navigatePlayerQueue(1), navigatePlayerQueue(-1)]);
assert.deepEqual(rapidIndexes, [1, 2, 3, 2], "presses faster than the player reports back must build on the track already requested");
context.pendingQueueStep = null;
context.seamless = { enabled: true, index: 0, track: { ...rapidQueue[0] }, queue: rapidQueue.slice(1) };
const adjacentRequests = [];
context.playAdjacentPageTrack = (step, track) => { adjacentRequests.push([step, track?.title]); return true; };
assert.equal(await navigatePlayerQueue(-1), true);
assert.deepEqual(adjacentRequests, [[-1, "Two"]], "Previous at the start of Now Playing must reach the release's earlier track");
context.classicPageHandoffTrack = { ...rapidQueue[2] };
await navigatePlayerQueue(1);
assert.deepEqual(adjacentRequests.at(-1), [1, "Three"], "a press during a page handoff must step from the track being handed off");
context.classicPageHandoffTrack = null;
context.playAdjacentPageTrack = () => false;
context.seamlessCommand = seamlessCommand;
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
