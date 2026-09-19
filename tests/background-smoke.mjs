import assert from "node:assert/strict";

let runtimeListener;
let installedListener;
let commandListener;
const tabRemovedListeners = [];
let tabUpdatedListener;
let offscreenCreated = false;
let offscreenCreateCalls = 0;
let offscreenCreateDetails = null;
let offscreenContextGate = null;
let offscreenRestoreGate = null;
let injected = false;
let injectedFiles = [];
let tabMessageCalls = 0;
const tabMessages = [];
let createdBackgroundTab = null;
let removedTabId = null;
const tabUpdates = [];
const windowUpdates = [];
const reloadedTabIds = [];
const offscreenMessages = [];
let bandcampTabs = [{ id: 7, url: "https://artist.bandcamp.com/album/fixture" }];
const session = {};
const local = { bandcampHubState: { playlist: [{ title: "Fixture" }] } };
const digitalOfferFixture = {
  "@type": "MusicRecording",
  byArtist: { name: "Fixture Artist" },
  additionalProperty: [],
  contains: [
    {
      "@id": "https://artist.bandcamp.com/track/not-the-requested-track",
      name: "Not the Requested Track",
      additionalProperty: [
        { name: "item_type", value: "t" },
        { name: "item_id", value: "100" },
        { name: "selling_band_id", value: "303" }
      ],
      offers: { price: "1.00", priceCurrency: "AUD" }
    },
    {
      "@id": "https://artist.bandcamp.com/track/fixture-track",
      name: "Fixture Track",
      additionalProperty: [
        { name: "item_type", value: "t" },
        { name: "item_id", value: "101" },
        { name: "selling_band_id", value: "303" }
      ],
      offers: { price: "1.50", priceCurrency: "AUD" }
    },
    {
      "@id": "https://artist.bandcamp.com/album/fixture-album",
      name: "Fixture Album",
      additionalProperty: [
        { name: "item_type", value: "a" },
        { name: "item_id", value: "202" },
        { name: "selling_band_id", value: "303" }
      ],
      offers: { price: "9.00", priceCurrency: "AUD" }
    }
  ]
};

const playlistTralbumFixture = {
  artist: "Fixture Artist",
  current: { title: "Fixture Album", artist: "Fixture Artist", featured_track_id: 101 },
  trackinfo: [
    { track_id: 101, title: "Fixture Track", duration: 181, file: { "mp3-128": "https://t4.bcbits.com/stream/refreshed-fixture" } }
  ]
};

let playlistFetchFailuresRemaining = 0;
let collectionFetchCalls = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes("/api/fancollection/1/search_items")) {
    collectionFetchCalls += 1;
    return {
      ok: true,
      async json() {
        return {
          tralbums: [{ item_type: "track", item_id: 101, tralbum_type: "t", tralbum_id: 101, album_id: 202, band_id: 303 }]
        };
      }
    };
  }
  if (String(url).includes("retry-track") && playlistFetchFailuresRemaining-- > 0) {
    throw new Error("temporary network failure");
  }
  return {
    ok: true,
    async text() {
      const tralbum = String(url).includes("free-track")
        ? { artist: "Fixture Artist", FREE: 1, current: { id: 404, type: "track", title: "Free Track", minimum_price: 1.5, download_pref: 1 } }
        : playlistTralbumFixture;
      return `<meta property="og:image" content="//f4.bcbits.com/img/a-fixture_10.jpg"><script data-band-currency="AUD"></script><script data-tralbum='${JSON.stringify(tralbum)}' data-cart='{&quot;currency&quot;:&quot;USD&quot;}'></script><li class="buyItem digital"><button class="buy-link">Free Download</button></li><script type="application/ld+json">${JSON.stringify(digitalOfferFixture)}</script>`;
    }
  };
};

globalThis.chrome = {
  runtime: {
    id: "fixture-extension",
    getURL: (path) => `chrome-extension://fixture-extension/${path}`,
    getContexts: async (query) => {
      if (query?.contextTypes?.includes("OFFSCREEN_DOCUMENT") && offscreenContextGate) {
        const gate = offscreenContextGate;
        offscreenContextGate = null;
        gate.entered();
        await gate.wait;
      }
      return query?.contextTypes?.includes("OFFSCREEN_DOCUMENT") && offscreenCreated
        ? [{ contextType: "OFFSCREEN_DOCUMENT" }]
        : [];
    },
    onMessage: { addListener(listener) { runtimeListener = listener; } },
    onInstalled: { addListener(listener) { installedListener = listener; } },
    async sendMessage(message) {
      if (message.target === "offscreen") {
        offscreenMessages.push(message);
        if (message.type === "BANDCAMP_HUB_OFFSCREEN_RESTORE" && offscreenRestoreGate) await offscreenRestoreGate;
        const previous = message.state || session.bandcampHubPlayback || {};
        const disabled = message.type.endsWith("DISABLE");
        const paused = message.type.endsWith("PAUSE") || message.type.endsWith("PLAY_PAUSE");
        return {
          ok: true,
          state: {
            ...previous,
            enabled: !disabled,
            status: disabled ? "idle" : paused ? "paused" : previous.status || "paused",
            isPlaying: false,
            queue: message.queue || previous.queue || [],
            index: message.index ?? previous.index ?? 0,
            track: message.queue?.[message.index || 0] || previous.track || null
          }
        };
      }
      return { ok: true };
    }
  },
  offscreen: {
    async createDocument(details) {
      offscreenCreateCalls += 1;
      offscreenCreateDetails = details;
      offscreenCreated = true;
    },
    async closeDocument() {
      offscreenCreated = false;
    }
  },
  storage: {
    local: {
      async get(key) {
        if (Array.isArray(key)) return Object.fromEntries(key.map((name) => [name, local[name]]));
        return { [key]: local[key] };
      },
      async set(values) { Object.assign(local, values); },
      async clear() {
        for (const key of Object.keys(local)) delete local[key];
      }
    },
    session: {
      async get(key) { return { [key]: session[key] }; },
      async set(values) { Object.assign(session, values); },
      async remove(key) { delete session[key]; },
      async clear() {
        for (const key of Object.keys(session)) delete session[key];
      }
    }
  },
  tabs: {
    onRemoved: { addListener(listener) { tabRemovedListeners.push(listener); } },
    onUpdated: { addListener(listener) { tabUpdatedListener = listener; } },
    async query() { return bandcampTabs; },
    async create(details) {
      createdBackgroundTab = { id: details.active === false ? 20 : 19, ...details };
      return createdBackgroundTab;
    },
    async get(tabId) {
      if (tabId === 7) return { id: 7, windowId: 1, status: "complete", url: "https://artist.bandcamp.com/album/fixture" };
      return tabId === 20
        ? { id: 20, status: "complete", url: "https://artist.bandcamp.com/album/fixture-album" }
        : { id: tabId, status: "complete", url: "https://artist.bandcamp.com/album/fixture" };
    },
    async remove(tabId) { removedTabId = tabId; },
    async reload(tabId) { reloadedTabIds.push(tabId); },
    async update(tabId, details) {
      tabUpdates.push({ tabId, details });
      return { id: tabId, ...details };
    },
    async sendMessage(tabId, message) {
      tabMessageCalls += 1;
      tabMessages.push({ tabId, message });
      if (!injected) throw new Error("No receiver");
      return { ok: true };
    }
  },
  windows: {
    async get(windowId) { return { id: windowId, type: "normal" }; },
    async getLastFocused() { return { id: 1, type: "normal" }; },
    async update(windowId, details) {
      windowUpdates.push({ windowId, details });
      return { id: windowId, ...details };
    }
  },
  scripting: {
    async executeScript(details) {
      injected = true;
      injectedFiles = details.files || [];
    }
  },
  commands: { onCommand: { addListener(listener) { commandListener = listener; } } }
};

await import(`../src/background/index.js?smoke=${Date.now()}`);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(reloadedTabIds, [7], "a newly loaded extension context must refresh existing Bandcamp tabs once");
assert.equal(session.bandkitRuntimeContextReady, true);
reloadedTabIds.length = 0;

function send(message, sender) {
  return new Promise((resolve) => {
    const keepsChannelOpen = runtimeListener(message, sender, resolve);
    assert.equal(keepsChannelOpen, true);
  });
}

let activationResponse = await send({ type: "BANDCAMP_HUB_GET_ENABLED" }, {
  id: "fixture-extension",
  url: "chrome-extension://fixture-extension/popup.html"
});
assert.equal(activationResponse.enabled, true, "Bandkit must default to active");

local.bandcampHubBpmCorrections = { "id:101": 123.4 };
session.bandcampHubTrackAnalysisCache = { "id:101": { bpm: 123.4, key: { camelot: "8A" }, cachedAt: 1 } };
let analysisStorageResponse = await send({ type: "BANDCAMP_HUB_OFFSCREEN_GET_ANALYSIS_STORAGE" }, {
  url: "chrome-extension://fixture-extension/offscreen.html"
});
assert.deepEqual(analysisStorageResponse.bpmCorrections, local.bandcampHubBpmCorrections);
assert.deepEqual(analysisStorageResponse.trackAnalysisCache, session.bandcampHubTrackAnalysisCache);
analysisStorageResponse = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_SET_ANALYSIS_STORAGE",
  bpmCorrections: { "id:202": 128 },
  trackAnalysisCache: { "id:202": { bpm: 128, key: { camelot: "9A" }, cachedAt: 2 } }
}, { url: "chrome-extension://fixture-extension/offscreen.html" });
assert.equal(analysisStorageResponse.ok, true);
assert.deepEqual(local.bandcampHubBpmCorrections, { "id:202": 128 });
assert.deepEqual(session.bandcampHubTrackAnalysisCache, { "id:202": { bpm: 128, key: { camelot: "9A" }, cachedAt: 2 } });
const originalAnalysisSessionSet = chrome.storage.session.set;
let delayedAnalysisWrites = 0;
chrome.storage.session.set = async (values) => {
  delayedAnalysisWrites += 1;
  if (delayedAnalysisWrites === 1) await new Promise((resolve) => setTimeout(resolve, 30));
  Object.assign(session, values);
};
await Promise.all([
  send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_ANALYSIS_STORAGE", trackAnalysisCache: { old: { bpm: 90 } } }, {
    url: "chrome-extension://fixture-extension/offscreen.html"
  }),
  send({ type: "BANDCAMP_HUB_OFFSCREEN_SET_ANALYSIS_STORAGE", trackAnalysisCache: { newest: { bpm: 120 } } }, {
    url: "chrome-extension://fixture-extension/offscreen.html"
  })
]);
assert.deepEqual(session.bandcampHubTrackAnalysisCache, { newest: { bpm: 120 } },
  "analysis cache writes must preserve request order when an earlier storage operation is slower");
chrome.storage.session.set = originalAnalysisSessionSet;
analysisStorageResponse = await send({ type: "BANDCAMP_HUB_OFFSCREEN_GET_ANALYSIS_STORAGE" }, {
  url: "https://artist.bandcamp.com/album/fixture"
});
assert.equal(analysisStorageResponse.ok, false, "Bandcamp pages must not receive the offscreen storage bridge");

let response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
  queue: [
    { title: "Allowed", url: "https://t4.bcbits.com/stream/allowed" },
    { title: "Rejected", url: "https://example.com/stream/rejected" }
  ],
  index: 0
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.state.queue.length, 1);
const playbackQueue = response.state.queue;
assert.equal(offscreenCreated, true);
assert.equal(offscreenCreateCalls, 1);
assert.deepEqual(offscreenCreateDetails.reasons, ["BLOBS", "WORKERS"]);

let releaseOlderEnable;
let markOlderEnableEntered;
const olderEnableEntered = new Promise((resolve) => { markOlderEnableEntered = resolve; });
offscreenContextGate = {
  entered: markOlderEnableEntered,
  wait: new Promise((resolve) => { releaseOlderEnable = resolve; })
};
offscreenMessages.length = 0;
const olderEnable = send({
  type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
  queue: [{ title: "Older", url: "https://t4.bcbits.com/stream/older" }],
  index: 0,
  autoplay: true
}, { url: "https://artist.bandcamp.com/album/fixture" });
await olderEnableEntered;
const newerEnable = await send({
  type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
  queue: [{ title: "Newer", url: "https://t4.bcbits.com/stream/newer" }],
  index: 0,
  autoplay: true
}, { url: "https://artist.bandcamp.com/album/fixture" });
releaseOlderEnable();
const staleEnable = await olderEnable;
assert.equal(newerEnable.state.track.title, "Newer");
assert.equal(staleEnable.stale, true, "an older enable request that finishes setup last must be discarded");
assert.deepEqual(
  offscreenMessages.filter((message) => message.type === "BANDCAMP_HUB_OFFSCREEN_ENABLE").map((message) => message.queue[0].title),
  ["Newer"],
  "rapid A-to-B playback must never dispatch A after B"
);

offscreenCreated = false;
session.bandcampHubPlayback = {
  enabled: true,
  status: "playing",
  isPlaying: true,
  currentTime: 43,
  index: 0,
  queue: playbackQueue
};
offscreenMessages.length = 0;
const offscreenCreateCallsBeforeConcurrentCommands = offscreenCreateCalls;
const [resumedPlayback, advancedPlayback] = await Promise.all([
  send({ type: "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE" }, { url: "https://artist.bandcamp.com/album/fixture" }),
  send({ type: "BANDCAMP_HUB_SEAMLESS_NEXT" }, { url: "https://artist.bandcamp.com/album/fixture" })
]);
assert.equal(resumedPlayback.ok, true);
assert.equal(advancedPlayback.ok, true);
assert.equal(offscreenCreateCalls, offscreenCreateCallsBeforeConcurrentCommands + 1, "concurrent commands must share one offscreen recreation");
assert.equal(offscreenMessages.filter((message) => message.type === "BANDCAMP_HUB_OFFSCREEN_RESTORE").length, 1);
assert.equal(offscreenMessages[0].state.currentTime, 43);
assert.equal(offscreenMessages[0].state.isPlaying, true);
assert.ok(offscreenMessages.some((message) => message.type === "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE"));
assert.ok(offscreenMessages.some((message) => message.type === "BANDCAMP_HUB_OFFSCREEN_NEXT"));

offscreenCreated = false;
offscreenMessages.length = 0;
await send({ type: "BANDCAMP_HUB_SEAMLESS_ENABLE", queue: playbackQueue, index: 0, autoplay: true },
  { url: "https://artist.bandcamp.com/album/fixture" });
assert.deepEqual(offscreenMessages.map((message) => message.type), ["BANDCAMP_HUB_OFFSCREEN_ENABLE"],
  "a cold album selection must start directly without loading the previous saved stream");

offscreenCreated = false;
offscreenMessages.length = 0;
let releaseOldRestore;
offscreenRestoreGate = new Promise((resolve) => { releaseOldRestore = resolve; });
const oldResume = send({ type: "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE" }, { url: "https://artist.bandcamp.com/album/fixture" });
for (let attempt = 0; attempt < 20 && !offscreenMessages.length; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(offscreenMessages[0]?.type, "BANDCAMP_HUB_OFFSCREEN_RESTORE");
const replacement = await Promise.race([
  send({ type: "BANDCAMP_HUB_SEAMLESS_ENABLE", queue: playbackQueue, index: 0, autoplay: true },
    { url: "https://artist.bandcamp.com/album/fixture" }),
  new Promise((resolve) => setTimeout(() => resolve(null), 100))
]);
releaseOldRestore();
offscreenRestoreGate = null;
await oldResume;
assert.equal(replacement?.ok, true, "a fresh album click must bypass an already-stalled saved-track restoration");
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_ENABLE",
  "an old resume command must not pause the new album after its slow restoration finishes");

response = await send({
  type: "BANDCAMP_HUB_GET_SEAMLESS_STATE"
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.state.enabled, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_GET_STATE");

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_SET_DJ",
  rate: 1.01,
  preservePitch: true,
  filterValue: -0.5,
  gainDb: -3,
  eqLowDb: 3,
  eqMidDb: -2,
  eqHighDb: 1
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_SET_DJ");
assert.equal(offscreenMessages.at(-1).filterValue, -0.5);
assert.equal(offscreenMessages.at(-1).gainDb, -3);
assert.equal(offscreenMessages.at(-1).eqLowDb, 3);
assert.equal(offscreenMessages.at(-1).eqMidDb, -2);
assert.equal(offscreenMessages.at(-1).eqHighDb, 1);

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_SCRATCH",
  active: true,
  multiplier: 1.25
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_SCRATCH");
assert.equal(offscreenMessages.at(-1).active, true);
assert.equal(offscreenMessages.at(-1).multiplier, 1.25);

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_SET_LOOP",
  beats: 8,
  bpm: 128
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_SET_LOOP");
assert.equal(offscreenMessages.at(-1).beats, 8);
assert.equal(offscreenMessages.at(-1).bpm, 128);

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_SET_LOOP",
  beats: 1 / 16,
  bpm: 128
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).beats, 1 / 16);

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_RESET_BPM"
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_RESET_BPM");

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_SET_RATE",
  rate: 0.35,
  preservePitch: true
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_SET_RATE");
assert.equal(offscreenMessages.at(-1).rate, 0.35);

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
  items: [{ playlistItemId: "playlist-one", id: "101", title: "Fixture Track", artist: "Bandcamp", pageUrl: "https://artist.bandcamp.com/track/fixture-track" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].url, "https://t4.bcbits.com/stream/refreshed-fixture");
assert.equal(response.items[0].duration, 181);
assert.equal(response.items[0].artist, "Fixture Artist");
assert.equal(response.items[0].art, "https://f4.bcbits.com/img/a-fixture_10.jpg");

playlistFetchFailuresRemaining = 1;
response = await send({
  type: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
  items: [{ playlistItemId: "playlist-retry", id: "101", title: "Fixture Track", artist: "Bandcamp", pageUrl: "https://artist.bandcamp.com/track/retry-track" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].url, "https://t4.bcbits.com/stream/refreshed-fixture",
  "playlist hydration must retry a transient Bandcamp page failure before marking the track unavailable");
assert.equal(playlistFetchFailuresRemaining, -1);

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
  items: [{ playlistItemId: "missing-stable", id: "999", title: "Missing Stable Track", album: "Fixture Album", pageUrl: "https://artist.bandcamp.com/album/fixture-album" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].url, undefined);
assert.ok(response.items[0].restoreError.includes("not currently streamable"),
  "a missing stable track id must not fall back to the album's featured stream");

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
  items: [{ playlistItemId: "missing-specific", id: "missing-specific", title: "Missing Specific Track", album: "Fixture Album", pageUrl: "https://artist.bandcamp.com/album/fixture-album" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].url, undefined);
assert.ok(response.items[0].restoreError.includes("not currently streamable"),
  "a missing specific track title must not fall back to an unrelated featured stream");

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
  items: [{ playlistItemId: "playlist-custom", id: "Fixture Album", title: "Fixture Album", pageUrl: "https://custom-label.example/album/fixture-album" }]
}, { url: "https://bandcamp.com/discover" });
assert.equal(response.ok, true);
assert.equal(response.items[0].pageUrl, "https://artist.bandcamp.com/album/fixture-album");
assert.equal(response.items[0].title, "Fixture Track");
assert.equal(response.items[0].album, "Fixture Album");
assert.equal(response.items[0].url, "https://t4.bcbits.com/stream/refreshed-fixture");
assert.equal(removedTabId, 20);
removedTabId = null;

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_CART_METADATA",
  items: [{ url: "https://artist.bandcamp.com/album/fixture-album" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].artist, "Fixture Artist");

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_CART_METADATA",
  items: [{ url: "https://artist.bandcamp.com/track/free-track" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].itemType, "track");
assert.equal(response.items[0].minimumPrice, 1.5, "free tracks may expose an internal non-zero price that must not be shown to the user");
assert.equal(response.items[0].currency, "AUD");
assert.equal(response.items[0].purchaseStatus, "free");

const replacementQueue = [{ id: "new-track", title: "New Track", url: "https://t4.bcbits.com/stream/new-track" }];
response = await send({
  type: "BANDCAMP_HUB_SET_NOW_PLAYING",
  playlist: replacementQueue,
  playlistMode: "browse",
  revision: 100,
  transitionTrackKey: "new-track",
  transitionExpiresAt: Date.now() + 30_000
}, { tab: { id: 7 }, url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
response = await send({
  type: "BANDCAMP_HUB_SET_NOW_PLAYING",
  playlist: [{ id: "old-track", title: "Old Track", url: "https://t4.bcbits.com/stream/old-track" }],
  playlistMode: "browse",
  revision: 99
}, { tab: { id: 8 }, url: "https://other.bandcamp.com/album/old" });
assert.equal(response.stale, true, "a delayed tab must not replace a newer Now Playing revision");
response = await send({
  type: "BANDCAMP_HUB_SET_NOW_PLAYING",
  playlist: replacementQueue,
  playlistMode: "browse",
  revision: 100,
  transitionTrackKey: ""
}, { tab: { id: 8 }, url: "https://other.bandcamp.com/album/old" });
assert.equal(response.ok, true, "the winning revision may clear its transition after playback commits");
response = await send({ type: "BANDCAMP_HUB_GET_NOW_PLAYING" }, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.playlist[0].title, "New Track");
assert.equal(response.revision, 100);
assert.equal(response.transitionTrackKey, "");

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE",
  queue: [{ playlistItemId: "playlist-one", title: "Fixture Track", url: "https://t4.bcbits.com/stream/refreshed-fixture" }],
  expectedTrack: { id: "fixture-track", title: "Fixture Track", url: "https://t4.bcbits.com/stream/refreshed-fixture" },
  selectedPlaylistItemId: "playlist-one",
  autoplay: true
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE");
assert.equal(offscreenMessages.at(-1).queue[0].playlistItemId, "playlist-one");
assert.equal(offscreenMessages.at(-1).expectedTrack.id, "fixture-track",
  "queue updates must carry the playback snapshot they were based on");
assert.equal(offscreenMessages.at(-1).selectedPlaylistItemId, "playlist-one");
assert.equal(offscreenMessages.at(-1).autoplay, true);

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX",
  index: 0,
  autoplay: true
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX");

response = await send({
  type: "BANDCAMP_HUB_CLEAR_PLAYBACK"
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_DISABLE");
assert.ok(tabMessages.some(({ message }) => message.type === "BANDCAMP_HUB_PLAYBACK_CLEARED"));

const savedStateBeforeDeactivation = local.bandcampHubState;
activationResponse = await send({ type: "BANDCAMP_HUB_SET_ENABLED", enabled: false }, {
  id: "fixture-extension",
  url: "chrome-extension://fixture-extension/popup.html"
});
assert.equal(activationResponse.enabled, false);
assert.equal(local.bandcampHubEnabled, false);
assert.equal(local.bandcampHubState, savedStateBeforeDeactivation, "deactivation must preserve user settings and data");
assert.equal(offscreenCreated, true, "deactivation must stop playback without dropping the reusable hidden playback context");
assert.equal(session.bandcampHubPlayback.enabled, false);
assert.ok(reloadedTabIds.includes(7), "open Bandcamp tabs must reload into the inactive state");

response = await send({ type: "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE" }, {
  url: "https://artist.bandcamp.com/album/fixture"
});
assert.equal(response.ok, false);
assert.equal(response.error, "Bandkit is deactivated.");

activationResponse = await send({ type: "BANDCAMP_HUB_SET_ENABLED", enabled: true }, {
  id: "fixture-extension",
  url: "chrome-extension://fixture-extension/popup.html"
});
assert.equal(activationResponse.enabled, true);
assert.equal(local.bandcampHubEnabled, true);

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_CART_ITEMS",
  items: [
    { title: "Fixture Track", url: "https://artist.bandcamp.com/track/fixture-track", requestedItemType: "t" },
    { title: "Fixture Track", album: "Fixture Album", url: "https://artist.bandcamp.com/track/fixture-track", requestedItemType: "a" }
  ]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].restore.item_type, "t");
assert.equal(response.items[0].restore.item_id, 101);
assert.equal(response.items[1].restore.item_type, "a");
assert.equal(response.items[1].restore.item_id, 202);
assert.equal(response.items[1].restore.url, "https://artist.bandcamp.com/album/fixture-album");

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_COLLECTION_MEMBERSHIP",
  fanId: 77,
  bandId: 303,
  searchKey: "Fixture Artist",
  itemType: "album",
  itemId: 202,
  albumId: 202
}, { url: "https://artist.bandcamp.com/album/fixture-album" });
assert.equal(response.ok, true);
assert.equal(response.owned, true, "a purchased track must mark its parent album as in the collection");

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_COLLECTION_MEMBERSHIP",
  fanId: 77,
  bandId: 303,
  searchKey: "Fixture Artist",
  itemType: "album",
  itemId: 999,
  albumId: 999
}, { url: "https://artist.bandcamp.com/album/wishlist-only" });
assert.equal(response.ok, true);
assert.equal(response.owned, false, "wishlist-only releases must not inherit another album's collection state");
assert.equal(collectionFetchCalls, 1, "collection membership lookups should share the short-lived fan collection cache");

response = await send({ type: "BANDCAMP_HUB_OPEN_COMPONENT_REFERENCE", url: "https://example.com/ignored" }, {
  id: "fixture-extension", url: "https://bandcamp.com/discover"
});
assert.equal(response.ok, true);
assert.equal(createdBackgroundTab.url, "chrome-extension://fixture-extension/component-reference.html", "The hidden command must open only the packaged reference");
assert.equal(createdBackgroundTab.active, true);
response = await send({ type: "BANDCAMP_HUB_OPEN_COMPONENT_REFERENCE" }, { id: "another-extension", url: "https://bandcamp.com/discover" });
assert.equal(response.ok, false);

response = await send({
  type: "BANDCAMP_HUB_OPEN_BACKGROUND_TAB",
  url: "https://artist.bandcamp.com/track/fixture-track?bandkit_wishlist_key=fixture#bandkit-wishlist"
}, { url: "https://bandcamp.com/discover" });
assert.equal(response.ok, true);
assert.equal(createdBackgroundTab.active, false);
assert.equal(createdBackgroundTab.id, 20);

response = await send({
  type: "BANDCAMP_HUB_OPEN_BACKGROUND_TAB",
  url: "https://artist.bandcamp.com/album/fixture-album#bandkit-cart"
}, { url: "https://bandcamp.com/discover" });
assert.equal(response.ok, true);
assert.equal(createdBackgroundTab.active, true);

response = await send({
  type: "BANDCAMP_HUB_WISHLIST_RESULT",
  key: "fixture-key",
  success: true
}, { url: "https://artist.bandcamp.com/track/fixture-track", tab: { id: 20 } });
assert.equal(response.ok, true);
assert.equal(removedTabId, 20);

session.bandcampHubPlayback = { enabled: true, status: "paused" };
response = await send({
  type: "BANDCAMP_HUB_DELETE_ALL_DATA"
}, { url: "https://artist.bandcamp.com/track/fixture-track", tab: { id: 7 } });
assert.equal(response.ok, true);
assert.deepEqual(local, {});
assert.deepEqual(session, {});
assert.equal(offscreenCreated, false, "deleting all browser data must close the playback context without deleting downloaded backups");
assert.ok(tabMessages.some(({ message }) => message.type === "BANDCAMP_HUB_PLAYBACK_CLEARED"));

response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_STATE",
  state: { enabled: true, status: "playing", queue: playbackQueue }
}, { url: "chrome-extension://fixture-extension/offscreen.html" });
assert.equal(response.ok, true);
assert.equal(session.bandcampHubPlayback.status, "playing");

const originalSessionSet = chrome.storage.session.set;
let delayedStateWrites = 0;
chrome.storage.session.set = async (values) => {
  delayedStateWrites += 1;
  if (delayedStateWrites === 1) await new Promise((resolve) => setTimeout(resolve, 30));
  Object.assign(session, values);
};
tabMessages.length = 0;
await Promise.all([
  send({ type: "BANDCAMP_HUB_OFFSCREEN_STATE", state: { enabled: true, status: "loading", queue: playbackQueue } }, { url: "chrome-extension://fixture-extension/offscreen.html" }),
  send({ type: "BANDCAMP_HUB_OFFSCREEN_STATE", state: { enabled: true, status: "playing", queue: playbackQueue } }, { url: "chrome-extension://fixture-extension/offscreen.html" })
]);
assert.equal(session.bandcampHubPlayback.status, "playing", "the newest offscreen state must win even when an earlier storage write is slower");
assert.deepEqual(tabMessages
  .filter(({ message }) => message.type === "BANDCAMP_HUB_SEAMLESS_STATE")
  .map(({ message }) => message.state.status), ["loading", "playing"],
"offscreen state broadcasts must preserve arrival order");
chrome.storage.session.set = originalSessionSet;

tabMessages.length = 0;
await Promise.all([0.1, 0.4, 0.9].map((level) => send({
  type: "BANDCAMP_HUB_OFFSCREEN_VISUALIZER",
  signal: { level, spectrum: [Math.round(level * 255)] }
}, { url: "chrome-extension://fixture-extension/offscreen.html" })));
await new Promise((resolve) => setTimeout(resolve, 45));
const visualizerMessages = tabMessages.filter(({ message }) => message.type === "BANDCAMP_HUB_VISUALIZER_STATE");
assert.equal(visualizerMessages.length, 1,
  "visualizer broadcasts must coalesce queued analyzer samples instead of replaying a burst");
assert.equal(visualizerMessages[0].message.signal.level, 0.9,
  "the coalesced broadcast must deliver the newest analyzer sample");

// Reproduce IPC acknowledgements that stay pending across multiple FFT frames.
// The old global Promise.allSettled gate delivered only the first sample here.
const originalTabSendMessage = chrome.tabs.sendMessage;
const delayedVisualizerAcks = [];
tabMessages.length = 0;
chrome.tabs.sendMessage = (tabId, message) => {
  if (message.type !== "BANDCAMP_HUB_VISUALIZER_STATE") return originalTabSendMessage(tabId, message);
  tabMessages.push({ tabId, message });
  return new Promise((resolve) => delayedVisualizerAcks.push(resolve));
};
for (const level of [0.2, 0.3, 0.5, 0.7, 0.8]) {
  await send({ type: "BANDCAMP_HUB_OFFSCREEN_VISUALIZER", signal: { level } },
    { url: "chrome-extension://fixture-extension/offscreen.html" });
  await new Promise((resolve) => setTimeout(resolve, 45));
}
assert.deepEqual(tabMessages.map(({ message }) => message.signal.level), [0.2, 0.3, 0.5, 0.7, 0.8],
  "Unresolved acknowledgements must not gate subsequent visualizer dispatches");
delayedVisualizerAcks.forEach((resolve) => resolve());
await Promise.resolve();
chrome.tabs.sendMessage = originalTabSendMessage;

offscreenCreated = true;
session.bandcampHubPlayback = {
  enabled: true,
  status: "playing",
  isPlaying: true,
  currentTime: 74,
  index: 0,
  queue: playbackQueue,
  track: playbackQueue[0]
};
offscreenMessages.length = 0;
bandcampTabs = [];
await Promise.all(tabRemovedListeners.map((listener) => listener(7, { isWindowClosing: false })));
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_PAUSE",
  "closing the final Bandcamp tab must explicitly pause background audio");
assert.equal(offscreenCreated, true, "last-tab pause must retain the offscreen queue for a later resume");
assert.equal(session.bandcampHubPlayback.status, "paused");
assert.equal(session.bandcampHubPlayback.currentTime, 74);
assert.deepEqual(session.bandcampHubPlayback.queue, playbackQueue);

session.bandcampHubPlayback = { ...session.bandcampHubPlayback, status: "playing", isPlaying: true };
offscreenMessages.length = 0;
await tabUpdatedListener(7, { url: "https://example.com/" });
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_PAUSE",
  "navigating the final Bandcamp tab away must also pause background audio");

bandcampTabs = [{ id: 7, url: "https://artist.bandcamp.com/album/fixture" }];
await commandListener("toggle-bandkit");
assert.equal(injected, true);
assert.deepEqual(injectedFiles, ["cart-autosave.js", "content.js"]);
assert.ok(tabMessageCalls >= 2);

reloadedTabIds.length = 0;
delete session.bandkitRuntimeContextReady;
await installedListener({ reason: "update" });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(reloadedTabIds, [7], "an extension reload must refresh open Bandcamp tabs into the new context");

console.log("background coordination smoke test passed");
