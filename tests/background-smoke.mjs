import assert from "node:assert/strict";

let runtimeListener;
let commandListener;
let offscreenCreated = false;
let offscreenCreateCalls = 0;
let injected = false;
let injectedFiles = [];
let tabMessageCalls = 0;
const tabMessages = [];
let createdBackgroundTab = null;
let removedTabId = null;
const reloadedTabIds = [];
const offscreenMessages = [];
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

globalThis.fetch = async (url) => ({
  ok: true,
  async text() {
    const tralbum = String(url).includes("free-track")
      ? { artist: "Fixture Artist", current: { id: 404, type: "track", title: "Free Track", minimum_price: 0 } }
      : playlistTralbumFixture;
    return `<meta property="og:image" content="//f4.bcbits.com/img/a-fixture_10.jpg"><script data-tralbum='${JSON.stringify(tralbum)}' data-cart='{&quot;currency&quot;:&quot;AUD&quot;}'></script><script type="application/ld+json">${JSON.stringify(digitalOfferFixture)}</script>`;
  }
});

globalThis.chrome = {
  runtime: {
    id: "fixture-extension",
    getURL: (path) => `chrome-extension://fixture-extension/${path}`,
    getContexts: async () => offscreenCreated ? [{ contextType: "OFFSCREEN_DOCUMENT" }] : [],
    onMessage: { addListener(listener) { runtimeListener = listener; } },
    async sendMessage(message) {
      if (message.target === "offscreen") {
        offscreenMessages.push(message);
        return {
          ok: true,
          state: {
            enabled: true,
            status: message.type.endsWith("DISABLE") ? "idle" : "paused",
            queue: message.queue || [],
            index: message.index || 0,
            track: message.queue?.[message.index || 0] || null
          }
        };
      }
      return { ok: true };
    }
  },
  offscreen: {
    async createDocument() {
      offscreenCreateCalls += 1;
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
      async clear() {
        for (const key of Object.keys(session)) delete session[key];
      }
    }
  },
  tabs: {
    async query() { return [{ id: 7, url: "https://artist.bandcamp.com/album/fixture" }]; },
    async create(details) {
      createdBackgroundTab = { id: details.active === false ? 20 : 19, ...details };
      return createdBackgroundTab;
    },
    async get(tabId) {
      return tabId === 20
        ? { id: 20, status: "complete", url: "https://artist.bandcamp.com/album/fixture-album" }
        : { id: tabId, status: "complete", url: "https://artist.bandcamp.com/album/fixture" };
    },
    async remove(tabId) { removedTabId = tabId; },
    async reload(tabId) { reloadedTabIds.push(tabId); },
    async sendMessage(tabId, message) {
      tabMessageCalls += 1;
      tabMessages.push({ tabId, message });
      if (!injected) throw new Error("No receiver");
      return { ok: true };
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
const [resumedPlayback, advancedPlayback] = await Promise.all([
  send({ type: "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE" }, { url: "https://artist.bandcamp.com/album/fixture" }),
  send({ type: "BANDCAMP_HUB_SEAMLESS_NEXT" }, { url: "https://artist.bandcamp.com/album/fixture" })
]);
assert.equal(resumedPlayback.ok, true);
assert.equal(advancedPlayback.ok, true);
assert.equal(offscreenCreateCalls, 2, "concurrent commands must share one offscreen recreation");
assert.equal(offscreenMessages.filter((message) => message.type === "BANDCAMP_HUB_OFFSCREEN_RESTORE").length, 1);
assert.equal(offscreenMessages[0].state.currentTime, 43);
assert.equal(offscreenMessages[0].state.isPlaying, true);
assert.ok(offscreenMessages.some((message) => message.type === "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE"));
assert.ok(offscreenMessages.some((message) => message.type === "BANDCAMP_HUB_OFFSCREEN_NEXT"));

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
assert.equal(response.items[0].minimumPrice, 0, "name-your-price tracks must preserve an explicit zero minimum");
assert.equal(response.items[0].currency, "AUD");

response = await send({
  type: "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE",
  queue: [{ playlistItemId: "playlist-one", title: "Fixture Track", url: "https://t4.bcbits.com/stream/refreshed-fixture" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(offscreenMessages.at(-1).type, "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE");
assert.equal(offscreenMessages.at(-1).queue[0].playlistItemId, "playlist-one");

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
assert.equal(offscreenCreated, false, "deactivation must close background playback");
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

await commandListener("toggle-bandkit");
assert.equal(injected, true);
assert.deepEqual(injectedFiles, ["cart-autosave.js", "content.js"]);
assert.ok(tabMessageCalls >= 2);

console.log("background coordination smoke test passed");
