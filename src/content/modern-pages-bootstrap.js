import { resolvePageScale } from "./scale.js";
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
    if (pathname === "/subscribe") return "subscribe";
    if (pathname === "/community") return "community";
    if (pathname === "/merch") return "merch";
    if (pathname === "/artists") return "music";
    if (pathname === "/" || pathname === "/music") return "music";
    return "";
  };

  const pageType = pageTypeFromUrl();
  const root = document.documentElement;

  // Both hooks come from the URL, so the page stylesheet can key off them from
  // the first paint rather than waiting for the runtime.
  root.dataset.bandkitCheckoutPage = String(location.pathname.startsWith("/cart/checkout"));
  root.dataset.bandkitCheckoutError = String(location.pathname === "/cart/checkout_booboo");

  // The page stylesheet ships with the extension, but its colours are resolved
  // from the user's theme by the runtime, which cannot start before
  // document_idle. Replaying the set it last resolved paints this navigation in
  // Bandkit's colours immediately. A page-aware theme derives its colours from
  // the page itself, so those values belong to the previous page until the
  // runtime recomputes them — still Bandkit's palette rather than Bandcamp's.
  const applyCachedPageTheme = (cache) => {
    if (cache?.enabled !== true) return;
    for (const [name, value] of Object.entries(cache.variables || {})) {
      if (typeof value === "string") root.style.setProperty(name, value);
    }
    root.dataset.bandkitPageTheme = "true";
  };

  let finished = false;
  let timeout = 0;

  const finish = () => {
    if (finished || !pageType) return;
    finished = true;
    window.clearTimeout(timeout);
    delete root.dataset.bandkitModernPending;
    if (root.dataset.bandkitEnabled === "false") delete root.dataset.bandkitModernReady;
    else root.dataset.bandkitModernReady = "true";
  };

  const restoreClassicPage = () => {
    if (!pageType) return;
    root.dataset.bandkitModernStyling = "false";
    root.dataset.bandkitModernPage = "false";
    root.dataset.bandkitModernRelease = "false";
    delete root.dataset.bandkitModernPageType;
    finish();
  };

  if (pageType) {
    root.dataset.bandkitModernBootstrap = "true";
    root.dataset.bandkitModernPending = "true";
    globalThis.BandKitModernPagesBootstrap = { finish, pageType };
    timeout = window.setTimeout(finish, 2500);
  }

  chrome.storage.local.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.STATE, STORAGE_KEYS.PAGE_THEME], (stored) => {
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
    applyCachedPageTheme(stored?.[STORAGE_KEYS.PAGE_THEME]);
    if (!pageType) return;
    const enabled = stored?.[STORAGE_KEYS.STATE]?.appearance?.modernReleasePages !== false;
    root.style.setProperty("--bandkit-page-scale", String(resolvePageScale(stored?.[STORAGE_KEYS.STATE]?.appearance, pageType)));
    root.dataset.bandkitModernStyling = String(enabled);
    if (!enabled) restoreClassicPage();
  });
})();
