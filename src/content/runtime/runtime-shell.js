import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState, updateRuntimeLive, updateRuntimeSaveState, updateRuntimeSeamless, updateRuntimeState } from "./context.js";
import { asset, createElement, resolvedTrackPageUrl, safeBandcampReleaseUrl, safeBandcampUrl } from "../core.js";
import { MUSIC_BAR_WIDTHS, defaultState } from "../state.js";
import { waveformPathData } from "../waveform.js";
import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { createAppContext } from "../app-context.js";

function registerRuntimeShell1(r) {
r.$canonicalBandcampFeedUrl = function canonicalBandcampFeedUrl(value) {
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
r.$discoverBandcampFeedUrl = function discoverBandcampFeedUrl() {
      const current = r.$canonicalBandcampFeedUrl(location.href);
      if (current) return current;
      for (const anchor of document.querySelectorAll("a[href]")) {
        const feedUrl = r.$canonicalBandcampFeedUrl(anchor.href);
        if (feedUrl) return feedUrl;
      }
      return "";
    };
r.$openFeedFromBandcampHome = function openFeedFromBandcampHome() {
      if (runtimeState.openHomeToFeed !== true
        || location.hostname !== "bandcamp.com"
        || location.pathname !== "/"
        || location.hash.startsWith("#bandkit-")) return false;
      const feedUrl = r.$canonicalBandcampFeedUrl(runtimeState.feedUrl) || r.$discoverBandcampFeedUrl();
      if (!feedUrl) return false;
      location.replace(feedUrl);
      return true;
    };
r.$pageMediaCommand = function pageMediaCommand(action, details = {}) {
      document.dispatchEvent(new CustomEvent("bandkit:media-command", { detail: { action, ...details } }));
    };
r.$syncPlayerPageSpace = function syncPlayerPageSpace() {
      const pageFooter = document.querySelector("#page-footer, #pgFt, page-footer, .full-page-app-wrapper > footer");
      const pageFlowParent = document.querySelector("#DiscoverApp main.app")
        || pageFooter?.parentElement
        || document.querySelector("#propOpenWrapper, .full-page-app-wrapper")
        || document.body;
      if (r.$playerSpacer.parentElement !== pageFlowParent) {
        r.$playerSpacer.parentElement?.style.removeProperty("scroll-padding-bottom");
        pageFlowParent.append(r.$playerSpacer);
      }
      const playerHeight = Math.ceil(r.$player.getBoundingClientRect().height);
      if (!playerHeight) return;
      const reservedHeight = `${playerHeight}px`;
      const discoverReservedHeight = `${playerHeight + 16}px`;
      r.$playerSpacer.style.setProperty("height", reservedHeight, "important");
      r.$playerSpacer.style.setProperty("flex-basis", reservedHeight, "important");
      const discoverDetail = document.querySelector("#DiscoverApp .focused-result");
      if (discoverDetail) {
        if (r.$discoverPlayerSpacer.parentElement !== discoverDetail) discoverDetail.append(r.$discoverPlayerSpacer);
        r.$discoverPlayerSpacer.style.setProperty("height", discoverReservedHeight, "important");
        r.$discoverPlayerSpacer.style.setProperty("flex-basis", discoverReservedHeight, "important");
        discoverDetail.style.setProperty("scroll-padding-bottom", discoverReservedHeight);
      } else {
        r.$discoverPlayerSpacer.remove();
      }
      document.documentElement.style.setProperty("--bandkit-player-reserved-height", reservedHeight);
      document.documentElement.style.scrollPaddingBottom = reservedHeight;
      pageFlowParent.style.setProperty("scroll-padding-bottom", reservedHeight);
    };
r.$buildScrubWaveform = function buildScrubWaveform(signature, width) {
      const { pathData, pixelWidth } = waveformPathData(signature, width);
      r.$scrubWaveform.setAttribute("viewBox", `0 0 ${pixelWidth} 24`);
      r.$scrubWaveformRemaining.setAttribute("d", pathData);
      r.$scrubWaveformPlayed.setAttribute("d", pathData);
      r.$scrubWaveformSignature = signature;
      r.$scrubWaveformWidth = pixelWidth;
    };
r.$refreshScrubWaveform = function refreshScrubWaveform(force = false, observedWidth = 0) {
      const signature = `${runtimeLive.title || ""}\u0000${runtimeLive.artist || ""}\u0000${runtimeLive.pageUrl || ""}`;
      if (!force && signature === r.$scrubWaveformSignature) return;
      const width = Math.max(80, Math.round(observedWidth || r.$scrubControl.getBoundingClientRect().width));
      if (signature === r.$scrubWaveformSignature && Math.abs(width - r.$scrubWaveformWidth) < 4) return;
      r.$buildScrubWaveform(signature, width);
    };
r.$syncScrubVisual = function syncScrubVisual(value = Number(r.$scrubSlider.value) || 0) {
      const progress = Math.max(0, Math.min(1, value / 1000));
      r.$scrubControl.style.setProperty("--hub-scrub-progress", `${(progress * 100).toFixed(2)}%`);
    };
r.$usesTraditionalScrubber = function usesTraditionalScrubber() {
      return runtimeState.scrubberStyle === "traditional";
    };
r.$syncScrubberStyles = function syncScrubberStyles() {
      const traditional = r.$usesTraditionalScrubber();
      r.$scrubControl.classList.toggle("is-traditional", traditional);
      for (const control of document.querySelectorAll(".bandkit-page-scrub-control")) {
        control.classList.toggle("is-traditional", traditional);
      }
    };
r.$syncMusicBarSize = function syncMusicBarSize() {
      const compact = runtimeState.musicBarSize === "compact";
      const changed = r.$player.classList.contains("is-compact") !== compact;
      r.$player.classList.toggle("is-compact", compact);
      r.$host.style.setProperty("--hub-player-height", compact ? "72px" : "96px");
      if (changed) window.requestAnimationFrame(r.$syncPlayerPageSpace);
    };
r.$syncMusicBarWidth = function syncMusicBarWidth() {
      const width = MUSIC_BAR_WIDTHS.includes(runtimeState.musicBarWidth) ? runtimeState.musicBarWidth : "default";
      const customWidth = Math.round(Math.max(480, Math.min(2000, Number(runtimeState.musicBarCustomWidth) || 900)));
      runtimeState.musicBarWidth = width;
      runtimeState.musicBarCustomWidth = customWidth;
      r.$player.dataset.contentWidth = width;
      r.$player.style.setProperty("--hub-player-custom-width", `${customWidth}px`);
    };
r.$toggleSectionPanel = function toggleSectionPanel(tabId) {
      const currentPanelVisible = runtimeState.activeTab === tabId && !r.$panel.classList.contains("is-hidden");
      runtimeState.activeTab = tabId;
      runtimeState.open = !currentPanelVisible;
      runtimeSaveState();
      r.$saveLayoutState();
      r.$render();
    };
r.$isNowPlayingView = function isNowPlayingView() {
      return runtimeState.activeTab === "playlist" && runtimeState.playlistView === "current";
    };
r.$individualTrackPageUrl = function individualTrackPageUrl(track) {
      const pageUrl = resolvedTrackPageUrl(track);
      try {
        if (pageUrl && new URL(pageUrl).pathname.includes("/track/")) return pageUrl;
      } catch {
        // Fall through to the visible track list.
      }
      const expectedTitle = String(track?.title || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!expectedTitle) return "";
      for (const row of document.querySelectorAll(".track_row_view, .track-list-item, [data-trackid], [data-track-id]")) {
        const rowTitle = r.$elementText(row, [".track-title", ".title", ".title-text"]).toLowerCase();
        if (rowTitle !== expectedTitle) continue;
        const link = [...row.querySelectorAll("a[href]")].find((anchor) => {
          try { return new URL(anchor.href, location.href).pathname.includes("/track/"); } catch { return false; }
        });
        const safeUrl = safeBandcampUrl(link?.href);
        if (safeUrl) return safeUrl;
      }
      for (const link of document.querySelectorAll('a[href*="/track/"]')) {
        const linkTitle = String(link.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (linkTitle === expectedTitle) {
          const safeUrl = safeBandcampUrl(link.href);
          if (safeUrl) return safeUrl;
        }
      }
      return "";
    };
r.$nativeTrackActionControl = function nativeTrackActionControl(action) {
      const selectors = action === "wishlist"
        ? ["#wishlist-msg button", "#wishlist-msg a", ".wishlist-button", "button[data-action*='wish' i]", "button[aria-label*='wishlist' i]", "a[aria-label*='wishlist' i]"]
        : ["#buyTrackLink", "#buyAlbumLink", ".download-link.buy-link", ".buy-link", "#buyItem", ".buyItem", "button[data-action*='cart' i]", "button[aria-label*='cart' i]"];
      for (const selector of selectors) {
        for (const match of document.querySelectorAll(selector)) {
          if (match.closest("#bandcamp-hub-extension-root, .bandcamp-hub-page-tools, .bandcamp-hub-page-playlist-menu")) continue;
          const control = match.matches("button, a, [role='button']")
            ? match
            : match.querySelector("button, a, [role='button']") || match.closest("button, a, [role='button']");
          if (control && !control.closest("#bandcamp-hub-extension-root, .bandcamp-hub-page-tools, .bandcamp-hub-page-playlist-menu")) return control;
        }
      }
      return null;
    };
r.$activateNativeTrackAction = function activateNativeTrackAction(action) {
      const control = r.$nativeTrackActionControl(action);
      if (!control) return false;
      if (action === "wishlist") {
        const status = `${control.getAttribute("aria-label") || ""} ${control.textContent || ""}`.toLowerCase();
        const alreadyWishlisted = control.getAttribute("aria-pressed") === "true"
          || control.classList.contains("wishlisted")
          || /in wishlist|wishlisted|remove from wishlist/.test(status);
        if (alreadyWishlisted) return true;
      }
      control.click();
      return true;
    };
}

function registerRuntimeShell2(r) {
r.$nativeCheckoutControl = function nativeCheckoutControl() {
      const match = document.querySelector([
        "#sidecartCheckout",
        "[data-test='sidecartCheckout']",
        "[data-test='mb-cart'] [data-test*='checkout' i]",
        "#sidecart a.buttonLink"
      ].join(", "));
      if (!match) return null;
      return match.matches("button, a, [role='button']")
        ? match
        : match.querySelector("button, a, [role='button']") || match.closest("button, a, [role='button']");
    };
r.$activateNativeCheckout = function activateNativeCheckout() {
      const control = r.$nativeCheckoutControl();
      if (!control) return false;
      control.click();
      return true;
    };
r.$runPendingTrackAction = function runPendingTrackAction() {
      const action = location.hash === "#bandkit-wishlist"
        ? "wishlist"
        : location.hash === "#bandkit-cart"
          ? "cart"
          : location.hash === "#bandkit-checkout"
            ? "checkout"
            : "";
      if (!action) return;
      let attempts = 0;
      const wishlistKey = new URLSearchParams(location.search).get("bandkit_wishlist_key") || "";
      const reportWishlistResult = (success) => {
        if (action !== "wishlist") return;
        void r.$runtimeMessage({ type: MESSAGES.WISHLIST_RESULT, key: wishlistKey, success });
      };
      const tryAction = () => {
        attempts += 1;
        let activated = false;
        if (action === "checkout") {
          const checkoutControl = r.$nativeCheckoutControl();
          if (checkoutControl) {
            history.replaceState(history.state, "", `${location.pathname}${location.search}`);
            checkoutControl.click();
            activated = true;
          }
        } else {
          activated = r.$activateNativeTrackAction(action);
        }
        if (activated) {
          if (action !== "checkout") history.replaceState(history.state, "", `${location.pathname}${location.search}`);
          reportWishlistResult(true);
          r.$showToast(action === "checkout"
            ? "Opening Bandcamp checkout…"
            : action === "wishlist"
              ? "Opened Bandcamp's wishlist action"
              : "Opened Bandcamp's purchase action");
          return;
        }
        if (attempts < 8) window.setTimeout(tryAction, 350);
        else {
          reportWishlistResult(false);
          if (action === "checkout") r.$showToast("Bandcamp's checkout control is not available on this page.");
        }
      };
      tryAction();
    };
r.$openBandcampCheckout = function openBandcampCheckout() {
      if (r.$activateNativeCheckout()) {
        r.$showToast("Opening Bandcamp checkout…");
        return;
      }
      const itemPage = runtimeState.cart.map((item) => safeBandcampUrl(item.url)).find(Boolean);
      const target = new URL(itemPage || "https://bandcamp.com/");
      target.hash = "bandkit-checkout";
      window.location.assign(target.href);
    };
r.$resolveTrackActionPage = async function resolveTrackActionPage(track) {
      const directUrl = r.$individualTrackPageUrl(track);
      if (directUrl) return directUrl;
      const sourceUrl = resolvedTrackPageUrl(track);
      if (!sourceUrl || !track?.title) return "";
      const resolved = await r.$runtimeMessage({
        type: MESSAGES.RESOLVE_CART_ITEMS,
        items: [{ title: track.title, artist: track.artist, url: sourceUrl, requestedItemType: "t" }]
      });
      return safeBandcampUrl(resolved?.items?.[0]?.restore?.url);
    };
r.$openTrackAction = async function openTrackAction(track, action) {
      const directUrl = r.$individualTrackPageUrl(track);
      if (!directUrl) r.$showToast(`Finding “${track.title}” on Bandcamp…`);
      const pageUrl = directUrl || await r.$resolveTrackActionPage(track);
      if (!pageUrl) {
        r.$showToast("This track does not expose an individual Bandcamp page.");
        return;
      }
      const target = new URL(pageUrl);
      const samePage = target.origin === location.origin && target.pathname === location.pathname;
      if (samePage && r.$activateNativeTrackAction(action)) {
        if (action === "wishlist") r.$markWishlistTrack(track, true);
        r.$showToast(action === "wishlist" ? "Updated the Bandcamp wishlist" : "Opened Bandcamp's purchase action");
        return;
      }
      target.hash = action === "wishlist" ? "bandkit-wishlist" : "bandkit-cart";
      if (action === "wishlist") {
        const key = r.$wishlistTrackKey(track);
        target.searchParams.set("bandkit_wishlist_key", key);
      }
      const response = await r.$runtimeMessage({ type: MESSAGES.OPEN_BACKGROUND_TAB, url: target.href });
      if (!response?.ok) {
        r.$showToast(response?.error || `Bandcamp could not open the ${action} action.`);
        return;
      }
      if (action === "wishlist") r.$markWishlistTrack(track, true);
      r.$showToast(action === "wishlist"
        ? `Opened “${track.title}” on Bandcamp for your wishlist.`
        : `Opened “${track.title}” on Bandcamp for purchase.`);
    };
r.$wishlistTrackKey = function wishlistTrackKey(track) {
      const sourceUrl = resolvedTrackPageUrl(track).split("#")[0];
      const title = String(track?.title || "").replace(/\s+/g, " ").trim().toLowerCase();
      return `${sourceUrl}|${title}`;
    };
r.$markWishlistTrack = function markWishlistTrack(trackOrKey, active) {
      const key = typeof trackOrKey === "string" ? trackOrKey : r.$wishlistTrackKey(trackOrKey);
      if (!key) return;
      const keys = new Set(runtimeState.wishlistTrackKeys || []);
      if (active) keys.add(key);
      else keys.delete(key);
      runtimeState.wishlistTrackKeys = [...keys].slice(-500);
      runtimeSaveState();
      if (runtimeState.activeTab === "playlist") r.$render();
    };
r.$artistUrlFromPageUrl = function artistUrlFromPageUrl(value) {
      const pageUrl = safeBandcampReleaseUrl(value);
      if (!pageUrl) return "";
      try {
        const url = new URL(pageUrl);
        return url.hostname === "bandcamp.com"
          ? pageUrl
          : url.hostname.endsWith(".bandcamp.com") ? `${url.origin}/` : pageUrl;
      } catch {
        return pageUrl;
      }
    };
r.$createPageLink = function createPageLink(text, url, className = "") {
      const link = createElement("a", className, text);
      const safeUrl = safeBandcampReleaseUrl(url);
      if (safeUrl) {
        link.href = safeUrl;
        link.target = "_blank";
        link.rel = "noopener";
      } else {
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
      }
      return link;
    };
r.$updatePageLink = function updatePageLink(link, value) {
      const safeUrl = safeBandcampReleaseUrl(value);
      if (safeUrl) {
        link.href = safeUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.removeAttribute("aria-disabled");
      } else {
        link.removeAttribute("href");
        link.removeAttribute("target");
        link.removeAttribute("rel");
        link.setAttribute("aria-disabled", "true");
      }
    };
r.$signedPercent = function signedPercent(value) {
      const rounded = Math.abs(value) < 0.05 ? 0 : Math.round(value * 10) / 10;
      return `${rounded > 0 ? "+" : ""}${rounded.toFixed(rounded % 1 ? 1 : 0)}%`;
    };
}

function registerRuntimeShell3(r) {
r.$showToast = function showToast(message, duration = 2200) {
      window.clearTimeout(r.$toastTimer);
      r.$toast.textContent = message;
      r.$toast.classList.add("is-visible");
      r.$toastTimer = window.setTimeout(() => {
        r.$toast.classList.remove("is-visible");
        r.$toast.textContent = "";
      }, Math.max(1200, Number(duration) || 2200));
    };
r.$storageGet = function storageGet(key) {
      return new Promise((resolve) => { chrome.storage.local.get(key, resolve); });
    };
r.$isTransientRuntimeMessageError = function isTransientRuntimeMessageError(error) {
      return /message port closed|receiving end does not exist|could not establish connection|extension context invalidated/i.test(String(error || ""));
    };
r.$runtimeMessage = function runtimeMessage(message) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              const error = chrome.runtime.lastError.message;
              resolve({ ok: false, error, transient: r.$isTransientRuntimeMessageError(error) });
              return;
            }
            resolve(response || { ok: false, error: "The extension background did not respond." });
          });
        } catch (error) {
          resolve({ ok: false, error: error.message, transient: r.$isTransientRuntimeMessageError(error.message) });
        }
      });
    };
r.$reportStorageWriteError = function reportStorageWriteError(error) {
      const now = Date.now();
      if (now - r.$storageErrorToastAt < 5000) return;
      r.$storageErrorToastAt = now;
      const message = String(error?.message || error || "");
      r.$showToast(/quota|bytes|space/i.test(message)
        ? "Bandkit storage is full. Delete old playlists or cart backups."
        : "Bandkit could not save this change.");
    };
r.$persistLocal = function persistLocal(values, notify = true) {
      if (r.$storageDisabled) return;
      try {
        const write = chrome.storage.local.set(values);
        if (write && typeof write.catch === "function") {
          write.catch((error) => {
            if (notify) r.$reportStorageWriteError(error);
          });
        }
      } catch (error) {
        if (notify) r.$reportStorageWriteError(error);
      }
    };
r.$persistNowPlayingSession = function persistNowPlayingSession() {
      if (r.$storageDisabled) return;
      void r.$runtimeMessage({
        type: MESSAGES.SET_NOW_PLAYING,
        playlist: runtimeState.playlist,
        playlistMode: runtimeState.playlistMode
      });
    };
r.$saveState = updateRuntimeSaveState(function saveState() {
      r.$persistLocal({ [STORAGE_KEYS.STATE]: runtimeState });
      r.$persistNowPlayingSession();
      r.$schedulePortableDataHomeSync();
    });
r.$schedulePortableDataHomeSync = function schedulePortableDataHomeSync() {
      if (!r.$dataDirectoryHandle || !r.$dataHomeReady || r.$localDataHomePermission !== "granted" || r.$storageDisabled) return;
      window.clearTimeout(r.$portableDataSyncTimer);
      r.$portableDataSyncTimer = window.setTimeout(() => {
        r.$portableDataSyncTimer = 0;
        void r.$flushPortableDataHome().catch((error) => {
          if (error?.message) console.warn("Bandkit data-folder sync paused.", error);
        });
      }, 300);
    };
}

export const registerRuntimeShell = [registerRuntimeShell1, registerRuntimeShell2, registerRuntimeShell3];

function setupRuntimeShell1(r) {
r.$cartAutosave = globalThis.BandKitCartAutosave;
r.$app = createAppContext(defaultState);
r.$state = updateRuntimeState(r.$app.state);
r.$sessionNowPlayingLoaded = false;
r.$layoutRevision = 0;
r.$clearedPageQueueSignature = "";
r.$nowPlayingExplicitlyCleared = false;
r.$live = updateRuntimeLive({
      available: false,
      isPlaying: false,
      hasPlaybackStarted: false,
      title: "",
      artist: "",
      art: "",
      pageUrl: "",
      artistUrl: "",
      currentTime: 0,
      duration: 0,
      progress: 0,
      tracks: []
    });
r.$seamless = updateRuntimeSeamless({
      enabled: false,
      status: "idle",
      error: "",
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      progress: 0,
      rate: 1,
      preservePitch: true,
      filterValue: 0,
      gainDb: 0,
      eqLowDb: 0,
      eqMidDb: 0,
      eqHighDb: 0,
      loopBeats: 0,
      loopStart: 0,
      loopEnd: 0,
      detectedBpm: null,
      automaticBpm: null,
      bpmSource: "auto",
      bpmStatus: "idle",
      detectedKey: null,
      waveform: [],
      index: -1,
      track: null,
      queue: []
    });
r.$pendingLoopBeats = null;
r.$bpmEditing = false;
r.$bpmDraft = "";
r.$toastTimer = undefined;
r.$storageErrorToastAt = 0;
r.$storageDisabled = false;
r.$dataHomeReady = false;
r.$dataDirectoryHandle = null;
r.$localDataHomePermission = "missing";
r.$portableDataSyncTimer = 0;
r.$portableDataSyncBusy = false;
r.$portableDataSyncPending = false;
r.$scanTimer = undefined;
r.$scanIdleCallback = undefined;
r.$playerEventScanTimer = undefined;
r.$lastPageScrollAt = 0;
r.$seamlessSyncTimer = undefined;
r.$pageActionsDirty = true;
r.$pageActionsObserver = null;
r.$playerSectionGeometryFrame = 0;
r.$playerSectionGeometrySignature = "";
r.$layoutSaveTimer = undefined;
r.$hubReady = false;
r.$startupError = "";
r.$dragging = null;
r.$launcherDrag = null;
r.$suppressLauncherClick = false;
r.$applyingLayout = false;
r.$lastRecordedTrack = "";
r.$lastPageItem = null;
r.$modernHandoffBusy = false;
r.$modernHandoffRequest = 0;
r.$modernHandoffTrackKey = "";
r.$modernHandoffPendingIndex = null;
r.$modernHandoffSuperseded = false;
r.$modernPlaylistQueueCache = new Map();
r.$discoverHandoffBusy = false;
r.$discoverHandoffTrackKey = "";
r.$discoverHandoffPending = false;
r.$discoverSwitchPendingDisable = false;
r.$feedHandoffBusy = false;
r.$feedHandoffTrackId = "";
r.$mutedFeedAudio = null;
r.$mutedFeedAudioWasMuted = false;
r.$mutedFeedTrackId = "";
r.$playlistPlaybackStarting = false;
r.$playlistPlaybackStartingRequest = 0;
r.$playlistPlayRequest = 0;
r.$pendingPlaylistItemId = "";
r.$feedSwitchPendingDisable = false;
r.$pendingFeedTrackId = "";
r.$pendingFeedSeekTime = null;
r.$pendingFeedSeekRevision = 0;
r.$suppressedFeedTrackId = "";
r.$feedHandoffTimer = 0;
r.$feedNativePauseTimer = 0;
r.$suppressModernControl = false;
r.$recommendationHandoffRequest = 0;
r.$suppressRecommendationControl = false;
r.$collectionHandoffRequest = 0;
r.$suppressCollectionControl = false;
r.$collectionNativeFallbackUntil = 0;
r.$scrubbing = false;
r.$pendingSeekTimer = 0;
r.$scrubReleaseTimer = 0;
r.$playerActionSignature = "";
r.$scrubRevision = 0;
r.$scrubWaveformSignature = "";
r.$scrubWaveformWidth = 0;
r.$scrubWaveformResizeObserver = null;
r.$playerTrackRenderSignature = "";
r.$playerPlaybackRenderState = "";
r.$bpmTapTimes = [];
r.$resizeCursorStyle = null;
r.$observedAudio = new WeakSet();
r.$bridgedMedia = null;
r.$bridgedCart = null;
r.$bridgedCartSummary = null;
r.$cartArtistCache = new Map();
r.$cartArtistPending = new Set();
r.$cartArtistAttempted = new Set();
r.$pageDjOpen = false;
r.$pageDjHost = null;
r.$pageDjShadow = null;
r.$pageDjSurface = null;
r.$pagePlaylistMenu = null;
r.$pagePlaylistMenuAnchor = null;
r.$draggingPlaylistId = "";
r.$modernReleaseLayoutPrepared = false;
r.$modernReleaseMoveRecords = [];
r.$modernReleaseShells = [];
r.$modernReleaseCleanups = [];
r.$modernReleaseSupporterTimer = null;
r.$modernReleasePalette = null;
r.$playerResizeObserver = null;
r.$pagePlayerSnapshot = null;
r.$pageActionThemeCache = null;
r.$pageTrackAnalysis = new Map();
r.$pageTrackAnalysisStatus = "idle";
r.$pageTrackAnalysisSignature = "";
r.$pageTrackAnalysisRequest = 0;
r.$PAGE_TRACK_ANALYSIS_CONCURRENCY = 3;
r.$pageTrackPriceCache = new Map();
r.$pageTrackPricePending = new Set();
}

function setupRuntimeShell2(r) {
document.addEventListener("bandkit:media-state", (event) => {
      const next = event.detail;
      if (!next || typeof next !== "object") return;
      const previous = r.$bridgedMedia;
      r.$bridgedMedia = {
        src: typeof next.src === "string" ? next.src : "",
        paused: Boolean(next.paused),
        ended: Boolean(next.ended),
        currentTime: Number(next.currentTime) || 0,
        duration: Number(next.duration) || 0,
        playbackRate: Number(next.playbackRate) || 1,
        volume: Number(next.volume) || 1
      };
      if (r.$hubReady && (!previous
        || previous.src !== r.$bridgedMedia.src
        || previous.paused !== r.$bridgedMedia.paused
        || previous.ended !== r.$bridgedMedia.ended
        || previous.duration !== r.$bridgedMedia.duration)) {
        window.clearTimeout(r.$playerEventScanTimer);
        r.$playerEventScanTimer = window.setTimeout(r.$scanLivePlayer, 0);
      }
      if (runtimeSeamless.enabled
        && !r.$bridgedMedia.paused
        && !r.$feedSwitchPendingDisable
        && !r.$pendingFeedTrackId
        && !r.$discoverSwitchPendingDisable
        && Date.now() >= r.$collectionNativeFallbackUntil) {
        r.$silenceNativePagePlayback();
      }
    });
document.addEventListener("bandkit:cart-state", (event) => {
      if (!Array.isArray(event.detail?.items)) return;
      r.$bridgedCart = event.detail.items;
      r.$bridgedCartSummary = event.detail.summary && typeof event.detail.summary === "object" ? event.detail.summary : null;
      r.$scanLiveCart();
    });
r.$pageMediaCommand("getState");
r.$root = document.createElement("li");
r.$root.id = "bandcamp-hub-extension-root";
r.$root.style.cssText = "list-style:none;margin:0;padding:0";
r.$host = document.createElement("div");
r.$host.setAttribute("data-bandcamp-hub", "");
r.$root.append(r.$host);
r.$shadow = r.$host.attachShadow({ mode: "open" });
r.$style = document.createElement("style");
r.$shadow.append(r.$style);
r.$modernReleaseStyle = document.createElement("style");
r.$modernReleaseStyle.id = "bandkit-modern-release-style";
r.$launcher = document.createElement("button");
r.$launcher.className = "hub-launcher is-panel-open";
r.$launcher.type = "button";
r.$launcher.title = "Toggle Bandkit (Alt+Shift+B)";
r.$launcher.setAttribute("aria-label", "Toggle Bandkit");
r.$launcherIcon = document.createElement("img");
r.$launcherIcon.className = "hub-launcher-brand";
r.$launcherIcon.src = asset("icon-bandkit.svg");
r.$launcherIcon.alt = "";
r.$launcher.append(r.$launcherIcon);
r.$panel = document.createElement("section");
r.$panel.className = "hub-panel is-contextual";
r.$panel.setAttribute("aria-label", "Bandkit");
r.$panel.setAttribute("aria-hidden", "true");
r.$panel.setAttribute("inert", "");
r.$panel.setAttribute("role", "dialog");
r.$panel.setAttribute("aria-modal", "false");
r.$panel.innerHTML = `
      <header class="hub-header">
        <div class="hub-title-row">
          <span class="hub-title">Now Playing &amp; Playlists</span>
        </div>
        <div class="hub-header-actions">
          <button class="hub-icon-button hub-reset" type="button" title="Reset size and position" aria-label="Reset size and position">
            <span class="hub-reset-symbol" aria-hidden="true"></span>
          </button>
          <button class="hub-icon-button hub-layout-toggle" type="button" aria-label="Dock Bandkit to the right" title="Dock Bandkit to the right">
            <img src="${asset("icon-dock.svg")}" alt="">
          </button>
          <button class="hub-icon-button hub-close" type="button" aria-label="Close Bandkit">
            <img src="${asset("icon-close.svg")}" alt="">
          </button>
        </div>
      </header>
      <nav class="hub-tabs" aria-label="Bandkit sections"></nav>
      <main class="hub-content"></main>
      <footer class="hub-player">
        <div class="hub-dj-drawer" aria-hidden="true"></div>
        <div class="hub-player-content">
          <div class="hub-player-main">
          <div class="hub-player-actions">
            <button class="hub-skip-button hub-previous-button" type="button" aria-label="Previous track">
              <img src="${asset("icon-skip.svg")}" alt="">
            </button>
            <button class="hub-play-button" type="button" aria-label="Play or pause"></button>
            <button class="hub-skip-button hub-next-button" type="button" aria-label="Next track">
              <img src="${asset("icon-skip.svg")}" alt="">
            </button>
          </div>
          <div class="hub-player-track is-empty">
            <a class="hub-player-art-link" aria-disabled="true">
              <img class="hub-art is-small hub-player-art" alt="">
            </a>
            <div class="hub-track-copy">
              <a class="hub-track-title hub-inline-link hub-player-title" aria-disabled="true"></a>
              <a class="hub-track-artist hub-inline-link hub-player-artist" aria-disabled="true"></a>
            </div>
          </div>
          <div class="hub-player-tools">
            <button class="hub-now-playing-button" type="button" aria-label="Open Now Playing" aria-expanded="false">
              <span class="hub-now-playing-icon" style="--hub-icon:url('${asset("icon-now-playing.svg")}')"></span>
              <span class="hub-now-playing-label">Now Playing</span>
              <span class="hub-now-playing-count">0</span>
            </button>
            <button class="hub-dj-player-button" type="button" aria-label="Open DJ tools" style="--hub-dj-icon:url('${asset("icon-dj.svg")}')"></button>
            <div class="hub-player-more-wrap">
              <button class="hub-player-more-button" type="button" aria-label="More track actions" aria-expanded="false">
                <span class="hub-player-more-dots" aria-hidden="true"><span></span><span></span><span></span></span>
              </button>
              <div class="hub-player-more-menu" hidden></div>
            </div>
          </div>
          </div>
          <div class="hub-scrub-row">
            <span class="hub-current-time">0:00</span>
            <div class="hub-scrub-control">
              <input class="hub-scrub-slider" type="range" min="0" max="1000" step="1" value="0" aria-label="Playback position">
              <svg class="hub-scrub-waveform" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path class="hub-scrub-waveform-remaining"></path>
                <path class="hub-scrub-waveform-played"></path>
              </svg>
              <span class="hub-scrub-playhead" aria-hidden="true"></span>
            </div>
            <span class="hub-duration">0:00</span>
          </div>
        </div>
        <div class="hub-toast" role="status" aria-live="polite"></div>
      </footer>
      <div class="hub-resize-handle is-left" data-edge="left" aria-hidden="true"></div>
      <div class="hub-resize-handle is-right" data-edge="right" aria-hidden="true"></div>
      <div class="hub-resize-handle is-top" data-edge="top" aria-hidden="true"></div>
      <div class="hub-resize-handle is-bottom" data-edge="bottom" aria-hidden="true"></div>
    `;
r.$player = r.$panel.querySelector(".hub-player");
r.$player.remove();
r.$headerShortcuts = document.createElement("nav");
r.$headerShortcuts.className = "hub-header-shortcuts";
r.$headerShortcuts.setAttribute("aria-label", "Bandkit shortcuts");
r.$playerSections = document.createElement("div");
r.$playerSections.className = "hub-player-sections";
r.$playerSections.setAttribute("aria-label", "Bandkit player and sections");
r.$playerSections.append(r.$player.querySelector(".hub-now-playing-button"), r.$headerShortcuts);
r.$player.append(r.$playerSections);
r.$shadow.append(r.$launcher, r.$panel, r.$player);
r.$playerSpacer = document.createElement("div");
r.$playerSpacer.id = "bandcamp-hub-player-spacer";
r.$playerSpacer.setAttribute("aria-hidden", "true");
r.$playerSpacer.style.cssText = "clear:both;display:block;flex:none;grid-column:1/-1;pointer-events:none;visibility:hidden;width:100%";
r.$discoverPlayerSpacer = r.$playerSpacer.cloneNode(false);
r.$discoverPlayerSpacer.id = "bandcamp-hub-discover-player-spacer";
r.$tabs = [
      { id: "playlist", label: "Now Playing & Playlists", icon: "icon-playlist.svg" },
      { id: "cart", label: "Cart", icon: "icon-cart.svg" },
      { id: "activity", label: "Activity", icon: "icon-activity.svg" },
      { id: "settings", label: "Settings", icon: "icon-settings.svg" }
    ];
r.$tabBar = r.$panel.querySelector(".hub-tabs");
r.$panelHeader = r.$panel.querySelector(".hub-header");
r.$content = r.$panel.querySelector(".hub-content");
r.$panelTitle = r.$panel.querySelector(".hub-title");
r.$playerArt = r.$player.querySelector(".hub-player-art");
r.$playerArtLink = r.$player.querySelector(".hub-player-art-link");
r.$playerTrack = r.$player.querySelector(".hub-player-track");
r.$playerTitle = r.$player.querySelector(".hub-player-title");
r.$playerArtist = r.$player.querySelector(".hub-player-artist");
r.$playButton = r.$player.querySelector(".hub-play-button");
r.$playerMoreButton = r.$player.querySelector(".hub-player-more-button");
r.$playerMoreMenu = r.$player.querySelector(".hub-player-more-menu");
r.$nowPlayingButton = r.$player.querySelector(".hub-now-playing-button");
r.$nowPlayingCount = r.$player.querySelector(".hub-now-playing-count");
r.$djPlayerButton = r.$player.querySelector(".hub-dj-player-button");
r.$headerCloseButton = r.$panel.querySelector(".hub-close");
r.$headerResetButton = r.$panel.querySelector(".hub-reset");
r.$layoutToggleButton = r.$panel.querySelector(".hub-layout-toggle");
}

function setupRuntimeShell3(r) {
r.$djDrawer = r.$player.querySelector(".hub-dj-drawer");
r.$scrubControl = r.$player.querySelector(".hub-scrub-control");
r.$scrubSlider = r.$player.querySelector(".hub-scrub-slider");
r.$scrubWaveform = r.$player.querySelector(".hub-scrub-waveform");
r.$scrubWaveformRemaining = r.$player.querySelector(".hub-scrub-waveform-remaining");
r.$scrubWaveformPlayed = r.$player.querySelector(".hub-scrub-waveform-played");
r.$currentTimeLabel = r.$player.querySelector(".hub-current-time");
r.$durationLabel = r.$player.querySelector(".hub-duration");
r.$toast = r.$player.querySelector(".hub-toast");
Object.assign(r.$app.dom, { content: r.$content, host: r.$host, panel: r.$panel, player: r.$player, root: r.$root, shadow: r.$shadow });
r.$refreshScrubWaveform(true);
if (typeof ResizeObserver === "function") {
      r.$scrubWaveformResizeObserver = new ResizeObserver((entries) => {
        r.$refreshScrubWaveform(true, entries[0]?.contentRect.width || 0);
      });
      r.$scrubWaveformResizeObserver.observe(r.$scrubControl);
    }
for (const tab of r.$tabs) {
      const button = document.createElement("button");
      button.className = "hub-tab";
      button.type = "button";
      button.dataset.tab = tab.id;
      button.title = tab.label;
      button.setAttribute("aria-label", tab.label);
      button.innerHTML = `<span class="hub-tab-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span><span class="hub-tab-dot" aria-hidden="true"></span>`;
      button.addEventListener("click", () => {
        runtimeState.activeTab = tab.id;
        runtimeSaveState();
        r.$render();
      });
      r.$tabBar.append(button);

      if (tab.id === "playlist") continue;

      const shortcut = document.createElement("button");
      shortcut.className = "hub-header-shortcut";
      shortcut.type = "button";
      shortcut.dataset.tab = tab.id;
      shortcut.title = tab.label;
      shortcut.setAttribute("aria-label", tab.label);
      const shortcutCounter = tab.id === "cart"
        ? '<span class="hub-header-shortcut-count hub-cart-shortcut-count" aria-hidden="true">0</span>'
        : '<span class="hub-header-shortcut-dot" aria-hidden="true"></span>';
      shortcut.innerHTML = `<span class="hub-header-shortcut-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span>${shortcutCounter}`;
      shortcut.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        r.$toggleSectionPanel(tab.id);
      });
      r.$headerShortcuts.append(shortcut);
    }
}

export const setupRuntimeShell = [setupRuntimeShell1, setupRuntimeShell2, setupRuntimeShell3];
