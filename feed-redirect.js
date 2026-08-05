(() => {
  if (window.top !== window || location.hostname !== "bandcamp.com") return;

  const STATE_KEY = "bandcampHubState";
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

  const readState = () => new Promise((resolve) => {
    chrome.storage.local.get(STATE_KEY, (stored) => resolve(stored?.[STATE_KEY] || {}));
  });

  const saveFeedUrl = (state, feedUrl) => {
    if (!feedUrl || state.feedUrl === feedUrl) return;
    chrome.storage.local.set({ [STATE_KEY]: { ...state, feedUrl } });
  };

  const currentFeedUrl = canonicalFeedUrl(location.href);
  if (currentFeedUrl) {
    void readState().then((state) => saveFeedUrl(state, currentFeedUrl));
    return;
  }

  if (location.pathname !== "/" || location.hash.startsWith("#bandkit-")) return;

  const root = document.documentElement;
  const previousVisibility = root.style.getPropertyValue("visibility");
  const previousPriority = root.style.getPropertyPriority("visibility");
  root.style.setProperty("visibility", "hidden", "important");
  let finished = false;
  let observer = null;
  let timeout = 0;

  const reveal = () => {
    if (previousVisibility) root.style.setProperty("visibility", previousVisibility, previousPriority);
    else root.style.removeProperty("visibility");
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

  void readState().then((state) => {
    if (state.openHomeToFeed === false) {
      finish("", state);
      return;
    }
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
