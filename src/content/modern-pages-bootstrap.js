import { STORAGE_KEYS } from "../shared/contracts.js";

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
    root.dataset.bandkitModernStyling = "false";
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
    const enabled = stored?.[STORAGE_KEYS.STATE]?.appearance?.modernReleasePages !== false;
    root.dataset.bandkitModernStyling = String(enabled);
    if (!enabled) restoreClassicPage();
  });
})();
