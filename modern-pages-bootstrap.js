(() => {
  // src/shared/contracts.js
  var STORAGE_KEYS = Object.freeze({
    BPM_CORRECTIONS: "bandcampHubBpmCorrections",
    ENABLED: "bandcampHubEnabled",
    LAYOUT: "bandcampHubLayout",
    PLAYBACK: "bandcampHubPlayback",
    STATE: "bandcampHubState"
  });
  var MESSAGES = Object.freeze({
    CLEAR_PLAYBACK: "BANDCAMP_HUB_CLEAR_PLAYBACK",
    DELETE_ALL_DATA: "BANDCAMP_HUB_DELETE_ALL_DATA",
    GET_ENABLED: "BANDCAMP_HUB_GET_ENABLED",
    GET_SEAMLESS_STATE: "BANDCAMP_HUB_GET_SEAMLESS_STATE",
    OFFSCREEN_PREFIX: "BANDCAMP_HUB_OFFSCREEN_",
    OFFSCREEN_ANALYZE_TRACKS: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_TRACKS",
    OFFSCREEN_ANALYZE_BPM: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_BPM",
    OFFSCREEN_DISABLE: "BANDCAMP_HUB_OFFSCREEN_DISABLE",
    OFFSCREEN_ENABLE: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
    OFFSCREEN_GET_STATE: "BANDCAMP_HUB_OFFSCREEN_GET_STATE",
    OFFSCREEN_NEXT: "BANDCAMP_HUB_OFFSCREEN_NEXT",
    OFFSCREEN_PLAY_INDEX: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX",
    OFFSCREEN_PLAY_PAUSE: "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE",
    OFFSCREEN_PREVIOUS: "BANDCAMP_HUB_OFFSCREEN_PREVIOUS",
    OFFSCREEN_RESET_BPM: "BANDCAMP_HUB_OFFSCREEN_RESET_BPM",
    OFFSCREEN_RESTORE: "BANDCAMP_HUB_OFFSCREEN_RESTORE",
    OFFSCREEN_SCRATCH: "BANDCAMP_HUB_OFFSCREEN_SCRATCH",
    OFFSCREEN_SEEK: "BANDCAMP_HUB_OFFSCREEN_SEEK",
    OFFSCREEN_SET_BPM: "BANDCAMP_HUB_OFFSCREEN_SET_BPM",
    OFFSCREEN_SET_DJ: "BANDCAMP_HUB_OFFSCREEN_SET_DJ",
    OFFSCREEN_SET_LOOP: "BANDCAMP_HUB_OFFSCREEN_SET_LOOP",
    OFFSCREEN_SET_RATE: "BANDCAMP_HUB_OFFSCREEN_SET_RATE",
    OFFSCREEN_STATE: "BANDCAMP_HUB_OFFSCREEN_STATE",
    OFFSCREEN_UPDATE_QUEUE: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
    OPEN: "BANDCAMP_HUB_OPEN",
    OPEN_BACKGROUND_TAB: "BANDCAMP_HUB_OPEN_BACKGROUND_TAB",
    PING: "BANDCAMP_HUB_PING",
    PLAYBACK_CLEARED: "BANDCAMP_HUB_PLAYBACK_CLEARED",
    RESOLVE_CART_ITEMS: "BANDCAMP_HUB_RESOLVE_CART_ITEMS",
    RESOLVE_CART_METADATA: "BANDCAMP_HUB_RESOLVE_CART_METADATA",
    RESOLVE_PLAYLIST_ITEMS: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
    RESTORE_CART: "BANDCAMP_HUB_RESTORE_CART",
    SEAMLESS_PREFIX: "BANDCAMP_HUB_SEAMLESS_",
    ANALYZE_TRACKS: "BANDCAMP_HUB_ANALYZE_TRACKS",
    SEAMLESS_ANALYZE_BPM: "BANDCAMP_HUB_SEAMLESS_ANALYZE_BPM",
    SEAMLESS_DISABLE: "BANDCAMP_HUB_SEAMLESS_DISABLE",
    SEAMLESS_ENABLE: "BANDCAMP_HUB_SEAMLESS_ENABLE",
    SEAMLESS_NEXT: "BANDCAMP_HUB_SEAMLESS_NEXT",
    SEAMLESS_PLAY_INDEX: "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX",
    SEAMLESS_PLAY_PAUSE: "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE",
    SEAMLESS_PREVIOUS: "BANDCAMP_HUB_SEAMLESS_PREVIOUS",
    SEAMLESS_RESET_BPM: "BANDCAMP_HUB_SEAMLESS_RESET_BPM",
    SEAMLESS_SCRATCH: "BANDCAMP_HUB_SEAMLESS_SCRATCH",
    SEAMLESS_SEEK: "BANDCAMP_HUB_SEAMLESS_SEEK",
    SEAMLESS_SET_BPM: "BANDCAMP_HUB_SEAMLESS_SET_BPM",
    SEAMLESS_SET_DJ: "BANDCAMP_HUB_SEAMLESS_SET_DJ",
    SEAMLESS_SET_LOOP: "BANDCAMP_HUB_SEAMLESS_SET_LOOP",
    SEAMLESS_SET_RATE: "BANDCAMP_HUB_SEAMLESS_SET_RATE",
    SEAMLESS_STATE: "BANDCAMP_HUB_SEAMLESS_STATE",
    SEAMLESS_UPDATE_QUEUE: "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE",
    SET_ENABLED: "BANDCAMP_HUB_SET_ENABLED",
    TOGGLE: "BANDCAMP_HUB_TOGGLE",
    WISHLIST_RESULT: "BANDCAMP_HUB_WISHLIST_RESULT",
    WISHLIST_UPDATED: "BANDCAMP_HUB_WISHLIST_UPDATED"
  });

  // src/content/modern-pages-bootstrap.js
  (() => {
    if (window.top !== window) return;
    const pathname = location.pathname.replace(/\/+$/, "") || "/";
    const hostname = location.hostname.toLowerCase();
    const pageTypeFromUrl = () => {
      if (hostname === "bandcamp.com") {
        return /^\/[^/]+\/feed$/.test(pathname) ? "feed" : "";
      }
      if (!hostname.endsWith(".bandcamp.com")) return "";
      const subdomain = hostname.slice(0, -".bandcamp.com".length);
      if (["www", "daily", "blog", "get", "help"].includes(subdomain)) return "";
      if (/^\/(?:album|track|merch)\/.+/.test(pathname)) return "release";
      if (pathname === "/video") return "video";
      if (pathname === "/community") return "community";
      if (pathname === "/merch") return "merch";
      if (pathname === "/artists") return "music";
      if (pathname === "/" || pathname === "/music") return "music";
      return "";
    };
    const pageType = pageTypeFromUrl();
    if (!pageType) return;
    const root = document.documentElement;
    root.dataset.bandkitModernBootstrap = "true";
    root.dataset.bandkitModernPending = "true";
    let finished = false;
    let timeout = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      delete root.dataset.bandkitModernPending;
      if (root.dataset.bandkitEnabled === "false") delete root.dataset.bandkitModernReady;
      else root.dataset.bandkitModernReady = "true";
    };
    const restoreClassicPage = () => {
      root.dataset.bandkitModernPage = "false";
      root.dataset.bandkitModernRelease = "false";
      delete root.dataset.bandkitModernPageType;
      finish();
    };
    globalThis.BandKitModernPagesBootstrap = { finish, pageType };
    timeout = window.setTimeout(finish, 2500);
    chrome.storage.local.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.STATE], (stored) => {
      if (chrome.runtime.lastError) {
        restoreClassicPage();
        return;
      }
      if (stored?.[STORAGE_KEYS.ENABLED] === false) {
        root.dataset.bandkitEnabled = "false";
        restoreClassicPage();
        return;
      }
      root.dataset.bandkitEnabled = "true";
      const enabled = stored?.[STORAGE_KEYS.STATE]?.appearance?.modernReleasePages === true;
      if (!enabled) restoreClassicPage();
    });
  })();
})();
