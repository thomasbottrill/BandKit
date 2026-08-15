import { STORAGE_KEYS } from "../shared/contracts.js";

(() => {
  if (window.top !== window || location.hostname !== "bandcamp.com") return;

  const STATE_KEY = STORAGE_KEYS.STATE;
  const ENABLED_KEY = STORAGE_KEYS.ENABLED;
  const canonicalFeedUrl = (value) => {
    try {
      const url = new URL(value || "", "https://bandcamp.com/");
      return url.protocol === "https:"
        && url.hostname === "bandcamp.com"
        && /^\/[^/]+\/feed\/?$/.test(url.pathname)
        ? `${url.origin}${url.pathname.replace(/\/$/, "")}`
        : "";
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
    write?.catch?.(() => {});
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
