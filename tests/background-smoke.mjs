import assert from "node:assert/strict";

let runtimeListener;
let actionListener;
let offscreenCreated = false;
let injected = false;
let injectedFiles = [];
let tabMessageCalls = 0;
let createdBackgroundTab = null;
let removedTabId = null;
const offscreenMessages = [];
const session = {};
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
  trackinfo: [
    { track_id: 101, title: "Fixture Track", duration: 181, file: { "mp3-128": "https://t4.bcbits.com/stream/refreshed-fixture" } }
  ]
};

globalThis.fetch = async () => ({
  ok: true,
  async text() {
    return `<script data-tralbum='${JSON.stringify(playlistTralbumFixture)}'></script><script type="application/ld+json">${JSON.stringify(digitalOfferFixture)}</script>`;
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
    async createDocument() { offscreenCreated = true; }
  },
  storage: {
    session: {
      async get(key) { return { [key]: session[key] }; },
      async set(values) { Object.assign(session, values); }
    }
  },
  tabs: {
    async query() { return [{ id: 7 }]; },
    async create(details) { createdBackgroundTab = { id: 19, ...details }; return createdBackgroundTab; },
    async remove(tabId) { removedTabId = tabId; },
    async sendMessage() {
      tabMessageCalls += 1;
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
  action: { onClicked: { addListener(listener) { actionListener = listener; } } }
};

await import(`../background.js?smoke=${Date.now()}`);

function send(message, sender) {
  return new Promise((resolve) => {
    const keepsChannelOpen = runtimeListener(message, sender, resolve);
    assert.equal(keepsChannelOpen, true);
  });
}

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
  items: [{ playlistItemId: "playlist-one", id: "101", title: "Fixture Track", pageUrl: "https://artist.bandcamp.com/track/fixture-track" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].url, "https://t4.bcbits.com/stream/refreshed-fixture");
assert.equal(response.items[0].duration, 181);

response = await send({
  type: "BANDCAMP_HUB_RESOLVE_CART_METADATA",
  items: [{ url: "https://artist.bandcamp.com/album/fixture-album" }]
}, { url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(response.ok, true);
assert.equal(response.items[0].artist, "Fixture Artist");

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
assert.equal(createdBackgroundTab.id, 19);

response = await send({
  type: "BANDCAMP_HUB_WISHLIST_RESULT",
  key: "fixture-key",
  success: true
}, { url: "https://artist.bandcamp.com/track/fixture-track", tab: { id: 19 } });
assert.equal(response.ok, true);
await new Promise((resolve) => setTimeout(resolve, 1900));
assert.equal(removedTabId, 19);

response = await send({
  type: "BANDCAMP_HUB_OFFSCREEN_STATE",
  state: { enabled: true, status: "playing", queue: playbackQueue }
}, { url: "chrome-extension://fixture-extension/offscreen.html" });
assert.equal(response.ok, true);
assert.equal(session.bandcampHubPlayback.status, "playing");

await actionListener({ id: 7, url: "https://artist.bandcamp.com/album/fixture" });
assert.equal(injected, true);
assert.deepEqual(injectedFiles, ["cart-autosave.js", "content.js"]);
assert.ok(tabMessageCalls >= 2);

console.log("background coordination smoke test passed");
