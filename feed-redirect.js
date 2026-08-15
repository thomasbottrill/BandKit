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

  // src/content/feed-redirect.js
  (() => {
    if (window.top !== window || location.hostname !== "bandcamp.com") return;
    const STATE_KEY = STORAGE_KEYS.STATE;
    const ENABLED_KEY = STORAGE_KEYS.ENABLED;
    const canonicalFeedUrl = (value) => {
      try {
        const url = new URL(value || "", "https://bandcamp.com/");
        return url.protocol === "https:" && url.hostname === "bandcamp.com" && /^\/[^/]+\/feed\/?$/.test(url.pathname) ? `${url.origin}${url.pathname.replace(/\/$/, "")}` : "";
      } catch {
        return "";
      }
    };
    const readSettings = () => new Promise((resolve) => {
      chrome.storage.local.get([ENABLED_KEY, STATE_KEY], (stored) => resolve({
        enabled: stored?.[ENABLED_KEY] !== false,
        state: stored?.[STATE_KEY] || {}
      }));
    });
    const saveFeedUrl = (state, feedUrl) => {
      if (!feedUrl || state.feedUrl === feedUrl) return;
      const write = chrome.storage.local.set({ [STATE_KEY]: { ...state, feedUrl } });
      write?.catch?.(() => {
      });
    };
    const currentFeedUrl = canonicalFeedUrl(location.href);
    if (currentFeedUrl) {
      void readSettings().then(({ enabled, state }) => {
        if (enabled) saveFeedUrl(state, currentFeedUrl);
      });
      return;
    }
    if (location.pathname !== "/" || location.hash.startsWith("#bandkit-")) return;
    const root = document.documentElement;
    let previousVisibility = "";
    let previousPriority = "";
    let concealed = false;
    let finished = false;
    let observer = null;
    let timeout = 0;
    const reveal = () => {
      if (!concealed) return;
      if (previousVisibility) root.style.setProperty("visibility", previousVisibility, previousPriority);
      else root.style.removeProperty("visibility");
      concealed = false;
    };
    const finish = (feedUrl = "", state = {}) => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      window.clearTimeout(timeout);
      if (feedUrl) {
        saveFeedUrl(state, feedUrl);
        location.replace(feedUrl);
        return;
      }
      reveal();
    };
    const feedUrlFromPage = () => {
      for (const anchor of document.querySelectorAll("a[href]")) {
        const feedUrl = canonicalFeedUrl(anchor.href);
        if (feedUrl) return feedUrl;
      }
      return "";
    };
    void readSettings().then(({ enabled, state }) => {
      if (!enabled) {
        finish("", state);
        return;
      }
      if (state.openHomeToFeed !== true) {
        finish("", state);
        return;
      }
      previousVisibility = root.style.getPropertyValue("visibility");
      previousPriority = root.style.getPropertyPriority("visibility");
      root.style.setProperty("visibility", "hidden", "important");
      concealed = true;
      const savedFeedUrl = canonicalFeedUrl(state.feedUrl);
      if (savedFeedUrl) {
        finish(savedFeedUrl, state);
        return;
      }
      const discoveredFeedUrl = feedUrlFromPage();
      if (discoveredFeedUrl) {
        finish(discoveredFeedUrl, state);
        return;
      }
      observer = new MutationObserver(() => {
        const feedUrl = feedUrlFromPage();
        if (feedUrl) finish(feedUrl, state);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      timeout = window.setTimeout(() => finish("", state), 1500);
    }).catch(() => finish());
  })();
})();
