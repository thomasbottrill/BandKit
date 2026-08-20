window.fixtureDownloads = [];
window.fixtureShares = [];
if (location.search.includes("cart-roundtrip")) {
  Object.defineProperty(navigator, "canShare", { configurable: true, value: ({ files }) => files?.[0]?.type === "text/html" });
  Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.fixtureShares.push(data); } });
}
window.fixturePurchaseClicks = 0;
if (location.search.includes("queue-single-card-controls")) {
  const fixtureHeader = document.createElement("header");
  fixtureHeader.className = "fixture-stacking-header";
  fixtureHeader.style.cssText = "left:0;position:fixed;right:0;top:0;z-index:100!important";
  const fixtureMenu = document.querySelector(".menu-items");
  fixtureMenu.before(fixtureHeader);
  fixtureHeader.append(fixtureMenu);
  const fixtureSticky = document.createElement("div");
  fixtureSticky.className = "sticky stuck fixture-overlapping-sidebar";
  fixtureSticky.style.cssText = "background:transparent;height:100vh;pointer-events:auto;position:fixed;right:0;top:0;width:300px;z-index:100";
  document.body.append(fixtureSticky);
}
document.querySelector("#buyItem")?.addEventListener("click", () => { window.fixturePurchaseClicks += 1; });
if (location.search.includes("page-footer-space")) {
  const pageWrapper = document.createElement("div");
  pageWrapper.id = "propOpenWrapper";
  const pageBody = document.querySelector("#pgBd");
  pageBody.before(pageWrapper);
  pageWrapper.append(pageBody);
  const classicFooter = document.createElement("div");
  classicFooter.id = "pgFt";
  classicFooter.textContent = "Bandcamp footer";
  const pageFooter = document.createElement("page-footer");
  pageFooter.textContent = "Bandcamp logo";
  pageWrapper.append(classicFooter, pageFooter);
}
if (location.search.includes("header-shadow-cart")) {
  const menuBar = document.createElement("menu-bar");
  const menuShadow = menuBar.attachShadow({ mode: "open" });
  menuShadow.innerHTML = `<style>li.cart,li.cart[hidden],button[aria-label="Cart"],button[aria-label="Cart"][hidden]{display:flex!important}</style><ul><li class="cart"><button type="button" aria-label="Cart"><span>3</span></button></li></ul>`;
  document.body.prepend(menuBar);
  window.fixtureMenuShadow = menuShadow;
}
window.fixtureStored = (location.search.includes("cart-ui") || location.search.includes("cart-roundtrip")) ? {
  bandcampHubState: {
    dataFolderSetup: true,
    open: true,
    activeTab: "cart",
    cartView: "saved",
    selectedSavedCartId: null,
    cartSummary: { subtotal: 35.87, currency: "USD" },
    cart: [
      { id: "live-1", title: "USD Fixture Album", artist: "Fixture Artist", kind: "Digital album", price: 9, currency: "USD", art: "/tests/fixtures/assets/art-clouds.png", url: "https://fixture.bandcamp.com/album/usd" },
      { id: "live-2", title: "GBP Fixture Album", artist: "Fixture Artist", kind: "Digital album", price: 12, currency: "GBP", art: "/tests/fixtures/assets/art-meridian.png", url: "https://fixture.bandcamp.com/album/gbp-one" },
      { id: "live-3", title: "Another GBP Album", artist: "Fixture Artist", kind: "Digital album", price: 8, currency: "GBP", art: "/tests/fixtures/assets/art-velocity.png", url: "https://fixture.bandcamp.com/album/gbp-two" }
    ],
    savedCarts: [{
      id: "saved-fixture",
      name: "Bandcamp Friday shortlist",
      savedAt: "2026-08-01T09:30:00.000Z",
      summary: { subtotal: 35.87, currency: "USD" },
      items: [
        { id: "saved-1", title: "Cloud Studies", artist: "North Harbour", kind: "Digital album", price: 9, currency: "USD", art: "/tests/fixtures/assets/art-clouds.png", url: "https://fixture.bandcamp.com/album/cloud-studies" },
        { id: "saved-2", title: "Meridian Lines", artist: "Signal Field", kind: "Vinyl · Blue", price: 12, currency: "GBP", art: "/tests/fixtures/assets/art-meridian.png", url: "https://fixture.bandcamp.com/album/meridian-lines" },
        { id: "saved-3", title: "Velocity", artist: "Gaiko", kind: "Digital track", price: 8, currency: "GBP", art: "/tests/fixtures/assets/art-velocity.png", url: "https://fixture.bandcamp.com/track/velocity" }
      ]
    }],
    activity: []
  }
} : {};
if (location.search.includes("page-dj-persist")) {
  window.fixtureStored = { bandcampHubState: { dj: { pageOpen: true } } };
}
if (location.search.includes("single-track-cart")) {
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "cart", cartView: "current", cart: [], savedCarts: [] } };
}
if (location.search.includes("appearance-reskin")) {
  window.fixtureStored = { bandcampHubState: {
    open: true,
    activeTab: "settings",
    appearance: {
      pageAware: false,
      applyToPage: true,
      preset: "custom",
      customAccent: "#202020",
      customSurface: "#151515",
      customCard: "#191919",
      customPageBackground: "#f7f7f7",
      customPageSurface: "#111111",
      customNavbar: "#272044",
      customText: "#222222",
      customSecondaryText: "#b0b0b0",
      savedThemes: []
    }
  } };
}
if (location.search.includes("theme-management")) {
  window.fixtureStored = { bandcampHubState: {
    dataFolderSetup: true,
    open: true,
    activeTab: "settings",
    appearance: {
      pageAware: false,
      applyToPage: true,
      preset: "saved-fixture-theme",
      customAccent: "#7c3aed",
      customScrubAccent: "#ec4899",
      customSurface: "#18181f",
      customCard: "#24242e",
      customPageBackground: "#0d0d12",
      customPageSurface: "#18181f",
      customNavbar: "#121218",
      customText: "#f8fafc",
      customSecondaryText: "#cbd5e1",
      savedThemes: [{
        id: "saved-fixture-theme",
        label: "Fixture Night",
        accent: "#7c3aed",
        scrubAccent: "#ec4899",
        surface: "#18181f",
        card: "#24242e",
        background: "#0d0d12",
        pageSurface: "#18181f",
        navbar: "#121218",
        text: "#f8fafc",
        secondaryText: "#cbd5e1"
      }]
    }
  } };
}
if (location.search.includes("panel-header-unify")) {
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "settings" } };
}
if (location.search.includes("feed-home-setting")) {
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "settings" } };
}
if (location.search.includes("header-shadow-cart")) {
  window.fixtureStored = { bandcampHubState: {
    open: true,
    activeTab: "settings",
    appearance: { hidePageCart: true, hideHeaderCart: true }
  } };
}
if (location.search.includes("queue-footer-navigation") || location.search.includes("queue-row-controls") || location.search.includes("queue-single-card-controls")) {
  window.fixtureQueueNavigationTracks = [
    { id: "queue-one", playlistItemId: "playlist-one", title: "Queue One", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/queue-one", duration: 120, url: "https://t4.bcbits.com/stream/queue-one" },
    { id: "queue-two", playlistItemId: "playlist-two", title: "Queue Two", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/queue-two", duration: 130, url: "https://t4.bcbits.com/stream/queue-two" }
  ];
  if (location.search.includes("queue-single-card-controls")) window.fixtureQueueNavigationTracks.length = 1;
  window.fixtureQueueNavigationIndex = 0;
  window.fixtureQueuePlaying = true;
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "nowPlaying", playlistMode: "manual", playlist: window.fixtureQueueNavigationTracks } };
}
if (location.search.includes("queue-skip-unavailable")) {
  window.fixtureQueueSkipTracks = [
    { id: "skip-one", playlistItemId: "skip-one", title: "Skip One", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-one", duration: 120, url: "https://t4.bcbits.com/stream/skip-one" },
    { id: "skip-missing", playlistItemId: "skip-missing", title: "Skip Missing", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-missing", duration: 130, url: "", restoreError: "Unavailable" },
    { id: "skip-three", playlistItemId: "skip-three", title: "Skip Three", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/skip-three", duration: 140, url: "https://t4.bcbits.com/stream/skip-three" }
  ];
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "nowPlaying", playlistMode: "manual", playlist: window.fixtureQueueSkipTracks } };
}
if (location.search.includes("last-item-clear")) {
  window.fixtureLastItem = { id: "last-item", playlistItemId: "playlist-last", title: "Last Queue Item", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/last-item", duration: 120, url: "https://t4.bcbits.com/stream/last-item" };
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "nowPlaying", playlistMode: "manual", playlist: [window.fixtureLastItem] } };
}
if (location.search.includes("cross-tab-queue-sync")) {
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "nowPlaying", playlistMode: "manual", playlist: [
    { id: "cross-tab-one", playlistItemId: "cross-tab-one", title: "Cross-tab One", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/cross-tab-one", duration: 120, url: "https://t4.bcbits.com/stream/cross-tab-one" }
  ] } };
}
if (location.search.includes("collection-now-playing-append") || location.search.includes("collection-rapid-switch")) {
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "nowPlaying", playlist: [] } };
  document.body.insertAdjacentHTML("beforeend", `
    <div id="collection-items"><div class="collection-grid" data-ismain="true" data-iswish="false">
      <div class="collection-item-container" data-trackid="collection-album" data-title="Head Above The Clouds" data-tralbumtype="a">
        <button class="track_play_auxiliary" type="button">Play Honey Be</button>
        <div class="collection-item-gallery-container" data-trackid="honey-be" data-item-json='{"featured_track_id":"honey-be","featured_track_title":"Honey Be","featured_track_duration":203,"item_title":"Head Above The Clouds","item_url":"https://fixture.bandcamp.com/album/head-above-the-clouds","band_name":"Micah Jey"}'><a class="item-link" href="https://fixture.bandcamp.com/album/head-above-the-clouds"></a><img class="collection-item-art" src="/tests/fixtures/assets/art-clouds.png"><div class="collection-title-details"><span class="collection-item-title">Head Above The Clouds</span><span class="collection-item-artist">Micah Jey</span></div></div>
        <div class="bottom-owner-controls"><div class="redownload-item"><a href="https://fixture.bandcamp.com/download/honey-be">Download</a></div></div>
      </div>
      <div class="collection-item-container" data-trackid="second-track" data-title="Second Track" data-tralbumtype="t">
        <button class="track_play_auxiliary" type="button">Play Second Track</button>
        <div class="collection-item-gallery-container"><a class="item-link" href="https://fixture.bandcamp.com/track/second-track"></a><img class="collection-item-art" src="/tests/fixtures/assets/art-meridian.png"><div class="collection-title-details"><span class="collection-item-title">Second Track</span><span class="collection-item-artist">Fixture Artist</span></div></div>
        <div class="bottom-owner-controls"><div class="redownload-item"><a href="https://fixture.bandcamp.com/download/second-track">Download</a></div></div>
      </div>
    </div></div>`);
}
if (location.search.includes("page-playlist-placement") || location.search.includes("page-playing-sync") || location.search.includes("page-unrelated-playing-sync") || location.search.includes("page-stale-playback") || location.search.includes("page-unknown-track") || location.search.includes("album-switch-performance")) {
  document.querySelector(".fixture-track-list").hidden = false;
  const tralbumScript = document.querySelector("script[data-tralbum]");
  const tralbum = JSON.parse(tralbumScript.getAttribute("data-tralbum"));
  tralbum.trackinfo[0].file = { "mp3-128": "https://t4.bcbits.com/stream/fixture-track" };
  tralbum.trackinfo[1].file = { "mp3-128": "https://t4.bcbits.com/stream/next-fixture-track" };
  tralbumScript.setAttribute("data-tralbum", JSON.stringify(tralbum));
}
if (location.search.includes("album-switch-performance")) {
  window.fixtureAlbumPerformanceQueue = [
    { id: "1", playlistItemId: "album-track-one", title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track", duration: 180, url: "https://t4.bcbits.com/stream/fixture-track" },
    { id: "2", playlistItemId: "album-track-two", title: "Next Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/next-fixture-track", duration: 200, url: "https://t4.bcbits.com/stream/next-fixture-track" }
  ];
  window.fixtureStored = { bandcampHubState: { open: true, activeTab: "nowPlaying", playlist: window.fixtureAlbumPerformanceQueue } };
  window.fixtureAlbumSwitchStartedAt = 0;
  window.fixtureAlbumSwitchFinishedAt = 0;
  const nativeMedia = [document.querySelector(".inline_player audio"), document.createElement("audio")];
  document.querySelector(".inline_player").append(nativeMedia[1]);
  window.fixtureNativeMediaPaused = [true, true];
  window.fixtureNativeMediaPauseCounts = [0, 0];
  nativeMedia.forEach((media, index) => {
    Object.defineProperty(media, "paused", { configurable: true, get: () => window.fixtureNativeMediaPaused[index] });
    media.pause = () => {
      window.fixtureNativeMediaPaused[index] = true;
      window.fixtureNativeMediaPauseCounts[index] += 1;
      media.dispatchEvent(new Event("pause"));
    };
  });
}
URL.createObjectURL = (blob) => {
  window.fixtureDownloads.push({ blob, filename: "" });
  return `blob:fixture-${window.fixtureDownloads.length}`;
};
URL.revokeObjectURL = () => {};
const fixtureAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  if (this.download) {
    window.fixtureDownloads.at(-1).filename = this.download;
    return;
  }
  fixtureAnchorClick.call(this);
};
window.addEventListener("error", (event) => {
  document.documentElement.dataset.fixtureError = `${event.message} @ ${event.lineno}:${event.colno}`;
});
window.addEventListener("unhandledrejection", (event) => {
  document.documentElement.dataset.fixtureError = String(event.reason);
});
window.fixtureRuntimeMessages = [];
const fixtureChrome = {
  runtime: {
    lastError: null,
    getURL: (path) => {
      document.documentElement.dataset.lastExtensionAsset = path;
      return new URL(`/dist/unpacked/${path}`, location.href).href;
    },
    getManifest: () => ({ version: "0.5.17" }),
    sendMessage(message, callback) {
      window.fixtureRuntimeMessages.push(structuredClone(message));
      if (location.search.includes("album-switch-performance")) {
        if (message.type === "BANDCAMP_HUB_GET_SEAMLESS_STATE") {
          callback?.({ ok: true, state: { enabled: true, status: "playing", isPlaying: true, currentTime: 16, duration: 180, index: 0, track: window.fixtureAlbumPerformanceQueue[0], queue: window.fixtureAlbumPerformanceQueue } });
          return;
        }
        if (message.type === "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS") {
          window.setTimeout(() => callback?.({ ok: true, items: message.items }), 3500);
          return;
        }
        if (message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX") {
          const index = Math.max(0, Math.min(window.fixtureAlbumPerformanceQueue.length - 1, Number(message.index) || 0));
          window.fixtureAlbumSwitchFinishedAt = performance.now();
          callback?.({ ok: true, state: { enabled: true, status: "playing", isPlaying: true, currentTime: 0, duration: window.fixtureAlbumPerformanceQueue[index].duration, index, track: window.fixtureAlbumPerformanceQueue[index], queue: window.fixtureAlbumPerformanceQueue } });
          return;
        }
        if (message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE") {
          const index = Math.max(0, Math.min(message.queue.length - 1, Number(message.index) || 0));
          window.fixtureAlbumSwitchFinishedAt = performance.now();
          callback?.({ ok: true, state: { enabled: true, status: "playing", isPlaying: true, currentTime: 0, duration: message.queue[index].duration, index, track: message.queue[index], queue: message.queue } });
          return;
        }
      }
      if (location.search.includes("queue-skip-unavailable")) {
        const playable = window.fixtureQueueSkipTracks.filter((track) => track.url);
        if (message.type === "BANDCAMP_HUB_GET_SEAMLESS_STATE") {
          callback?.({ ok: true, state: { enabled: true, status: "playing", isPlaying: true, currentTime: 8, duration: 120, index: 0, track: playable[0], queue: playable } });
          return;
        }
        if (message.type === "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS") {
          callback?.({ ok: true, items: message.items.map((item) => item.playlistItemId === "skip-missing" ? { ...item, url: "", restoreError: "Unavailable" } : item) });
          return;
        }
        if (message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE") {
          const index = Math.max(0, Math.min(message.queue.length - 1, Number(message.index) || 0));
          callback?.({ ok: true, state: { enabled: true, status: "playing", isPlaying: true, currentTime: 0, duration: message.queue[index].duration, index, track: message.queue[index], queue: message.queue } });
          return;
        }
        if (message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX") {
          const index = Math.max(0, Math.min(playable.length - 1, Number(message.index) || 0));
          callback?.({ ok: true, state: { enabled: true, status: "playing", isPlaying: true, currentTime: 0, duration: playable[index].duration, index, track: playable[index], queue: playable } });
          return;
        }
      }
      if ((location.search.includes("queue-footer-navigation") || location.search.includes("queue-row-controls") || location.search.includes("queue-single-card-controls")) && ["BANDCAMP_HUB_GET_SEAMLESS_STATE", "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX", "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE", "BANDCAMP_HUB_SEAMLESS_SEEK"].includes(message.type)) {
        if (message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX") {
          window.fixtureQueueNavigationIndex = Math.max(0, Math.min(window.fixtureQueueNavigationTracks.length - 1, Number(message.index) || 0));
          window.fixtureQueuePlaying = true;
        }
        if (message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE") window.fixtureQueuePlaying = !window.fixtureQueuePlaying;
        const index = window.fixtureQueueNavigationIndex;
        const playbackTrack = (location.search.includes("queue-row-controls-stale-identity") || location.search.includes("queue-single-card-controls"))
          ? { ...window.fixtureQueueNavigationTracks[index], playlistItemId: "" }
          : window.fixtureQueueNavigationTracks[index];
        const playbackQueue = (location.search.includes("queue-row-controls-stale-identity") || location.search.includes("queue-single-card-controls"))
          ? window.fixtureQueueNavigationTracks.map((track) => ({ ...track, playlistItemId: "" }))
          : window.fixtureQueueNavigationTracks;
        const respond = () => callback?.({ ok: true, state: { enabled: true, status: window.fixtureQueuePlaying ? "playing" : "paused", isPlaying: window.fixtureQueuePlaying, currentTime: 0, duration: window.fixtureQueueNavigationTracks[index].duration, index, track: playbackTrack, queue: playbackQueue } });
        if (location.search.includes("queue-row-controls") && message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX") window.setTimeout(respond, 120);
        else respond();
        return;
      }
      if (location.search.includes("last-item-clear") && ["BANDCAMP_HUB_GET_SEAMLESS_STATE", "BANDCAMP_HUB_CLEAR_PLAYBACK"].includes(message.type)) {
        const disabled = message.type === "BANDCAMP_HUB_CLEAR_PLAYBACK";
        callback?.({ ok: true, state: disabled
          ? { enabled: false, status: "idle", isPlaying: false, currentTime: 0, duration: 0, index: -1, track: null, queue: [] }
          : { enabled: true, status: "playing", isPlaying: true, currentTime: 14, duration: 120, index: 0, track: window.fixtureLastItem, queue: [window.fixtureLastItem] }
        });
        return;
      }
      if (message.type === "BANDCAMP_HUB_GET_SEAMLESS_STATE" && location.search.includes("navigation-reconnect")) {
        const track = {
          id: "remote-track", title: "Previous Page Track", artist: "Previous Artist",
          pageUrl: "https://previous-artist.bandcamp.com/track/previous-page-track",
          duration: 240, url: "https://t4.bcbits.com/stream/previous-page-track"
        };
        callback?.({ ok: true, state: { enabled: true, status: "playing", isPlaying: true, currentTime: 64, duration: 240, index: 0, track, queue: [track] } });
        return;
      }
      if (message.type === "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS" && location.search.includes("collection-now-playing-append")) {
        callback?.({ ok: true, items: (message.items || []).map((item) => ({
          ...item,
          duration: item.title === "Honey Be" ? 180 : 200,
          url: item.title === "Honey Be" ? "https://t4.bcbits.com/stream/honey-be" : "https://t4.bcbits.com/stream/second-track"
        })) });
        return;
      }
      if (message.type === "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS" && location.search.includes("collection-rapid-switch")) {
        const items = (message.items || []).map((item) => ({
          ...item,
          duration: item.title === "Honey Be" ? 180 : 200,
          url: item.title === "Honey Be" ? "https://t4.bcbits.com/stream/honey-be" : "https://t4.bcbits.com/stream/second-track"
        }));
        window.setTimeout(() => callback?.({ ok: true, items }), items[0]?.title === "Honey Be" ? 220 : 20);
        return;
      }
      if (message.type === "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE" && location.search.includes("collection-now-playing-append")) {
        window.fixtureCollectionSeamlessState = {
          ...window.fixtureCollectionSeamlessState,
          enabled: true,
          status: "playing",
          isPlaying: true,
          index: 0,
          track: message.queue[0],
          queue: message.queue
        };
        callback?.({ ok: true, state: window.fixtureCollectionSeamlessState });
        return;
      }
      if (message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE") {
        const index = Math.max(0, Math.min(message.queue.length - 1, Number(message.index) || 0));
        const enabledState = { enabled: true, status: "playing", isPlaying: true, index, track: message.queue[index], queue: message.queue };
        if (location.search.includes("collection-now-playing-append")) window.fixtureCollectionSeamlessState = enabledState;
        callback?.({ ok: true, state: enabledState });
        return;
      }
      if (message.type === "BANDCAMP_HUB_RESOLVE_CART_METADATA") {
        callback?.({ ok: true, items: (message.items || []).map((item) => ({ ...item, artist: "Resolved Cart Artist" })) });
        return;
      }
      callback?.({ ok: true, state: { enabled: false, status: "idle" } });
    },
    onMessage: { addListener(listener) { window.fixtureRuntimeListener = listener; } }
  },
  storage: {
    local: {
      get(_key, callback) { document.documentElement.dataset.storageRead = "true"; callback(window.fixtureStored); },
      set(values) { Object.assign(window.fixtureStored, values); }
    },
    onChanged: { addListener(listener) { window.fixtureStorageListener = listener; } }
  }
};
