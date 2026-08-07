import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content.js", import.meta.url), "utf8");

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
  URL,
  Date,
  Math,
  MAX_PLAYLIST_ITEMS: 500,
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
  extractFunction("prepareExternalNowPlaying"),
  extractFunction("playPlaylistAt"),
  extractFunction("navigatePlayerQueue"),
  `globalThis.testApi = { playlistTrackKey, playlistTracksMatch, mergeHydratedPlaylist, addTracksToPlaylist, recordActivePlaylistAnalysis, prepareExternalNowPlaying, playPlaylistAt, navigatePlayerQueue };`
].join("\n"), context);

const { playlistTracksMatch, mergeHydratedPlaylist, addTracksToPlaylist, recordActivePlaylistAnalysis, prepareExternalNowPlaying, playPlaylistAt, navigatePlayerQueue } = context.testApi;
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
assert.deepEqual(Array.from(context.state.playlist, (item) => item.playlistItemId), ["a", "b", "c"]);
assert.equal(prepared.index, 1, "playing an existing page track must preserve its queue position");

prepared = await prepareExternalNowPlaying({
  id: "d",
  title: "D",
  artist: "Fixture",
  pageUrl: "https://fixture.bandcamp.com/track/d",
  url: "stream-d"
});
assert.deepEqual(Array.from(context.state.playlist, (item) => item.title), ["A", "B", "C", "D"]);
assert.equal(prepared.index, 3, "a new page track must append instead of replacing or promoting the queue");

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
assert.equal(prepared.index, -1);
assert.equal(context.state.playlist.length, 500);
assert.ok(prepared.error.includes("500 tracks"), "the queue limit must reject a new track explicitly instead of silently dropping it");
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
  playlist: [
    { playlistItemId: "available", id: "available", title: "Available", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/available", url: "stream-available" },
    { playlistItemId: "unavailable", id: "unavailable", title: "Unavailable", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/unavailable", url: "expired-stream" }
  ],
  dj: {}
};
context.hydratePlaylist = async () => ({
  items: [
    { ...context.state.playlist[0], url: "fresh-stream" },
    { ...context.state.playlist[1], url: "", restoreError: "Unavailable" }
  ],
  failed: 1,
  error: ""
});
context.runtimeCalls.length = 0;
context.toastMessages.length = 0;
const unavailablePlayed = await playPlaylistAt(1);
assert.equal(unavailablePlayed, false);
assert.equal(context.runtimeCalls.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE"), false,
  "selecting an unavailable track must never fall back to another playable queue item");
assert.ok(context.toastMessages.at(-1).includes("Unavailable is not currently streamable"));

context.state = {
  activeTab: "nowPlaying",
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
assert.equal(rapidEnables[0].index, 1, "the final rapid selection must win");

context.state = {
  activeTab: "nowPlaying",
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
enableResolvers[1]({ ok: true, state: { enabled: true, index: 1, queue: context.state.playlist } });
assert.equal(await overlappingSecond, true);
assert.equal(context.playlistPlaybackStarting, false);

console.log("now playing identity and ordering smoke test passed");
