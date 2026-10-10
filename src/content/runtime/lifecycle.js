import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState, updateRuntimeState } from "./context.js";
import { formatDuration, portableBandcampUrl } from "../core.js";
import { MAX_PLAYLIST_ITEMS, MAX_SAVED_THEMES, MUSIC_BAR_SCRUBBER_WIDTHS, MUSIC_BAR_STYLES, MUSIC_BAR_WIDTHS, ONBOARDING_COMPLETE, PLAYER_BLEND_MODES, SCRUBBER_HANDLE_SHAPES, VISUALIZER_BLEND_MODES, normalizeVisualizerType, normalizeHandleSize } from "../state.js";
import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { normalizedActivity, repairDuplicatedCartActivity } from "../activity-model.js";
import { HANDLE_OUTLINE_CSS } from "../handle-outline-style.js";
import { normalizeCustomHandle } from "../custom-scrub-handle.js";
import { normalizeCustomTimeline } from "../custom-timeline.js";
import { normalizeCustomPlayerButtons } from "../custom-player-buttons.js";
import { normalizeTimelineStyle } from "../timeline-styles.js";
import { headerMutationNeedsMount } from "./header-mutations.js";
import { applyHeaderScrollBehavior } from "./header-scroll.js";
import { resumeVisualizer } from "../visualizer-frame.js";

function normalizeGlassAppearance(appearance) {
  const previous = [appearance.frostedGlass, appearance.glassTransparency, appearance.glassBlur];
  appearance.frostedGlass = appearance.frostedGlass === true;
  appearance.glassTransparency = Math.round(Math.max(0, Math.min(70, Number(appearance.glassTransparency) || 0)));
  appearance.glassBlur = Math.round(Math.max(0, Math.min(30, Number(appearance.glassBlur) || 0)));
  return previous.some((value, index) => value !== [appearance.frostedGlass, appearance.glassTransparency, appearance.glassBlur][index]);
}

function normalizeVisualThemeAppearance(appearance) {
  const previous = [appearance.visualizerColourSource, appearance.visualThemeId];
  appearance.visualizerColourSource = appearance.visualizerColourSource === "custom" ? "custom" : "theme";
  if (!appearance.visualThemeId || appearance.visualThemeId === "none") appearance.visualThemeId = "dynamic";
  return previous.some((value, index) => value !== [appearance.visualizerColourSource, appearance.visualThemeId][index]);
}

function normalizedVisualizerDimension(value, min, max) {
  if (value === "auto" || value == null || value === "") return "auto";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(Math.max(min, Math.min(max, numeric))) : "auto";
}

function normalizedOptionalColour(value) {
  return /^#[\da-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : null;
}

function normalizedCrossTabSettings(incoming, current) {
  const onboardingCompletedVersion = Math.max(
    0,
    Number(current.onboardingCompletedVersion) || 0,
    Number(incoming.onboardingCompletedVersion) || 0
  );
  return {
    openHomeToFeed: Boolean(incoming.openHomeToFeed),
    feedUrl: typeof incoming.feedUrl === "string" ? incoming.feedUrl : "",
    onboardingCompletedVersion,
    onboardingStep: onboardingCompletedVersion > 0 ? 0 : Math.max(0, Math.min(10, Number(incoming.onboardingStep) || 0)),
    djToolsEnabled: incoming.djToolsEnabled !== false,
    cartEnabled: incoming.cartEnabled !== false,
    playlistsEnabled: incoming.playlistsEnabled !== false,
    activityEnabled: incoming.activityEnabled !== false,
    autoAnalyzeTracks: incoming.autoAnalyzeTracks !== false,
    showTrackKeys: incoming.showTrackKeys !== false,
    showCamelotNotation: incoming.showCamelotNotation === true,
    recordPlaylistMetadata: incoming.recordPlaylistMetadata !== false,
    showMusicBarAnalysis: incoming.showMusicBarAnalysis !== false,
    keepMusicBarAnalysisVisible: incoming.keepMusicBarAnalysisVisible === true,
    scrubberStyle: normalizeTimelineStyle(incoming.scrubberStyle),
    scrubberHandleShape: SCRUBBER_HANDLE_SHAPES.includes(incoming.scrubberHandleShape)
      ? incoming.scrubberHandleShape : "pill",
    customScrubberHandle: normalizeCustomHandle(incoming.customScrubberHandle),
    customTimeline: normalizeCustomTimeline(incoming.customTimeline),
    customPlayerButtons: normalizeCustomPlayerButtons(incoming.customPlayerButtons),
    musicBarTimelineColor: normalizedOptionalColour(incoming.musicBarTimelineColor),
    musicBarHandleColor: normalizedOptionalColour(incoming.musicBarHandleColor),
    musicBarControlsColor: normalizedOptionalColour(incoming.musicBarControlsColor),
    musicBarPlayerColor: normalizedOptionalColour(incoming.musicBarPlayerColor),
    retainTimelineColors: incoming.retainTimelineColors !== false,
    scrubberHandleSize: normalizeHandleSize(incoming.scrubberHandleSize),
    retainSvgHandleColors: incoming.retainSvgHandleColors === true,
    retainPngHandleColors: incoming.retainPngHandleColors !== false,
    musicBarScrubberWidth: MUSIC_BAR_SCRUBBER_WIDTHS.includes(incoming.musicBarScrubberWidth)
      ? incoming.musicBarScrubberWidth : "full",
    musicBarStyle: incoming.musicBarStyle === "floating" ? "rounded"
      : MUSIC_BAR_STYLES.includes(incoming.musicBarStyle) ? incoming.musicBarStyle : "zune",
    musicBarDynamicColor: incoming.musicBarDynamicColor !== false,
    musicBarPlayerDynamicColor: incoming.musicBarPlayerDynamicColor !== false,
    musicBarPanelDynamicColor: incoming.musicBarPanelDynamicColor !== false,
    musicBarBlendMode: PLAYER_BLEND_MODES.includes(incoming.musicBarBlendMode)
      ? incoming.musicBarBlendMode : "normal",
    musicBarPanelButtons: "compact",
    musicBarRecentPanel: ["playlist", "cart", "activity", "settings"].includes(incoming.musicBarRecentPanel)
      ? incoming.musicBarRecentPanel : "playlist",
    musicBarSize: incoming.musicBarSize === "compact" ? "compact" : "standard",
    musicBarVisualizer: incoming.musicBarVisualizer === "off" ? "off"
      : normalizeVisualizerType(incoming.musicBarVisualizerType, incoming.musicBarVisualizer),
    musicBarVisualizerType: normalizeVisualizerType(incoming.musicBarVisualizerType, incoming.musicBarVisualizer),
    musicBarVisualizerOpacity: Math.round(Math.max(10, Math.min(400, Number(incoming.musicBarVisualizerOpacity) || 100))),
    musicBarVisualizerWidth: normalizedVisualizerDimension(incoming.musicBarVisualizerWidth, 240, 3200),
    musicBarVisualizerHeight: normalizedVisualizerDimension(incoming.musicBarVisualizerHeight, 24, 240),
    musicBarVisualizerBlendMode: VISUALIZER_BLEND_MODES.includes(incoming.musicBarVisualizerBlendMode)
      ? incoming.musicBarVisualizerBlendMode : "normal",
    musicBarWidth: MUSIC_BAR_WIDTHS.includes(incoming.musicBarWidth) ? incoming.musicBarWidth : "default",
    musicBarCustomWidth: Math.round(Math.max(480, Math.min(2000, Number(incoming.musicBarCustomWidth) || 900))),
    musicBarBottomOffset: Math.round(Math.max(0, Math.min(160, Number(incoming.musicBarBottomOffset) || 0))),
    dockChevronGap: Math.max(0, Number(incoming.dockChevronGap) || 0),
    settingsDrawers: incoming.settingsDrawers && typeof incoming.settingsDrawers === "object"
      ? { ...incoming.settingsDrawers } : {},
    dj: { ...current.dj, ...(incoming.dj || {}) }
  };
}

function settingsChanged(current, incoming) {
  return Object.entries(incoming).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key]));
}

function applyOnboardingCompletionChange(r, changes) {
  if (Number(changes[STORAGE_KEYS.ONBOARDING_COMPLETE]?.newValue) <= 0
    || Number(runtimeState.onboardingCompletedVersion) > 0
    || (r.$onboardingActive && !r.$onboardingReplay)) return;
  runtimeState.onboardingCompletedVersion = ONBOARDING_COMPLETE;
  runtimeState.onboardingStep = 0;
  r.$onboardingActive = false;
  r.$onboardingReplay = false;
  if (r.$hubReady) r.$renderOnboarding();
}

function applyIncomingLayout(r, incomingLayout) {
  if (!incomingLayout || (Number(incomingLayout.revision) || 0) < r.$layoutRevision) return;
  const previousLayout = r.$savedLayoutState();
  r.$applyPersistedLayout(incomingLayout);
  const nextLayout = r.$savedLayoutState();
  previousLayout.revision = 0;
  nextLayout.revision = 0;
  if (!r.$hubReady || JSON.stringify(previousLayout) === JSON.stringify(nextLayout)) return;
  r.$applyLayoutMode();
  r.$render();
}

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
      const fraction = Math.max(0, Math.min(1, Number(r.$scrubSlider.value) / 1000));
      return {
        duration,
        fraction,
        currentTime: fraction * duration
      };
    };
r.$seekToScrubTarget = async function seekToScrubTarget() {
      window.clearTimeout(r.$pendingSeekTimer);
      const target = r.$scrubTarget();
      if (r.$pendingFeedTrackId) {
        r.$pendingFeedSeekFraction = target.fraction;
        r.$pendingFeedSeekTime = target.duration ? target.currentTime : null;
        r.$pendingFeedSeekTrackId = r.$pendingFeedTrackId;
        r.$pendingFeedSeekRevision += 1;
        if (!target.duration) return;
        if (runtimeSeamless.enabled && String(runtimeSeamless.track?.id || "") === r.$pendingFeedTrackId) {
          await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: target.currentTime });
          return;
        }
        const feedAudio = r.$getAudio();
        if (feedAudio?.duration && r.$feedStreamTrackId(feedAudio.currentSrc || feedAudio.src) === r.$pendingFeedTrackId) {
          feedAudio.currentTime = target.currentTime;
        }
        return;
      }
      if (r.$queueClassicPageSeek?.(target.fraction)) return;
      if (!target.duration) return;
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
        if (cartShortcut.hidden) cartShortcut.hidden = false;
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
        // Rewriting these attributes when nothing changed re-dirties style after
        // the launcher's computed-colour read, which forces the next header
        // synchronisation to recalculate the whole header again.
        for (const nativeCart of nativeCarts) {
          if (!nativeCart.hasAttribute("data-bandkit-native-cart")) nativeCart.setAttribute("data-bandkit-native-cart", "");
          if (nativeCart.hasAttribute("hidden") !== hideHeaderCart) nativeCart.toggleAttribute("hidden", hideHeaderCart);
          const nativeCartWrapper = nativeCart.closest("li");
          if (nativeCartWrapper && !nativeCartWrapper.hasAttribute("data-bandkit-native-cart-wrapper")) {
            nativeCartWrapper.setAttribute("data-bandkit-native-cart-wrapper", "");
          }
          if (nativeCartWrapper && nativeCartWrapper.hasAttribute("hidden") !== hideHeaderCart) {
            nativeCartWrapper.toggleAttribute("hidden", hideHeaderCart);
          }
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
      const ROOT_HEADER_CSS = "align-items:center;display:flex;height:100%;list-style:none;margin:0;padding:0";
      const LAUNCHER_HEADER_CLASSES = ["is-header", "is-modern-header", "is-floating"];
      // style.cssText reads back normalised, so the applied layout is tracked
      // separately rather than compared against the source string.
      let appliedRootLayout = "";
      function applyRootHeaderLayout(layout) {
        // display:flex stands in for the whole declaration: if a native header
        // swap wiped the inline style, the sentinel is gone and it is rewritten.
        if (appliedRootLayout === layout && r.$root.style.display === "flex") return;
        appliedRootLayout = layout;
        r.$root.style.cssText = ROOT_HEADER_CSS;
      }
      function syncLauncherHeaderClasses(active) {
        for (const className of LAUNCHER_HEADER_CLASSES) {
          const shouldHave = active.includes(className);
          if (r.$launcher.classList.contains(className) !== shouldHave) r.$launcher.classList.toggle(className, shouldHave);
        }
      }
      function mountLauncherInHeader({ allowFloating = false } = {}) {
        const pageFeedControl = document.querySelector('ul[role="menubar"] a[aria-label="Feed"], .menu-items a[aria-label="Feed"]');
        const menuBarShadow = document.querySelector("menu-bar")?.shadowRoot || null;
        applyHeaderScrollBehavior(document);
        applyHeaderScrollBehavior(menuBarShadow);
        if (menuBarShadow && observedHeaderShadow !== menuBarShadow) {
          shadowHeaderObserver?.disconnect();
          observedHeaderShadow = menuBarShadow;
          shadowHeaderObserver = new MutationObserver((records) => {
            if (records.some((record) => headerMutationNeedsMount(record, r.$root))) scheduleHeaderMount();
          });
          shadowHeaderObserver.observe(menuBarShadow, { childList: true, subtree: true });
        }
        const shadowFeedControl = menuBarShadow?.querySelector('a[aria-label="Feed"]') || null;
        const feedControl = pageFeedControl || shadowFeedControl;
        const feedItem = feedControl?.parentElement;
        const modernNav = feedControl?.closest("ul");
        const legacyNav = document.querySelector("#user-nav");
        if (modernNav && feedItem?.parentElement === modernNav) {
          applyRootHeaderLayout("modern");
          if (r.$root.className !== "bandkit-menu-item") r.$root.className = "bandkit-menu-item";
          if (r.$root.getAttribute("role") !== "none") r.$root.setAttribute("role", "none");
          if (feedItem.nextElementSibling !== r.$root) feedItem.after(r.$root);
          syncExtensionStackingAncestor();
          syncLauncherHeaderClasses(["is-header", "is-modern-header"]);
          // Every write above is guarded so that a launcher which is already
          // mounted leaves style clean, and this computed read stays cheap
          // instead of forcing a full header style recalculation each frame.
          const nativeIcon = feedControl.querySelector("svg");
          const nativeIconStyle = nativeIcon ? getComputedStyle(nativeIcon) : null;
          const nativeColor = nativeIconStyle?.fill && nativeIconStyle.fill !== "none"
            ? nativeIconStyle.fill
            : nativeIconStyle?.stroke || getComputedStyle(feedControl).color;
          if (r.$launcher.style.color !== nativeColor) r.$launcher.style.color = nativeColor;
          syncNativeHeaderCart(modernNav);
          return true;
        }
        if (legacyNav) {
          applyRootHeaderLayout("legacy");
          if (r.$root.className !== "") r.$root.className = "";
          if (r.$root.hasAttribute("role")) r.$root.removeAttribute("role");
          if (r.$root.parentElement !== legacyNav) legacyNav.prepend(r.$root);
          syncExtensionStackingAncestor();
          if (r.$launcher.style.color) r.$launcher.style.removeProperty("color");
          syncLauncherHeaderClasses(["is-header"]);
          syncNativeHeaderCart(legacyNav);
          return true;
        }
        if (allowFloating) {
          if (r.$root.parentElement !== document.body) document.body.append(r.$root);
          syncExtensionStackingAncestor();
          if (r.$launcher.style.color) r.$launcher.style.removeProperty("color");
          syncLauncherHeaderClasses(["is-floating"]);
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
      const headerObserver = new MutationObserver((records) => {
        if (records.some((record) => headerMutationNeedsMount(record, r.$root))) scheduleHeaderMount();
      });
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
r.$restoreRuntimeState = function restoreRuntimeState({ saved, savedState, savedNowPlaying }) {
      const sessionQueue = savedNowPlaying;
      const useSessionQueue = Array.isArray(sessionQueue?.playlist);
      r.$nowPlayingRevision = useSessionQueue ? Math.max(0, Number(sessionQueue?.revision) || 0) : 0;
      r.$nowPlayingTransitionTrackKey = useSessionQueue ? String(sessionQueue?.transitionTrackKey || "") : "";
      r.$nowPlayingTransitionExpiresAt = useSessionQueue ? Math.max(0, Number(sessionQueue?.transitionExpiresAt) || 0) : 0;
      const storedActivity = normalizedActivity(savedState?.activity);
      const repairCartActivity = Boolean(savedState) && savedState.activityCartEventsRepaired !== true;
      const restoredActivity = repairCartActivity ? repairDuplicatedCartActivity(storedActivity) : storedActivity;
      const legacyOnboardingState = Boolean(savedState)
        && !Object.prototype.hasOwnProperty.call(savedState, "onboardingCompletedVersion");
      const onboardingPermanentlyCompleted = Number(saved[STORAGE_KEYS.ONBOARDING_COMPLETE]) > 0
        || Number(savedState?.onboardingCompletedVersion) > 0
        || legacyOnboardingState;
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
          playlistShuffleEnabled: useSessionQueue
            ? sessionQueue?.playlistShuffleEnabled === true
            : savedState.playlistShuffleEnabled === true,
          playlistShuffleOrder: useSessionQueue
            ? Array.isArray(sessionQueue?.playlistShuffleOrder) ? sessionQueue.playlistShuffleOrder : []
            : Array.isArray(savedState.playlistShuffleOrder) ? savedState.playlistShuffleOrder : [],
          savedPlaylists: r.$normalizeSavedPlaylists(savedState.savedPlaylists || runtimeState.savedPlaylists),
          activity: restoredActivity,
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
        runtimeState.playlistShuffleEnabled = sessionQueue?.playlistShuffleEnabled === true;
        runtimeState.playlistShuffleOrder = Array.isArray(sessionQueue?.playlistShuffleOrder) ? sessionQueue.playlistShuffleOrder : [];
      }
      r.$setSharedStateBaseline(runtimeState);
      if (repairCartActivity) {
        r.$setSharedStateBaseline({ ...runtimeState, activity: storedActivity, activityCartEventsRepaired: false });
        runtimeState.activityCartEventsRepaired = true;
        runtimeSaveState();
      }
      if (legacyOnboardingState) {
        runtimeState.onboardingCompletedVersion = ONBOARDING_COMPLETE;
        runtimeState.onboardingStep = 0;
        runtimeSaveState();
      }
      if (onboardingPermanentlyCompleted) {
        runtimeState.onboardingCompletedVersion = ONBOARDING_COMPLETE;
        runtimeState.onboardingStep = 0;
        if (Number(saved[STORAGE_KEYS.ONBOARDING_COMPLETE]) <= 0) {
          void r.$persistLocal({ [STORAGE_KEYS.ONBOARDING_COMPLETE]: ONBOARDING_COMPLETE });
        }
      }
      r.$sessionNowPlayingLoaded = useSessionQueue;
      r.$lastNowPlayingSignature = r.$nowPlayingSessionSignature();
      runtimeState.onboardingCompletedVersion = Math.max(0, Number(runtimeState.onboardingCompletedVersion) || 0);
      runtimeState.onboardingStep = Math.max(0, Math.min(10, Number(runtimeState.onboardingStep) || 0));
      runtimeState.djToolsEnabled = runtimeState.djToolsEnabled !== false;
      runtimeState.cartEnabled = runtimeState.cartEnabled !== false;
      runtimeState.playlistsEnabled = runtimeState.playlistsEnabled !== false;
      runtimeState.activityEnabled = runtimeState.activityEnabled !== false;
      runtimeState.playlistMode = runtimeState.playlistMode === "manual" ? "manual" : "browse";
      runtimeState.playlistShuffleEnabled = runtimeState.playlistShuffleEnabled === true;
      runtimeState.playlistShuffleOrder = Array.isArray(runtimeState.playlistShuffleOrder)
        ? runtimeState.playlistShuffleOrder.map(String).slice(0, MAX_PLAYLIST_ITEMS)
        : [];
      runtimeState.scrubberStyle = normalizeTimelineStyle(runtimeState.scrubberStyle);
      runtimeState.scrubberHandleShape = SCRUBBER_HANDLE_SHAPES.includes(runtimeState.scrubberHandleShape)
        ? runtimeState.scrubberHandleShape : "pill";
      runtimeState.customScrubberHandle = normalizeCustomHandle(runtimeState.customScrubberHandle);
      runtimeState.customTimeline = normalizeCustomTimeline(runtimeState.customTimeline);
      runtimeState.customPlayerButtons = normalizeCustomPlayerButtons(runtimeState.customPlayerButtons);
      runtimeState.musicBarTimelineColor = normalizedOptionalColour(runtimeState.musicBarTimelineColor);
      runtimeState.musicBarHandleColor = normalizedOptionalColour(runtimeState.musicBarHandleColor);
      runtimeState.musicBarControlsColor = normalizedOptionalColour(runtimeState.musicBarControlsColor);
      runtimeState.musicBarPlayerColor = normalizedOptionalColour(runtimeState.musicBarPlayerColor);
      runtimeState.retainTimelineColors = runtimeState.retainTimelineColors !== false;
      runtimeState.scrubberHandleSize = normalizeHandleSize(runtimeState.scrubberHandleSize);
      runtimeState.retainSvgHandleColors = runtimeState.retainSvgHandleColors === true;
      runtimeState.retainPngHandleColors = runtimeState.retainPngHandleColors !== false;
      runtimeState.musicBarScrubberWidth = MUSIC_BAR_SCRUBBER_WIDTHS.includes(runtimeState.musicBarScrubberWidth)
        ? runtimeState.musicBarScrubberWidth : "full";
      runtimeState.keepMusicBarAnalysisVisible = runtimeState.keepMusicBarAnalysisVisible === true;
      runtimeState.musicBarStyle = runtimeState.musicBarStyle === "floating" ? "rounded"
        : MUSIC_BAR_STYLES.includes(runtimeState.musicBarStyle) ? runtimeState.musicBarStyle : "zune";
      runtimeState.musicBarDynamicColor = runtimeState.musicBarDynamicColor !== false;
      runtimeState.musicBarPlayerDynamicColor = runtimeState.musicBarPlayerDynamicColor !== false;
      runtimeState.musicBarPanelDynamicColor = runtimeState.musicBarPanelDynamicColor !== false;
      runtimeState.musicBarBlendMode = PLAYER_BLEND_MODES.includes(runtimeState.musicBarBlendMode)
        ? runtimeState.musicBarBlendMode : "normal";
      runtimeState.musicBarPanelButtons = "compact";
      runtimeState.musicBarRecentPanel = ["playlist", "cart", "activity", "settings"].includes(runtimeState.musicBarRecentPanel)
        ? runtimeState.musicBarRecentPanel : "playlist";
      runtimeState.musicBarSize = runtimeState.musicBarSize === "compact" ? "compact" : "standard";
      runtimeState.musicBarVisualizerType = normalizeVisualizerType(runtimeState.musicBarVisualizerType, runtimeState.musicBarVisualizer);
      runtimeState.musicBarVisualizer = runtimeState.musicBarVisualizer === "off" ? "off" : runtimeState.musicBarVisualizerType;
      runtimeState.musicBarVisualizerOpacity = Math.round(Math.max(10, Math.min(400, Number(runtimeState.musicBarVisualizerOpacity) || 100)));
      runtimeState.musicBarVisualizerWidth = normalizedVisualizerDimension(runtimeState.musicBarVisualizerWidth, 240, 3200);
      runtimeState.musicBarVisualizerHeight = normalizedVisualizerDimension(runtimeState.musicBarVisualizerHeight, 24, 240);
      runtimeState.musicBarVisualizerBlendMode = VISUALIZER_BLEND_MODES.includes(runtimeState.musicBarVisualizerBlendMode)
        ? runtimeState.musicBarVisualizerBlendMode : "normal";
      runtimeState.musicBarWidth = MUSIC_BAR_WIDTHS.includes(runtimeState.musicBarWidth) ? runtimeState.musicBarWidth : "default";
      runtimeState.musicBarCustomWidth = Math.round(Math.max(480, Math.min(2000, Number(runtimeState.musicBarCustomWidth) || 900)));
      runtimeState.musicBarBottomOffset = Math.round(Math.max(0, Math.min(160, Number(runtimeState.musicBarBottomOffset) || 0)));
      runtimeState.appearance.applyToPage = Boolean(runtimeState.appearance.applyToPage);
      runtimeState.appearance.pageAware = !runtimeState.appearance.applyToPage;
      const storedModernReleasePages = runtimeState.appearance.modernReleasePages;
      runtimeState.appearance.modernReleasePages = Boolean(storedModernReleasePages);
      const normalizedGlassAppearance = normalizeGlassAppearance(runtimeState.appearance);
      const normalizedVisualThemeAppearance = normalizeVisualThemeAppearance(runtimeState.appearance);
      if (normalizedGlassAppearance
        || normalizedVisualThemeAppearance
        || storedModernReleasePages !== runtimeState.appearance.modernReleasePages) runtimeSaveState();
      // Bandcamp's carts are hidden exactly while Bandkit's cart is on.
      const hideShoppingCart = runtimeState.cartEnabled !== false;
      runtimeState.appearance.hidePageCart = hideShoppingCart;
      runtimeState.appearance.hideHeaderCart = hideShoppingCart;
      const backupReminderDays = Number(runtimeState.backupReminderDays);
      runtimeState.backupReminderDays = [0, 7, 14, 30].includes(backupReminderDays) ? backupReminderDays : 7;
      runtimeState.backupIntroSeen = runtimeState.backupIntroSeen === true;
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
      if (!["index", "player", "features", "tools", "appearance", "browsing", "onboarding", "privacy", "about"].includes(runtimeState.settingsView)) {
        runtimeState.settingsView = "index";
      }
      if (typeof runtimeState.settingsSubView !== "string") {
        runtimeState.settingsSubView = "index";
      }
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
      const savedPromise = r.$storageGet([STORAGE_KEYS.STATE, STORAGE_KEYS.LAYOUT, STORAGE_KEYS.ONBOARDING_COMPLETE]);
      const nowPlayingPromise = r.$runtimeMessage({ type: MESSAGES.GET_NOW_PLAYING });
      const styleUrl = new URL(chrome.runtime.getURL("hub.css"));
      styleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
      const modernStyleUrl = new URL(chrome.runtime.getURL("modern-release.css"));
      modernStyleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
      const hubCssPromise = fetch(styleUrl.href).then((response) => response.text()).then((css) => css + HANDLE_OUTLINE_CSS);
      const modernCssPromise = earlyModernPageBootstrap
        ? Promise.resolve("")
        : fetch(modernStyleUrl.href).then((response) => response.text());
      const [saved, savedNowPlaying] = await Promise.all([savedPromise, nowPlayingPromise]);
      const savedState = saved[STORAGE_KEYS.STATE];
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

      if (r.$restoreRuntimeState({ saved, savedState, savedNowPlaying })) return;
      r.$activateFirstRunOnboarding();
      await r.$syncSeamlessState();
      r.$applyAppearance();
      r.$syncTrackKeyVisibilityMode();
      r.$applyLayoutMode();
      r.$observePageActionSources();
      document.addEventListener("click", (event) => {
        const target = event.target instanceof Element
          ? event.target.closest(".community-tabs a, .community-tabs button")
          : null;
        if (!target) return;
        window.requestAnimationFrame(() => r.$applyModernReleaseLayout());
      }, true);
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => {
          r.$capturePanelLayout();
          r.$schedulePlayerSectionGeometry();
        }).observe(r.$panel);
      }
      r.$scanLivePlayer();
      r.$render();
      r.$schedulePlaylistMetadataRefresh(0);
      r.$runPendingTrackAction();
      if (!r.$scanTimer && !r.$scanIdleCallback) r.$scheduleLivePlayerMaintenance();
      r.$seamlessSyncTimer = window.setInterval(() => void r.$syncSeamlessState(), 3000);
      window.addEventListener("scroll", () => {
        r.$lastPageScrollAt = Date.now();
      }, { passive: true });
      const resumePageRuntime = (event) => {
        resumeVisualizer(r);
        void r.$syncSeamlessState();
        r.$injectPageDjToolsLink();
        r.$syncPageAwareTheme?.();
        r.$schedulePlaylistMetadataRefresh(0);
        if (!event.persisted) return;
        r.$applyAppearance();
        r.$scanLivePlayer();
        r.$render();
        r.$scheduleLivePlayerMaintenance(0);
      };
      const leavePageRuntime = (event) => {
        if (!event.persisted) r.$app.cleanup();
      };
      window.addEventListener("pageshow", resumePageRuntime);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) r.$visualizerFrameQueue?.cancel();
        if (!document.hidden) {
          resumeVisualizer(r);
          void r.$syncSeamlessState();
          r.$injectPageDjToolsLink();
          r.$syncPageAwareTheme?.();
          r.$schedulePlaylistMetadataRefresh(0);
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
        window.removeEventListener("pageshow", resumePageRuntime);
        window.removeEventListener("pagehide", leavePageRuntime);
        window.clearTimeout(r.$scanTimer);
        window.clearTimeout(r.$playerEventScanTimer);
        window.clearTimeout(r.$playlistMetadataRefreshTimer);
        if (r.$scanIdleCallback && "cancelIdleCallback" in window) window.cancelIdleCallback(r.$scanIdleCallback);
        window.clearInterval(r.$seamlessSyncTimer);
        window.clearTimeout(r.$layoutSaveTimer);
        window.clearTimeout(r.$feedHandoffTimer);
        window.cancelAnimationFrame(r.$playerSectionGeometryFrame);
        window.cancelAnimationFrame(r.$playerRenderFrame);
        window.cancelAnimationFrame(r.$panelRenderFrame);
        window.cancelAnimationFrame(r.$playlistButtonsFrame);
        r.$visualizerFrameQueue?.cancel();
        r.$playerResizeObserver?.disconnect();
        r.$playerSpectrumResizeObserver?.disconnect();
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
        r.$setResizeCursor("");
      });
      window.addEventListener("pagehide", leavePageRuntime);
      r.$hubReady = true;
      r.$reportDiagnostic("ready");
    };
}

export const registerLifecycle = [registerHeaderMount, registerRuntimeStateRestore, registerLifecycle1, registerLifecycle2];

function setupScrubPreview(r) {
  r.$scrubControl.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const rect = r.$scrubControl.getBoundingClientRect();
    if (!rect.width) return;
    const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    r.$scrubPreviewActive = true;
    r.$scrubControl.style.setProperty("--hub-scrub-preview-progress", `${(progress * 100).toFixed(2)}%`);
    const duration = Number(r.$scrubDuration) || 0;
    r.$currentTimeLabel.textContent = formatDuration(progress * duration);
    r.$durationLabel.textContent = `−${formatDuration((1 - progress) * duration)}`;
  });
  r.$scrubControl.addEventListener("pointerleave", () => {
    r.$scrubPreviewActive = false;
    r.$syncScrubVisual();
    r.$renderPlayer();
  });
}

function createRuntimeMessageHandler(r) {
  return (message, _sender, sendResponse) => {
      if (message?.type === MESSAGES.PING) {
        sendResponse({ ok: true, version: chrome.runtime.getManifest().version, ready: r.$hubReady, open: runtimeState.open, error: r.$startupError });
        return false;
      }
      if (message?.type === MESSAGES.TOGGLE) r.$setOpen(!runtimeState.open);
      if (message?.type === MESSAGES.OPEN) r.$setOpen(true);
      if (message?.type === MESSAGES.SEAMLESS_STATE) r.$applySeamlessState(message.state);
      if (message?.type === MESSAGES.VISUALIZER_STATE) {
        r.$queueMusicBarVisualizerSignal({ ...(message.signal || {}), reactive: true });
      }
      if (message?.type === MESSAGES.NOW_PLAYING_STATE) {
        const revision = Math.max(0, Number(message.revision) || 0);
        if (revision < r.$nowPlayingRevision) { sendResponse({ ok: true, stale: true }); return false; }
        const playlist = r.$normalizePlaylist(message.playlist);
        const playlistMode = message.playlistMode === "manual" ? "manual" : "browse";
        const playlistShuffleEnabled = message.playlistShuffleEnabled === true;
        const playlistShuffleOrder = Array.isArray(message.playlistShuffleOrder) ? message.playlistShuffleOrder.map(String).slice(0, MAX_PLAYLIST_ITEMS) : [];
        const transitionTrackKey = String(message.transitionTrackKey || "");
        const transitionExpiresAt = Math.max(0, Number(message.transitionExpiresAt) || 0);
        r.$nowPlayingTransitionTrackKey = transitionTrackKey;
        r.$nowPlayingTransitionExpiresAt = transitionExpiresAt;
        r.$nowPlayingRevision = revision;
        if (JSON.stringify(playlist) !== JSON.stringify(runtimeState.playlist)
          || playlistMode !== runtimeState.playlistMode
          || playlistShuffleEnabled !== runtimeState.playlistShuffleEnabled
          || JSON.stringify(playlistShuffleOrder) !== JSON.stringify(runtimeState.playlistShuffleOrder)) {
          runtimeState.playlist = playlist;
          runtimeState.playlistMode = playlistMode;
          runtimeState.playlistShuffleEnabled = playlistShuffleEnabled;
          runtimeState.playlistShuffleOrder = playlistShuffleOrder;
          if (r.$isNowPlayingView()) r.$schedulePanelRender();
          else r.$schedulePlayerRender();
          r.$schedulePlaylistButtons();
        }
        r.$lastNowPlayingSignature = r.$nowPlayingSessionSignature();
      }
      if (message?.type === MESSAGES.PLAYBACK_CLEARED
        && !r.$savedPlaylistReplacementRequest
        && Date.now() >= r.$savedPlaylistReplacementGuardUntil) {
        r.$clearLocalPlaybackState({ persist: false });
      }
      if (message?.type === MESSAGES.CART_ADD_ITEMS) {
        // Stay silent until Bandcamp's cart has actually loaded here, so the
        // caller keeps waiting instead of recording a failure.
        if (!r.$pageCartIsAvailable()) return false;
        void r.$sendCartRestore(message.items).then((result) => {
          // The caller has no cart of its own to read, so hand back the cart
          // this tab just wrote. Without it the caller's panel keeps showing
          // the cart as it was before the add and the action looks like it
          // did nothing.
          r.$scanLiveCart();
          sendResponse({ ...result, cart: runtimeState.cart, cartSummary: runtimeState.cartSummary });
        });
        return true;
      }
      if (message?.type === MESSAGES.CART_REMOVE_ITEM) {
        if (!r.$pageCartIsAvailable()) return false;
        void r.$sendCartRemove(message.clear ? null : message.item).then((result) => {
          r.$scanLiveCart();
          sendResponse({ ...result, cart: runtimeState.cart, cartSummary: runtimeState.cartSummary });
        });
        return true;
      }
      if (message?.type === MESSAGES.WISHLIST_UPDATED) {
        if (message.success !== false) r.$markWishlistTrack(message.key, message.active !== false);
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
}

function setupLifecycle1(r) {
setupScrubPreview(r); r.$scrubSlider.addEventListener("pointerdown", () => r.$beginScrub(true));
r.$scrubSlider.addEventListener("input", () => {
      r.$beginScrub();
      const target = r.$scrubTarget();
      r.$currentTimeLabel.textContent = formatDuration(target.currentTime); r.$durationLabel.textContent = `−${formatDuration(Math.max(0, target.duration - target.currentTime))}`;
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
r.$runtimeMessageHandler = createRuntimeMessageHandler(r);
chrome.runtime.onMessage.addListener(r.$runtimeMessageHandler);
r.$app.registerCleanup(() => chrome.runtime.onMessage.removeListener(r.$runtimeMessageHandler));
chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== "local") return;
      const incomingLayout = changes[STORAGE_KEYS.LAYOUT]?.newValue;
      applyIncomingLayout(r, incomingLayout);
      applyOnboardingCompletionChange(r, changes);
      const incoming = changes[STORAGE_KEYS.STATE]?.newValue;
      if (!incoming) return;
      const incomingCartIsNewer = (Number(incoming.cartSavedAt) || 0) >= (Number(runtimeState.cartSavedAt) || 0);
      const cart = incomingCartIsNewer ? incoming.cart || [] : runtimeState.cart;
      const cartSummary = incomingCartIsNewer ? incoming.cartSummary || null : runtimeState.cartSummary;
      const cartSavedAt = incomingCartIsNewer ? incoming.cartSavedAt || null : runtimeState.cartSavedAt;
      const savedCarts = r.$cartAutosave.normalizeSavedCarts(incoming.savedCarts);
      const playlist = r.$sessionNowPlayingLoaded ? runtimeState.playlist : r.$normalizePlaylist(incoming.playlist);
      const playlistMode = r.$sessionNowPlayingLoaded
        ? runtimeState.playlistMode
        : incoming.playlistMode === "manual" ? "manual" : "browse";
      const playlistShuffleEnabled = r.$sessionNowPlayingLoaded
        ? runtimeState.playlistShuffleEnabled === true
        : incoming.playlistShuffleEnabled === true;
      const playlistShuffleOrder = r.$sessionNowPlayingLoaded
        ? runtimeState.playlistShuffleOrder
        : Array.isArray(incoming.playlistShuffleOrder) ? incoming.playlistShuffleOrder.map(String).slice(0, MAX_PLAYLIST_ITEMS) : [];
      const savedPlaylists = r.$normalizeSavedPlaylists(incoming.savedPlaylists);
      const backupIntroSeen = incoming.backupIntroSeen === true;
      const backupReminderDays = [0, 7, 14, 30].includes(Number(incoming.backupReminderDays))
        ? Number(incoming.backupReminderDays) : 7;
      const backupReminderSnoozedAt = incoming.backupReminderSnoozedAt || null;
      const lastBackupAt = incoming.lastBackupAt || null;
      const activity = normalizedActivity(incoming.activity);
      const syncedSettings = normalizedCrossTabSettings(incoming, runtimeState);
      const appearance = {
        ...runtimeState.appearance,
        ...(incoming.appearance || {}),
        savedThemes: Array.isArray(incoming.appearance?.savedThemes)
          ? incoming.appearance.savedThemes.filter((theme) => theme?.id && theme?.label && theme?.accent && theme?.surface).slice(0, MAX_SAVED_THEMES)
          : runtimeState.appearance.savedThemes
      };
      const incomingModernReleasePages = appearance.modernReleasePages;
      appearance.modernReleasePages = Boolean(incomingModernReleasePages);
      const normalizedIncomingGlass = normalizeGlassAppearance(appearance);
      const normalizedIncomingVisualTheme = normalizeVisualThemeAppearance(appearance);
      const appearanceNeedsNormalization = normalizedIncomingGlass
        || normalizedIncomingVisualTheme
        || incomingModernReleasePages !== appearance.modernReleasePages;
      const appearanceChanged = JSON.stringify(appearance) !== JSON.stringify(runtimeState.appearance);
      r.$setSharedStateBaseline({
        ...runtimeState,
        ...incoming,
        ...syncedSettings,
        cart, cartSavedAt, cartSummary,
        savedPlaylists, savedCarts,
        backupIntroSeen,
        backupReminderDays,
        backupReminderSnoozedAt,
        lastBackupAt,
        activity,
        appearance
      });
      if (JSON.stringify(cart) === JSON.stringify(runtimeState.cart)
        && cartSavedAt === runtimeState.cartSavedAt
        && JSON.stringify(cartSummary) === JSON.stringify(runtimeState.cartSummary)
        && JSON.stringify(savedCarts) === JSON.stringify(runtimeState.savedCarts)
        && JSON.stringify(playlist) === JSON.stringify(runtimeState.playlist)
        && playlistMode === runtimeState.playlistMode
        && playlistShuffleEnabled === runtimeState.playlistShuffleEnabled
        && JSON.stringify(playlistShuffleOrder) === JSON.stringify(runtimeState.playlistShuffleOrder)
        && JSON.stringify(savedPlaylists) === JSON.stringify(runtimeState.savedPlaylists)
        && !settingsChanged(runtimeState, syncedSettings)
        && backupIntroSeen === (runtimeState.backupIntroSeen === true)
        && backupReminderDays === Number(runtimeState.backupReminderDays)
        && backupReminderSnoozedAt === (runtimeState.backupReminderSnoozedAt || null)
        && lastBackupAt === (runtimeState.lastBackupAt || null)
        && JSON.stringify(activity) === JSON.stringify(runtimeState.activity)
        && !appearanceChanged) return;
      runtimeState.cart = cart;
      runtimeState.cartSavedAt = cartSavedAt;
      runtimeState.cartSummary = cartSummary;
      runtimeState.savedCarts = savedCarts;
      runtimeState.playlist = playlist;
      runtimeState.playlistMode = playlistMode;
      runtimeState.playlistShuffleEnabled = playlistShuffleEnabled;
      runtimeState.playlistShuffleOrder = playlistShuffleOrder;
      runtimeState.savedPlaylists = savedPlaylists;
      runtimeState.backupIntroSeen = backupIntroSeen;
      runtimeState.backupReminderDays = backupReminderDays;
      runtimeState.backupReminderSnoozedAt = backupReminderSnoozedAt;
      runtimeState.lastBackupAt = lastBackupAt;
      runtimeState.activity = activity;
      Object.assign(runtimeState, syncedSettings);
      runtimeState.appearance = appearance;
      if (appearanceNeedsNormalization) runtimeSaveState();
      if (!runtimeState.savedCarts.some((snapshot) => snapshot.id === runtimeState.selectedSavedCartId)) {
        runtimeState.selectedSavedCartId = null;
      }
      if (["cart", "playlist", "settings"].includes(runtimeState.activeTab)) r.$render();
      else r.$renderPlayer();
      if (appearanceChanged) r.$applyAppearance();
      r.$syncTrackKeyVisibilityMode();
      r.$syncScrubberStyles();
      r.$syncMusicBarStyle();
      r.$syncMusicBarPanelButtons();
      r.$syncMusicBarSize(); r.$syncMusicBarVisualizer();
      r.$syncMusicBarWidth();
      r.$syncFrostedGlass(); r.$syncCornerStyle();
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
      r.$playerSurfaceHost?.remove(); r.$playerSurfaceObserver?.disconnect(); window.cancelAnimationFrame(r.$playerSurfaceFrame);
    });
}

export const setupLifecycle = [setupLifecycle1];
