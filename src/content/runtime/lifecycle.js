import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState, updateRuntimeState } from "./context.js";
import { formatDuration, portableBandcampUrl } from "../core.js";
import { DEFAULT_DATA_FOLDER, MAX_SAVED_THEMES, MUSIC_BAR_WIDTHS } from "../state.js";
import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { dataHomeStatus } from "../../shared/data-home.js";

function registerLifecycle1(r) {
r.$scrubTarget = function scrubTarget() {
      const pendingFeed = r.$pendingFeedTrackId ? r.$getFeedPlayerState(r.$pendingFeedTrackId) : null;
      const pendingFeedCard = r.$pendingFeedTrackId
        ? document.querySelector(`.collection-item-container[data-trackid="${CSS.escape(r.$pendingFeedTrackId)}"][data-item-json]`)
        : null;
      const pendingFeedData = r.$parseJsonAttribute(pendingFeedCard, "data-item-json") || {};
      const duration = pendingFeed
        ? Number(pendingFeed.duration) || Number(pendingFeedData.featured_track_duration) || 0
        : r.$pendingFeedTrackId ? Number(pendingFeedData.featured_track_duration) || 0
        : runtimeSeamless.enabled ? Number(runtimeSeamless.duration) || 0 : Number(r.$getAudio()?.duration) || Number(runtimeLive.duration) || 0;
      return {
        duration,
        currentTime: (Number(r.$scrubSlider.value) / 1000) * duration
      };
    };
r.$seekToScrubTarget = async function seekToScrubTarget() {
      window.clearTimeout(r.$pendingSeekTimer);
      const target = r.$scrubTarget();
      if (!target.duration) return;
      if (r.$pendingFeedTrackId) {
        r.$pendingFeedSeekTime = target.currentTime;
        r.$pendingFeedSeekRevision += 1;
        const feedAudio = r.$getAudio();
        if (feedAudio?.duration) feedAudio.currentTime = target.currentTime;
        return;
      }
      if (runtimeSeamless.enabled) {
        await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: target.currentTime });
        return;
      }
      const audio = r.$getAudio();
      if (audio?.duration) {
        audio.currentTime = target.currentTime;
        return;
      }
      const discover = r.$getDiscoverPlayerState();
      if (discover && r.$bridgedMedia?.src) {
        r.$pageMediaCommand("seek", { currentTime: target.currentTime });
        return;
      }
      if (discover?.timeline) {
        const min = Number(discover.timeline.min) || 0;
        const max = Number(discover.timeline.max) || 1;
        discover.timeline.value = String(min + (max - min) * (target.currentTime / target.duration));
        discover.timeline.dispatchEvent(new Event("input", { bubbles: true }));
        discover.timeline.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
r.$finishScrub = async function finishScrub() {
      const revision = r.$scrubRevision;
      window.clearTimeout(r.$scrubReleaseTimer);
      await r.$seekToScrubTarget();
      if (revision !== r.$scrubRevision) return;
      r.$scrubbing = false;
      r.$renderPlayer();
    };
}

function registerHeaderMount(r) {
r.$initializeHeaderMount = function initializeHeaderMount() {
      let shadowHeaderObserver = null;
      let observedHeaderShadow = null;
      const nativeHeaderCartSelector = [
        "a[href*='/cart']",
        "a[href*='bandcamp.com/cart']",
        "[aria-label*='cart' i]",
        "[title*='cart' i]",
        "[data-testid*='cart' i]",
        ".cart-link",
        ".cart-wrapper",
        ".cart-wrapper-corp-lo",
        ".menubar-cart-icon",
        "#cart-link",
        "#cart-control"
      ].join(",");
      function syncNativeHeaderCart(nav) {
        const cartShortcut = r.$headerShortcuts.querySelector('[data-tab="cart"]');
        cartShortcut.hidden = false;
        const roots = [
          nav,
          document.querySelector("#menubar-wrapper"),
          document.querySelector("#user-nav"),
          ...document.querySelectorAll("header, header .menu-items, ul[role='menubar'].menu-items"),
          document.querySelector("menu-bar")?.shadowRoot
        ].filter(Boolean);
        const labelledNativeCarts = roots.flatMap((headerRoot) => [...headerRoot.querySelectorAll(nativeHeaderCartSelector)]);
        const iconNativeCarts = roots.flatMap((headerRoot) => [...headerRoot.querySelectorAll('use[href$="#menubar-cart-icon"], use[xlink\\:href$="#menubar-cart-icon"]')]
          .map((icon) => icon.closest("a, button, [role='button'], li"))
          .filter(Boolean));
        const nativeCarts = [...new Set([...labelledNativeCarts, ...iconNativeCarts])]
          .filter((control) => !r.$root.contains(control));
        const hideHeaderCart = Boolean(runtimeState.appearance.hideHeaderCart);
        for (const nativeCart of nativeCarts) {
          nativeCart.setAttribute("data-bandkit-native-cart", "");
          nativeCart.toggleAttribute("hidden", hideHeaderCart);
          const nativeCartWrapper = nativeCart.closest("li");
          nativeCartWrapper?.setAttribute("data-bandkit-native-cart-wrapper", "");
          nativeCartWrapper?.toggleAttribute("hidden", hideHeaderCart);
          if (nativeCart.dataset.bandkitCartBound) continue;
          nativeCart.dataset.bandkitCartBound = "true";
          nativeCart.addEventListener("click", (event) => {
            if (!runtimeState.appearance.hideHeaderCart) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            r.$openBandKitCart();
          });
        }
        r.$applyShadowHeaderCartVisibility(hideHeaderCart);
      }
      let extensionStackingAncestor = null;
      let extensionStackingOriginal = null;
      function syncExtensionStackingAncestor() {
        const shadowHost = r.$root.getRootNode() instanceof ShadowRoot ? r.$root.getRootNode().host : null;
        const nextAncestor = r.$root.closest("header, #menubar-wrapper")
          || shadowHost?.closest?.("menu-bar, header, #menubar-wrapper")
          || null;
        if (extensionStackingAncestor === nextAncestor) return;
        if (extensionStackingAncestor) {
          extensionStackingAncestor.removeAttribute("data-bandkit-extension-stacking");
          if (extensionStackingOriginal?.value) {
            extensionStackingAncestor.style.setProperty("z-index", extensionStackingOriginal.value, extensionStackingOriginal.priority);
          } else {
            extensionStackingAncestor.style.removeProperty("z-index");
          }
        }
        extensionStackingAncestor = nextAncestor;
        extensionStackingOriginal = extensionStackingAncestor ? {
          value: extensionStackingAncestor.style.getPropertyValue("z-index"),
          priority: extensionStackingAncestor.style.getPropertyPriority("z-index")
        } : null;
        if (extensionStackingAncestor) {
          extensionStackingAncestor.setAttribute("data-bandkit-extension-stacking", "");
          // Bandcamp's scrolled Feed sidebar and header both use z-index:100
          // !important. Inline priority is required so the visible fixed panel
          // remains the actual pointer target after the sidebar becomes sticky.
          extensionStackingAncestor.style.setProperty("z-index", "2147483646", "important");
        }
      }
      function mountLauncherInHeader({ allowFloating = false } = {}) {
        const pageFeedControl = document.querySelector('ul[role="menubar"] a[aria-label="Feed"], .menu-items a[aria-label="Feed"]');
        const menuBarShadow = document.querySelector("menu-bar")?.shadowRoot || null;
        if (menuBarShadow && observedHeaderShadow !== menuBarShadow) {
          shadowHeaderObserver?.disconnect();
          observedHeaderShadow = menuBarShadow;
          shadowHeaderObserver = new MutationObserver(() => scheduleHeaderMount());
          shadowHeaderObserver.observe(menuBarShadow, { childList: true, subtree: true });
        }
        const shadowFeedControl = menuBarShadow?.querySelector('a[aria-label="Feed"]') || null;
        const feedControl = pageFeedControl || shadowFeedControl;
        const feedItem = feedControl?.parentElement;
        const modernNav = feedControl?.closest("ul");
        const legacyNav = document.querySelector("#user-nav");
        if (modernNav && feedItem?.parentElement === modernNav) {
          r.$root.style.cssText = "align-items:center;display:flex;height:100%;list-style:none;margin:0;padding:0";
          r.$root.className = "bandkit-menu-item";
          r.$root.setAttribute("role", "none");
          if (feedItem.nextElementSibling !== r.$root) feedItem.after(r.$root);
          syncExtensionStackingAncestor();
          r.$launcher.classList.remove("is-floating");
          r.$launcher.classList.add("is-header", "is-modern-header");
          const nativeIcon = feedControl.querySelector("svg");
          const nativeIconStyle = nativeIcon ? getComputedStyle(nativeIcon) : null;
          const nativeColor = nativeIconStyle?.fill && nativeIconStyle.fill !== "none"
            ? nativeIconStyle.fill
            : nativeIconStyle?.stroke || getComputedStyle(feedControl).color;
          r.$launcher.style.color = nativeColor;
          syncNativeHeaderCart(modernNav);
          return true;
        }
        if (legacyNav) {
          r.$root.style.cssText = "align-items:center;display:flex;height:100%;list-style:none;margin:0;padding:0";
          r.$root.className = "";
          r.$root.removeAttribute("role");
          if (r.$root.parentElement !== legacyNav) legacyNav.prepend(r.$root);
          syncExtensionStackingAncestor();
          r.$launcher.style.removeProperty("color");
          r.$launcher.classList.remove("is-floating", "is-modern-header");
          r.$launcher.classList.add("is-header");
          syncNativeHeaderCart(legacyNav);
          return true;
        }
        if (allowFloating) {
          document.body.append(r.$root);
          syncExtensionStackingAncestor();
          r.$launcher.style.removeProperty("color");
          r.$launcher.classList.remove("is-header", "is-modern-header");
          r.$launcher.classList.add("is-floating");
          syncNativeHeaderCart(null);
        }
        return false;
      }

      let headerMountFrame = 0;
      function scheduleHeaderMount() {
        if (headerMountFrame) return;
          headerMountFrame = requestAnimationFrame(() => {
            headerMountFrame = 0;
            observeHeaderMountTargets();
            mountLauncherInHeader({ allowFloating: !r.$root.isConnected });
            r.$applyShadowHeaderTheme();
            r.$syncPlayerPageSpace();
          });
      }
      mountLauncherInHeader({ allowFloating: true });
      r.$applyShadowHeaderTheme();
      r.$syncPlayerPageSpace();
      requestAnimationFrame(r.$syncPlayerPageSpace);
      if ("ResizeObserver" in window) {
        r.$playerResizeObserver = new ResizeObserver(r.$syncPlayerPageSpace);
        r.$playerResizeObserver.observe(r.$player);
      }
      for (const delay of [100, 500, 1500]) window.setTimeout(scheduleHeaderMount, delay);
      const headerObserver = new MutationObserver(scheduleHeaderMount);
      const observedHeaderMountTargets = new WeakSet();
      function observeHeaderMountTargets() {
        if (!observedHeaderMountTargets.has(document.body)) {
          observedHeaderMountTargets.add(document.body);
          // Header replacements are direct body children on Bandcamp. Watching
          // the entire page subtree also observed every Discover grid mutation.
          headerObserver.observe(document.body, { childList: true });
        }
        for (const target of document.querySelectorAll("#menubar-wrapper, #user-nav, header[role='banner']")) {
          if (observedHeaderMountTargets.has(target)) continue;
          observedHeaderMountTargets.add(target);
          headerObserver.observe(target, { childList: true, subtree: true });
        }
      }
      observeHeaderMountTargets();
      r.$syncPageTypography();
      return { headerObserver, shadowHeaderObserver: () => shadowHeaderObserver };
    };
}

function registerRuntimeStateRestore(r) {
r.$restoreRuntimeState = function restoreRuntimeState({ saved, savedState, savedNowPlaying, initialDataHomeStatus }) {
      const sessionQueue = savedNowPlaying;
      const useSessionQueue = Array.isArray(sessionQueue?.playlist);
      if (savedState) {
        r.$state = updateRuntimeState(r.$app.replaceState({
          ...runtimeState,
          ...savedState,
          cart: savedState.cart || runtimeState.cart,
          savedCarts: r.$cartAutosave.normalizeSavedCarts(savedState.savedCarts || runtimeState.savedCarts),
          playlist: r.$normalizePlaylist(useSessionQueue ? sessionQueue?.playlist || [] : savedState.playlist || runtimeState.playlist),
          playlistMode: useSessionQueue
            ? sessionQueue?.playlistMode === "manual" ? "manual" : "browse"
            : savedState.playlistMode,
          savedPlaylists: r.$normalizeSavedPlaylists(savedState.savedPlaylists || runtimeState.savedPlaylists),
          activity: (savedState.activity || []).filter((item) => item?.url),
          appearance: {
            ...runtimeState.appearance,
            ...(savedState.appearance || {}),
            savedThemes: Array.isArray(savedState.appearance?.savedThemes)
              ? savedState.appearance.savedThemes.filter((theme) => theme?.id && theme?.label && theme?.accent && theme?.surface).slice(0, MAX_SAVED_THEMES)
              : []
          },
          dj: {
            ...runtimeState.dj,
            ...(savedState.dj || {})
          }
        }));
      }
      if (!savedState && useSessionQueue) {
        runtimeState.playlist = r.$normalizePlaylist(sessionQueue?.playlist || []);
        runtimeState.playlistMode = sessionQueue?.playlistMode === "manual" ? "manual" : "browse";
      }
      r.$sessionNowPlayingLoaded = useSessionQueue;
      runtimeState.playlistMode = runtimeState.playlistMode === "manual" ? "manual" : "browse";
      runtimeState.scrubberStyle = runtimeState.scrubberStyle === "traditional" ? "traditional" : "waveform";
      runtimeState.musicBarSize = runtimeState.musicBarSize === "compact" ? "compact" : "standard";
      runtimeState.musicBarWidth = MUSIC_BAR_WIDTHS.includes(runtimeState.musicBarWidth) ? runtimeState.musicBarWidth : "default";
      runtimeState.musicBarCustomWidth = Math.round(Math.max(480, Math.min(2000, Number(runtimeState.musicBarCustomWidth) || 900)));
      runtimeState.appearance.applyToPage = Boolean(runtimeState.appearance.applyToPage);
      runtimeState.appearance.pageAware = !runtimeState.appearance.applyToPage;
      const storedModernReleasePages = runtimeState.appearance.modernReleasePages;
      runtimeState.appearance.modernReleasePages = Boolean(storedModernReleasePages);
      if (storedModernReleasePages !== runtimeState.appearance.modernReleasePages) runtimeSaveState();
      const hideShoppingCart = Boolean(runtimeState.appearance.hidePageCart || runtimeState.appearance.hideHeaderCart);
      runtimeState.appearance.hidePageCart = hideShoppingCart;
      runtimeState.appearance.hideHeaderCart = hideShoppingCart;
      if (String(runtimeState.dataFolderName || "").toLowerCase() === DEFAULT_DATA_FOLDER.toLowerCase()) {
        runtimeState.dataFolderName = `Documents/${DEFAULT_DATA_FOLDER}`;
        runtimeSaveState();
      }
      if (initialDataHomeStatus?.folderName && runtimeState.dataFolderName !== initialDataHomeStatus.folderName) {
        runtimeState.dataFolderName = initialDataHomeStatus.folderName;
        runtimeSaveState();
      }
      if (initialDataHomeStatus?.configured && runtimeState.dataFolderSetup !== true) {
        runtimeState.dataFolderSetup = true;
        runtimeSaveState();
      }
      if (!r.$dataHomeReady) {
        runtimeState.open = true;
        runtimeSaveState();
      }
      const discoveredFeedUrl = r.$discoverBandcampFeedUrl();
      if (discoveredFeedUrl && discoveredFeedUrl !== runtimeState.feedUrl) {
        runtimeState.feedUrl = discoveredFeedUrl;
        runtimeSaveState();
      }
      if (r.$openFeedFromBandcampHome()) return true;
      r.$applyPersistedLayout(saved[STORAGE_KEYS.LAYOUT]);
      const savedAtDate = runtimeState.cartSavedAt ? new Date(runtimeState.cartSavedAt) : new Date();
      const initialAutoSave = r.$cartAutosave.upsertAutoSavedCart(runtimeState.savedCarts, runtimeState.cart, {
        savedAt: Number.isNaN(savedAtDate.getTime()) ? new Date().toISOString() : savedAtDate.toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        summary: runtimeState.cartSummary
      });
      runtimeState.savedCarts = initialAutoSave.savedCarts;
      if (initialAutoSave.changed) runtimeSaveState();
      if (["playing", "nowPlaying"].includes(runtimeState.activeTab)) {
        runtimeState.activeTab = "playlist";
        runtimeState.playlistView = "current";
      }
      if (!["current", "saved"].includes(runtimeState.playlistView)) runtimeState.playlistView = "current";
      if (!r.$tabs.some((tab) => tab.id === runtimeState.activeTab)) runtimeState.activeTab = "playlist";
      if (!["floating", "docked"].includes(runtimeState.layoutMode)) runtimeState.layoutMode = "floating";
      if (!["left", "right"].includes(runtimeState.dockSide)) runtimeState.dockSide = "right";
      if (!Number.isFinite(Number(runtimeState.dockedWidth)) || Number(runtimeState.dockedWidth) < 320) runtimeState.dockedWidth = 420;
      runtimeState.wishlistTrackKeys = Array.isArray(runtimeState.wishlistTrackKeys)
        ? runtimeState.wishlistTrackKeys.filter((key) => typeof key === "string" && key).slice(-500)
        : [];
      r.$pageDjOpen = Boolean(runtimeState.dj.pageOpen);
      if (!runtimeState.launcherPosition || !Number.isFinite(Number(runtimeState.launcherPosition.left)) || !Number.isFinite(Number(runtimeState.launcherPosition.top))) {
        runtimeState.launcherPosition = null;
      }
      return false;
    };
}

function registerLifecycle2(r) {
r.$init = async function init() {
      document.documentElement.dataset.bandkitFeedPage = String(document.body.classList.contains("feed") || /\/feed\/?$/.test(location.pathname));
      const earlyModernPageBootstrap = document.documentElement.dataset.bandkitModernBootstrap === "true"
        ? globalThis.BandKitModernPagesBootstrap
        : null;
      const savedPromise = r.$storageGet([STORAGE_KEYS.STATE, STORAGE_KEYS.LAYOUT]);
      const nowPlayingPromise = r.$runtimeMessage({ type: MESSAGES.GET_NOW_PLAYING });
      const dataHomeStatusPromise = dataHomeStatus();
      const styleUrl = new URL(chrome.runtime.getURL("hub.css"));
      styleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
      const modernStyleUrl = new URL(chrome.runtime.getURL("modern-release.css"));
      modernStyleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
      const hubCssPromise = fetch(styleUrl.href).then((response) => response.text());
      const modernCssPromise = earlyModernPageBootstrap
        ? Promise.resolve("")
        : fetch(modernStyleUrl.href).then((response) => response.text());
      const [saved, initialDataHomeStatus, savedNowPlaying] = await Promise.all([savedPromise, dataHomeStatusPromise, nowPlayingPromise]);
      r.$localDataHomePermission = initialDataHomeStatus?.permission || "missing";
      const savedState = saved[STORAGE_KEYS.STATE];
      r.$dataDirectoryHandle = initialDataHomeStatus?.handle || null;
      r.$dataHomeReady = initialDataHomeStatus?.configured === true || savedState?.dataFolderSetup === true;
      if (earlyModernPageBootstrap) {
        runtimeState.appearance = {
          ...runtimeState.appearance,
          ...(savedState?.appearance || {})
        };
        try {
          r.$applyModernReleaseLayout();
        } finally {
          earlyModernPageBootstrap.finish?.();
        }
      }
      const [hubCss, modernCss] = await Promise.all([hubCssPromise, modernCssPromise]);
      r.$style.textContent = hubCss;
      if (modernCss) {
        r.$modernReleaseStyle.textContent = modernCss;
        document.head.append(r.$modernReleaseStyle);
      }
      const headerMount = r.$initializeHeaderMount();

      if (r.$restoreRuntimeState({ saved, savedState, savedNowPlaying, initialDataHomeStatus })) return;
      await r.$syncSeamlessState();
      r.$applyAppearance();
      r.$syncTrackKeyVisibilityMode();
      r.$syncPageActionLabelMode();
      r.$applyLayoutMode();
      r.$observePageActionSources();
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => {
          r.$capturePanelLayout();
          r.$schedulePlayerSectionGeometry();
        }).observe(r.$panel);
      }
      r.$scanLivePlayer();
      r.$render();
      r.$schedulePortableDataHomeSync();
      void r.$refreshIncompletePlaylistMetadata();
      r.$runPendingTrackAction();
      if (!r.$scanTimer && !r.$scanIdleCallback) r.$scheduleLivePlayerMaintenance();
      r.$seamlessSyncTimer = window.setInterval(() => void r.$syncSeamlessState(), 3000);
      window.addEventListener("scroll", () => {
        r.$lastPageScrollAt = Date.now();
      }, { passive: true });
      window.addEventListener("pageshow", () => void r.$syncSeamlessState());
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          void r.$syncSeamlessState();
          void r.$refreshPortableDataHomePermission({ notify: true });
          r.$scheduleLivePlayerMaintenance(120);
        }
      });
      window.setTimeout(r.$applyAppearance, 800);
      window.addEventListener("resize", () => {
        r.$applyLauncherPosition();
        r.$applySavedLayout();
        r.$syncPlayerPageSpace();
        r.$schedulePlayerSectionGeometry();
      });
      r.$app.registerCleanup(() => {
        window.clearTimeout(r.$scanTimer);
        window.clearTimeout(r.$playerEventScanTimer);
        if (r.$scanIdleCallback && "cancelIdleCallback" in window) window.cancelIdleCallback(r.$scanIdleCallback);
        window.clearInterval(r.$seamlessSyncTimer);
        window.clearTimeout(r.$layoutSaveTimer);
        window.clearTimeout(r.$feedHandoffTimer);
        window.cancelAnimationFrame(r.$playerSectionGeometryFrame);
        r.$playerResizeObserver?.disconnect();
        r.$pageActionsObserver?.disconnect();
        headerMount.headerObserver.disconnect();
        headerMount.shadowHeaderObserver()?.disconnect();
        const finalPanelRect = r.$panel.getBoundingClientRect();
        if (finalPanelRect.width && finalPanelRect.height) {
          if (runtimeState.layoutMode === "docked") {
            runtimeState.dockedWidth = Math.round(finalPanelRect.width);
          } else {
            runtimeState.layout = {
              left: Math.round(finalPanelRect.left),
              top: Math.round(finalPanelRect.top),
              width: Math.round(finalPanelRect.width),
              height: Math.round(finalPanelRect.height)
            };
          }
        }
        r.$saveLayoutState();
        r.$setResizeCursor("");
      });
      window.addEventListener("pagehide", () => r.$app.cleanup(), { once: true });
      r.$hubReady = true;
      if (r.$dataHomeReady && r.$localDataHomePermission !== "granted") {
        r.$showToast("Folder backup needs access. Your Chrome copy is safe; restore access in Bandkit.", 6500);
      }
      r.$reportDiagnostic("ready");
    };
}

export const registerLifecycle = [registerHeaderMount, registerRuntimeStateRestore, registerLifecycle1, registerLifecycle2];

function setupLifecycle1(r) {
r.$scrubSlider.addEventListener("pointerdown", () => r.$beginScrub(true));
r.$scrubSlider.addEventListener("input", () => {
      r.$beginScrub();
      const target = r.$scrubTarget();
      r.$currentTimeLabel.textContent = formatDuration(target.currentTime);
      r.$scrubSlider.setAttribute("aria-valuetext", `${formatDuration(target.currentTime)} of ${formatDuration(target.duration)}`);
      r.$syncScrubVisual();
      window.clearTimeout(r.$pendingSeekTimer);
      r.$pendingSeekTimer = window.setTimeout(() => {
        void r.$seekToScrubTarget();
      }, 60);
    });
r.$scrubSlider.addEventListener("change", () => {
      void r.$finishScrub();
    });
r.$scrubSlider.addEventListener("pointerup", () => {
      window.clearTimeout(r.$scrubReleaseTimer);
      r.$scrubReleaseTimer = window.setTimeout(() => {
        if (r.$scrubbing) void r.$finishScrub();
      }, 120);
    });
r.$scrubSlider.addEventListener("pointercancel", () => {
      window.clearTimeout(r.$pendingSeekTimer);
      window.clearTimeout(r.$scrubReleaseTimer);
      r.$scrubbing = false;
      r.$renderPlayer();
    });
r.$scrubSlider.addEventListener("blur", () => {
      if (r.$scrubbing) void r.$finishScrub();
    });
r.$runtimeMessageHandler = (message, _sender, sendResponse) => {
      if (message?.type === MESSAGES.PING) {
        sendResponse({ ok: true, version: chrome.runtime.getManifest().version, ready: r.$hubReady, open: runtimeState.open, error: r.$startupError });
        return false;
      }
      if (message?.type === MESSAGES.TOGGLE) r.$setOpen(!runtimeState.open);
      if (message?.type === MESSAGES.OPEN) r.$setOpen(true);
      if (message?.type === MESSAGES.SEAMLESS_STATE) r.$applySeamlessState(message.state);
      if (message?.type === MESSAGES.NOW_PLAYING_STATE) {
        const playlist = r.$normalizePlaylist(message.playlist);
        const playlistMode = message.playlistMode === "manual" ? "manual" : "browse";
        if (JSON.stringify(playlist) !== JSON.stringify(runtimeState.playlist) || playlistMode !== runtimeState.playlistMode) {
          runtimeState.playlist = playlist;
          runtimeState.playlistMode = playlistMode;
          if (runtimeState.activeTab === "playlist") r.$render();
          else r.$renderPlayer();
          r.$injectPlaylistButtons();
        }
      }
      if (message?.type === MESSAGES.PLAYBACK_CLEARED) r.$clearLocalPlaybackState({ persist: false });
      if (message?.type === MESSAGES.WISHLIST_UPDATED) {
        r.$markWishlistTrack(message.key, message.success !== false);
      }
      if (message?.type === MESSAGES.RESTORE_CART) {
        r.$restoreSavedCart(message.items)
          .then(sendResponse)
          .catch((error) => sendResponse({ ok: false, error: error.message || "Cart restoration failed." }));
        return true;
      }
      sendResponse({ ok: true });
      return false;
    };
chrome.runtime.onMessage.addListener(r.$runtimeMessageHandler);
r.$app.registerCleanup(() => chrome.runtime.onMessage.removeListener(r.$runtimeMessageHandler));
chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== "local") return;
      const incomingLayout = changes[STORAGE_KEYS.LAYOUT]?.newValue;
      if (incomingLayout && (Number(incomingLayout.revision) || 0) > r.$layoutRevision) {
        r.$applyPersistedLayout(incomingLayout);
        if (r.$hubReady) {
          r.$applyLayoutMode();
          r.$render();
        }
      }
      const incoming = changes[STORAGE_KEYS.STATE]?.newValue;
      if (!incoming) return;
      const savedCarts = r.$cartAutosave.normalizeSavedCarts(incoming.savedCarts);
      const playlist = r.$sessionNowPlayingLoaded ? runtimeState.playlist : r.$normalizePlaylist(incoming.playlist);
      const playlistMode = r.$sessionNowPlayingLoaded
        ? runtimeState.playlistMode
        : incoming.playlistMode === "manual" ? "manual" : "browse";
      const savedPlaylists = r.$normalizeSavedPlaylists(incoming.savedPlaylists);
      const dataFolderName = String(incoming.dataFolderName || "");
      const dataFolderSetup = incoming.dataFolderSetup === true;
      const autoAnalyzeTracks = incoming.autoAnalyzeTracks !== false;
      const showTrackKeys = incoming.showTrackKeys !== false;
      const pageActionLabels = Boolean(incoming.pageActionLabels);
      const recordPlaylistMetadata = incoming.recordPlaylistMetadata !== false;
      const scrubberStyle = incoming.scrubberStyle === "traditional" ? "traditional" : "waveform";
      const musicBarSize = incoming.musicBarSize === "compact" ? "compact" : "standard";
      const musicBarWidth = MUSIC_BAR_WIDTHS.includes(incoming.musicBarWidth) ? incoming.musicBarWidth : "default";
      const musicBarCustomWidth = Math.round(Math.max(480, Math.min(2000, Number(incoming.musicBarCustomWidth) || 900)));
      const appearance = {
        ...runtimeState.appearance,
        ...(incoming.appearance || {}),
        savedThemes: Array.isArray(incoming.appearance?.savedThemes)
          ? incoming.appearance.savedThemes.filter((theme) => theme?.id && theme?.label && theme?.accent && theme?.surface).slice(0, MAX_SAVED_THEMES)
          : runtimeState.appearance.savedThemes
      };
      const incomingModernReleasePages = appearance.modernReleasePages;
      appearance.modernReleasePages = Boolean(incomingModernReleasePages);
      const appearanceNeedsNormalization = incomingModernReleasePages !== appearance.modernReleasePages;
      const appearanceChanged = JSON.stringify(appearance) !== JSON.stringify(runtimeState.appearance);
      if (JSON.stringify(savedCarts) === JSON.stringify(runtimeState.savedCarts)
        && JSON.stringify(playlist) === JSON.stringify(runtimeState.playlist)
        && playlistMode === runtimeState.playlistMode
        && JSON.stringify(savedPlaylists) === JSON.stringify(runtimeState.savedPlaylists)
        && autoAnalyzeTracks === (runtimeState.autoAnalyzeTracks !== false)
        && showTrackKeys === (runtimeState.showTrackKeys !== false)
        && pageActionLabels === Boolean(runtimeState.pageActionLabels)
        && recordPlaylistMetadata === (runtimeState.recordPlaylistMetadata !== false)
        && scrubberStyle === runtimeState.scrubberStyle
        && musicBarSize === runtimeState.musicBarSize
        && musicBarWidth === runtimeState.musicBarWidth
        && musicBarCustomWidth === runtimeState.musicBarCustomWidth
        && dataFolderName === runtimeState.dataFolderName
        && dataFolderSetup === (runtimeState.dataFolderSetup === true)
        && !appearanceChanged) return;
      runtimeState.savedCarts = savedCarts;
      runtimeState.playlist = playlist;
      runtimeState.playlistMode = playlistMode;
      runtimeState.savedPlaylists = savedPlaylists;
      runtimeState.dataFolderName = dataFolderName;
      runtimeState.dataFolderSetup = dataFolderSetup;
      if (r.$localDataHomePermission === "missing") r.$dataHomeReady = dataFolderSetup;
      runtimeState.autoAnalyzeTracks = autoAnalyzeTracks;
      runtimeState.showTrackKeys = showTrackKeys;
      runtimeState.pageActionLabels = pageActionLabels;
      runtimeState.recordPlaylistMetadata = recordPlaylistMetadata;
      runtimeState.scrubberStyle = scrubberStyle;
      runtimeState.musicBarSize = musicBarSize;
      runtimeState.musicBarWidth = musicBarWidth;
      runtimeState.musicBarCustomWidth = musicBarCustomWidth;
      runtimeState.appearance = appearance;
      if (appearanceNeedsNormalization) runtimeSaveState();
      if (!runtimeState.savedCarts.some((snapshot) => snapshot.id === runtimeState.selectedSavedCartId)) {
        runtimeState.selectedSavedCartId = null;
      }
      if (["cart", "playlist", "settings"].includes(runtimeState.activeTab)) r.$render();
      else r.$renderPlayer();
      if (appearanceChanged) r.$applyAppearance();
      r.$syncTrackKeyVisibilityMode();
      r.$syncPageActionLabelMode();
      r.$syncScrubberStyles();
      r.$syncMusicBarSize();
      r.$syncMusicBarWidth();
      r.$ensurePagePlayerWaveforms();
      r.$injectPageDjToolsLink();
      r.$injectPlaylistButtons();
    });
r.$init().catch((error) => {
      r.$startupError = String(error?.stack || error?.message || error);
      console.error("Bandkit failed to start.", error);
      r.$reportDiagnostic("error", r.$startupError);
      try {
        r.$app.cleanup();
      } catch {}
      r.$root.remove();
    });
}

export const setupLifecycle = [setupLifecycle1];
