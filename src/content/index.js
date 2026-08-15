import { asset, createArt, createButtonIcon, createElement, createSectionHeading, escapeHtml, formatCartPrice, formatDuration, parseClock, portableBandcampUrl, resolveImage, resolvedTrackPageUrl, safeBandcampReleaseUrl, safeBandcampUrl } from "./core.js";
import { accessibleControlPalette, accessibleScrubberPalette, colorString, contrast, hexColor, hexString, luminance, mixColor, parseColor, readableColor } from "./color.js";
import { BUILT_IN_THEMES, DEFAULT_DATA_FOLDER, DEFAULT_DATA_PARENT, FEEDBACK_FORM_URL, FEEDBACK_LIST_URL, MAX_PLAYLIST_ITEMS, MUSIC_BAR_WIDTHS, SUPPORT_PAYMENT_URL, THEME_COLOR_KEYS, defaultState } from "./state.js";
import { waveformPathData } from "./waveform.js";
import { MESSAGES, STORAGE_KEYS } from "../shared/contracts.js";
import { createPlaylistModel } from "./playlist-model.js";
import { parseCartBackup, portableCartItem, portableCartRestore } from "./cart-model.js";
import { createAppContext } from "./app-context.js";

(async () => {
  if (window.top !== window || document.getElementById("bandcamp-hub-extension-root")) {
    return;
  }

  const activation = await new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.ENABLED, (stored) => {
      resolve(stored?.[STORAGE_KEYS.ENABLED] !== false);
    });
  });
  if (!activation) return;

  const cartAutosave = globalThis.BandKitCartAutosave;

  const app = createAppContext(defaultState);
  let state = app.state;
  let layoutRevision = 0;
  let clearedPageQueueSignature = "";
  let nowPlayingExplicitlyCleared = false;
  let live = {
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
  };
  let seamless = {
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
  };
  let pendingLoopBeats = null;
  let bpmEditing = false;
  let bpmDraft = "";
  let toastTimer;
  let storageErrorToastAt = 0;
  let storageDisabled = false;
  let dataDirectoryHandle = null;
  let scanTimer;
  let scanIdleCallback;
  let playerEventScanTimer;
  let lastPageScrollAt = 0;
  let seamlessSyncTimer;
  let pageActionsDirty = true;
  let pageActionsObserver = null;
  let playerSectionGeometryFrame = 0;
  let playerSectionGeometrySignature = "";
  let layoutSaveTimer;
  let hubReady = false;
  let startupError = "";
  let dragging = null;
  let launcherDrag = null;
  let suppressLauncherClick = false;
  let applyingLayout = false;
  let lastRecordedTrack = "";
  let lastPageItem = null;
  let modernHandoffBusy = false;
  let modernHandoffRequest = 0;
  let modernHandoffTrackKey = "";
  let modernHandoffPendingIndex = null;
  let modernHandoffSuperseded = false;
  const modernPlaylistQueueCache = new Map();
  let discoverHandoffBusy = false;
  let discoverHandoffTrackKey = "";
  let discoverHandoffPending = false;
  let discoverSwitchPendingDisable = false;
  let feedHandoffBusy = false;
  let feedHandoffTrackId = "";
  let mutedFeedAudio = null;
  let mutedFeedAudioWasMuted = false;
  let mutedFeedTrackId = "";
  let playlistPlaybackStarting = false;
  let playlistPlaybackStartingRequest = 0;
  let playlistPlayRequest = 0;
  let pendingPlaylistItemId = "";
  let feedSwitchPendingDisable = false;
  let pendingFeedTrackId = "";
  let suppressedFeedTrackId = "";
  let feedHandoffTimer = 0;
  let suppressModernControl = false;
  let recommendationHandoffRequest = 0;
  let suppressRecommendationControl = false;
  let collectionHandoffRequest = 0;
  let suppressCollectionControl = false;
  let collectionNativeFallbackUntil = 0;
  let scrubbing = false;
  let pendingSeekTimer = 0;
  let scrubReleaseTimer = 0;
  let playerActionSignature = "";
  let scrubRevision = 0;
  let scrubWaveformSignature = "";
  let scrubWaveformWidth = 0;
  let scrubWaveformResizeObserver = null;
  let playerTrackRenderSignature = "";
  let playerPlaybackRenderState = "";
  let bpmTapTimes = [];
  let resizeCursorStyle = null;
  const observedAudio = new WeakSet();
  let bridgedMedia = null;
  let bridgedCart = null;
  let bridgedCartSummary = null;

  function canonicalBandcampFeedUrl(value) {
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
  }

  function discoverBandcampFeedUrl() {
    const current = canonicalBandcampFeedUrl(location.href);
    if (current) return current;
    for (const anchor of document.querySelectorAll("a[href]")) {
      const feedUrl = canonicalBandcampFeedUrl(anchor.href);
      if (feedUrl) return feedUrl;
    }
    return "";
  }

  function openFeedFromBandcampHome() {
    if (state.openHomeToFeed !== true
      || location.hostname !== "bandcamp.com"
      || location.pathname !== "/"
      || location.hash.startsWith("#bandkit-")) return false;
    const feedUrl = canonicalBandcampFeedUrl(state.feedUrl) || discoverBandcampFeedUrl();
    if (!feedUrl) return false;
    location.replace(feedUrl);
    return true;
  }
  const cartArtistCache = new Map();
  const cartArtistPending = new Set();
  const cartArtistAttempted = new Set();
  let pageDjOpen = false;
  let pageDjHost = null;
  let pageDjShadow = null;
  let pageDjSurface = null;
  let pagePlaylistMenu = null;
  let pagePlaylistMenuAnchor = null;
  let draggingPlaylistId = "";
  let modernReleaseLayoutPrepared = false;
  let modernReleaseMoveRecords = [];
  let modernReleaseShells = [];
  let modernReleaseCleanups = [];
  let modernReleaseSupporterTimer = null;
  let modernReleasePalette = null;
  let playerResizeObserver = null;
  let pagePlayerSnapshot = null;
  let pageActionThemeCache = null;
  let pageTrackAnalysis = new Map();
  let pageTrackAnalysisStatus = "idle";
  let pageTrackAnalysisSignature = "";
  let pageTrackAnalysisRequest = 0;
  const PAGE_TRACK_ANALYSIS_CONCURRENCY = 6;
  const pageTrackPriceCache = new Map();
  const pageTrackPricePending = new Set();

  function pageMediaCommand(action, details = {}) {
    document.dispatchEvent(new CustomEvent("bandkit:media-command", { detail: { action, ...details } }));
  }

  document.addEventListener("bandkit:media-state", (event) => {
    const next = event.detail;
    if (!next || typeof next !== "object") return;
    const previous = bridgedMedia;
    bridgedMedia = {
      src: typeof next.src === "string" ? next.src : "",
      paused: Boolean(next.paused),
      ended: Boolean(next.ended),
      currentTime: Number(next.currentTime) || 0,
      duration: Number(next.duration) || 0,
      playbackRate: Number(next.playbackRate) || 1,
      volume: Number(next.volume) || 1
    };
    if (hubReady && (!previous
      || previous.src !== bridgedMedia.src
      || previous.paused !== bridgedMedia.paused
      || previous.ended !== bridgedMedia.ended
      || previous.duration !== bridgedMedia.duration)) {
      window.clearTimeout(playerEventScanTimer);
      playerEventScanTimer = window.setTimeout(scanLivePlayer, 0);
    }
    if (seamless.enabled
      && !bridgedMedia.paused
      && !feedSwitchPendingDisable
      && !pendingFeedTrackId
      && !discoverSwitchPendingDisable
      && Date.now() >= collectionNativeFallbackUntil) {
      silenceNativePagePlayback();
    }
  });

  document.addEventListener("bandkit:cart-state", (event) => {
    if (!Array.isArray(event.detail?.items)) return;
    bridgedCart = event.detail.items;
    bridgedCartSummary = event.detail.summary && typeof event.detail.summary === "object" ? event.detail.summary : null;
    scanLiveCart();
  });
  pageMediaCommand("getState");

  const root = document.createElement("li");
  root.id = "bandcamp-hub-extension-root";
  root.style.cssText = "list-style:none;margin:0;padding:0";
  const host = document.createElement("div");
  host.setAttribute("data-bandcamp-hub", "");
  root.append(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  shadow.append(style);
  const modernReleaseStyle = document.createElement("style");
  modernReleaseStyle.id = "bandkit-modern-release-style";

  const launcher = document.createElement("button");
  launcher.className = "hub-launcher is-panel-open";
  launcher.type = "button";
  launcher.title = "Toggle Bandkit (Alt+Shift+B)";
  launcher.setAttribute("aria-label", "Toggle Bandkit");
  const launcherIcon = document.createElement("img");
  launcherIcon.className = "hub-launcher-brand";
  launcherIcon.src = asset("icon-bandkit.svg");
  launcherIcon.alt = "";
  launcher.append(launcherIcon);

  const panel = document.createElement("section");
  panel.className = "hub-panel is-contextual";
  panel.setAttribute("aria-label", "Bandkit");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.innerHTML = `
    <header class="hub-header">
      <div class="hub-title-row">
        <span class="hub-title">Playlists</span>
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
          <div class="hub-player-more-wrap">
            <button class="hub-player-more-button" type="button" aria-label="More track actions" aria-expanded="false">
              <span class="hub-player-more-dots" aria-hidden="true"><span></span><span></span><span></span></span>
            </button>
            <div class="hub-player-more-menu" hidden></div>
          </div>
          <button class="hub-dj-player-button" type="button" aria-label="Open DJ tools" style="--hub-dj-icon:url('${asset("icon-dj.svg")}')"></button>
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

  const player = panel.querySelector(".hub-player");
  player.remove();
  const headerShortcuts = document.createElement("nav");
  headerShortcuts.className = "hub-header-shortcuts";
  headerShortcuts.setAttribute("aria-label", "Bandkit shortcuts");
  const playerSections = document.createElement("div");
  playerSections.className = "hub-player-sections";
  playerSections.setAttribute("aria-label", "Bandkit player and sections");
  playerSections.append(player.querySelector(".hub-now-playing-button"), headerShortcuts);
  player.append(playerSections);
  shadow.append(launcher, panel, player);

  const playerSpacer = document.createElement("div");
  playerSpacer.id = "bandcamp-hub-player-spacer";
  playerSpacer.setAttribute("aria-hidden", "true");
  playerSpacer.style.cssText = "clear:both;display:block;flex:none;grid-column:1/-1;pointer-events:none;visibility:hidden;width:100%";
  const discoverPlayerSpacer = playerSpacer.cloneNode(false);
  discoverPlayerSpacer.id = "bandcamp-hub-discover-player-spacer";

  function syncPlayerPageSpace() {
    const pageFooter = document.querySelector("#page-footer, #pgFt, page-footer, .full-page-app-wrapper > footer");
    const pageFlowParent = document.querySelector("#DiscoverApp main.app")
      || pageFooter?.parentElement
      || document.querySelector("#propOpenWrapper, .full-page-app-wrapper")
      || document.body;
    if (playerSpacer.parentElement !== pageFlowParent) {
      playerSpacer.parentElement?.style.removeProperty("scroll-padding-bottom");
      pageFlowParent.append(playerSpacer);
    }
    const playerHeight = Math.ceil(player.getBoundingClientRect().height);
    if (!playerHeight) return;
    const reservedHeight = `${playerHeight}px`;
    const discoverReservedHeight = `${playerHeight + 16}px`;
    playerSpacer.style.setProperty("height", reservedHeight, "important");
    playerSpacer.style.setProperty("flex-basis", reservedHeight, "important");
    const discoverDetail = document.querySelector("#DiscoverApp .focused-result");
    if (discoverDetail) {
      if (discoverPlayerSpacer.parentElement !== discoverDetail) discoverDetail.append(discoverPlayerSpacer);
      discoverPlayerSpacer.style.setProperty("height", discoverReservedHeight, "important");
      discoverPlayerSpacer.style.setProperty("flex-basis", discoverReservedHeight, "important");
      discoverDetail.style.setProperty("scroll-padding-bottom", discoverReservedHeight);
    } else {
      discoverPlayerSpacer.remove();
    }
    document.documentElement.style.setProperty("--bandkit-player-reserved-height", reservedHeight);
    document.documentElement.style.scrollPaddingBottom = reservedHeight;
    pageFlowParent.style.setProperty("scroll-padding-bottom", reservedHeight);
  }

  const tabs = [
    { id: "playlist", label: "Playlists", icon: "icon-playlist.svg" },
    { id: "cart", label: "Cart", icon: "icon-cart.svg" },
    { id: "activity", label: "Activity", icon: "icon-activity.svg" },
    { id: "settings", label: "Settings", icon: "icon-settings.svg" }
  ];

  const tabBar = panel.querySelector(".hub-tabs");
  const panelHeader = panel.querySelector(".hub-header");
  const content = panel.querySelector(".hub-content");
  const panelTitle = panel.querySelector(".hub-title");
  const playerArt = player.querySelector(".hub-player-art");
  const playerArtLink = player.querySelector(".hub-player-art-link");
  const playerTrack = player.querySelector(".hub-player-track");
  const playerTitle = player.querySelector(".hub-player-title");
  const playerArtist = player.querySelector(".hub-player-artist");
  const playButton = player.querySelector(".hub-play-button");
  const playerMoreButton = player.querySelector(".hub-player-more-button");
  const playerMoreMenu = player.querySelector(".hub-player-more-menu");
  const nowPlayingButton = player.querySelector(".hub-now-playing-button");
  const nowPlayingCount = player.querySelector(".hub-now-playing-count");
  const djPlayerButton = player.querySelector(".hub-dj-player-button");
  const headerCloseButton = panel.querySelector(".hub-close");
  const headerResetButton = panel.querySelector(".hub-reset");
  const layoutToggleButton = panel.querySelector(".hub-layout-toggle");
  const djDrawer = player.querySelector(".hub-dj-drawer");
  const scrubControl = player.querySelector(".hub-scrub-control");
  const scrubSlider = player.querySelector(".hub-scrub-slider");
  const scrubWaveform = player.querySelector(".hub-scrub-waveform");
  const scrubWaveformRemaining = player.querySelector(".hub-scrub-waveform-remaining");
  const scrubWaveformPlayed = player.querySelector(".hub-scrub-waveform-played");
  const currentTimeLabel = player.querySelector(".hub-current-time");
  const durationLabel = player.querySelector(".hub-duration");
  const toast = player.querySelector(".hub-toast");
  Object.assign(app.dom, { content, host, panel, player, root, shadow });


  function buildScrubWaveform(signature, width) {
    const { pathData, pixelWidth } = waveformPathData(signature, width);
    scrubWaveform.setAttribute("viewBox", `0 0 ${pixelWidth} 24`);
    scrubWaveformRemaining.setAttribute("d", pathData);
    scrubWaveformPlayed.setAttribute("d", pathData);
    scrubWaveformSignature = signature;
    scrubWaveformWidth = pixelWidth;
  }

  function refreshScrubWaveform(force = false, observedWidth = 0) {
    const signature = `${live.title || ""}\u0000${live.artist || ""}\u0000${live.pageUrl || ""}`;
    if (!force && signature === scrubWaveformSignature) return;
    const width = Math.max(80, Math.round(observedWidth || scrubControl.getBoundingClientRect().width));
    if (signature === scrubWaveformSignature && Math.abs(width - scrubWaveformWidth) < 4) return;
    buildScrubWaveform(signature, width);
  }

  function syncScrubVisual(value = Number(scrubSlider.value) || 0) {
    const progress = Math.max(0, Math.min(1, value / 1000));
    scrubControl.style.setProperty("--hub-scrub-progress", `${(progress * 100).toFixed(2)}%`);
  }

  function usesTraditionalScrubber() {
    return state.scrubberStyle === "traditional";
  }

  function syncScrubberStyles() {
    const traditional = usesTraditionalScrubber();
    scrubControl.classList.toggle("is-traditional", traditional);
    for (const control of document.querySelectorAll(".bandkit-page-scrub-control")) {
      control.classList.toggle("is-traditional", traditional);
    }
  }

  function syncMusicBarSize() {
    const compact = state.musicBarSize === "compact";
    const changed = player.classList.contains("is-compact") !== compact;
    player.classList.toggle("is-compact", compact);
    host.style.setProperty("--hub-player-height", compact ? "72px" : "96px");
    if (changed) window.requestAnimationFrame(syncPlayerPageSpace);
  }

  function syncMusicBarWidth() {
    const width = MUSIC_BAR_WIDTHS.includes(state.musicBarWidth) ? state.musicBarWidth : "default";
    const customWidth = Math.round(Math.max(480, Math.min(2000, Number(state.musicBarCustomWidth) || 900)));
    state.musicBarWidth = width;
    state.musicBarCustomWidth = customWidth;
    player.dataset.contentWidth = width;
    player.style.setProperty("--hub-player-custom-width", `${customWidth}px`);
  }

  refreshScrubWaveform(true);
  if (typeof ResizeObserver === "function") {
    scrubWaveformResizeObserver = new ResizeObserver((entries) => {
      refreshScrubWaveform(true, entries[0]?.contentRect.width || 0);
    });
    scrubWaveformResizeObserver.observe(scrubControl);
  }

  function toggleSectionPanel(tabId) {
    const currentPanelVisible = state.activeTab === tabId && !panel.classList.contains("is-hidden");
    state.activeTab = tabId;
    state.open = !currentPanelVisible;
    saveState();
    saveLayoutState();
    render();
  }

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.className = "hub-tab";
    button.type = "button";
    button.dataset.tab = tab.id;
    button.title = tab.label;
    button.setAttribute("aria-label", tab.label);
    button.innerHTML = `<span class="hub-tab-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span><span class="hub-tab-dot" aria-hidden="true"></span>`;
    button.addEventListener("click", () => {
      state.activeTab = tab.id;
      saveState();
      render();
    });
    tabBar.append(button);

    const shortcut = document.createElement("button");
    shortcut.className = "hub-header-shortcut";
    shortcut.type = "button";
    shortcut.dataset.tab = tab.id;
    shortcut.title = tab.label;
    shortcut.setAttribute("aria-label", tab.label);
    const shortcutCounter = tab.id === "cart"
      ? '<span class="hub-header-shortcut-count hub-cart-shortcut-count" aria-hidden="true">0</span>'
      : tab.id === "playlist"
        ? '<span class="hub-header-shortcut-count hub-playlist-shortcut-count" aria-hidden="true">0</span>'
        : '<span class="hub-header-shortcut-dot" aria-hidden="true"></span>';
    shortcut.innerHTML = `<span class="hub-header-shortcut-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span>${shortcutCounter}`;
    shortcut.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSectionPanel(tab.id);
    });
    headerShortcuts.append(shortcut);
  }


  function individualTrackPageUrl(track) {
    const pageUrl = resolvedTrackPageUrl(track);
    try {
      if (pageUrl && new URL(pageUrl).pathname.includes("/track/")) return pageUrl;
    } catch {
      // Fall through to the visible track list.
    }
    const expectedTitle = String(track?.title || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!expectedTitle) return "";
    for (const row of document.querySelectorAll(".track_row_view, .track-list-item, [data-trackid], [data-track-id]")) {
      const rowTitle = elementText(row, [".track-title", ".title", ".title-text"]).toLowerCase();
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
  }

  function nativeTrackActionControl(action) {
    const selectors = action === "wishlist"
      ? ["#wishlist-msg button", "#wishlist-msg a", ".wishlist-button", "button[data-action*='wish' i]", "button[aria-label*='wishlist' i]", "a[aria-label*='wishlist' i]"]
      : ["#buyItem", ".buyItem", ".buy-link", "button[data-action*='cart' i]", "button[aria-label*='cart' i]"];
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
  }

  function activateNativeTrackAction(action) {
    const control = nativeTrackActionControl(action);
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
  }

  function nativeCheckoutControl() {
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
  }

  function activateNativeCheckout() {
    const control = nativeCheckoutControl();
    if (!control) return false;
    control.click();
    return true;
  }

  function runPendingTrackAction() {
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
      void runtimeMessage({ type: MESSAGES.WISHLIST_RESULT, key: wishlistKey, success });
    };
    const tryAction = () => {
      attempts += 1;
      let activated = false;
      if (action === "checkout") {
        const checkoutControl = nativeCheckoutControl();
        if (checkoutControl) {
          history.replaceState(history.state, "", `${location.pathname}${location.search}`);
          checkoutControl.click();
          activated = true;
        }
      } else {
        activated = activateNativeTrackAction(action);
      }
      if (activated) {
        if (action !== "checkout") history.replaceState(history.state, "", `${location.pathname}${location.search}`);
        reportWishlistResult(true);
        showToast(action === "checkout"
          ? "Opening Bandcamp checkout…"
          : action === "wishlist"
            ? "Opened Bandcamp's wishlist action"
            : "Opened Bandcamp's purchase action");
        return;
      }
      if (attempts < 8) window.setTimeout(tryAction, 350);
      else {
        reportWishlistResult(false);
        if (action === "checkout") showToast("Bandcamp's checkout control is not available on this page.");
      }
    };
    tryAction();
  }

  function openBandcampCheckout() {
    if (activateNativeCheckout()) {
      showToast("Opening Bandcamp checkout…");
      return;
    }
    const itemPage = state.cart.map((item) => safeBandcampUrl(item.url)).find(Boolean);
    const target = new URL(itemPage || "https://bandcamp.com/");
    target.hash = "bandkit-checkout";
    window.location.assign(target.href);
  }

  async function resolveTrackActionPage(track) {
    const directUrl = individualTrackPageUrl(track);
    if (directUrl) return directUrl;
    const sourceUrl = resolvedTrackPageUrl(track);
    if (!sourceUrl || !track?.title) return "";
    const resolved = await runtimeMessage({
      type: MESSAGES.RESOLVE_CART_ITEMS,
      items: [{ title: track.title, artist: track.artist, url: sourceUrl, requestedItemType: "t" }]
    });
    return safeBandcampUrl(resolved?.items?.[0]?.restore?.url);
  }

  async function openTrackAction(track, action) {
    const directUrl = individualTrackPageUrl(track);
    if (!directUrl) showToast(`Finding “${track.title}” on Bandcamp…`);
    const pageUrl = directUrl || await resolveTrackActionPage(track);
    if (!pageUrl) {
      showToast("This track does not expose an individual Bandcamp page.");
      return;
    }
    const target = new URL(pageUrl);
    const samePage = target.origin === location.origin && target.pathname === location.pathname;
    if (samePage && activateNativeTrackAction(action)) {
      if (action === "wishlist") markWishlistTrack(track, true);
      showToast(action === "wishlist" ? "Updated the Bandcamp wishlist" : "Opened Bandcamp's purchase action");
      return;
    }
    target.hash = action === "wishlist" ? "bandkit-wishlist" : "bandkit-cart";
    if (action === "wishlist") {
      const key = wishlistTrackKey(track);
      target.searchParams.set("bandkit_wishlist_key", key);
    }
    const response = await runtimeMessage({ type: MESSAGES.OPEN_BACKGROUND_TAB, url: target.href });
    if (!response?.ok) {
      showToast(response?.error || `Bandcamp could not open the ${action} action.`);
      return;
    }
    if (action === "wishlist") markWishlistTrack(track, true);
    showToast(action === "wishlist"
      ? `Opened “${track.title}” on Bandcamp for your wishlist.`
      : `Opened “${track.title}” on Bandcamp for purchase.`);
  }

  function wishlistTrackKey(track) {
    const sourceUrl = resolvedTrackPageUrl(track).split("#")[0];
    const title = String(track?.title || "").replace(/\s+/g, " ").trim().toLowerCase();
    return `${sourceUrl}|${title}`;
  }

  function markWishlistTrack(trackOrKey, active) {
    const key = typeof trackOrKey === "string" ? trackOrKey : wishlistTrackKey(trackOrKey);
    if (!key) return;
    const keys = new Set(state.wishlistTrackKeys || []);
    if (active) keys.add(key);
    else keys.delete(key);
    state.wishlistTrackKeys = [...keys].slice(-500);
    saveState();
    if (["playlist", "nowPlaying"].includes(state.activeTab)) render();
  }

  function artistUrlFromPageUrl(value) {
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
  }

  function createPageLink(text, url, className = "") {
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
  }

  function updatePageLink(link, value) {
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
  }

  function signedPercent(value) {
    const rounded = Math.abs(value) < 0.05 ? 0 : Math.round(value * 10) / 10;
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(rounded % 1 ? 1 : 0)}%`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.textContent = "";
    }, 2200);
  }

  function storageGet(key) {
    return new Promise((resolve) => { chrome.storage.local.get(key, resolve); });
  }

  function runtimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "The extension background did not respond." });
        });
      } catch (error) {
        resolve({ ok: false, error: error.message });
      }
    });
  }

  function reportStorageWriteError(error) {
    const now = Date.now();
    if (now - storageErrorToastAt < 5000) return;
    storageErrorToastAt = now;
    const message = String(error?.message || error || "");
    showToast(/quota|bytes|space/i.test(message)
      ? "Bandkit storage is full. Delete old playlists or cart backups."
      : "Bandkit could not save this change.");
  }

  function persistLocal(values, notify = true) {
    if (storageDisabled) return;
    try {
      const write = chrome.storage.local.set(values);
      if (write && typeof write.catch === "function") {
        write.catch((error) => {
          if (notify) reportStorageWriteError(error);
        });
      }
    } catch (error) {
      if (notify) reportStorageWriteError(error);
    }
  }

  function saveState() {
    persistLocal({ [STORAGE_KEYS.STATE]: state });
  }

  function portableSettings() {
    return {
      openHomeToFeed: Boolean(state.openHomeToFeed),
      autoAnalyzeTracks: state.autoAnalyzeTracks !== false,
      showTrackKeys: state.showTrackKeys !== false,
      pageActionLabels: Boolean(state.pageActionLabels),
      recordPlaylistMetadata: state.recordPlaylistMetadata !== false,
      scrubberStyle: state.scrubberStyle,
      musicBarSize: state.musicBarSize,
      musicBarWidth: state.musicBarWidth,
      musicBarCustomWidth: state.musicBarCustomWidth,
      layoutMode: state.layoutMode,
      dockSide: state.dockSide,
      dockedWidth: state.dockedWidth,
      appearance: structuredClone(state.appearance),
      dj: {
        range: state.dj.range,
        preservePitch: state.dj.preservePitch,
        autoTempo: state.dj.autoTempo,
        loopSize: state.dj.loopSize,
        knobMode: state.dj.knobMode
      }
    };
  }

  function portableActivity() {
    return state.activity.map((item) => ({
      action: String(item.action || "activity").slice(0, 80),
      title: String(item.title || "Untitled track").slice(0, 500),
      artist: String(item.artist || "Unknown artist").slice(0, 500),
      url: portableBandcampUrl(item.url),
      artistUrl: portableBandcampUrl(item.artistUrl),
      createdAt: item.createdAt || null
    }));
  }

  function portableDataBackup() {
    const exportedAt = new Date().toISOString();
    return {
      format: "bandkit-data-home",
      version: 1,
      exportedAt,
      notice: "Bandkit does not collect or store bank account details, card numbers, passwords, or Bandcamp cookies.",
      playlists: {
        nowPlaying: normalizePlaylist(state.playlist).map(portablePlaylistItem).filter(Boolean),
        saved: normalizeSavedPlaylists(state.savedPlaylists).map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          savedAt: playlist.savedAt,
          items: playlist.items.map(portablePlaylistItem).filter(Boolean)
        }))
      },
      carts: {
        current: state.cart.map((item) => portableCartItem(item)).filter(Boolean),
        saved: cartAutosave.normalizeSavedCarts(state.savedCarts).map((cart) => ({
          id: cart.id,
          name: cart.name,
          savedAt: cart.savedAt,
          sourcePage: portableBandcampUrl(cart.sourcePage),
          summary: cart.summary || null,
          items: (cart.items || []).map((item) => portableCartItem(item)).filter(Boolean)
        }))
      },
      activity: portableActivity(),
      settings: portableSettings()
    };
  }

  async function writeTextFile(directory, filename, value) {
    const fileHandle = await directory.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(value);
    await writable.close();
  }

  async function writeJsonFile(directory, filename, value) {
    await writeTextFile(directory, filename, `${JSON.stringify(value, null, 2)}\n`);
  }

  async function savePortableDataHome() {
    if (!("showDirectoryPicker" in window)) {
      const backup = portableDataBackup();
      const blobUrl = URL.createObjectURL(new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `bandkit-data-${backup.exportedAt.slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      showToast("Downloaded a complete Bandkit data copy");
      return;
    }

    dataDirectoryHandle = await window.showDirectoryPicker({
      id: "bandkit-data-home",
      mode: "readwrite",
      startIn: DEFAULT_DATA_PARENT
    });
    const rootDirectory = dataDirectoryHandle.name.toLowerCase() === DEFAULT_DATA_FOLDER.toLowerCase()
      ? dataDirectoryHandle
      : await dataDirectoryHandle.getDirectoryHandle(DEFAULT_DATA_FOLDER, { create: true });
    const [playlistsDirectory, cartsDirectory, activityDirectory, settingsDirectory] = await Promise.all([
      rootDirectory.getDirectoryHandle("Playlists", { create: true }),
      rootDirectory.getDirectoryHandle("Carts", { create: true }),
      rootDirectory.getDirectoryHandle("Activity", { create: true }),
      rootDirectory.getDirectoryHandle("Settings", { create: true })
    ]);
    const backup = portableDataBackup();
    const playlistIndex = backup.playlists.saved.map((playlist, index) => ({
      id: playlist.id,
      name: playlist.name,
      savedAt: playlist.savedAt,
      file: `${String(index + 1).padStart(2, "0")}-${shareFileName(playlist.name, "playlist")}.json`
    }));
    const cartIndex = backup.carts.saved.map((cart, index) => ({
      id: cart.id,
      name: cart.name,
      savedAt: cart.savedAt,
      file: `${String(index + 1).padStart(2, "0")}-${shareFileName(cart.name, "cart")}.json`
    }));
    await Promise.all([
      writeTextFile(rootDirectory, "README.txt", [
        "Bandkit data home",
        "",
        `Last saved: ${backup.exportedAt}`,
        "",
        "Your data is grouped into Playlists, Carts, Activity, and Settings.",
        "Bandkit does not collect or store bank account details, card numbers, passwords, or Bandcamp cookies.",
        "Chrome local extension storage remains Bandkit's live working copy; use Settings > Privacy and data to refresh these portable files."
      ].join("\n")),
      writeJsonFile(playlistsDirectory, "now-playing.json", backup.playlists.nowPlaying),
      writeJsonFile(playlistsDirectory, "index.json", playlistIndex),
      writeJsonFile(cartsDirectory, "current-cart.json", backup.carts.current),
      writeJsonFile(cartsDirectory, "index.json", cartIndex),
      writeJsonFile(activityDirectory, "activity.json", backup.activity),
      writeJsonFile(settingsDirectory, "settings.json", backup.settings),
      ...backup.playlists.saved.map((playlist, index) => writeJsonFile(
        playlistsDirectory,
        playlistIndex[index].file,
        playlist
      )),
      ...backup.carts.saved.map((cart, index) => writeJsonFile(
        cartsDirectory,
        cartIndex[index].file,
        cart
      ))
    ]);
    state.dataFolderName = dataDirectoryHandle.name.toLowerCase() === DEFAULT_DATA_FOLDER.toLowerCase()
      ? `Documents/${DEFAULT_DATA_FOLDER}`
      : `${dataDirectoryHandle.name}/${DEFAULT_DATA_FOLDER}`;
    saveState();
    showToast("Saved an organized copy of your Bandkit data");
  }

  function savedLayoutState(value = state) {
    return {
      revision: layoutRevision,
      open: Boolean(value.open),
      layoutMode: value.layoutMode === "docked" ? "docked" : "floating",
      dockSide: value.dockSide === "left" ? "left" : "right",
      dockedWidth: Math.max(320, Number(value.dockedWidth) || 420),
      layout: value.layout && typeof value.layout === "object" ? { ...value.layout } : null,
      launcherPosition: value.launcherPosition && typeof value.launcherPosition === "object" ? { ...value.launcherPosition } : null
    };
  }

  function applyPersistedLayout(value) {
    if (!value || typeof value !== "object") return false;
    state.open = Boolean(value.open);
    state.layoutMode = value.layoutMode === "docked" ? "docked" : "floating";
    state.dockSide = value.dockSide === "left" ? "left" : "right";
    state.dockedWidth = Math.max(320, Number(value.dockedWidth) || 420);
    state.layout = value.layout && typeof value.layout === "object" ? { ...value.layout } : null;
    state.launcherPosition = value.launcherPosition && typeof value.launcherPosition === "object" ? { ...value.launcherPosition } : null;
    layoutRevision = Math.max(layoutRevision, Number(value.revision) || 0);
    return true;
  }

  function saveLayoutState() {
    layoutRevision = Math.max(Date.now(), layoutRevision + 1);
    persistLocal({ [STORAGE_KEYS.LAYOUT]: savedLayoutState() });
  }

  function syncPageTypography() {
    const pageFont = getComputedStyle(document.body).fontFamily?.trim();
    const fontFamily = pageFont && pageFont !== "initial"
      ? pageFont
      : '"Helvetica Neue", Helvetica, Arial, sans-serif';
    host.style.setProperty("--hub-font-family", fontFamily);
    for (const control of document.querySelectorAll(".bandcamp-hub-page-playlist:not([data-bandkit-font-synced]), .bandcamp-hub-page-playlist-menu:not([data-bandkit-font-synced])")) {
      control.style.setProperty("--hub-font-family", fontFamily);
      control.dataset.bandkitFontSynced = "true";
    }
  }

  const {
    canonicalPlaylistPageUrl,
    mergeHydratedPlaylist,
    normalizePlaylist,
    normalizePlaylistBpm,
    normalizePlaylistItem,
    normalizePlaylistKey,
    normalizeSavedPlaylists,
    playlistTrackKey,
    playlistTracksMatch,
    portablePlaylistItem
  } = createPlaylistModel({
    isReusableStreamUrl,
    maxItems: MAX_PLAYLIST_ITEMS,
    normalizedTrackTitle,
    portableBandcampUrl,
    resolveImage,
    resolvedTrackPageUrl,
    safeBandcampUrl
  });
  Object.assign(app.services, {
    cartModel: { parseCartBackup, portableCartItem, portableCartRestore },
    playlistModel: {
      canonicalPlaylistPageUrl,
      mergeHydratedPlaylist,
      normalizePlaylist,
      normalizeSavedPlaylists,
      playlistTrackKey,
      playlistTracksMatch,
      portablePlaylistItem
    }
  });

  function activePlaylistAnalysis(track) {
    if (state.recordPlaylistMetadata === false || !seamless.track || !matchingQueueTrack([seamless.track], track)) return null;
    const bpm = normalizePlaylistBpm(seamless.detectedBpm);
    const key = normalizePlaylistKey(seamless.detectedKey);
    return bpm || key ? { bpm, key } : null;
  }

  function capturePlaylistAnalysis(track) {
    const analysis = activePlaylistAnalysis(track);
    return analysis ? { ...track, ...analysis } : track;
  }


  function playlistIsActive() {
    return Boolean(seamless.enabled && seamless.track && matchingQueueTrack(seamless.queue, seamless.track));
  }

  async function syncActivePlaylistQueue() {
    if (!playlistIsActive()) return;
    const playable = state.playlist.filter((track) => isReusableStreamUrl(track.url));
    await seamlessCommand(MESSAGES.SEAMLESS_UPDATE_QUEUE, { queue: playable });
  }

  function resetLoadedPlayback() {
    live = {
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
    };
    seamless = {
      ...seamless,
      enabled: false,
      status: "idle",
      error: "",
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      progress: 0,
      index: -1,
      track: null,
      queue: []
    };
  }

  function clearLocalPlaybackState({ persist = true } = {}) {
    clearedPageQueueSignature ||= `${live.pageUrl}|${live.title}`;
    nowPlayingExplicitlyCleared = true;
    playlistPlayRequest += 1;
    playlistPlaybackStartingRequest = 0;
    playlistPlaybackStarting = false;
    pendingPlaylistItemId = "";
    state.playlist = [];
    state.playlistMode = "browse";
    if (persist) saveState();

    pageMediaCommand("pause");
    stopModernPagePlayer();
    for (const audio of document.querySelectorAll("audio")) {
      if (!audio.paused) audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Some page audio elements are not seekable until metadata is loaded.
      }
    }
    resetLoadedPlayback();
    syncPagePlayerUi();
    syncRecommendationPlaybackUi();
    render();
    injectPlaylistButtons();
  }

  function releaseExplicitPlaybackClear() {
    nowPlayingExplicitlyCleared = false;
    clearedPageQueueSignature = "";
  }

  async function clearNowPlayingPlayback({ notify = true } = {}) {
    clearedPageQueueSignature = `${live.pageUrl}|${live.title}`;
    clearLocalPlaybackState();
    await runtimeMessage({ type: MESSAGES.CLEAR_PLAYBACK });

    // Apply the empty state last so a delayed pre-clear playback broadcast
    // cannot leave stale metadata in the persistent footer.
    clearLocalPlaybackState();
    if (notify) showToast("Now Playing cleared");
  }

  function addTracksToPlaylist(tracks, { quiet = false } = {}) {
    releaseExplicitPlaybackClear();
    const incoming = normalizePlaylist((Array.isArray(tracks) ? tracks : []).map(capturePlaylistAnalysis));
    if (incoming.length) state.playlistMode = "manual";
    let added = 0;
    let refreshed = 0;
    let atCapacity = false;
    for (const source of incoming) {
      const existingIndex = state.playlist.findIndex((item) => playlistTracksMatch(item, source));
      if (existingIndex >= 0) {
        const existing = state.playlist[existingIndex];
        const replacement = {
          ...existing,
          ...source,
          playlistItemId: existing.playlistItemId,
          bpm: source.bpm ?? existing.bpm,
          key: source.key ?? existing.key
        };
        if (JSON.stringify(replacement) !== JSON.stringify(existing)) {
          state.playlist[existingIndex] = replacement;
          refreshed += 1;
        }
        continue;
      }
      if (state.playlist.length >= MAX_PLAYLIST_ITEMS) {
        atCapacity = true;
        continue;
      }
      source.playlistItemId = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      source.addedAt ||= new Date().toISOString();
      state.playlist.push(source);
      added += 1;
    }
    if (added || refreshed) {
      state.playlist = normalizePlaylist(state.playlist);
      saveState();
      void syncActivePlaylistQueue();
      if (state.activeTab === "nowPlaying") render();
      injectPlaylistButtons();
    }
    const capacitySuffix = atCapacity ? ` · ${MAX_PLAYLIST_ITEMS}-track limit reached` : "";
    if (!quiet) showToast(added
      ? `Added ${added} track${added === 1 ? "" : "s"} to Now Playing${capacitySuffix}`
      : atCapacity ? `Now Playing can hold up to ${MAX_PLAYLIST_ITEMS} tracks` : "Already in Now Playing");
    return added;
  }

  function addTrackToPlaylist(track) {
    return addTracksToPlaylist([track]);
  }

  function createSavedPlaylistWithTracks(tracks, suggestedName = "New playlist") {
    const items = normalizePlaylist((Array.isArray(tracks) ? tracks : []).map(capturePlaylistAnalysis));
    if (!items.length) return null;
    const name = window.prompt("Name this playlist", suggestedName)?.trim();
    if (!name) return null;
    const snapshot = {
      id: `saved-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.slice(0, 120),
      savedAt: new Date().toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      items
    };
    state.savedPlaylists.unshift(snapshot);
    state.savedPlaylists = normalizeSavedPlaylists(state.savedPlaylists);
    saveState();
    if (state.activeTab === "playlist" && state.playlistView === "saved") render();
    showToast(`Added to “${snapshot.name}”`);
    return snapshot;
  }

  function createEmptySavedPlaylist() {
    const suggestedName = `Playlist ${state.savedPlaylists.length + 1}`;
    const name = window.prompt("Name this playlist", suggestedName)?.trim();
    if (!name) return null;
    const snapshot = {
      id: `saved-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.slice(0, 120),
      savedAt: new Date().toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      items: []
    };
    state.savedPlaylists.unshift(snapshot);
    state.savedPlaylists = normalizeSavedPlaylists(state.savedPlaylists);
    state.playlistView = "saved";
    saveState();
    render();
    showToast(`Created “${snapshot.name}”`);
    return snapshot;
  }

  function addTracksToSavedPlaylist(tracks, snapshotId) {
    const snapshot = state.savedPlaylists.find((entry) => entry.id === snapshotId);
    const incoming = normalizePlaylist((Array.isArray(tracks) ? tracks : []).map(capturePlaylistAnalysis));
    if (!snapshot || !incoming.length) return 0;
    let added = 0;
    let atCapacity = false;
    for (const item of incoming) {
      if (snapshot.items.some((entry) => playlistTracksMatch(entry, item))) continue;
      if (snapshot.items.length >= MAX_PLAYLIST_ITEMS) {
        atCapacity = true;
        continue;
      }
      item.playlistItemId = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      item.addedAt = new Date().toISOString();
      snapshot.items.push(item);
      added += 1;
    }
    if (added) {
      snapshot.items = normalizePlaylist(snapshot.items);
      saveState();
      if (state.activeTab === "playlist" && state.playlistView === "saved") render();
    }
    const capacitySuffix = atCapacity ? ` · ${MAX_PLAYLIST_ITEMS}-track limit reached` : "";
    showToast(added
      ? `Added ${added} track${added === 1 ? "" : "s"} to “${snapshot.name}”${capacitySuffix}`
      : atCapacity ? `“${snapshot.name}” can hold up to ${MAX_PLAYLIST_ITEMS} tracks` : `Already in “${snapshot.name}”`);
    return added;
  }

  function addTrackToSavedPlaylist(track, snapshotId) {
    return addTracksToSavedPlaylist([track], snapshotId) > 0;
  }

  async function hydratePlaylist(items) {
    const response = await runtimeMessage({ type: MESSAGES.RESOLVE_PLAYLIST_ITEMS, items });
    if (!response?.ok) return { items: normalizePlaylist(items), failed: items.length, error: response?.error || "Could not refresh the playlist." };
    const hydrated = normalizePlaylist(response.items);
    return {
      items: hydrated,
      failed: hydrated.filter((item) => !isReusableStreamUrl(item.url)).length,
      error: ""
    };
  }


  function playlistItemNeedsMetadata(item) {
    return !resolveImage(item?.art) || !String(item?.artist || "").trim() || String(item.artist).trim().toLowerCase() === "bandcamp";
  }

  async function refreshIncompletePlaylistMetadata() {
    const candidates = [
      ...state.playlist,
      ...state.savedPlaylists.flatMap((snapshot) => snapshot.items || [])
    ].filter((item) => playlistItemNeedsMetadata(item));
    const unique = [...new Map(candidates.map((item) => [playlistTrackKey(item), item])).values()];
    if (!unique.length) return false;
    const response = await runtimeMessage({ type: MESSAGES.RESOLVE_PLAYLIST_ITEMS, items: unique });
    if (!response?.ok || !Array.isArray(response.items)) return false;
    const refreshed = normalizePlaylist(response.items);
    const byKey = new Map(refreshed.map((item) => [playlistTrackKey(item), item]));
    let changed = false;
    const repair = (item) => {
      const replacement = byKey.get(playlistTrackKey(item)) || refreshed.find((candidate) => playlistTracksMatch(candidate, item));
      if (!replacement) return item;
      const currentArtist = String(item.artist || "").trim();
      const replacementArtist = String(replacement.artist || "").trim();
      const artist = (!currentArtist || currentArtist.toLowerCase() === "bandcamp") && replacementArtist.toLowerCase() !== "bandcamp"
        ? replacementArtist
        : currentArtist || replacementArtist || "Bandcamp";
      const art = resolveImage(item.art) || resolveImage(replacement.art);
      const repaired = {
        ...item,
        artist,
        album: item.album || replacement.album,
        art,
        duration: Number(item.duration) || Number(replacement.duration) || 0,
        url: isReusableStreamUrl(replacement.url) ? replacement.url : item.url,
        restoreError: isReusableStreamUrl(replacement.url) ? "" : item.restoreError
      };
      if (JSON.stringify(repaired) !== JSON.stringify(item)) changed = true;
      return repaired;
    };
    state.playlist = normalizePlaylist(state.playlist.map(repair));
    state.savedPlaylists = normalizeSavedPlaylists(state.savedPlaylists.map((snapshot) => ({
      ...snapshot,
      items: (snapshot.items || []).map(repair)
    })));
    if (!changed) return false;
    saveState();
    void syncActivePlaylistQueue();
    if (["playlist", "nowPlaying"].includes(state.activeTab)) render();
    return true;
  }

  async function prepareExternalNowPlaying(track, sourceQueue = [], { trustProvidedStreams = false, replaceQueue = false } = {}) {
    releaseExplicitPlaybackClear();
    const incoming = normalizePlaylistItem(track);
    if (!incoming) return { queue: [], index: -1, error: "This Bandcamp track could not be added to Now Playing." };
    const prepareRequest = ++playlistPlayRequest;
    playlistPlaybackStartingRequest = 0;
    playlistPlaybackStarting = false;
    pendingPlaylistItemId = "";
    syncCurrentPlaylistPlaybackUi();
    const preserveQueue = state.playlistMode === "manual" && !replaceQueue;
    if (!preserveQueue) {
      const sourceItems = normalizePlaylist(sourceQueue);
      const sourceIndex = sourceItems.findIndex((item) => playlistTracksMatch(item, incoming));
      const pageQueue = sourceIndex >= 0 ? sourceItems.slice(sourceIndex) : [incoming];
      state.playlistMode = "browse";
      state.playlist = pageQueue.some((item) => playlistTracksMatch(item, incoming))
        ? pageQueue
        : normalizePlaylist([incoming, ...pageQueue.slice(0, MAX_PLAYLIST_ITEMS - 1)]);
    }
    if (!state.playlist.length) {
      let initialQueue = normalizePlaylist([incoming]);
      if (!initialQueue.some((item) => playlistTracksMatch(item, incoming))) {
        initialQueue = normalizePlaylist([...initialQueue.slice(0, MAX_PLAYLIST_ITEMS - 1), incoming]);
      }
      if (trustProvidedStreams && isReusableStreamUrl(incoming.url)) {
        const queue = initialQueue.filter((item) => isReusableStreamUrl(item.url));
        const index = queue.findIndex((item) => Boolean(matchingQueueTrack([item], incoming)));
        if (index >= 0) {
          state.playlist = initialQueue;
          saveState();
          if (state.activeTab === "nowPlaying") render();
          injectPlaylistButtons();
          return { queue, index, error: "", request: prepareRequest, usedFreshStreams: true };
        }
      }
      const hydrated = await hydratePlaylist(initialQueue);
      if (prepareRequest !== playlistPlayRequest) return { queue: [], index: -1, error: "Playback request was replaced.", cancelled: true, request: prepareRequest };
      const mergedItems = mergeHydratedPlaylist(state.playlist.length ? state.playlist : initialQueue, hydrated.items);
      const queue = mergedItems.filter((item) => isReusableStreamUrl(item.url));
      const index = queue.findIndex((item) => Boolean(matchingQueueTrack([item], incoming)));
      if (index >= 0) {
        state.playlist = mergedItems;
        saveState();
        if (state.activeTab === "nowPlaying") render();
        injectPlaylistButtons();
      }
      return {
        queue,
        index,
        error: index >= 0 ? "" : hydrated.error || "This Bandcamp track is not currently streamable.",
        request: prepareRequest
      };
    }
    const currentItems = state.playlist;
    const existingIndex = currentItems.findIndex((item) => Boolean(matchingQueueTrack([item], incoming)));
    if (existingIndex < 0 && currentItems.length >= MAX_PLAYLIST_ITEMS) {
      const error = `Now Playing can hold up to ${MAX_PLAYLIST_ITEMS} tracks.`;
      showToast(error);
      return { queue: [], index: -1, error, capacity: true, request: prepareRequest };
    }
    const existing = existingIndex >= 0 ? currentItems[existingIndex] : null;
    const promoted = {
      ...(existing || {}),
      ...incoming,
      playlistItemId: existing?.playlistItemId || `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      addedAt: existing?.addedAt || incoming.addedAt || new Date().toISOString()
    };
    const nextItems = [
      promoted,
      ...currentItems.filter((_, index) => index !== existingIndex)
    ];
    state.playlist = normalizePlaylist(nextItems);
    saveState();
    if (state.activeTab === "nowPlaying") render();
    injectPlaylistButtons();

    if (trustProvidedStreams && isReusableStreamUrl(promoted.url)) {
      const queue = state.playlist.filter((item) => isReusableStreamUrl(item.url));
      const index = queue.findIndex((item) => item.playlistItemId === promoted.playlistItemId);
      if (index >= 0) {
        return { queue, index, error: "", request: prepareRequest, usedFreshStreams: true };
      }
    }

    const hydrated = await hydratePlaylist(state.playlist);
    if (prepareRequest !== playlistPlayRequest) return { queue: [], index: -1, error: "Playback request was replaced.", cancelled: true, request: prepareRequest };
    state.playlist = mergeHydratedPlaylist(state.playlist, hydrated.items);
    saveState();
    if (!state.playlist.some((item) => item.playlistItemId === promoted.playlistItemId)) {
      return { queue: [], index: -1, error: "Playback request was removed.", cancelled: true, request: prepareRequest };
    }
    const queue = state.playlist.filter((item) => isReusableStreamUrl(item.url));
    const index = queue.findIndex((item) => item.playlistItemId === promoted.playlistItemId);
    if (state.activeTab === "nowPlaying") render();
    return {
      queue,
      index,
      error: index >= 0 ? "" : hydrated.error || "This Bandcamp track is not currently streamable.",
      request: prepareRequest
    };
  }

  async function playPlaylistAt(requestedIndex = 0, { forceRefresh = false } = {}) {
    releaseExplicitPlaybackClear();
    if (!state.playlist.length) {
      showToast("Add a streamable Bandcamp track to the playlist first.");
      return false;
    }
    const originalItems = state.playlist;
    const selectedIndex = Math.max(0, Math.min(state.playlist.length - 1, Number(requestedIndex) || 0));
    const selected = state.playlist[selectedIndex];
    const nextItems = state.playlistMode === "manual"
      ? [selected, ...state.playlist.filter((_, index) => index !== selectedIndex)]
      : state.playlist.slice(selectedIndex);
    const queueChanged = nextItems.length !== state.playlist.length
      || nextItems.some((item, index) => item.playlistItemId !== state.playlist[index]?.playlistItemId);
    state.playlist = normalizePlaylist(nextItems);
    const target = state.playlist[0];
    saveState();
    if (String(target.id || "") === suppressedFeedTrackId) suppressedFeedTrackId = "";
    const playRequest = ++playlistPlayRequest;
    pendingPlaylistItemId = target.playlistItemId;
    syncCurrentPlaylistPlaybackUi();
    const activeQueueTrack = matchingQueueTrack(seamless.queue, target);
    const activeIndex = activeQueueTrack ? seamless.queue.indexOf(activeQueueTrack) : -1;
    if (!forceRefresh && !queueChanged && playlistIsActive() && activeIndex >= 0) {
      const nextState = await seamlessCommand(MESSAGES.SEAMLESS_PLAY_INDEX, { index: activeIndex, autoplay: true });
      if (playRequest !== playlistPlayRequest) return false;
      if (!nextState && pendingPlaylistItemId === target.playlistItemId) pendingPlaylistItemId = "";
      syncCurrentPlaylistPlaybackUi();
      return Boolean(nextState);
    }
    showToast("Refreshing the playlist from Bandcamp…");
    const hydrated = await hydratePlaylist(state.playlist);
    if (playRequest !== playlistPlayRequest) return false;
    state.playlist = mergeHydratedPlaylist(state.playlist, hydrated.items);
    saveState();
    const restoreOriginalOrder = () => {
      state.playlist = mergeHydratedPlaylist(originalItems, state.playlist);
      saveState();
    };
    const queue = state.playlist.filter((track) => isReusableStreamUrl(track.url));
    if (!queue.length) {
      restoreOriginalOrder();
      if (pendingPlaylistItemId === target.playlistItemId) pendingPlaylistItemId = "";
      syncCurrentPlaylistPlaybackUi();
      render();
      showToast(hydrated.error || "None of these tracks are currently streamable.");
      return false;
    }
    const index = queue.findIndex((track) => track.playlistItemId === target.playlistItemId);
    if (index < 0) {
      restoreOriginalOrder();
      if (pendingPlaylistItemId === target.playlistItemId) pendingPlaylistItemId = "";
      syncCurrentPlaylistPlaybackUi();
      render();
      showToast(`${target.title} is not currently streamable.`);
      return false;
    }
    playlistPlaybackStartingRequest = playRequest;
    playlistPlaybackStarting = true;
    stopModernPagePlayer();
    pageMediaCommand("pause");
    const pageAudio = getAudio();
    if (pageAudio && !pageAudio.paused) pageAudio.pause();
    try {
      const response = await runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE,
        queue,
        index,
        currentTime: 0,
        autoplay: true,
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        filterValue: state.dj.filterValue,
        gainDb: state.dj.gainDb,
        eqLowDb: state.dj.eqLowDb,
        eqMidDb: state.dj.eqMidDb,
        eqHighDb: state.dj.eqHighDb
      });
      if (!response?.ok) {
        restoreOriginalOrder();
        if (pendingPlaylistItemId === target.playlistItemId) pendingPlaylistItemId = "";
        syncCurrentPlaylistPlaybackUi();
        showToast(response?.error || "The playlist could not start.");
        return false;
      }
      if (playRequest !== playlistPlayRequest) return false;
      applySeamlessState(response.state);
      if (pendingPlaylistItemId === target.playlistItemId) pendingPlaylistItemId = "";
      state.open = true;
      state.activeTab = "nowPlaying";
      state.playlistView = "current";
      saveState();
      render();
      showToast(`Playing ${queue.length} playlist track${queue.length === 1 ? "" : "s"}${hydrated.failed ? ` · ${hydrated.failed} unavailable` : ""}`);
      return true;
    } finally {
      if (playlistPlaybackStartingRequest === playRequest) {
        playlistPlaybackStartingRequest = 0;
        playlistPlaybackStarting = false;
      }
    }
  }

  async function navigatePlayerQueue(direction) {
    const step = direction < 0 ? -1 : 1;
    if (!seamless.enabled) return false;

    const seamlessIndex = Math.max(0, Number(seamless.index) || 0);
    const seamlessQueue = Array.isArray(seamless.queue) ? seamless.queue : [];
    const playlistIndex = seamless.track
      ? state.playlist.findIndex((item) => Boolean(matchingQueueTrack([item], seamless.track)))
      : -1;

    // The visible Now Playing list can be larger than the currently hydrated
    // offscreen queue. Navigate that list so an expired/missing stream is
    // refreshed on demand instead of making the footer controls appear inert.
    if (playlistIndex >= 0 && state.playlist.length > seamlessQueue.length) {
      let targetIndex = playlistIndex + step;
      while (targetIndex >= 0 && targetIndex < state.playlist.length) {
        const targetItemId = state.playlist[targetIndex]?.playlistItemId;
        if (await playPlaylistAt(targetIndex)) return true;
        const refreshedTarget = state.playlist.find((item) => item.playlistItemId === targetItemId);
        if (refreshedTarget && isReusableStreamUrl(refreshedTarget.url)) return false;
        targetIndex += step;
      }
    }

    const targetIndex = seamlessIndex + step;
    if (targetIndex >= 0 && targetIndex < seamlessQueue.length) {
      return Boolean(await seamlessCommand(MESSAGES.SEAMLESS_PLAY_INDEX, { index: targetIndex, autoplay: true }));
    }

    if (step < 0) {
      await seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: 0 });
      return true;
    }
    showToast("You’re at the end of Now Playing.");
    return false;
  }

  function savePlaylistSnapshot(items = state.playlist) {
    const playlistItems = normalizePlaylist(items);
    if (!playlistItems.length) {
      showToast("There is no playlist to save yet.");
      return;
    }
    const now = new Date();
    const suggestedName = `Playlist — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const name = window.prompt("Name this saved playlist", suggestedName)?.trim();
    if (!name) return;
    state.savedPlaylists.unshift({
      id: `saved-playlist-${Date.now()}`,
      name: name.slice(0, 120),
      savedAt: now.toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      items: structuredClone(playlistItems)
    });
    state.savedPlaylists = normalizeSavedPlaylists(state.savedPlaylists);
    saveState();
    render();
    showToast(`Saved “${name}” locally`);
  }

  function restoreSavedPlaylist(snapshot, mode = "replace", { syncPlayback = true } = {}) {
    const incoming = normalizePlaylist(snapshot?.items);
    if (!incoming.length) return;
    playlistPlayRequest += 1;
    playlistPlaybackStartingRequest = 0;
    playlistPlaybackStarting = false;
    pendingPlaylistItemId = "";
    state.playlistMode = "manual";
    let addedCount = incoming.length;
    if (mode === "replace") {
      state.playlist = incoming;
    } else {
      addedCount = addTracksToPlaylist(incoming, { quiet: true });
    }
    state.playlistView = "current";
    saveState();
    render();
    if (syncPlayback) void syncActivePlaylistQueue();
    showToast(mode === "replace"
      ? `Loaded “${snapshot.name}” into Now Playing`
      : addedCount
        ? `Added ${addedCount} track${addedCount === 1 ? "" : "s"} from “${snapshot.name}” to Now Playing`
        : `No new tracks from “${snapshot.name}” were added`);
  }

  function shareFileName(value, fallback) {
    const name = String(value || "").trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);
    return name || fallback;
  }

  function sharedCollectionDocument({ title, eyebrow, summary, rows, embeddedPayload, embeddedId }) {
    const emptyState = '<div class="empty">There are no items in this collection.</div>';
    const embeddedData = embeddedPayload && embeddedId
      ? `<script type="application/json" id="${escapeHtml(embeddedId)}">${embeddedPayload}<\/script>`
      : "";
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light;--ink:#17202a;--muted:#66737f;--line:#dfe5e8;--accent:#1687a7;--surface:#fff;--wash:#f3f6f7}
    *{box-sizing:border-box}body{background:var(--wash);color:var(--ink);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:42px 20px}main{margin:auto;max-width:820px}header{margin-bottom:24px}.eyebrow{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(28px,5vw,44px);letter-spacing:-.035em;line-height:1.05;margin:7px 0 10px}.summary{color:var(--muted);margin:0}.collection{display:grid;gap:12px}.item{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;display:grid;gap:18px;grid-template-columns:96px minmax(0,1fr);padding:14px}.art,.art-placeholder{aspect-ratio:1;background:#e9eef0;border-radius:8px;display:block;object-fit:cover;overflow:hidden;width:96px}.art-placeholder{align-items:center;color:#8a969f;display:flex;font-size:11px;font-weight:700;justify-content:center;text-align:center}.kind{color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.item h2{font-size:19px;line-height:1.2;margin:2px 0}.item a{color:inherit;text-decoration-color:color-mix(in srgb,var(--accent) 55%,transparent);text-underline-offset:3px}.item h2 a{text-decoration:none}.item h2 a:hover{color:var(--accent)}.byline,.album{color:var(--muted);margin:3px 0}.album strong{color:var(--ink)}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.chip{background:#edf6f8;border:1px solid #cbe3e9;border-radius:999px;color:#226477;font-size:11px;font-weight:700;padding:2px 8px}.empty{background:var(--surface);border:1px solid var(--line);border-radius:12px;color:var(--muted);padding:28px;text-align:center}.footer{color:var(--muted);font-size:11px;margin-top:22px}.footer a{color:var(--accent)}
    @media(max-width:520px){body{padding:24px 12px}.item{align-items:start;gap:12px;grid-template-columns:72px minmax(0,1fr);padding:11px}.art,.art-placeholder{width:72px}.item h2{font-size:16px}}
  </style>
</head>
<body>
  <main>
    <header><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(title)}</h1><p class="summary">${escapeHtml(summary)}</p></header>
    <section class="collection">${rows || emptyState}</section>
    <p class="footer">Shared from Bandcamp with Bandkit. Open any title to view it on Bandcamp.</p>
  </main>
  ${embeddedData}
</body>
</html>`;
  }

  function collectionArtwork(imageUrl, title, pageUrl) {
    const art = resolveImage(imageUrl);
    if (!art) return '<div class="art-placeholder">No artwork</div>';
    const image = `<img class="art" src="${escapeHtml(art)}" alt="Artwork for ${escapeHtml(title)}" loading="lazy">`;
    return pageUrl ? `<a href="${escapeHtml(pageUrl)}">${image}</a>` : image;
  }

  function createPlaylistDocument(items = state.playlist, playlistName = "Bandkit playlist") {
    const playlistItems = normalizePlaylist(items).map(portablePlaylistItem).filter(Boolean);
    const exportedAt = new Date();
    const safeName = String(playlistName || "Bandkit playlist").trim().slice(0, 120) || "Bandkit playlist";
    const payload = {
      format: "bandkit-playlist",
      version: 1,
      name: safeName,
      exportedAt: exportedAt.toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      items: playlistItems
    };
    const embeddedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
    const rows = playlistItems.map((item) => {
      const pageUrl = safeBandcampReleaseUrl(item.pageUrl);
      const artistUrl = safeBandcampUrl(item.artistUrl) || pageUrl;
      const title = pageUrl ? `<a href="${escapeHtml(pageUrl)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
      const artist = artistUrl ? `<a href="${escapeHtml(artistUrl)}">${escapeHtml(item.artist)}</a>` : escapeHtml(item.artist);
      const chips = [
        item.duration ? formatDuration(item.duration) : "",
        formatPlaylistBpm(item.bpm),
        [item.key?.camelot, item.key?.shortName].filter(Boolean).join(" · ")
      ].filter(Boolean).map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("");
      return `<article class="item">${collectionArtwork(item.art, item.title, pageUrl)}<div><div class="kind">Track</div><h2>${title}</h2><p class="byline">by ${artist}</p>${item.album ? `<p class="album"><strong>Album:</strong> ${escapeHtml(item.album)}</p>` : ""}${chips ? `<div class="chips">${chips}</div>` : ""}</div></article>`;
    }).join("");
    return {
      count: playlistItems.length,
      filename: `${shareFileName(safeName, "bandkit-playlist")}.html`,
      title: safeName,
      text: `${playlistItems.length} track${playlistItems.length === 1 ? "" : "s"} shared from Bandkit`,
      html: sharedCollectionDocument({
        title: safeName,
        eyebrow: "Shared playlist",
        summary: `${playlistItems.length} track${playlistItems.length === 1 ? "" : "s"} · Shared ${exportedAt.toLocaleString()}`,
        rows,
        embeddedPayload,
        embeddedId: "bandkit-playlist-data"
      })
    };
  }

  function downloadHtmlDocument(documentData, message) {
    const blobUrl = URL.createObjectURL(new Blob([documentData.html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = documentData.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast(message);
  }

  async function shareHtmlDocument(documentData, label) {
    const file = new File([documentData.html], documentData.filename, { type: "text/html" });
    try {
      const canShareFile = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (typeof navigator.share === "function" && canShareFile) {
        await navigator.share({ title: documentData.title, text: documentData.text, files: [file] });
        showToast(`Shared ${label}`);
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
    downloadHtmlDocument(documentData, `Sharing is unavailable here · downloaded ${label} instead`);
  }

  function exportPlaylist(items = state.playlist, playlistName = "Bandkit playlist") {
    const documentData = createPlaylistDocument(items, playlistName);
    downloadHtmlDocument(documentData, `Downloaded ${documentData.count} playlist track${documentData.count === 1 ? "" : "s"}`);
  }

  function sharePlaylist(items = state.playlist, playlistName = "Bandkit playlist") {
    const documentData = createPlaylistDocument(items, playlistName);
    return shareHtmlDocument(documentData, `“${documentData.title}”`);
  }

  function parsePlaylistBackup(text) {
    const source = String(text || "").trim();
    if (!source) throw new Error("The selected file is empty.");
    let payload;
    if (source.startsWith("{")) {
      payload = JSON.parse(source);
    } else {
      const documentNode = new DOMParser().parseFromString(source, "text/html");
      const embedded = documentNode.querySelector("#bandkit-playlist-data")?.textContent;
      if (embedded) {
        payload = JSON.parse(embedded);
      } else {
        const heading = documentNode.querySelector("h1")?.textContent?.trim() || documentNode.title.trim();
        const legacyRows = [...documentNode.querySelectorAll("ol > li, ul > li")];
        const items = legacyRows.map((row, index) => {
          const title = row.querySelector("strong")?.textContent?.trim() || "";
          let pageUrl = row.querySelector("a[href]")?.href || "";
          try {
            const candidate = new URL(pageUrl);
            if (candidate.protocol === "http:" && (candidate.hostname === "bandcamp.com" || candidate.hostname.endsWith(".bandcamp.com"))) {
              candidate.protocol = "https:";
              pageUrl = candidate.href;
            }
          } catch {
            pageUrl = "";
          }
          const safePageUrl = safeBandcampReleaseUrl(pageUrl);
          if (!title || !safePageUrl) return null;
          const details = row.cloneNode(true);
          details.querySelectorAll("strong, a, br").forEach((node) => node.remove());
          let byline = details.textContent.replace(/\s+/g, " ").trim().replace(/^by\s+/i, "");
          const durationMatch = byline.match(/\s*\((\d+):(\d{2})\)\s*$/);
          const duration = durationMatch ? (Number(durationMatch[1]) * 60) + Number(durationMatch[2]) : 0;
          if (durationMatch) byline = byline.slice(0, durationMatch.index).trim();
          const [artist = "Bandcamp", ...albumParts] = byline.split(/\s+—\s+/);
          return {
            id: `legacy-import-${index}-${safePageUrl}`,
            title,
            artist: artist.trim() || "Bandcamp",
            album: albumParts.join(" — ").trim(),
            pageUrl: safePageUrl,
            duration
          };
        }).filter(Boolean);
        if (!items.length) throw new Error("This HTML file does not contain recognizable Bandkit playlist tracks.");
        payload = {
          format: "bandkit-playlist",
          version: 1,
          name: heading || "Bandkit playlist",
          exportedAt: new Date().toISOString(),
          sourcePage: "",
          items
        };
      }
    }
    if (payload?.format !== "bandkit-playlist" || Number(payload.version) !== 1 || !Array.isArray(payload.items)) {
      throw new Error("This is not a supported Bandkit playlist.");
    }
    const items = normalizePlaylist(payload.items);
    if (!items.length) throw new Error("The playlist does not contain any valid Bandcamp tracks.");
    return {
      name: String(payload.name || "Imported playlist").trim().slice(0, 120) || "Imported playlist",
      savedAt: Number.isNaN(new Date(payload.exportedAt).getTime()) ? new Date().toISOString() : new Date(payload.exportedAt).toISOString(),
      sourcePage: portableBandcampUrl(payload.sourcePage),
      items
    };
  }

  async function importPlaylist(file, button) {
    if (!file) return;
    button.disabled = true;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Playlist files must be smaller than 5 MB.");
      const imported = parsePlaylistBackup(await file.text());
      const fallbackName = String(file.name || "Imported playlist").replace(/\.(?:html?|json)$/i, "").replace(/^bandkit-playlist-?/i, "").trim();
      const snapshot = {
        id: `playlist-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: imported.name === "Bandkit playlist" && fallbackName ? fallbackName.slice(0, 120) : imported.name,
        savedAt: imported.savedAt,
        sourcePage: imported.sourcePage,
        items: imported.items
      };
      state.savedPlaylists.unshift(snapshot);
      state.savedPlaylists = normalizeSavedPlaylists(state.savedPlaylists);
      saveState();
      render();
      showToast(`Imported “${snapshot.name}” with ${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"}`);
    } catch (error) {
      showToast(error?.message || "The playlist could not be imported.");
    } finally {
      button.disabled = false;
    }
  }

  function reportDiagnostic(status, error = "") {
    persistLocal({
      bandcampHubDiagnostic: {
        status,
        error: String(error || ""),
        url: location.href,
        at: new Date().toISOString(),
        version: chrome.runtime.getManifest().version
      }
    }, false);
  }


  function selectedAppearanceTheme() {
    const selectedTheme = [...BUILT_IN_THEMES, ...(state.appearance.savedThemes || [])].find((theme) => theme.id === state.appearance.preset);
    if (state.appearance.preset === "custom") {
      return {
        id: "custom",
        label: "Custom",
        accent: state.appearance.customAccent,
        scrubAccent: state.appearance.customScrubAccent || state.appearance.customAccent,
        surface: state.appearance.customSurface,
        card: state.appearance.customCard,
        background: state.appearance.customPageBackground,
        pageSurface: state.appearance.customPageSurface,
        navbar: state.appearance.customNavbar,
        text: state.appearance.customText,
        secondaryText: state.appearance.customSecondaryText
      };
    }
    return selectedTheme || BUILT_IN_THEMES[0];
  }

  function portableAppearanceTheme(theme = selectedAppearanceTheme()) {
    const surfaceColor = hexColor(theme.surface, { r: 255, g: 255, b: 255, a: 1 });
    const pageSurface = theme.pageSurface || theme.surface;
    const text = theme.text || (luminance(hexColor(pageSurface, surfaceColor)) < 0.34 ? "#f8fafc" : "#111827");
    return {
      label: String(theme.label || "Custom").trim().slice(0, 28) || "Custom",
      accent: theme.accent,
      scrubAccent: theme.scrubAccent || theme.accent,
      surface: theme.surface,
      card: theme.card || hexString(luminance(surfaceColor) < 0.34
        ? mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.07)
        : mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.4)),
      background: theme.background || theme.surface,
      pageSurface,
      navbar: theme.navbar || pageSurface,
      text,
      secondaryText: theme.secondaryText || hexString(mixColor(
        hexColor(text, { r: 17, g: 24, b: 39, a: 1 }),
        hexColor(pageSurface, surfaceColor),
        luminance(hexColor(pageSurface, surfaceColor)) < 0.34 ? 0.35 : 0.42
      ))
    };
  }

  function validThemeHex(value) {
    return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
  }

  function parseThemeBackup(text) {
    const source = String(text || "").trim();
    if (!source) throw new Error("The selected theme file is empty.");
    let payload;
    try {
      payload = JSON.parse(source);
    } catch {
      throw new Error("The selected file is not valid JSON.");
    }
    if (payload?.format !== "bandkit-theme" || Number(payload.version) !== 1 || !payload.theme || typeof payload.theme !== "object") {
      throw new Error("This is not a supported Bandkit theme.");
    }
    const label = String(payload.name || payload.theme.label || "Imported theme").trim().slice(0, 28) || "Imported theme";
    const theme = { label };
    for (const key of THEME_COLOR_KEYS) {
      if (!validThemeHex(payload.theme[key])) throw new Error(`The theme has an invalid ${key} colour.`);
      theme[key] = payload.theme[key].toLowerCase();
    }
    if (payload.theme.scrubAccent != null && !validThemeHex(payload.theme.scrubAccent)) {
      throw new Error("The theme has an invalid scrubAccent colour.");
    }
    theme.scrubAccent = (payload.theme.scrubAccent || theme.accent).toLowerCase();
    return theme;
  }

  function exportAppearanceTheme() {
    const theme = portableAppearanceTheme();
    const exportedAt = new Date();
    const payload = {
      format: "bandkit-theme",
      version: 1,
      name: theme.label,
      exportedAt: exportedAt.toISOString(),
      theme: {
        ...Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, theme[key]])),
        scrubAccent: theme.scrubAccent
      }
    };
    const blobUrl = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    const slug = theme.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "custom";
    link.href = blobUrl;
    link.download = `bandkit-theme-${slug}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast(`Downloaded theme “${theme.label}”`);
  }

  async function importAppearanceTheme(file, button) {
    if (!file) return;
    button.disabled = true;
    try {
      if (file.size > 128 * 1024) throw new Error("Theme files must be smaller than 128 KB.");
      const imported = parseThemeBackup(await file.text());
      const savedTheme = {
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...imported
      };
      state.appearance.savedThemes = [...(state.appearance.savedThemes || []), savedTheme].slice(-12);
      state.appearance.preset = savedTheme.id;
      state.appearance.pageAware = false;
      state.appearance.customAccent = savedTheme.accent;
      state.appearance.customScrubAccent = savedTheme.scrubAccent === savedTheme.accent ? null : savedTheme.scrubAccent;
      state.appearance.customSurface = savedTheme.surface;
      state.appearance.customCard = savedTheme.card;
      state.appearance.customPageBackground = savedTheme.background;
      state.appearance.customPageSurface = savedTheme.pageSurface;
      state.appearance.customNavbar = savedTheme.navbar;
      state.appearance.customText = savedTheme.text;
      state.appearance.customSecondaryText = savedTheme.secondaryText;
      applyAppearance();
      saveState();
      render();
      showToast(`Imported and saved theme “${savedTheme.label}”`);
    } catch (error) {
      showToast(error?.message || "The theme could not be imported.");
    } finally {
      button.disabled = false;
    }
  }

  function accessibleAppearanceTheme(theme = selectedAppearanceTheme()) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 17, g: 24, b: 39, a: 1 };
    const panel = hexColor(theme.surface, white);
    const panelIsDark = luminance(panel) < 0.34;
    const card = hexColor(theme.card, panelIsDark ? mixColor(panel, white, 0.07) : mixColor(panel, white, 0.4));
    const background = hexColor(theme.background, luminance(panel) < 0.34 ? mixColor(panel, black, 0.38) : mixColor(panel, white, 0.28));
    const pageSurface = hexColor(theme.pageSurface, panel);
    const navbar = hexColor(theme.navbar, pageSurface);
    const preferredText = hexColor(theme.text, luminance(pageSurface) < 0.34 ? white : black);
    const panelTextResult = readableColor(preferredText, [panel], 7);
    const cardTextResult = readableColor(preferredText, [card], 7);
    const textResult = readableColor(preferredText, [pageSurface], 7);
    const backgroundTextResult = readableColor(preferredText, [background], 7);
    const navbarTextResult = readableColor(preferredText, [navbar], 7);
    const preferredSecondaryText = hexColor(theme.secondaryText, mixColor(preferredText, pageSurface, luminance(pageSurface) < 0.34 ? 0.35 : 0.42));
    const mutedResult = readableColor(preferredSecondaryText, [pageSurface], 4.5);
    const backgroundMutedResult = readableColor(preferredSecondaryText, [background], 4.5);
    const panelMutedResult = readableColor(preferredSecondaryText, [panel], 4.5);
    const cardMutedResult = readableColor(preferredSecondaryText, [card], 4.5);
    const preferredAccent = hexColor(theme.accent, { r: 29, g: 160, b: 195, a: 1 });
    const preferredScrubAccent = hexColor(theme.scrubAccent || theme.accent, preferredAccent);
    const panelAccentResult = readableColor(preferredAccent, [panel], 4.5);
    const cardAccentResult = readableColor(preferredAccent, [card], 4.5);
    const accentResult = readableColor(preferredAccent, [pageSurface], 4.5);
    const backgroundAccentResult = readableColor(preferredAccent, [background], 4.5);
    const text = textResult.color;
    const accent = accentResult.color;
    const panelAccent = panelAccentResult.color;
    const muted = mutedResult.color;
    const border = readableColor(mixColor(pageSurface, text, luminance(pageSurface) < 0.34 ? 0.24 : 0.16), [pageSurface], 3).color;
    const backgroundBorder = readableColor(mixColor(background, backgroundTextResult.color, luminance(background) < 0.34 ? 0.24 : 0.16), [background], 3).color;
    const panelBorder = readableColor(mixColor(panel, panelTextResult.color, luminance(panel) < 0.34 ? 0.24 : 0.16), [panel], 3).color;
    const cardBorder = readableColor(mixColor(card, cardTextResult.color, luminance(card) < 0.34 ? 0.24 : 0.16), [card], 3).color;
    const onAccent = contrast(accent, white) >= contrast(accent, black) ? white : black;
    const backgroundOnAccent = contrast(backgroundAccentResult.color, white) >= contrast(backgroundAccentResult.color, black) ? white : black;
    const panelOnAccent = contrast(panelAccent, white) >= contrast(panelAccent, black) ? white : black;
    const cardOnAccent = contrast(cardAccentResult.color, white) >= contrast(cardAccentResult.color, black) ? white : black;
    return {
      panel, card, background, pageSurface, navbar, text,
      panelText: panelTextResult.color, cardText: cardTextResult.color,
      panelMuted: panelMutedResult.color, cardMuted: cardMutedResult.color,
      backgroundText: backgroundTextResult.color, backgroundMuted: backgroundMutedResult.color,
      backgroundAccent: backgroundAccentResult.color, backgroundBorder, backgroundOnAccent,
      navbarText: navbarTextResult.color,
      accent, panelAccent, cardAccent: cardAccentResult.color, preferredScrubAccent, muted,
      border, panelBorder, cardBorder, onAccent, panelOnAccent, cardOnAccent,
      adjusted: panelTextResult.adjusted || cardTextResult.adjusted || textResult.adjusted || backgroundTextResult.adjusted || navbarTextResult.adjusted || mutedResult.adjusted || backgroundMutedResult.adjusted || panelMutedResult.adjusted || cardMutedResult.adjusted || panelAccentResult.adjusted || cardAccentResult.adjusted || accentResult.adjusted || backgroundAccentResult.adjusted,
      textContrast: Math.min(contrast(panelTextResult.color, panel), contrast(cardTextResult.color, card), contrast(text, pageSurface), contrast(backgroundTextResult.color, background), contrast(navbarTextResult.color, navbar)),
      accentContrast: Math.min(contrast(panelAccent, panel), contrast(cardAccentResult.color, card), contrast(accent, pageSurface))
    };
  }

  function ensureBandcampThemeStyle() {
    if (document.querySelector("#bandkit-bandcamp-theme")) return;
    const pageThemeStyle = document.createElement("style");
    pageThemeStyle.id = "bandkit-bandcamp-theme";
    pageThemeStyle.textContent = `
      html[data-bandkit-page-theme="true"] { background: var(--bandkit-page-background) !important; color-scheme: var(--bandkit-page-scheme); }
      html[data-bandkit-page-theme="true"] body { background: var(--bandkit-page-background) !important; background-image: none !important; color: var(--bandkit-page-background-text) !important; }
      html[data-bandkit-page-theme="true"] :is(#centerWrapper, #propOpenWrapper, #DiscoverApp, #DiscoverApp .discover-app, #PlaylistPage, .full-page-app-wrapper) { background-color: var(--bandkit-page-background) !important; background-image: none !important; color: var(--bandkit-page-background-text) !important; }
      html[data-bandkit-page-theme="true"] :is(main, #pgBd, #pgBdWrapper, #main, #fan-container, #collection-items, .page-bg, .collection-main, .feed-main, .discover-results, .discover-detail, #DiscoverApp main.app, #PlaylistPage .playlist-page, #music-grid, #merch-grid, #community) { background-color: var(--bandkit-page-surface) !important; background-image: none !important; color: var(--bandkit-page-text) !important; }
      html[data-bandkit-page-theme="true"] #DiscoverApp :is(.results-grid-item .content, .focused-result) { background-color: var(--bandkit-page-surface) !important; background-image: none !important; }
      html[data-bandkit-page-theme="true"] :is(.collection-item-container, .story-innards, .discover-player, section.floating-player, .popupmenu, .menu, #rightColumn > #bio-container, #rightColumn > #showography, #rightColumn > #discography, #rightColumn > .sidebar, #rightColumn > .widget, .artists-grid > .artists-grid-item, #music-grid > .music-grid-item, #merch-grid > .merch-grid-item, .video-list > .video-caption, .community-feed .story, .community-band-info .story, body.feed #sidebar, .inline_player, .bandkit-modern-purchase-panel, #recommendations_container .recommended-album) {
        background-color: var(--bandkit-page-card) !important;
        background-image: none !important;
        --bandkit-page-text: var(--bandkit-page-card-text);
        --bandkit-page-muted: var(--bandkit-page-card-muted);
        --bandkit-page-accent: var(--bandkit-page-card-accent);
        --bandkit-page-accent-soft: var(--bandkit-page-card-accent-soft);
        --bandkit-page-border: var(--bandkit-page-card-border);
        --bandkit-page-on-accent: var(--bandkit-page-card-on-accent);
      }
      html[data-bandkit-page-theme="true"] :is(h1, h2, h3, h4, h5, h6, p, li, td, th, label, strong, .primaryText, .track-title, .title, .title-text, .item-title, .albumTitle, .trackTitle, :where(#name-section .title)) { color: var(--bandkit-page-text) !important; }
      html[data-bandkit-page-theme="true"] :is(.secondaryText, .track-number, .time, .artist, .artist-name, .subhead, .itemsubtext, .genre, .location, .tralbumData, .credits) { color: var(--bandkit-page-muted) !important; }
      html[data-bandkit-page-theme="true"] :is(a, a.primaryText, .buy-link, .download-link, #track_table a, button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-analyze):not(.bandcamp-hub-page-buy):not(.bandcamp-hub-page-playlist-menu button)) { color: var(--bandkit-page-accent) !important; }
      html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, header[role="banner"]) :is(.bandcamp-logo-link, .logo > a, a[aria-label="Bandcamp"], a[aria-label="Bandcamp home"]) { color: var(--bandkit-page-navbar-text) !important; }
      html[data-bandkit-page-theme="true"] :is(input, select, textarea, .track_row_view, .collection-item-container, .item, .popupmenu, .menu) { border-color: var(--bandkit-page-border) !important; }
      html[data-bandkit-page-theme="true"] :is(input, select, textarea, .popupmenu, .menu) { background-color: var(--bandkit-page-card) !important; color: var(--bandkit-page-text) !important; }
      html[data-bandkit-page-theme="true"] button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-analyze):not(.bandcamp-hub-page-buy):not(.bandcamp-hub-page-playlist-menu button):not(.no-outline):not(.icon-only):not(.play-target):not(.over-image):not(.wishlist-button) { background-color: var(--bandkit-page-card) !important; border-color: var(--bandkit-page-border) !important; }
      html[data-bandkit-page-theme="true"] :is(button.selected, button.is-selected, button.active, button[aria-pressed="true"]):not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-analyze) { background-color: var(--bandkit-page-accent) !important; color: var(--bandkit-page-on-accent) !important; }
      html[data-bandkit-page-theme="true"] :is(.band-navbar-wrapper, #band-navbar) { background-color: var(--bandkit-page-navbar) !important; }
      html[data-bandkit-page-theme="true"] #band-navbar a { color: var(--bandkit-page-navbar-text) !important; }
      html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, header[role="banner"]) { background-color: var(--bandkit-page-navbar) !important; color: var(--bandkit-page-navbar-text) !important; }
      html[data-bandkit-page-theme="true"] .follow-unfollow,
      html[data-bandkit-page-theme="true"] .follow-unfollow *,
      html[data-bandkit-page-theme="true"] .follow-band,
      html[data-bandkit-page-theme="true"] .follow-band * { background-color: var(--bandkit-page-accent) !important; background-image: none !important; border-color: var(--bandkit-page-accent) !important; box-shadow: none !important; color: var(--bandkit-page-on-accent) !important; }
      html[data-bandkit-page-theme="true"] .follow-unfollow { border: 0 !important; }
      html[data-bandkit-page-theme="true"] :is(.tag, .tags a, .collection-item-tags a) { background-color: var(--bandkit-page-accent-soft) !important; border-color: transparent !important; color: var(--bandkit-page-accent) !important; }
      html[data-bandkit-page-theme="true"][data-bandkit-feed-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-add-to, .bandcamp-hub-page-playlist.is-feed-sidebar-action, .bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-feed-purchase-action, .bandkit-feed-hear-more-action, .bandkit-feed-wishlist-control, .bandkit-feed-wishlist-action .wishlist-msg, .bandkit-feed-wishlist-action .wishlisted-msg > span:first-child),
      html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-collection-download-action) { border-color: var(--bandkit-page-border) !important; color: var(--bandkit-page-accent) !important; }
      html[data-bandkit-page-theme="true"][data-bandkit-feed-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action, .bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-feed-purchase-action, .bandkit-feed-hear-more-action, .bandkit-feed-wishlist-control, .bandkit-feed-wishlist-action .wishlist-msg, .bandkit-feed-wishlist-action .wishlisted-msg > span:first-child):is(:hover, :focus-visible),
      html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-collection-download-action):is(:hover, :focus-visible) { background: var(--bandkit-page-accent-soft) !important; border-color: var(--bandkit-page-accent) !important; }
      html[data-bandkit-page-theme="true"] :is(hr, .track_row_view, .collection-item-container, section.floating-player) { border-color: var(--bandkit-page-border) !important; }
      html[data-bandkit-page-theme="true"] .track_row_view { background-color: transparent !important; background-image: none !important; }
      html[data-bandkit-page-theme="true"] :is(.page-banners, .banner-manager) .text-banner {
        --bandkit-page-text: var(--bandkit-page-surface-text);
        --bandkit-page-muted: var(--bandkit-page-surface-muted);
        --bandkit-page-accent: var(--bandkit-page-surface-accent);
        --bandkit-page-border: var(--bandkit-page-surface-border);
        background: var(--bandkit-page-surface) !important;
        border-color: var(--bandkit-page-border) !important;
        color: var(--bandkit-page-text) !important;
      }
      html[data-bandkit-page-theme="true"] :is(.page-banners, .banner-manager) .text-banner :is(p, span) { color: inherit !important; }
      html[data-bandkit-page-theme="true"] :is(.page-banners, .banner-manager) .text-banner .review-button {
        background: transparent !important;
        border: 0 !important;
        color: var(--bandkit-page-accent) !important;
      }
      html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner {
        --gray700: var(--bandkit-page-surface-text);
        --page-text-color: var(--bandkit-page-surface-text);
        --page-text-color-secondary: var(--bandkit-page-surface-muted);
        --border-color: var(--bandkit-page-surface-border);
        background: var(--bandkit-page-surface) !important;
        color: var(--bandkit-page-surface-text) !important;
      }
      html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.genre-filter, .subgenre-filter, .format-filter, .more-filters-row, .tags-background, .horizontal-scroll-row) {
        background: transparent !important;
        background-image: none !important;
      }
      html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) {
        --gray700: var(--bandkit-page-card-text);
        --g-button-background-color: var(--bandkit-page-card);
        --g-button-text-color: var(--bandkit-page-card-text);
        --g-button-border-color: var(--bandkit-page-card-border);
        background: var(--bandkit-page-card) !important;
        background-image: none !important;
        border-color: var(--bandkit-page-card-border) !important;
        color: var(--bandkit-page-card-text) !important;
      }
      html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.chip-button.selected-tag, .radio-item.active, .radio-item.selected, .radio-item[aria-checked="true"], [role="option"][aria-selected="true"]) {
        --gray700: var(--bandkit-page-on-accent);
        --g-button-background-color: var(--bandkit-page-accent);
        --g-button-text-color: var(--bandkit-page-on-accent);
        --g-button-border-color: var(--bandkit-page-accent);
        background: var(--bandkit-page-accent) !important;
        border-color: var(--bandkit-page-accent) !important;
        color: var(--bandkit-page-on-accent) !important;
      }
      html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) :is(span, svg) { color: inherit !important; }
      html[data-bandkit-page-theme="true"] #DiscoverApp :is(.tag-search-wrapper, .filters-banner) input::placeholder {
        color: var(--bandkit-page-card-muted) !important;
        opacity: 1 !important;
      }
      html[data-bandkit-page-theme="true"] #PlaylistPage {
        --gray700: var(--bandkit-page-surface-text);
        --page-text-color: var(--bandkit-page-surface-text);
        --page-text-color-secondary: var(--bandkit-page-surface-muted);
        --page-background-color: var(--bandkit-page-surface);
        --border-color: var(--bandkit-page-surface-border);
        --border-color-subtle: var(--bandkit-page-surface-border);
        --elevated-background: transparent;
        --elevated-border: 1px solid var(--bandkit-page-surface-border);
      }
      html[data-bandkit-page-theme="true"] #PlaylistPage .tracklist-pane { background: var(--bandkit-page-surface) !important; }
      html[data-bandkit-page-theme="true"] #PlaylistPage :is(.play-pause-button.play-target, .play-pause-button.over-image, .wishlist-button, .wishlist-button.action) {
        background: transparent !important;
        background-image: none !important;
        border-color: transparent !important;
        box-shadow: none !important;
      }
      html[data-bandkit-page-theme="true"] #PlaylistPage .wishlist-button { --gray700: var(--bandkit-page-accent); color: var(--bandkit-page-accent) !important; }
      html[data-bandkit-page-theme="true"] #PlaylistPage .track-meta .art > img {
        background: transparent !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      html[data-bandkit-page-theme="true"] #HomepageApp { background-color: var(--bandkit-page-background) !important; color: var(--bandkit-page-background-text) !important; }
      html[data-bandkit-page-theme="true"] #HomepageApp .g-section {
        --bandkit-page-text: var(--bandkit-page-background-text);
        --bandkit-page-muted: var(--bandkit-page-background-muted);
        --bandkit-page-accent: var(--bandkit-page-background-accent);
        --bandkit-page-accent-soft: var(--bandkit-page-background-accent-soft);
        --bandkit-page-border: var(--bandkit-page-background-border);
        --bandkit-page-on-accent: var(--bandkit-page-background-on-accent);
        background-color: var(--bandkit-page-background) !important;
        color: var(--bandkit-page-text) !important;
      }
      html[data-bandkit-page-theme="true"] #HomepageApp .g-section.inverted {
        --bandkit-page-text: var(--bandkit-page-surface-text);
        --bandkit-page-muted: var(--bandkit-page-surface-muted);
        --bandkit-page-accent: var(--bandkit-page-surface-accent);
        --bandkit-page-accent-soft: var(--bandkit-page-surface-accent-soft);
        --bandkit-page-border: var(--bandkit-page-surface-border);
        --bandkit-page-on-accent: var(--bandkit-page-surface-on-accent);
        background-color: var(--bandkit-page-surface) !important;
      }
      html[data-bandkit-page-theme="true"] #HomepageApp .g-section :is(.attribution, .attribution-meta, .byline, .date, .meta) { color: var(--bandkit-page-muted) !important; }
      html[data-bandkit-page-theme="true"] #HomepageApp :is(.play-pause-button, .play-button, .artwork-play-button).over-image {
        background-color: transparent !important;
        background-image: none !important;
        border-color: transparent !important;
      }
      html[data-bandkit-page-theme="true"] body.tralbum-page :is(#buyItemModal, .buyItemModal, .buy-item-modal, .purchase-modal, .purchase-dialog, [role="dialog"])
        :is(input[type="text"], input[type="number"], input:not([type]), select, textarea) {
        background-color: #fff !important;
        border-color: #aaa !important;
        color: #333 !important;
        color-scheme: light;
      }
      html[data-bandkit-page-theme="true"] ::selection { background: var(--bandkit-page-accent); color: var(--bandkit-page-on-accent); }
    `;
    document.head.append(pageThemeStyle);
  }

  function applyBandcampPageTheme() {
    ensureBandcampThemeStyle();
    const enabled = Boolean(state.appearance.applyToPage);
    document.documentElement.dataset.bandkitPageTheme = String(enabled);
    if (!enabled) {
      for (const name of ["--bandkit-page-background", "--bandkit-page-surface", "--bandkit-page-card", "--bandkit-page-navbar", "--bandkit-page-navbar-text", "--bandkit-page-text", "--bandkit-page-background-text", "--bandkit-page-background-muted", "--bandkit-page-background-accent", "--bandkit-page-background-accent-soft", "--bandkit-page-background-border", "--bandkit-page-background-on-accent", "--bandkit-page-surface-text", "--bandkit-page-surface-muted", "--bandkit-page-surface-accent", "--bandkit-page-surface-accent-soft", "--bandkit-page-surface-border", "--bandkit-page-surface-on-accent", "--bandkit-page-muted", "--bandkit-page-accent", "--bandkit-page-accent-soft", "--bandkit-page-border", "--bandkit-page-on-accent", "--bandkit-page-card-text", "--bandkit-page-card-muted", "--bandkit-page-card-accent", "--bandkit-page-card-accent-soft", "--bandkit-page-card-border", "--bandkit-page-card-on-accent", "--bandkit-page-scheme"]) {
        document.documentElement.style.removeProperty(name);
      }
      return;
    }
    const theme = accessibleAppearanceTheme();
    const dark = luminance(theme.background) < 0.34;
    const variables = {
      "--bandkit-page-background": colorString(theme.background),
      "--bandkit-page-surface": colorString(theme.pageSurface),
      "--bandkit-page-card": colorString(theme.card),
      "--bandkit-page-navbar": colorString(theme.navbar),
      "--bandkit-page-navbar-text": colorString(theme.navbarText),
      "--bandkit-page-text": colorString(theme.text),
      "--bandkit-page-background-text": colorString(theme.backgroundText),
      "--bandkit-page-background-muted": colorString(theme.backgroundMuted),
      "--bandkit-page-background-accent": colorString(theme.backgroundAccent),
      "--bandkit-page-background-accent-soft": colorString(theme.backgroundAccent, luminance(theme.background) < 0.34 ? 0.16 : 0.1),
      "--bandkit-page-background-border": colorString(theme.backgroundBorder),
      "--bandkit-page-background-on-accent": colorString(theme.backgroundOnAccent),
      "--bandkit-page-surface-text": colorString(theme.text),
      "--bandkit-page-surface-muted": colorString(theme.muted),
      "--bandkit-page-surface-accent": colorString(theme.accent),
      "--bandkit-page-surface-accent-soft": colorString(theme.accent, luminance(theme.pageSurface) < 0.34 ? 0.16 : 0.1),
      "--bandkit-page-surface-border": colorString(theme.border),
      "--bandkit-page-surface-on-accent": colorString(theme.onAccent),
      "--bandkit-page-muted": colorString(theme.muted),
      "--bandkit-page-accent": colorString(theme.accent),
      "--bandkit-page-accent-soft": colorString(theme.accent, dark ? 0.16 : 0.1),
      "--bandkit-page-border": colorString(theme.border),
      "--bandkit-page-on-accent": colorString(theme.onAccent),
      "--bandkit-page-card-text": colorString(theme.cardText),
      "--bandkit-page-card-muted": colorString(theme.cardMuted),
      "--bandkit-page-card-accent": colorString(theme.cardAccent),
      "--bandkit-page-card-accent-soft": colorString(theme.cardAccent, luminance(theme.card) < 0.34 ? 0.16 : 0.1),
      "--bandkit-page-card-border": colorString(theme.cardBorder),
      "--bandkit-page-card-on-accent": colorString(theme.cardOnAccent),
      "--bandkit-page-scheme": dark ? "dark" : "light"
    };
    for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
  }

  function applyShadowHeaderTheme() {
    const menuBar = document.querySelector("menu-bar");
    if (!menuBar?.shadowRoot) return;
    const propertyNames = [
      "--default-background-color", "--page-background-color", "--menubar-background-color",
      "--elevated-background-color-1", "--elevated-background-color-2", "--elevated-background-color-3", "--elevated-background-color-4",
      "--default-foreground-color", "--page-text-color", "--page-text-color-secondary", "--bc-link-color",
      "--menubar-search-input-background-color", "--border-color", "--border-color-strong", "--border-color-subtle",
      "--bandcamp-blue", "--artist-blue", "--blue400", "--disabled-text-color", "color-scheme"
    ];
    if (!state.appearance.applyToPage) {
      for (const name of propertyNames) menuBar.style.removeProperty(name);
      return;
    }
    const theme = accessibleAppearanceTheme();
    const dark = luminance(theme.navbar) < 0.34;
    const navbarAccent = readableColor(theme.accent, [theme.navbar], 4.5).color;
    const navbarMuted = readableColor(theme.muted, [theme.navbar], 4.5).color;
    const navbarBorder = readableColor(
      mixColor(theme.navbar, theme.navbarText, dark ? 0.24 : 0.16),
      [theme.navbar],
      3
    ).color;
    const searchBackground = mixColor(theme.navbar, theme.navbarText, dark ? 0.16 : 0.08);
    const variables = {
      "--default-background-color": colorString(theme.navbar),
      "--page-background-color": colorString(theme.navbar),
      "--menubar-background-color": colorString(theme.navbar),
      "--elevated-background-color-1": colorString(theme.navbar),
      "--elevated-background-color-2": colorString(theme.navbar),
      "--elevated-background-color-3": colorString(theme.navbar),
      "--elevated-background-color-4": colorString(theme.navbar),
      "--default-foreground-color": colorString(theme.navbarText),
      "--page-text-color": colorString(theme.navbarText),
      "--page-text-color-secondary": colorString(navbarMuted),
      "--bc-link-color": colorString(theme.navbarText),
      "--menubar-search-input-background-color": colorString(searchBackground),
      "--border-color": colorString(navbarBorder),
      "--border-color-strong": colorString(theme.navbarText),
      "--border-color-subtle": colorString(navbarBorder, 0.55),
      "--bandcamp-blue": colorString(theme.navbarText),
      "--artist-blue": colorString(navbarAccent),
      "--blue400": colorString(navbarAccent),
      "--disabled-text-color": colorString(navbarMuted),
      "color-scheme": dark ? "dark" : "light"
    };
    for (const [name, value] of Object.entries(variables)) menuBar.style.setProperty(name, value, "important");
  }

  function isClassicReleasePage() {
    return Boolean(
      document.body?.classList.contains("tralbum-page")
      && document.querySelector("#trackInfo")
      && document.querySelector("#tralbumArt")
      && document.querySelector(".trackView")
    );
  }

  function modernBandcampPageType() {
    const pathname = location.pathname.replace(/\/+$/, "") || "/";
    const isBandcampHome = location.hostname === "bandcamp.com" && pathname === "/";
    const isDiscover = Boolean(document.querySelector("#DiscoverApp")) || /^\/discover(?:\/|$)/.test(pathname);
    const isFanCollection = Boolean(document.querySelector("#fan-container, #collection-grid"))
      && !document.body?.classList.contains("feed")
      && !/\/feed$/.test(pathname);
    if (isBandcampHome || isDiscover || isFanCollection) return "";
    if (isClassicReleasePage()) return "release";
    if (document.body?.classList.contains("feed") || /\/feed$/.test(pathname)) return "feed";
    if (document.querySelector(".video-list") || pathname === "/video") return "video";
    if (document.querySelector("#community")) return "community";
    if (document.querySelector("#music-grid, .artists-grid") || pathname === "/artists") return "music";
    if (document.querySelector("#merch-grid, .merch-grid")) return "merch";
    return "";
  }

  function moveModernReleaseNode(node, destination) {
    if (!node || !destination) return;
    const marker = document.createComment("bandkit-modern-release-position");
    node.before(marker);
    destination.append(node);
    modernReleaseMoveRecords.push({ node, marker });
  }

  function createModernReleaseShell(tagName, className, heading = "") {
    const shell = document.createElement(tagName);
    shell.className = className;
    if (heading) {
      const title = document.createElement("h2");
      title.className = "bandkit-modern-section-title";
      title.textContent = heading;
      shell.append(title);
    }
    modernReleaseShells.push(shell);
    return shell;
  }

  function pageActionThemeValues() {
    if (pageActionThemeCache) return pageActionThemeCache;
    const styles = getComputedStyle(host);
    pageActionThemeCache = Object.fromEntries([
      "--hub-card", "--hub-ink", "--hub-accent", "--hub-accent-soft", "--hub-line", "--hub-on-accent"
    ].map((name) => [name, styles.getPropertyValue(name)]));
    return pageActionThemeCache;
  }

  function applyPageActionTheme(control) {
    if (!control) return;
    for (const [name, value] of Object.entries(pageActionThemeValues())) {
      if (value) control.style.setProperty(name, value);
    }
  }

  function setPageActionLabel(control, label) {
    if (!control) return;
    let visibleLabel = control.querySelector(":scope > .bandkit-page-action-label");
    if (!label) {
      delete control.dataset.bandkitLabel;
      visibleLabel?.remove();
      return;
    }
    control.dataset.bandkitLabel = label;
    if (!visibleLabel) {
      visibleLabel = document.createElement("span");
      visibleLabel.className = "bandkit-page-action-label";
      visibleLabel.setAttribute("aria-hidden", "true");
      control.append(visibleLabel);
    }
    visibleLabel.dataset.bandkitLabelText = label;
  }

  function pageActionControlText(control) {
    if (!(control instanceof Element)) return "";
    const copy = control.cloneNode(true);
    copy.querySelectorAll(".bandkit-page-action-label").forEach((label) => label.remove());
    return String(copy.textContent || "").replace(/\s+/g, " ").trim();
  }

  function syncPageActionLabelMode() {
    document.documentElement.dataset.bandkitPageActionLabels = String(Boolean(state.pageActionLabels));
  }

  function syncTrackKeyVisibilityMode() {
    document.documentElement.dataset.bandkitShowTrackKeys = String(state.showTrackKeys !== false);
  }

  function markModernTrackAvailability(trackTable) {
    if (!trackTable) return;
    const trackInfo = getBandcampPageData()?.tralbum?.trackinfo || [];
    const rows = [...trackTable.querySelectorAll(".track_row_view")];
    for (const [index, row] of rows.entries()) {
      const control = row.querySelector(".play-col > a");
      const relation = row.getAttribute("rel") || "";
      const trackNumber = Number(relation.match(/(?:^|[&;\s])tracknum=(\d+)/i)?.[1] || 0);
      const track = trackInfo[trackNumber > 0 ? trackNumber - 1 : index];
      const hasTrackAvailability = Boolean(track && Object.prototype.hasOwnProperty.call(track, "file"));
      const hasPlayableFile = Boolean(track?.file && Object.values(track.file).some((value) => typeof value === "string" && value.trim()));
      const nativeStyle = control ? getComputedStyle(control) : null;
      const nativelyUnavailable = !control
        || control.hidden
        || control.getAttribute("aria-disabled") === "true"
        || nativeStyle?.display === "none"
        || nativeStyle?.visibility === "hidden";
      row.classList.toggle("bandkit-modern-track-unplayable", hasTrackAvailability ? !hasPlayableFile : nativelyUnavailable);
    }
    modernReleaseCleanups.push(() => rows.forEach((row) => row.classList.remove("bandkit-modern-track-unplayable")));
  }

  function prepareModernReleaseLayout() {
    if (modernReleaseLayoutPrepared || !isClassicReleasePage()) return;
    const release = document.querySelector(".trackView");
    const trackInfoInner = document.querySelector("#trackInfoInner");
    const commands = trackInfoInner?.querySelector(":scope > .tralbumCommands");
    const rightColumn = document.querySelector("#rightColumn");
    const trackTable = document.querySelector("#track_table");
    if (!release || !trackInfoInner || !rightColumn) return;
    if (commands) {
      const albumTracks = buildSeamlessQueue();
      if (albumTracks.length) {
        const addAllButton = createPagePlaylistButton();
        addAllButton.classList.add("is-album-add-all");
        addAllButton._bandkitTracks = albumTracks;
        setPageActionLabel(addAllButton, "Add all");
        addAllButton.style.setProperty("--hub-plus-icon", `url('${asset("icon-add-all.svg")}')`);
        applyPageActionTheme(addAllButton);
        addAllButton.setAttribute("aria-haspopup", "menu");
        addAllButton.setAttribute("aria-expanded", "false");
        addAllButton.setAttribute("aria-label", "Add all album tracks to Now Playing or a playlist");
        addAllButton.title = addAllButton.getAttribute("aria-label");
        const inlinePlayer = trackInfoInner.querySelector(":scope > .inline_player");
        if (inlinePlayer) {
          let playerTools = inlinePlayer.querySelector(":scope > .bandcamp-hub-page-tools");
          if (!playerTools) {
            playerTools = document.createElement("div");
            playerTools.className = "bandcamp-hub-page-tools";
            inlinePlayer.append(playerTools);
          }
          playerTools.append(addAllButton);
          modernReleaseCleanups.push(() => addAllButton.remove());
        }
      }
      const addTrigger = [...commands.querySelectorAll("button, a")].find((control) => {
        const text = control.textContent?.trim() || "";
        const accessibleName = `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""}`.trim();
        return text === "+" || /^add to(?: collection)?$/i.test(accessibleName);
      });
      if (addTrigger) {
        const hiddenTrigger = addTrigger.closest("li") || addTrigger;
        hiddenTrigger.classList.add("bandkit-modern-add-trigger");
        modernReleaseCleanups.push(() => hiddenTrigger.classList.remove("bandkit-modern-add-trigger"));
      }
    }

    const purchasePanel = createModernReleaseShell("section", "bandkit-modern-purchase-panel", "Buy & collect");
    const purchaseList = createModernReleaseShell("ul", "bandkit-modern-purchase-list");
    purchasePanel.append(purchaseList);
    rightColumn.prepend(purchasePanel);
    for (const item of commands?.querySelectorAll(":scope > .buyItem") || []) {
      moveModernReleaseNode(item, purchaseList);
    }
    if (commands && [...commands.children].every((item) => item.classList.contains("bandkit-modern-add-trigger"))) {
      commands.classList.add("bandkit-modern-commands-empty");
      modernReleaseCleanups.push(() => commands.classList.remove("bandkit-modern-commands-empty"));
    }
    markModernTrackAvailability(trackTable);

    const releasePrimary = createModernReleaseShell("section", "bandkit-modern-release-primary");
    const musicColumn = createModernReleaseShell("div", "bandkit-modern-music-column");
    const artColumn = createModernReleaseShell("div", "bandkit-modern-art-column");
    releasePrimary.append(musicColumn, artColumn);
    release.append(releasePrimary);
    for (const node of [
      document.querySelector("#name-section"),
      document.querySelector("#trackInfo")
    ]) {
      if (node) moveModernReleaseNode(node, musicColumn);
    }
    const artworkColumn = document.querySelector(".middleColumn");
    if (artworkColumn) moveModernReleaseNode(artworkColumn, artColumn);

    const releaseBody = createModernReleaseShell("section", "bandkit-modern-release-body");
    const notesPanel = createModernReleaseShell("section", "bandkit-modern-notes-panel", "Release notes");
    if (trackTable) {
      moveModernReleaseNode(trackTable, trackInfoInner);
      const inlinePlayer = trackInfoInner.querySelector(":scope > .inline_player");
      if (inlinePlayer) inlinePlayer.after(trackTable);
    } else {
      releaseBody.classList.add("is-single-track");
    }
    artColumn.append(notesPanel);
    release.append(releaseBody);

    const supporters = document.querySelector(".middleColumn > .collected-by, .collected-by.tralbum.collectors");
    if (supporters) {
      moveModernReleaseNode(supporters, releaseBody);
      releaseBody.prepend(supporters);

      supporters.dataset.bandkitExpanded = "false";
      const minimizeSupporters = createModernReleaseShell("button", "bandkit-modern-supporters-toggle");
      minimizeSupporters.type = "button";
      minimizeSupporters.textContent = "Minimize";
      minimizeSupporters.hidden = true;
      minimizeSupporters.setAttribute("aria-expanded", "false");
      supporters.append(minimizeSupporters);

      const supporterDetails = supporters.querySelector(".deets");
      if (supporterDetails) {
        const reviews = createModernReleaseShell("div", "bandkit-modern-supporter-reviews");
        const supporterGrid = createModernReleaseShell("div", "bandkit-modern-supporter-grid");
        supporterDetails.append(reviews, supporterGrid);
        for (const review of supporterDetails.querySelectorAll(":scope > .writing")) {
          moveModernReleaseNode(review, reviews);
        }
        for (const selector of [":scope > .no-writing", ":scope > .more-thumbs"]) {
          const node = supporterDetails.querySelector(selector);
          if (node) moveModernReleaseNode(node, supporterGrid);
        }

        const reviewItems = [...reviews.querySelectorAll(":scope > .writing")];
        let activeReview = 0;
        const showReview = (index) => {
          activeReview = (index + reviewItems.length) % reviewItems.length;
          reviewItems.forEach((review, reviewIndex) => {
            const active = reviewIndex === activeReview;
            review.classList.toggle("is-active", active);
            review.setAttribute("aria-hidden", String(!active));
          });
        };
        const stopReviewRotation = () => {
          if (modernReleaseSupporterTimer) window.clearInterval(modernReleaseSupporterTimer);
          modernReleaseSupporterTimer = null;
        };
        const startReviewRotation = () => {
          stopReviewRotation();
          if (!reviewItems.length) return;
          showReview(activeReview);
          if (reviewItems.length > 1) {
            modernReleaseSupporterTimer = window.setInterval(() => showReview(activeReview + 1), 6500);
          }
        };
        startReviewRotation();

        const moreSupporters = supporterGrid.querySelector(":scope > .more-thumbs");
        const avatarGrid = supporterGrid.querySelector(":scope > .no-writing");
        let supporterLayoutFrame = 0;
        const syncCompactSupporters = () => {
          if (!avatarGrid) return;
          const avatars = [...avatarGrid.querySelectorAll(":scope > .fan.pic")];
          const firstAvatar = avatars[0];
          if (!firstAvatar) return;
          const styles = getComputedStyle(avatarGrid);
          const gap = Number.parseFloat(styles.columnGap) || 8;
          const avatarWidth = firstAvatar.getBoundingClientRect().width || 42;
          const columns = Math.max(1, Math.floor((avatarGrid.clientWidth + gap) / (avatarWidth + gap)));
          const compactLimit = columns * 2;
          avatars.forEach((avatar, index) => {
            avatar.classList.toggle("bandkit-modern-supporter-overflow", index >= compactLimit);
          });
        };
        const scheduleCompactSupporters = () => {
          window.cancelAnimationFrame(supporterLayoutFrame);
          supporterLayoutFrame = window.requestAnimationFrame(syncCompactSupporters);
        };
        const supporterResizeObserver = new ResizeObserver(scheduleCompactSupporters);
        const supporterMutationObserver = new MutationObserver(scheduleCompactSupporters);
        if (avatarGrid) {
          supporterResizeObserver.observe(avatarGrid);
          supporterMutationObserver.observe(avatarGrid, { childList: true });
          scheduleCompactSupporters();
        }
        const setExpanded = (expanded) => {
          supporters.dataset.bandkitExpanded = String(expanded);
          minimizeSupporters.hidden = !expanded;
          minimizeSupporters.setAttribute("aria-expanded", String(expanded));
          moreSupporters?.setAttribute("aria-expanded", String(expanded));
          if (expanded) {
            stopReviewRotation();
            reviewItems.forEach((review) => review.setAttribute("aria-hidden", "false"));
          } else {
            startReviewRotation();
          }
        };
        const expandSupporters = () => setExpanded(true);
        const collapseSupporters = () => setExpanded(false);
        moreSupporters?.addEventListener("click", expandSupporters);
        minimizeSupporters.addEventListener("click", collapseSupporters);
        modernReleaseCleanups.push(() => {
          stopReviewRotation();
          moreSupporters?.removeEventListener("click", expandSupporters);
          minimizeSupporters.removeEventListener("click", collapseSupporters);
          reviewItems.forEach((review) => {
            review.classList.remove("is-active");
            review.removeAttribute("aria-hidden");
          });
          window.cancelAnimationFrame(supporterLayoutFrame);
          supporterResizeObserver.disconnect();
          supporterMutationObserver.disconnect();
          avatarGrid?.querySelectorAll(".bandkit-modern-supporter-overflow").forEach((avatar) => {
            avatar.classList.remove("bandkit-modern-supporter-overflow");
          });
          delete supporters.dataset.bandkitExpanded;
        });
      }
    }

    for (const selector of [
      ".about-label", ".tralbum-about", ".credits-label", ".tralbum-credits",
      ".license-label", "#license"
    ]) {
      const node = document.querySelector(selector);
      if (node && !notesPanel.contains(node)) moveModernReleaseNode(node, notesPanel);
    }

    const tagsLabel = document.querySelector(".tags-label");
    const tags = document.querySelector(".tralbum-tags");
    if (tagsLabel || tags) {
      const tagsPanel = createModernReleaseShell("section", "bandkit-modern-tags-panel", "Tags");
      releaseBody.append(tagsPanel);
      if (tagsLabel) moveModernReleaseNode(tagsLabel, tagsPanel);
      if (tags) moveModernReleaseNode(tags, tagsPanel);

      if (supporters) {
        let tagsWidthFrame = 0;
        const syncTagsWidth = () => {
          window.cancelAnimationFrame(tagsWidthFrame);
          tagsWidthFrame = window.requestAnimationFrame(() => {
            const width = supporters.getBoundingClientRect().width;
            if (width > 0) {
              tagsPanel.style.setProperty("width", `${width}px`, "important");
              tagsPanel.style.setProperty("max-width", `${width}px`, "important");
            }
          });
        };
        const tagsWidthObserver = new ResizeObserver(syncTagsWidth);
        tagsWidthObserver.observe(supporters);
        syncTagsWidth();
        modernReleaseCleanups.push(() => {
          window.cancelAnimationFrame(tagsWidthFrame);
          tagsWidthObserver.disconnect();
          tagsPanel.style.removeProperty("width");
          tagsPanel.style.removeProperty("max-width");
        });
      }
    }

    const recommendations = document.querySelector("#recommendations_container");
    if (recommendations) {
      const recommendationsTitle = createModernReleaseShell("h2", "bandkit-modern-recommendations-title");
      recommendationsTitle.textContent = "More to explore";
      recommendations.prepend(recommendationsTitle);

      const activateRecommendationCard = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const card = target?.closest(".recommended-album");
        if (!card || !recommendations.contains(card)) return;
        recommendations.querySelectorAll(".recommended-album.selected").forEach((candidate) => {
          candidate.classList.toggle("selected", candidate === card);
        });
        card.classList.add("selected");
        card.closest(".first-row")?.classList.add("expanded");
      };
      recommendations.addEventListener("pointerover", activateRecommendationCard);
      recommendations.addEventListener("focusin", activateRecommendationCard);
      modernReleaseCleanups.push(() => {
        recommendations.removeEventListener("pointerover", activateRecommendationCard);
        recommendations.removeEventListener("focusin", activateRecommendationCard);
      });
    }

    modernReleaseLayoutPrepared = true;
  }

  function restoreModernReleaseLayout() {
    if (!modernReleaseLayoutPrepared) return;
    if (modernReleaseSupporterTimer) window.clearInterval(modernReleaseSupporterTimer);
    modernReleaseSupporterTimer = null;
    for (const cleanup of [...modernReleaseCleanups].reverse()) cleanup();
    modernReleaseCleanups = [];
    for (const { node, marker } of [...modernReleaseMoveRecords].reverse()) {
      if (marker.isConnected) marker.replaceWith(node);
    }
    for (const shell of [...modernReleaseShells].reverse()) shell.remove();
    modernReleaseMoveRecords = [];
    modernReleaseShells = [];
    modernReleaseLayoutPrepared = false;
  }

  function captureModernReleasePalette() {
    const fallbackBackground = { r: 255, g: 255, b: 255, a: 1 };
    const fallbackText = { r: 17, g: 24, b: 39, a: 1 };
    const background = firstComputedColor(["body"], "backgroundColor") || fallbackBackground;
    const surface = firstComputedColor(["#pgBd", "main", "body"], "backgroundColor") || background;
    const surfaceRaised = firstComputedColor([".story-innards", ".collection-item-container", ".track_row_view", ".discover-player", "section.floating-player"], "backgroundColor") || surface;
    const text = firstComputedColor([".primaryText", "#name-section .trackTitle", ".collection-item-title", ".story", "#pgBd", "body"], "color") || fallbackText;
    const secondary = firstComputedColor([".secondaryText", ".collection-item-artist", ".story-date", ".track-number", ".time"], "color") || text;
    const link = firstComputedColor(["#trackInfo a:not(.notSkinnable)", "#name-section a", "#community a", "#music-grid a", ".story a", "#rightColumn a", "a"], "color") || text;
    const navbar = firstComputedColor(["#band-navbar"], "backgroundColor") || surface;
    const navbarText = firstComputedColor(["#band-navbar a.active", "#band-navbar a"], "color") || text;
    const footerBackground = firstComputedColor(["#pgFt", "#recommendations_container"], "backgroundColor") || background;
    const dark = luminance(surface) < 0.34;
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 17, g: 24, b: 39, a: 1 };
    return {
      background,
      surface,
      surfaceRaised,
      text,
      secondary,
      link,
      navbar,
      navbarText,
      footerBackground,
      line: { ...text, a: dark ? 0.24 : 0.18 },
      accentSoft: { ...link, a: dark ? 0.16 : 0.1 },
      onAccent: contrast(link, white) >= contrast(link, black) ? white : black,
      preserveArtistColors: true,
      scheme: dark ? "dark" : "light"
    };
  }

  function modernArtistForeground(preferred, background, minimum = 4.5) {
    if (contrast(preferred, background) >= minimum) return preferred;
    const channels = [preferred.r, preferred.g, preferred.b];
    const chroma = Math.max(...channels) - Math.min(...channels);
    const distance = Math.sqrt(
      ((preferred.r - background.r) ** 2)
      + ((preferred.g - background.g) ** 2)
      + ((preferred.b - background.b) ** 2)
    );

    // Modern Pages is primarily a layout option. Keep deliberate, strongly
    // chromatic artist colours (for example yellow secondary text on a blue
    // page) instead of normalising them into a different-looking hue. The
    // accessibility rescue remains active for near-invisible neutral colours,
    // which is the common failure mode on black artist themes.
    if (chroma >= 48 && distance >= 110) return preferred;
    return readableColor(preferred, [background], minimum).color;
  }

  function accessibleModernPagePalette(palette) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 17, g: 24, b: 39, a: 1 };
    const opaque = (color, background) => {
      const source = color || background;
      const alpha = Math.max(0, Math.min(1, Number(source?.a ?? 1)));
      return alpha >= 0.999 ? { ...source, a: 1 } : mixColor(background, source, alpha);
    };
    const background = opaque(palette.background || white, white);
    const surface = opaque(palette.surface || background, background);
    const surfaceRaised = opaque(palette.surfaceRaised || surface, surface);
    const navbar = opaque(palette.navbar || surface, surface);
    const footerBackground = opaque(palette.footerBackground || background, background);
    const preferredText = palette.text || (luminance(surface) < 0.34 ? white : black);
    const preferredMuted = palette.secondary || preferredText;
    const preferredAccent = palette.link || preferredText;
    const foreground = (preferred, on, minimum = 7) => (
      readableColor(opaque(preferred, on), [on], minimum).color
    );
    const line = (on) => foreground(palette.line || { ...preferredText, a: 0.24 }, on, 3);
    const onAccent = (accent) => contrast(accent, white) >= contrast(accent, black) ? white : black;
    const role = (on) => {
      const text = foreground(preferredText, on);
      const secondary = palette.preserveArtistColors
        ? modernArtistForeground(opaque(preferredMuted, on), on, 4.5)
        : foreground(preferredMuted, on, 4.5);
      const link = palette.preserveArtistColors
        ? modernArtistForeground(opaque(preferredAccent, on), on, 4.5)
        : foreground(preferredAccent, on, 4.5);
      return {
        text,
        secondary,
        link,
        line: line(on),
        accentSoft: { ...link, a: luminance(on) < 0.34 ? 0.18 : 0.12 },
        onAccent: onAccent(link)
      };
    };
    const surfaceRole = role(surface);
    const raisedRole = role(surfaceRaised);
    const footerRole = role(footerBackground);
    const navbarText = foreground(palette.navbarText || preferredText, navbar);
    const navbarAccent = palette.preserveArtistColors
      ? modernArtistForeground(opaque(preferredAccent, navbar), navbar, 3)
      : foreground(preferredAccent, navbar, 3);
    return {
      ...palette,
      background,
      surface,
      surfaceRaised,
      navbar,
      footerBackground,
      text: surfaceRole.text,
      secondary: surfaceRole.secondary,
      link: surfaceRole.link,
      line: surfaceRole.line,
      accentSoft: surfaceRole.accentSoft,
      onAccent: surfaceRole.onAccent,
      backgroundText: foreground(preferredText, background),
      raisedText: raisedRole.text,
      raisedSecondary: raisedRole.secondary,
      raisedLink: raisedRole.link,
      raisedLine: raisedRole.line,
      raisedAccentSoft: raisedRole.accentSoft,
      raisedOnAccent: raisedRole.onAccent,
      footerText: footerRole.text,
      footerSecondary: footerRole.secondary,
      footerLink: footerRole.link,
      footerLine: footerRole.line,
      footerAccentSoft: footerRole.accentSoft,
      footerOnAccent: footerRole.onAccent,
      navbarText,
      navbarAccent,
      navbarLine: line(navbar),
      scheme: luminance(background) < 0.34 ? "dark" : "light"
    };
  }

  function setModernReleasePalette(palette) {
    const variables = {
      "--bandkit-release-bg": colorString(palette.background),
      "--bandkit-release-surface": colorString(palette.surface),
      "--bandkit-release-surface-raised": colorString(palette.surfaceRaised || palette.surface),
      "--bandkit-release-background-ink": colorString(palette.backgroundText || palette.text),
      "--bandkit-release-ink": colorString(palette.text),
      "--bandkit-release-muted": colorString(palette.secondary),
      "--bandkit-release-line": colorString(palette.line),
      "--bandkit-release-accent": colorString(palette.link),
      "--bandkit-release-accent-soft": colorString(palette.accentSoft),
      "--bandkit-release-on-accent": colorString(palette.onAccent || palette.surface),
      "--bandkit-release-raised-ink": colorString(palette.raisedText || palette.text),
      "--bandkit-release-raised-muted": colorString(palette.raisedSecondary || palette.secondary),
      "--bandkit-release-raised-line": colorString(palette.raisedLine || palette.line),
      "--bandkit-release-raised-accent": colorString(palette.raisedLink || palette.link),
      "--bandkit-release-raised-accent-soft": colorString(palette.raisedAccentSoft || palette.accentSoft),
      "--bandkit-release-raised-on-accent": colorString(palette.raisedOnAccent || palette.onAccent || palette.surface),
      "--bandkit-release-navbar": colorString(palette.navbar),
      "--bandkit-release-navbar-text": colorString(palette.navbarText),
      "--bandkit-release-navbar-accent": colorString(palette.navbarAccent || palette.link),
      "--bandkit-release-navbar-line": colorString(palette.navbarLine || palette.line),
      "--bandkit-release-footer-bg": colorString(palette.footerBackground || palette.background),
      "--bandkit-release-footer-ink": colorString(palette.footerText || palette.text),
      "--bandkit-release-footer-muted": colorString(palette.footerSecondary || palette.secondary),
      "--bandkit-release-footer-line": colorString(palette.footerLine || palette.line),
      "--bandkit-release-footer-accent": colorString(palette.footerLink || palette.link),
      "--bandkit-release-footer-accent-soft": colorString(palette.footerAccentSoft || palette.accentSoft),
      "--bandkit-release-footer-on-accent": colorString(palette.footerOnAccent || palette.onAccent || palette.background),
      "--bandkit-release-scheme": palette.scheme
    };
    for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
  }

  function themedModernReleasePalette(palette) {
    if (!state.appearance.applyToPage) return palette;
    const theme = accessibleAppearanceTheme();
    const dark = luminance(theme.background) < 0.34;
    return {
      ...palette,
      background: theme.background,
      surface: theme.pageSurface,
      surfaceRaised: theme.card,
      text: theme.text,
      secondary: theme.muted,
      link: theme.accent,
      navbar: theme.navbar,
      navbarText: theme.navbarText,
      footerBackground: theme.background,
      line: theme.border,
      accentSoft: { ...theme.accent, a: dark ? 0.16 : 0.1 },
      onAccent: theme.onAccent,
      preserveArtistColors: false,
      scheme: dark ? "dark" : "light"
    };
  }

  function clearModernReleasePalette() {
    for (const name of [
      "--bandkit-release-bg", "--bandkit-release-surface", "--bandkit-release-surface-raised",
      "--bandkit-release-background-ink",
      "--bandkit-release-ink", "--bandkit-release-muted", "--bandkit-release-line",
      "--bandkit-release-accent", "--bandkit-release-accent-soft", "--bandkit-release-on-accent",
      "--bandkit-release-raised-ink", "--bandkit-release-raised-muted", "--bandkit-release-raised-line",
      "--bandkit-release-raised-accent", "--bandkit-release-raised-accent-soft", "--bandkit-release-raised-on-accent",
      "--bandkit-release-navbar", "--bandkit-release-navbar-text", "--bandkit-release-navbar-accent", "--bandkit-release-navbar-line",
      "--bandkit-release-footer-bg", "--bandkit-release-footer-ink", "--bandkit-release-footer-muted",
      "--bandkit-release-footer-line", "--bandkit-release-footer-accent", "--bandkit-release-footer-accent-soft",
      "--bandkit-release-footer-on-accent",
      "--bandkit-release-scheme"
    ]) document.documentElement.style.removeProperty(name);
  }

  function applyModernReleaseLayout() {
    const pageType = modernBandcampPageType();
    const enabled = Boolean(state.appearance.modernReleasePages && pageType);
    if (enabled) {
      if (!modernReleasePalette) modernReleasePalette = captureModernReleasePalette();
      if (pageType === "release") prepareModernReleaseLayout();
      else restoreModernReleaseLayout();
      if (modernReleasePalette) {
        setModernReleasePalette(accessibleModernPagePalette(themedModernReleasePalette(modernReleasePalette)));
      }
      document.documentElement.dataset.bandkitModernPage = "true";
      document.documentElement.dataset.bandkitModernPageType = pageType;
      document.documentElement.dataset.bandkitModernRelease = String(pageType === "release");
      return;
    }
    document.documentElement.dataset.bandkitModernPage = "false";
    delete document.documentElement.dataset.bandkitModernPageType;
    document.documentElement.dataset.bandkitModernRelease = "false";
    restoreModernReleaseLayout();
    clearModernReleasePalette();
  }

  function firstComputedColor(selectors, property) {
    for (const selector of selectors) {
      const element = selector === "body" ? document.body : document.querySelector(selector);
      if (!element || host.contains(element)) continue;
      const parsed = parseColor(getComputedStyle(element)[property]);
      if (parsed && parsed.a > 0.05) return parsed;
    }
    return null;
  }

  function setThemeVariables(variables) {
    pageActionThemeCache = null;
    for (const [name, value] of Object.entries(variables)) {
      host.style.setProperty(name, value);
      pageDjHost?.style.setProperty(name, value);
      for (const button of document.querySelectorAll(".bandcamp-hub-page-dj, .bandcamp-hub-page-analyze, .bandcamp-hub-page-playlist, .bandcamp-hub-page-cart, .bandcamp-hub-page-buy, #DiscoverApp .results-grid-item .image-container > .play-pause-button, #DiscoverApp .results-grid-item .image-container > .play-button, #DiscoverApp .focused-result > .artwork-play-button, #DiscoverApp .focused-result > .play-pause-button, #DiscoverApp .focused-result > .play-button, #DiscoverApp .discover-detail > .play-pause-button, #DiscoverApp .discover-detail > .play-button")) button.style.setProperty(name, value);
    }
  }

  function syncPageDjTheme() {
    if (!pageDjHost) return;
    const styles = getComputedStyle(host);
    for (const name of [
      "--hub-accent", "--hub-accent-soft", "--hub-ink", "--hub-muted", "--hub-faint",
      "--hub-line", "--hub-panel", "--hub-card", "--hub-card-footer", "--hub-header",
      "--hub-hover", "--hub-on-accent", "--hub-wash",
      "--hub-card-accent", "--hub-card-accent-soft", "--hub-card-ink", "--hub-card-muted",
      "--hub-card-faint", "--hub-card-line", "--hub-card-on-accent",
      "--hub-card-footer-accent", "--hub-card-footer-accent-soft", "--hub-card-footer-ink",
      "--hub-card-footer-muted", "--hub-card-footer-faint", "--hub-card-footer-line",
      "--hub-card-footer-on-accent"
    ]) {
      const value = styles.getPropertyValue(name);
      pageDjHost.style.setProperty(name, value);
      for (const button of document.querySelectorAll(".bandcamp-hub-page-dj, .bandcamp-hub-page-analyze, .bandcamp-hub-page-playlist, .bandcamp-hub-page-cart, .bandcamp-hub-page-buy, #DiscoverApp .results-grid-item .image-container > .play-pause-button, #DiscoverApp .results-grid-item .image-container > .play-button, #DiscoverApp .focused-result > .artwork-play-button, #DiscoverApp .focused-result > .play-pause-button, #DiscoverApp .focused-result > .play-button, #DiscoverApp .discover-detail > .play-pause-button, #DiscoverApp .discover-detail > .play-button")) button.style.setProperty(name, value);
    }
  }

  function accessibleSurfaceRole(background, preferredText, preferredMuted, preferredAccent) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 17, g: 24, b: 39, a: 1 };
    const opaque = (color) => {
      const source = color || black;
      const alpha = Math.max(0, Math.min(1, Number(source.a ?? 1)));
      return alpha >= 0.999 ? { ...source, a: 1 } : mixColor(background, source, alpha);
    };
    const text = readableColor(opaque(preferredText), [background], 7).color;
    const muted = readableColor(opaque(preferredMuted || preferredText), [background], 4.5).color;
    const accent = readableColor(opaque(preferredAccent || preferredText), [background], 4.5).color;
    const faint = readableColor(mixColor(muted, background, 0.25), [background], 4.5).color;
    const line = readableColor(mixColor(background, text, luminance(background) < 0.34 ? 0.24 : 0.16), [background], 3).color;
    const onAccent = contrast(accent, white) >= contrast(accent, black) ? white : black;
    return { text, muted, accent, faint, line, onAccent };
  }

  function updateThemeFromPage() {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 17, g: 24, b: 39, a: 1 };
    const pageBackground = firstComputedColor(["#pgBd", "#pgBdWrapper", ".page-bg", "body"], "backgroundColor") || white;
    const pageText = firstComputedColor([".primaryText", "#name-section .title", ".track-title", "#pgBd", "body"], "color") || black;
    const pageSecondary = firstComputedColor([".secondaryText", ".track-number", ".time", "body"], "color");
    const pageAccent = firstComputedColor(["a.primaryText", ".download-link", ".buy-link", "#track_table a", "a"], "color") || { r: 29, g: 160, b: 195, a: 1 };
    const darkPage = luminance(pageBackground) < 0.34;
    const panelColor = darkPage ? mixColor(pageBackground, black, 0.32) : mixColor(pageBackground, white, 0.82);
    const cardColor = darkPage ? mixColor(panelColor, white, 0.06) : mixColor(panelColor, white, 0.48);
    const preferredMuted = pageSecondary || pageText;
    const panelRole = accessibleSurfaceRole(panelColor, pageText, preferredMuted, pageAccent);
    const cardRole = accessibleSurfaceRole(cardColor, pageText, preferredMuted, pageAccent);
    const cardFooterColor = mixColor(cardColor, pageBackground, 0.12);
    const cardFooterRole = accessibleSurfaceRole(cardFooterColor, pageText, preferredMuted, pageAccent);
    const headerColor = mixColor(panelColor, pageBackground, darkPage ? 0.18 : 0.08);
    const headerRole = accessibleSurfaceRole(headerColor, pageText, preferredMuted, pageAccent);
    const washColor = mixColor(panelColor, pageBackground, darkPage ? 0.32 : 0.18);
    const hoverColor = mixColor(cardColor, cardRole.text, darkPage ? 0.13 : 0.07);
    const activeCardColor = mixColor(cardColor, cardRole.accent, 0.18);
    const controlPalette = accessibleControlPalette([cardColor, activeCardColor], cardRole.accent);
    const scrubberPalette = accessibleScrubberPalette(cardRole.accent, cardColor);
    const scrubberRemaining = mixColor(cardColor, cardRole.muted, 0.35);

    const variables = {
      "--hub-accent": colorString(panelRole.accent),
      "--hub-accent-soft": colorString(panelRole.accent, darkPage ? 0.22 : 0.12),
      "--hub-ink": colorString(panelRole.text),
      "--hub-muted": colorString(panelRole.muted),
      "--hub-faint": colorString(panelRole.faint),
      "--hub-line": colorString(panelRole.line),
      "--hub-panel": colorString(panelColor),
      "--hub-card": colorString(cardColor),
      "--hub-card-accent": colorString(cardRole.accent),
      "--hub-card-accent-soft": colorString(cardRole.accent, luminance(cardColor) < 0.34 ? 0.22 : 0.12),
      "--hub-card-ink": colorString(cardRole.text),
      "--hub-card-muted": colorString(cardRole.muted),
      "--hub-card-faint": colorString(cardRole.faint),
      "--hub-card-line": colorString(cardRole.line),
      "--hub-card-on-accent": colorString(cardRole.onAccent),
      "--hub-card-footer": colorString(cardFooterColor),
      "--hub-card-footer-accent": colorString(cardFooterRole.accent),
      "--hub-card-footer-accent-soft": colorString(cardFooterRole.accent, luminance(cardFooterColor) < 0.34 ? 0.22 : 0.12),
      "--hub-card-footer-ink": colorString(cardFooterRole.text),
      "--hub-card-footer-muted": colorString(cardFooterRole.muted),
      "--hub-card-footer-faint": colorString(cardFooterRole.faint),
      "--hub-card-footer-line": colorString(cardFooterRole.line),
      "--hub-card-footer-on-accent": colorString(cardFooterRole.onAccent),
      "--hub-header": colorString(headerColor),
      "--hub-tab-foreground": colorString(headerRole.text),
      "--hub-tab-active-bg": colorString(headerRole.text, darkPage ? 0.16 : 0.08),
      "--hub-hover": colorString(hoverColor),
      "--hub-on-accent": colorString(panelRole.onAccent),
      "--hub-control-bg": colorString(controlPalette.background),
      "--hub-control-fg": colorString(controlPalette.foreground),
      "--hub-control-border": colorString(controlPalette.background),
      "--hub-control-focus": colorString(controlPalette.background),
      "--hub-scrub-accent": colorString(scrubberPalette.accent),
      "--hub-scrub-remaining": colorString(scrubberRemaining),
      "--hub-scrub-surface": colorString(scrubberPalette.surface),
      "--hub-scrub-halo": colorString(scrubberPalette.halo, 0.62),
      "--hub-wash": colorString(washColor, 0.96)
    };
    setThemeVariables(variables);
  }

  function applySelectedTheme() {
    const accessible = accessibleAppearanceTheme();
    const surface = accessible.panel;
    const accent = accessible.panelAccent;
    const dark = luminance(surface) < 0.34;
    const ink = accessible.panelText;
    const card = accessible.card;
    const muted = accessible.panelMuted;
    const panelRole = accessibleSurfaceRole(surface, ink, muted, accent);
    const cardRole = accessibleSurfaceRole(card, accessible.cardText, accessible.cardMuted, accessible.cardAccent);
    const cardFooter = mixColor(card, surface, 0.12);
    const cardFooterRole = accessibleSurfaceRole(cardFooter, accessible.cardText, accessible.cardMuted, accessible.cardAccent);
    const header = mixColor(surface, card, 0.2);
    const headerRole = accessibleSurfaceRole(header, ink, muted, accent);
    const activeCard = mixColor(card, cardRole.accent, 0.18);
    const controlPalette = accessibleControlPalette([card, activeCard], cardRole.accent);
    const scrubberPalette = accessibleScrubberPalette(accessible.preferredScrubAccent, card);
    const scrubberRemaining = mixColor(card, cardRole.muted, 0.35);
    setThemeVariables({
      "--hub-accent": colorString(panelRole.accent),
      "--hub-accent-soft": colorString(panelRole.accent, dark ? 0.24 : 0.13),
      "--hub-ink": colorString(panelRole.text),
      "--hub-muted": colorString(panelRole.muted),
      "--hub-faint": colorString(panelRole.faint),
      "--hub-line": colorString(panelRole.line),
      "--hub-panel": colorString(surface),
      "--hub-card": colorString(card),
      "--hub-card-accent": colorString(cardRole.accent),
      "--hub-card-accent-soft": colorString(cardRole.accent, luminance(card) < 0.34 ? 0.24 : 0.13),
      "--hub-card-ink": colorString(cardRole.text),
      "--hub-card-muted": colorString(cardRole.muted),
      "--hub-card-faint": colorString(cardRole.faint),
      "--hub-card-line": colorString(cardRole.line),
      "--hub-card-on-accent": colorString(cardRole.onAccent),
      "--hub-card-footer": colorString(cardFooter),
      "--hub-card-footer-accent": colorString(cardFooterRole.accent),
      "--hub-card-footer-accent-soft": colorString(cardFooterRole.accent, luminance(cardFooter) < 0.34 ? 0.24 : 0.13),
      "--hub-card-footer-ink": colorString(cardFooterRole.text),
      "--hub-card-footer-muted": colorString(cardFooterRole.muted),
      "--hub-card-footer-faint": colorString(cardFooterRole.faint),
      "--hub-card-footer-line": colorString(cardFooterRole.line),
      "--hub-card-footer-on-accent": colorString(cardFooterRole.onAccent),
      "--hub-header": colorString(header),
      "--hub-tab-foreground": colorString(headerRole.text),
      "--hub-tab-active-bg": colorString(headerRole.text, dark ? 0.16 : 0.08),
      "--hub-hover": colorString(mixColor(card, cardRole.text, dark ? 0.13 : 0.07)),
      "--hub-on-accent": colorString(panelRole.onAccent),
      "--hub-control-bg": colorString(controlPalette.background),
      "--hub-control-fg": colorString(controlPalette.foreground),
      "--hub-control-border": colorString(controlPalette.background),
      "--hub-control-focus": colorString(controlPalette.background),
      "--hub-scrub-accent": colorString(scrubberPalette.accent),
      "--hub-scrub-remaining": colorString(scrubberRemaining),
      "--hub-scrub-surface": colorString(scrubberPalette.surface),
      "--hub-scrub-halo": colorString(scrubberPalette.halo, 0.62),
      "--hub-wash": colorString(mixColor(surface, card, 0.25), 0.96)
    });
  }

  function applyAppearance() {
    if (!modernReleasePalette && modernBandcampPageType()) {
      modernReleasePalette = captureModernReleasePalette();
    }
    applyBandcampPageTheme();
    applyShadowHeaderTheme();
    applyModernReleaseLayout();
    if (state.appearance.pageAware) updateThemeFromPage();
    else applySelectedTheme();
    applyNativeCartVisibility();
    applyNativePlayerVisibility();
    ensurePagePlayerWaveforms();
  }

  function applyNativeCartVisibility() {
    ensurePageStyles();
    const hidePageCart = Boolean(state.appearance.hidePageCart);
    const hideHeaderCart = Boolean(state.appearance.hideHeaderCart);
    document.documentElement.dataset.bandkitHidePageCart = String(hidePageCart);
    document.documentElement.dataset.bandkitHideHeaderCart = String(hideHeaderCart);
    for (const nativeCart of document.querySelectorAll("[data-bandkit-native-cart]")) {
      nativeCart.toggleAttribute("hidden", hideHeaderCart);
    }
    for (const wrapper of document.querySelectorAll("[data-bandkit-native-cart-wrapper]")) {
      wrapper.toggleAttribute("hidden", hideHeaderCart);
    }
    applyShadowHeaderCartVisibility(hideHeaderCart);
  }

  function setShadowCartElementVisibility(element, hidden) {
    if (!element) return;
    if (!element.hasAttribute("data-bandkit-display-captured")) {
      element.setAttribute("data-bandkit-display-captured", "true");
      element.dataset.bandkitDisplayValue = element.style.getPropertyValue("display");
      element.dataset.bandkitDisplayPriority = element.style.getPropertyPriority("display");
    }
    element.toggleAttribute("hidden", hidden);
    if (hidden) {
      element.style.setProperty("display", "none", "important");
      return;
    }
    const value = element.dataset.bandkitDisplayValue || "";
    const priority = element.dataset.bandkitDisplayPriority || "";
    if (value) element.style.setProperty("display", value, priority);
    else element.style.removeProperty("display");
  }

  function applyShadowHeaderCartVisibility(hidden) {
    const menuShadow = document.querySelector("menu-bar")?.shadowRoot;
    if (!menuShadow) return;
    let visibilityStyle = menuShadow.querySelector("#bandkit-native-header-cart-style");
    if (!visibilityStyle) {
      visibilityStyle = document.createElement("style");
      visibilityStyle.id = "bandkit-native-header-cart-style";
      menuShadow.append(visibilityStyle);
    }
    visibilityStyle.textContent = hidden
      ? `li.cart,li[data-bandkit-native-cart-wrapper],button[aria-label="Cart"],button[data-bandkit-native-cart]{display:none!important}`
      : "";
    const candidates = menuShadow.querySelectorAll('li.cart, li[data-bandkit-native-cart-wrapper], button[aria-label="Cart"], button[data-bandkit-native-cart]');
    for (const candidate of candidates) setShadowCartElementVisibility(candidate, hidden);
  }

  function applyNativePlayerVisibility() {
    ensurePageStyles();
    document.documentElement.dataset.bandkitHideBandcampPlayer = String(Boolean(state.appearance.hideBandcampPlayer));
  }

  function applyLauncherPosition() {
    if (launcher.classList.contains("is-header")) {
      launcher.classList.remove("is-floating");
      launcher.style.removeProperty("left");
      launcher.style.removeProperty("right");
      launcher.style.removeProperty("top");
      return;
    }
    launcher.classList.add("is-floating");
    if (!state.launcherPosition) {
      launcher.style.removeProperty("left");
      launcher.style.removeProperty("right");
      launcher.style.removeProperty("top");
      return;
    }
    const left = Math.max(8, Math.min(window.innerWidth - 50, Number(state.launcherPosition.left) || 8));
    const top = Math.max(8, Math.min(window.innerHeight - 48, Number(state.launcherPosition.top) || 8));
    state.launcherPosition = { left: Math.round(left), top: Math.round(top) };
    launcher.style.left = `${left}px`;
    launcher.style.right = "auto";
    launcher.style.top = `${top}px`;
  }

  function clearPanelInlineLayout() {
    for (const property of ["left", "right", "top", "bottom", "width", "height"]) panel.style.removeProperty(property);
  }

  function applyLayoutMode() {
    const docked = state.layoutMode === "docked";
    const dockSide = state.dockSide === "left" ? "left" : "right";
    panel.classList.toggle("is-docked", docked);
    panel.classList.toggle("is-dock-left", docked && dockSide === "left");
    panel.classList.toggle("is-dock-right", docked && dockSide === "right");
    panelHeader.setAttribute("aria-label", docked ? `Bandkit docked to the ${dockSide}` : "Drag to move Bandkit");
    layoutToggleButton.classList.toggle("is-docked", docked);
    layoutToggleButton.querySelector("img").src = asset(docked ? "icon-floating.svg" : "icon-dock.svg");
    layoutToggleButton.setAttribute("aria-label", docked ? "Return Bandkit to floating mode" : `Dock Bandkit to the ${dockSide}`);
    layoutToggleButton.title = docked ? "Return Bandkit to floating mode" : `Dock Bandkit to the ${dockSide}`;
    syncDockedControls();
    applyLauncherPosition();
    applySavedLayout();
    schedulePlayerSectionGeometry();
  }

  function toggleLayoutMode() {
    state.layoutMode = state.layoutMode === "docked" ? "floating" : "docked";
    applyLayoutMode();
    saveState();
    saveLayoutState();
    if (state.activeTab === "settings") render();
    showToast(state.layoutMode === "docked" ? `Bandkit docked to the ${state.dockSide}` : "Bandkit returned to floating mode");
  }

  function applySavedLayout() {
    applyingLayout = true;
    if (panel.classList.contains("is-contextual")) {
      clearPanelInlineLayout();
      requestAnimationFrame(() => {
        applyingLayout = false;
      });
      return;
    }
    if (state.layoutMode === "docked") {
      clearPanelInlineLayout();
      const dockedWidth = Math.min(Math.max(320, Number(state.dockedWidth) || 420), Math.max(320, window.innerWidth));
      panel.style.width = `${dockedWidth}px`;
    } else if (!state.layout) {
      clearPanelInlineLayout();
    } else {
      const width = Math.min(Math.max(320, state.layout.width), window.innerWidth - 16);
      const height = Math.min(Math.max(520, state.layout.height), window.innerHeight - 16);
      const left = Math.min(Math.max(8, state.layout.left), window.innerWidth - width - 8);
      const top = Math.min(Math.max(8, state.layout.top), window.innerHeight - height - 8);
      panel.style.left = `${left}px`;
      panel.style.right = "auto";
      panel.style.top = `${top}px`;
      panel.style.bottom = "auto";
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
    }
    requestAnimationFrame(() => {
      applyingLayout = false;
    });
  }

  function capturePanelLayout() {
    if (applyingLayout || dragging || panel.classList.contains("is-contextual")) return;
    if (state.layoutMode === "docked") {
      const rect = panel.getBoundingClientRect();
      if (!rect.width) return;
      state.dockedWidth = Math.round(rect.width);
      window.clearTimeout(layoutSaveTimer);
      layoutSaveTimer = window.setTimeout(() => {
        saveState();
        saveLayoutState();
      }, 180);
      return;
    }
    if (!state.layout && !panel.style.width) return;
    const rect = panel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.layout = { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
    window.clearTimeout(layoutSaveTimer);
    layoutSaveTimer = window.setTimeout(() => {
      saveState();
      saveLayoutState();
    }, 180);
  }

  function resetPanelLayout() {
    state.layout = null;
    state.dockedWidth = 420;
    state.launcherPosition = null;
    applyLayoutMode();
    saveState();
    saveLayoutState();
    showToast("Bandkit panel and launcher positions reset");
  }

  function syncDockedControls() {
    const docked = state.layoutMode === "docked";
    const dockSide = state.dockSide === "left" ? "left" : "right";
    launcher.classList.toggle("is-panel-open", state.open);
    headerResetButton.classList.toggle("is-dock-close", docked);
    const resetSymbol = headerResetButton.querySelector(".hub-reset-symbol");
    resetSymbol.style.setProperty("--hub-reset-icon", `url('${asset(docked ? "icon-chevron.svg" : "icon-reset.svg")}')`);
    resetSymbol.style.setProperty("--hub-reset-rotation", docked ? (dockSide === "left" ? "90deg" : "-90deg") : "0deg");
    const label = docked ? `Close Bandkit to the ${dockSide}` : "Reset size and position";
    headerResetButton.setAttribute("aria-label", label);
    headerResetButton.title = label;
  }


  function createCartDocument(items = state.cart, cartName = "Bandcamp cart", summary = state.cartSummary, { includeRestore = true } = {}) {
    const cartItems = Array.isArray(items) ? items : [];
    const exportedAt = new Date();
    const safeName = String(cartName || "Bandcamp cart").trim().slice(0, 120) || "Bandcamp cart";
    const payload = {
      format: includeRestore ? "bandkit-cart" : "bandkit-cart-share",
      version: 1,
      exportedAt: exportedAt.toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      summary: summary && typeof summary === "object" ? {
        subtotal: Number.isFinite(Number(summary.subtotal)) ? Number(summary.subtotal) : null,
        currency: /^[A-Z]{3}$/.test(summary.currency || "") ? summary.currency : null
      } : null,
      items: cartItems.map((item) => portableCartItem(item, { includeRestore })).filter(Boolean)
    };
    const serializedPayload = JSON.stringify(payload).replaceAll("<", "\\u003c");
    const rows = cartItems.map((item) => {
      const itemUrl = portableBandcampUrl(item.url, true);
      const artistUrl = artistUrlFromPageUrl(itemUrl) || itemUrl;
      const title = itemUrl ? `<a href="${escapeHtml(itemUrl)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
      const artist = item.artist
        ? artistUrl ? `<a href="${escapeHtml(artistUrl)}">${escapeHtml(item.artist)}</a>` : escapeHtml(item.artist)
        : "Unknown artist";
      const chips = [
        item.kind,
        Number(item.price) ? formatCartPrice(item.price, item.currency) : ""
      ].filter(Boolean).map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("");
      return `<article class="item">${collectionArtwork(cartItemArt(item), item.title, itemUrl)}<div><div class="kind">${escapeHtml(item.kind || "Bandcamp release")}</div><h2>${title}</h2><p class="byline">by ${artist}</p>${item.album && item.album !== item.title ? `<p class="album"><strong>Album:</strong> ${escapeHtml(item.album)}</p>` : ""}${chips ? `<div class="chips">${chips}</div>` : ""}</div></article>`;
    }).join("");
    return {
      count: cartItems.length,
      filename: `${shareFileName(safeName, "bandcamp-cart")}.html`,
      title: safeName,
      text: `${cartItems.length} item${cartItems.length === 1 ? "" : "s"} shared from Bandkit`,
      html: sharedCollectionDocument({
        title: safeName,
        eyebrow: "Shared Bandcamp cart",
        summary: `${cartItems.length} item${cartItems.length === 1 ? "" : "s"} · ${cartTotalLabel(cartItems, summary)} · Shared ${exportedAt.toLocaleString()}`,
        rows,
        embeddedPayload: includeRestore ? serializedPayload : "",
        embeddedId: includeRestore ? "bandkit-cart-data" : ""
      })
    };
  }

  function exportCart(items = state.cart, cartName = "Bandcamp cart", summary = state.cartSummary) {
    const documentData = createCartDocument(items, cartName, summary);
    downloadHtmlDocument(documentData, `Downloaded an importable backup with ${documentData.count} item${documentData.count === 1 ? "" : "s"}`);
  }

  function shareCart(items = state.cart, cartName = "Bandcamp cart", summary = state.cartSummary) {
    const documentData = createCartDocument(items, cartName, summary, { includeRestore: false });
    return shareHtmlDocument(documentData, `“${documentData.title}”`);
  }


  async function importAndRestoreCart(file, button) {
    if (!file) return;
    button.disabled = true;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Cart backups must be smaller than 5 MB.");
      const imported = parseCartBackup(await file.text());
      const fallbackName = String(file.name || "Imported cart").replace(/\.(?:html?|json)$/i, "").replace(/^bandcamp-cart-?/i, "Cart ").trim();
      const saved = cartAutosave.saveNamedCart(state.savedCarts, imported.items, fallbackName || "Imported cart", {
        id: `cart-import-${Date.now()}`,
        savedAt: imported.savedAt,
        sourcePage: imported.sourcePage,
        summary: imported.summary
      });
      state.savedCarts = saved.savedCarts;
      saveState();
      showToast(`Imported ${imported.items.length} item${imported.items.length === 1 ? "" : "s"}; restoring through Bandcamp…`);
      await restoreSavedCart(imported.items);
    } catch (error) {
      showToast(error?.message || "The cart backup could not be imported.");
    } finally {
      button.disabled = false;
    }
  }

  function exportActivity() {
    const exportedAt = new Date();
    const rows = state.activity.map((item) => {
      const trackUrl = safeBandcampUrl(item.url);
      const artistUrl = safeBandcampUrl(item.artistUrl) || artistUrlFromPageUrl(trackUrl);
      const createdAt = item.createdAt ? new Date(item.createdAt) : null;
      const timestamp = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString()
        : item.time || "Recorded locally";
      const track = trackUrl
        ? `<a href="${escapeHtml(trackUrl)}" target="_blank" rel="noopener">${escapeHtml(item.title || "Untitled track")}</a>`
        : `<strong>${escapeHtml(item.title || "Untitled track")}</strong>`;
      const artist = artistUrl
        ? `<a href="${escapeHtml(artistUrl)}" target="_blank" rel="noopener">${escapeHtml(item.artist || "Unknown artist")}</a>`
        : escapeHtml(item.artist || "Unknown artist");
      return `
      <li>
        <div class="entry"><span class="action">${escapeHtml(item.action || "activity")}</span> ${track} by ${artist}</div>
        <time${createdAt && !Number.isNaN(createdAt.getTime()) ? ` datetime="${escapeHtml(createdAt.toISOString())}"` : ""}>${escapeHtml(timestamp)}</time>
        ${trackUrl ? `<div class="url"><a href="${escapeHtml(trackUrl)}" target="_blank" rel="noopener">${escapeHtml(trackUrl)}</a></div>` : ""}
      </li>`;
    }).join("");
    const documentText = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bandcamp activity log</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:48px auto;padding:0 24px;color:#17202a;background:#fff}h1{margin-bottom:4px}ol{padding-left:24px}li{margin:0 0 22px;padding-left:6px}.entry{font-size:17px}.action{display:inline-block;border-radius:4px;background:#dbeafe;color:#1e3a8a;font-size:12px;font-weight:700;padding:2px 6px;text-transform:capitalize}time,.url{display:block;color:#64748b;font-size:13px;margin-top:4px}.url a{font-size:12px}a{color:#1687a7;overflow-wrap:anywhere}</style></head><body><h1>Bandcamp activity log</h1><p>Exported by Bandkit on ${escapeHtml(exportedAt.toLocaleString())}. ${state.activity.length} entr${state.activity.length === 1 ? "y" : "ies"}.</p><ol>${rows || "<li>No activity had been recorded when this file was created.</li>"}</ol></body></html>`;
    const blobUrl = URL.createObjectURL(new Blob([documentText], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `bandcamp-activity-${exportedAt.toISOString().slice(0, 10)}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast(`Downloaded an activity log with ${state.activity.length} entr${state.activity.length === 1 ? "y" : "ies"}`);
  }

  function saveCartSnapshot() {
    if (!state.cart.length) {
      showToast("There is no cart to save yet.");
      return;
    }
    const now = new Date();
    const suggestedName = `Cart — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const name = window.prompt("Name this saved cart", suggestedName)?.trim();
    if (!name) return;
    const result = cartAutosave.saveNamedCart(state.savedCarts, state.cart, name, {
      savedAt: now.toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      summary: state.cartSummary
    });
    state.savedCarts = result.savedCarts;
    saveState();
    render();
    showToast(`Saved “${name}” locally`);
  }

  function createEmptySavedCart() {
    const suggestedName = `Cart ${state.savedCarts.filter((snapshot) => !cartAutosave.isAutoSavedCart(snapshot)).length + 1}`;
    const name = window.prompt("Name this saved cart", suggestedName)?.trim();
    if (!name) return null;
    const result = cartAutosave.saveNamedCart(state.savedCarts, [], name, {
      id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      allowEmpty: true
    });
    if (!result.snapshot) return null;
    state.savedCarts = result.savedCarts;
    state.cartView = "saved";
    saveState();
    render();
    showToast(`Created “${result.snapshot.name}”`);
    return result.snapshot;
  }

  async function restoreSavedCart(items) {
    const sourceItems = Array.isArray(items) ? items.slice(0, 100) : [];
    if (!sourceItems.length) return { ok: false, error: "This saved cart is empty." };
    const result = await addResolvedItemsToCart(sourceItems);
    state.open = true;
    state.activeTab = "cart";
    state.cartView = "current";
    state.selectedSavedCartId = null;
    saveState();
    render();
    const failed = result.failed?.length || 0;
    const summary = result.error
      ? result.error
      : `Restored ${result.added || 0}; ${result.alreadyPresent || 0} already present${failed ? `; ${failed} could not be restored` : ""}.`;
    showToast(summary);
    return { ok: !result.error, ...result, summary };
  }

  async function addResolvedItemsToCart(sourceItems) {
    const resolved = await runtimeMessage({ type: MESSAGES.RESOLVE_CART_ITEMS, items: sourceItems });
    if (!resolved?.ok) return { ok: false, error: resolved?.error || "Could not inspect the saved cart items." };
    const requestId = `restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        document.removeEventListener("bandkit:cart-restore-result", onResult);
        resolve({ requestId, error: "Bandcamp did not finish restoring the cart in time.", added: 0, alreadyPresent: 0, failed: [] });
      }, Math.max(15000, resolved.items.length * 11000));
      const onResult = (event) => {
        if (event.detail?.requestId !== requestId) return;
        window.clearTimeout(timeout);
        document.removeEventListener("bandkit:cart-restore-result", onResult);
        resolve(event.detail);
      };
      document.addEventListener("bandkit:cart-restore-result", onResult);
      document.dispatchEvent(new CustomEvent("bandkit:cart-command", {
        detail: { action: "restore", requestId, items: resolved.items }
      }));
    });
    return result;
  }

  async function cartItemsForTracks(tracks, requestedItemType = "t") {
    const sourceTracks = normalizePlaylist(Array.isArray(tracks) ? tracks : []);
    if (!sourceTracks.length) return [];
    const resolved = await runtimeMessage({
      type: MESSAGES.RESOLVE_CART_ITEMS,
      items: sourceTracks.map((track) => ({
        title: track.title,
        album: track.album,
        artist: track.artist,
        art: track.art,
        url: resolvedTrackPageUrl(track),
        requestedItemType
      }))
    });
    if (!resolved?.ok) {
      showToast(resolved?.error || "Bandcamp could not identify these cart items.");
      return [];
    }
    return (resolved.items || []).map((item, index) => {
      const source = sourceTracks[index] || {};
      const restore = item?.restore;
      return portableCartItem({
        id: `saved-cart-item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        title: restore?.item_title || item?.title || source.title,
        artist: restore?.artist_name || item?.artist || source.artist,
        album: item?.album || source.album,
        kind: requestedItemType === "a" ? "Digital album" : "Digital track",
        price: Math.max(0, Number(restore?.unit_price) || 0),
        currency: restore?.currency || "USD",
        art: item?.art || source.art,
        url: restore?.url || item?.url || source.pageUrl,
        restore
      });
    }).filter(Boolean);
  }

  async function addTracksToSavedCart(tracks, snapshotId) {
    const snapshot = state.savedCarts.find((entry) => entry.id === snapshotId && !cartAutosave.isAutoSavedCart(entry));
    if (!snapshot) return 0;
    const items = await cartItemsForTracks(tracks, "t");
    if (!items.length) return 0;
    const existing = new Set((snapshot.items || []).map((item) => cartAutosave.cartSignature([item])));
    const additions = items.filter((item) => {
      const signature = cartAutosave.cartSignature([item]);
      if (existing.has(signature)) return false;
      existing.add(signature);
      return true;
    });
    if (!additions.length) {
      showToast(`Already in “${snapshot.name}”`);
      return 0;
    }
    snapshot.items = [...(snapshot.items || []), ...additions].slice(0, 100);
    snapshot.summary = null;
    snapshot.modifiedAt = new Date().toISOString();
    state.savedCarts = cartAutosave.normalizeSavedCarts(state.savedCarts);
    saveState();
    if (state.activeTab === "cart" && state.cartView === "saved") render();
    showToast(`Added ${additions.length} item${additions.length === 1 ? "" : "s"} to “${snapshot.name}”`);
    return additions.length;
  }

  async function addTracksToCurrentCart(tracks) {
    const items = await cartItemsForTracks(tracks, "t");
    if (!items.length) return;
    await restoreSavedCart(items);
  }

  async function removeLiveCartItem(item) {
    const requestId = `remove-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        document.removeEventListener("bandkit:cart-remove-result", onResult);
        resolve({ requestId, removed: false, error: "Bandcamp did not finish removing the item in time." });
      }, 12000);
      const onResult = (event) => {
        if (event.detail?.requestId !== requestId) return;
        window.clearTimeout(timeout);
        document.removeEventListener("bandkit:cart-remove-result", onResult);
        resolve(event.detail);
      };
      document.addEventListener("bandkit:cart-remove-result", onResult);
      document.dispatchEvent(new CustomEvent("bandkit:cart-command", {
        detail: { action: "remove", requestId, item: item.restore || item }
      }));
    });
  }

  async function addQueuedItemToCart(track, requestedItemType, button) {
    const pageUrl = resolvedTrackPageUrl(track);
    if (!pageUrl) {
      showToast("This track does not expose an individual Bandcamp page.");
      return;
    }
    const label = requestedItemType === "a" ? "album" : "track";
    button.disabled = true;
    showToast(`Opening the ${label} on Bandcamp…`);
    try {
      const resolved = await runtimeMessage({ type: MESSAGES.RESOLVE_CART_ITEMS, items: [{
        title: track.title,
        album: track.album,
        artist: track.artist,
        url: pageUrl,
        requestedItemType
      }] });
      const actionUrl = safeBandcampUrl(resolved?.items?.[0]?.restore?.url) || pageUrl;
      const target = new URL(actionUrl);
      target.hash = "bandkit-cart";
      const response = await runtimeMessage({ type: MESSAGES.OPEN_BACKGROUND_TAB, url: target.href });
      if (!response?.ok) showToast(response?.error || `Bandcamp could not open this ${label}.`);
      else showToast(`Opened the ${label} on Bandcamp for purchase.`);
    } finally {
      button.disabled = false;
    }
  }

  function createPlaylistMenuOption(label, onClick, { disabled = false, back = false } = {}) {
    const option = createElement("button", `hub-playlist-menu-option${back ? " is-back" : ""}`, label);
    option.type = "button";
    option.disabled = disabled;
    option.setAttribute("role", "menuitem");
    option.addEventListener("click", onClick);
    return option;
  }

  function populatePlaylistDestinationMenu(menu, trigger, track, view = "destinations") {
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    menu.replaceChildren();
    if (view === "playlists") {
      menu.append(createPlaylistMenuOption("← Add destination", () => populatePlaylistDestinationMenu(menu, trigger, track), { back: true }));
      menu.append(createPlaylistMenuOption("＋ New playlist", () => {
        close();
        createSavedPlaylistWithTracks([track], `${track.artist || "Bandcamp"} playlist`);
      }));
      for (const snapshot of state.savedPlaylists) {
        const alreadyAdded = snapshot.items.some((item) => playlistTracksMatch(item, track));
        menu.append(createPlaylistMenuOption(`${alreadyAdded ? "✓" : "＋"} ${snapshot.name}`, () => {
          close();
          addTrackToSavedPlaylist(track, snapshot.id);
        }, { disabled: alreadyAdded }));
      }
      if (!state.savedPlaylists.length) menu.append(createElement("div", "hub-playlist-menu-empty", "No playlists yet"));
    } else if (view === "carts") {
      const savedCarts = state.savedCarts.filter((snapshot) => !cartAutosave.isAutoSavedCart(snapshot));
      menu.append(
        createPlaylistMenuOption("← Add destination", () => populatePlaylistDestinationMenu(menu, trigger, track), { back: true }),
        createPlaylistMenuOption("＋ Current Bandcamp cart", () => {
          close();
          void addTracksToCurrentCart([track]);
        })
      );
      for (const snapshot of savedCarts) {
        menu.append(createPlaylistMenuOption(`＋ ${snapshot.name}`, () => {
          close();
          void addTracksToSavedCart([track], snapshot.id);
        }));
      }
      if (!savedCarts.length) menu.append(createElement("div", "hub-playlist-menu-empty", "No saved carts yet"));
    } else {
      const inPlaying = state.playlist.some((item) => playlistTracksMatch(item, track));
      menu.append(
        createPlaylistMenuOption(inPlaying ? "✓ In Now Playing" : "＋ Add to Now Playing", () => {
          close();
          addTrackToPlaylist(track);
        }, { disabled: inPlaying }),
        createPlaylistMenuOption("＋ Add to Playlist…", () => {
          populatePlaylistDestinationMenu(menu, trigger, track, "playlists");
          window.setTimeout(() => menu.querySelector(".hub-playlist-menu-option")?.focus(), 0);
        }),
        createPlaylistMenuOption("＋ Add to Cart…", () => {
          populatePlaylistDestinationMenu(menu, trigger, track, "carts");
          window.setTimeout(() => menu.querySelector(".hub-playlist-menu-option")?.focus(), 0);
        })
      );
    }
  }

  function closeSiblingDestinationMenus(wrapper, keepMenu) {
    const actions = wrapper.closest(".hub-queue-actions");
    for (const menu of actions?.querySelectorAll(".hub-playlist-destination-menu") || []) {
      if (menu === keepMenu) continue;
      menu.hidden = true;
      menu.parentElement?.querySelector('[aria-haspopup="menu"]')?.setAttribute("aria-expanded", "false");
    }
  }

  function createPlaylistDestinationControl(track, { labeled = false } = {}) {
    const wrapper = createElement("div", `hub-playlist-destination${labeled ? " is-labeled" : ""}`);
    const trackPageUrl = resolvedTrackPageUrl(track);
    const trigger = createElement("button", `hub-queue-action hub-playlist-action${labeled ? " is-labeled" : ""}`);
    trigger.type = "button";
    trigger.disabled = !trackPageUrl;
    trigger.title = `Add ${track.title} to Now Playing, a playlist, or a cart`;
    trigger.setAttribute("aria-label", trigger.title);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.append(createButtonIcon("icon-plus.svg"));
    if (labeled) trigger.append(document.createTextNode("Add"));
    const menu = createElement("div", "hub-playlist-destination-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      if (opening) closeSiblingDestinationMenus(wrapper, menu);
      if (opening) populatePlaylistDestinationMenu(menu, trigger, track);
      menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
    });
    wrapper.addEventListener("focusout", () => window.setTimeout(() => {
      if (!wrapper.contains(shadow.activeElement)) {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    }, 50));
    wrapper.append(trigger, menu);
    return wrapper;
  }

  function createCartDestinationControl(track, { labeled = false } = {}) {
    const wrapper = createElement("div", `hub-playlist-destination hub-cart-destination${labeled ? " is-labeled" : ""}`);
    const trackPageUrl = resolvedTrackPageUrl(track);
    const trigger = createElement("button", `hub-queue-action hub-queue-cart${labeled ? " is-labeled" : ""}`);
    trigger.type = "button";
    trigger.disabled = !trackPageUrl;
    trigger.title = trackPageUrl ? `Add ${track.title} to cart` : "No individual Bandcamp track page is available";
    trigger.setAttribute("aria-label", trigger.title);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    const cartIcon = createElement("span", "hub-button-icon hub-queue-cart-icon");
    cartIcon.style.setProperty("--hub-icon", `url('${asset("icon-cart.svg")}')`);
    trigger.append(cartIcon);
    if (labeled) trigger.append(document.createTextNode(" Add to cart"));

    const menu = createElement("div", "hub-playlist-destination-menu hub-cart-destination-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    const addTrack = createPlaylistMenuOption("Add track", async () => {
      close();
      await addQueuedItemToCart(track, "t", addTrack);
    });
    const addAlbum = createPlaylistMenuOption("Add album", async () => {
      close();
      await addQueuedItemToCart(track, "a", addAlbum);
    });
    menu.append(addTrack, addAlbum);
    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      if (opening) closeSiblingDestinationMenus(wrapper, menu);
      menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
    });
    wrapper.addEventListener("focusout", () => window.setTimeout(() => {
      if (!wrapper.contains(shadow.activeElement)) close();
    }, 50));
    wrapper.append(trigger, menu);
    return wrapper;
  }

  function createTrackActionControls(track, { labeled = false } = {}) {
    const actions = createElement("div", `hub-queue-actions${labeled ? " is-labeled" : ""}`);
    const trackPageUrl = resolvedTrackPageUrl(track);
    const playlist = createPlaylistDestinationControl(track, { labeled });
    const wishlisted = (state.wishlistTrackKeys || []).includes(wishlistTrackKey(track));
    const wishlist = createElement("button", `hub-queue-action hub-wishlist-action${labeled ? " is-labeled" : ""}${wishlisted ? " is-active" : ""}`);
    wishlist.type = "button";
    wishlist.disabled = !trackPageUrl;
    wishlist.title = wishlisted ? `${track.title} is in your Bandcamp wishlist` : trackPageUrl ? `Add ${track.title} to your Bandcamp wishlist` : "No individual Bandcamp track page is available";
    wishlist.setAttribute("aria-label", wishlisted ? `${track.title} is wishlisted` : `Add ${track.title} to wishlist`);
    wishlist.setAttribute("aria-pressed", String(wishlisted));
    wishlist.append(createButtonIcon("icon-wishlist.svg"));
    if (labeled) wishlist.append(document.createTextNode(wishlisted ? "Wishlisted" : "Wishlist"));
    wishlist.addEventListener("click", () => {
      if (wishlisted) showToast(`“${track.title}” is already in your Bandcamp wishlist.`);
      else void openTrackAction(track, "wishlist");
    });

    const cart = createCartDestinationControl(track, { labeled });
    actions.append(playlist, wishlist, cart);
    return actions;
  }

  function currentLiveTrack() {
    return {
      title: live.title,
      artist: live.artist,
      album: seamless.track?.album || "",
      id: seamless.track?.id || `${live.pageUrl}|${live.title}`,
      pageUrl: individualTrackPageUrl(seamless.track) || individualTrackPageUrl(live) || live.pageUrl,
      artistUrl: live.artistUrl,
      art: live.art,
      duration: seamless.duration || live.duration,
      url: seamless.track?.url || getAudio()?.currentSrc || getAudio()?.src || ""
    };
  }

  function renderPlayerMoreActions() {
    const track = currentLiveTrack();
    const inPlaylist = state.playlist.some((item) => playlistTracksMatch(item, track));
    const signature = live.hasPlaybackStarted ? `${track.title}|${track.pageUrl}|${inPlaylist}` : "";
    playerMoreButton.disabled = !signature || !resolvedTrackPageUrl(track);
    if (signature === playerActionSignature) return;
    playerActionSignature = signature;
    playerMoreMenu.hidden = true;
    playerMoreButton.setAttribute("aria-expanded", "false");
    playerMoreMenu.replaceChildren();
    if (signature) playerMoreMenu.append(createTrackActionControls(track, { labeled: true }));
  }

  function render() {
    panel.classList.toggle("is-hidden", !state.open);
    launcher.classList.toggle("is-active", state.open);
    launcher.setAttribute("aria-expanded", String(state.open));
    syncDockedControls();
    const labels = {
      playlist: "Playlists",
      cart: "Cart",
      activity: "Activity",
      settings: "Settings",
      nowPlaying: "Now Playing"
    };
    const availablePanelHeight = Math.max(220, window.innerHeight - 160);
    const sectionPanelHeight = Math.max(220, Math.min(availablePanelHeight, Number(state.sectionPanelHeight) || availablePanelHeight));
    panel.style.setProperty("--hub-section-panel-height", `${sectionPanelHeight}px`);
    panelTitle.textContent = labels[state.activeTab] || "Bandkit";
    panel.setAttribute("aria-label", `${panelTitle.textContent} panel`);
    panelHeader.setAttribute("aria-label", `${panelTitle.textContent} panel header`);
    for (const button of headerShortcuts.querySelectorAll(".hub-header-shortcut")) {
      const active = state.open && button.dataset.tab === state.activeTab;
      const count = button.dataset.tab === "cart"
        ? state.cart.length
        : button.dataset.tab === "playlist" ? state.savedPlaylists.length : 0;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("has-dot", count > 0);
      const counter = button.querySelector(".hub-header-shortcut-count");
      if (counter) counter.textContent = count > 99 ? "99+" : String(count);
      if (button.dataset.tab === "playlist") {
        button.setAttribute("aria-label", count ? `Playlists, ${count} saved` : "Playlists");
        button.title = button.getAttribute("aria-label");
      }
    }
    for (const button of tabBar.querySelectorAll(".hub-tab")) {
      const active = button.dataset.tab === state.activeTab;
      const count = button.dataset.tab === "cart"
        ? state.cart.length
        : button.dataset.tab === "playlist" ? state.savedPlaylists.length : 0;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
      button.classList.toggle("has-dot", count > 0);
      const counter = button.querySelector(".hub-tab-dot");
      if (counter) counter.textContent = count > 99 ? "99+" : String(count);
      if (button.dataset.tab === "playlist") {
        button.setAttribute("aria-label", count ? `Playlists, ${count} saved` : "Playlists");
        button.title = button.getAttribute("aria-label");
      }
    }

    content.replaceChildren();
    if (state.activeTab === "playlist") renderPlaylist();
    if (state.activeTab === "cart") renderCart();
    if (state.activeTab === "activity") renderActivity();
    if (state.activeTab === "settings") renderSettings();
    if (state.activeTab === "nowPlaying") renderCurrentPlaylist();
    mountPanelClose();
    renderDjTools();
    renderPlayer();
    schedulePlayerSectionGeometry();
  }

  function mountPanelClose() {
    const anchor = state.activeTab === "cart"
      ? content.querySelector(".hub-saved-cart-detail-toolbar, .hub-cart-view-header")
      : state.activeTab === "playlist"
        ? content.querySelector(".hub-saved-cart-detail-toolbar, .hub-section-heading")
        : state.activeTab === "nowPlaying"
          ? content.querySelector(".hub-section-heading")
          : content.querySelector(".hub-section-heading");
    if (!anchor) return;
    anchor.classList.add("hub-panel-content-header");
    anchor.append(headerCloseButton);
  }


  function renderDjTools() {
    djDrawer.replaceChildren();
    djDrawer.classList.toggle("is-open", state.dj.open);
    djDrawer.setAttribute("aria-hidden", String(!state.dj.open));
    djPlayerButton.classList.toggle("is-active", state.dj.open);
    djPlayerButton.setAttribute("aria-expanded", String(state.dj.open));
    djPlayerButton.setAttribute("aria-label", state.dj.open ? "Close DJ tools" : "Open DJ tools");
    syncPageDjToolsUi();
    if (state.dj.open) djDrawer.append(createDjToolsCard());
    renderPageDjTools();
  }

  function createDjToolsCard({ includeWaveform = true } = {}) {
    const card = createElement("section", "hub-card hub-dj-card");
    card.setAttribute("aria-label", "DJ playback tools");

    const bpm = Number(seamless.detectedBpm) || null;
    const tempoPercent = (state.dj.rate - 1) * 100;

    if (includeWaveform) {
      const waveformButton = createElement("button", "hub-dj-waveform");
      waveformButton.type = "button";
      waveformButton.disabled = !seamless.enabled || !seamless.waveform?.length;
      waveformButton.setAttribute("aria-label", "Track waveform. Click to seek.");
      const waveformCanvas = createElement("canvas", "hub-dj-waveform-canvas");
      waveformButton.append(waveformCanvas);
      waveformButton.addEventListener("click", (event) => {
        const duration = Number(seamless.duration) || 0;
        if (!duration) return;
        const bounds = waveformButton.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
        void seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: duration * progress });
      });
      card.append(waveformButton);
      drawDjWaveform(waveformCanvas);
    }

    const analysisRow = createElement("div", "hub-dj-analysis-row");
    const bpmEditor = createElement("div", "hub-dj-bpm-editor");
    const bpmLabel = createElement("span");
    bpmLabel.className = `hub-dj-bpm-label${state.dj.autoTempo ? " is-active" : ""}`;
    bpmEditor.append(bpmLabel);
    const bpmValueRow = createElement("div", "hub-dj-bpm-value-row");
    const bpmInput = createElement("input", "hub-dj-bpm-input");
    bpmInput.type = "text";
    bpmInput.inputMode = "decimal";
    bpmInput.pattern = "[0-9]*[.]?[0-9]*";
    bpmInput.min = "40";
    bpmInput.max = "300";
    bpmInput.step = "0.1";
    bpmInput.placeholder = seamless.bpmStatus === "analyzing" ? "…" : "—";
    bpmInput.title = "Click to edit BPM";
    bpmInput.setAttribute("aria-label", "Track BPM. Click to edit.");
    const refreshDisplayedBpm = () => {
      const tempoAdjusted = Boolean(bpm && Math.abs(state.dj.rate - 1) > 0.001);
      bpmLabel.textContent = `BPM · ${state.dj.autoTempo ? "AUTO" : "MANUAL"}${tempoAdjusted ? " · ↕" : ""}`;
      bpmLabel.title = tempoAdjusted ? "BPM adjusted by the tempo control" : "";
      bpmInput.value = bpmEditing ? bpmDraft : (bpm ? String(Math.round(bpm * state.dj.rate * 10) / 10) : "");
    };
    refreshDisplayedBpm();
    bpmInput.disabled = !seamless.enabled;
    const setManualBpm = () => {
      const displayedValue = Math.max(40, Math.min(300, Number(bpmInput.value)));
      if (!Number.isFinite(displayedValue) || !bpm) return;
      bpmInput.value = String(Math.round(displayedValue * 10) / 10);
      if (state.dj.autoTempo) {
        const detectedBase = Number(seamless.automaticBpm) || bpm;
        const targetRate = Math.max(0.35, Math.min(2, displayedValue / detectedBase));
        state.dj.rate = targetRate;
        void seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, {
          rate: targetRate,
          preservePitch: state.dj.preservePitch
        });
      } else {
        void seamlessCommand(MESSAGES.SEAMLESS_SET_BPM, { bpm: displayedValue });
      }
    };
    bpmInput.addEventListener("change", setManualBpm);
    bpmInput.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      bpmEditing = true;
      bpmDraft = bpmInput.value;
    });
    bpmInput.addEventListener("focus", () => {
      bpmEditing = true;
      bpmDraft = bpmInput.value;
      bpmInput.select();
    });
    bpmInput.addEventListener("input", () => {
      bpmDraft = bpmInput.value;
    });
    bpmInput.addEventListener("blur", () => {
      bpmEditing = false;
      bpmDraft = "";
      window.setTimeout(() => {
        if (!bpmEditing) renderDjTools();
      }, 0);
    });
    bpmInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") bpmInput.blur();
      if (event.key === "Escape") {
        bpmEditing = false;
        bpmDraft = "";
        refreshDisplayedBpm();
        bpmInput.blur();
      }
      event.stopPropagation();
    });
    const resetBpm = createElement("button", "hub-dj-reset-symbol hub-dj-bpm-reset");
    resetBpm.style.setProperty("--hub-reset-icon", `url('${asset("icon-reset.svg")}')`);
    resetBpm.type = "button";
    resetBpm.disabled = !seamless.enabled || !bpm;
    resetBpm.title = "Reset BPM and tempo";
    resetBpm.setAttribute("aria-label", "Reset BPM and tempo");
    resetBpm.addEventListener("click", () => {
      bpmTapTimes = [];
      bpmEditing = false;
      bpmDraft = "";
      state.dj.rate = 1;
      saveState();
      void seamlessCommand(MESSAGES.SEAMLESS_RESET_BPM).then(() => seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, {
        rate: 1,
        preservePitch: state.dj.preservePitch
      }));
    });
    bpmValueRow.append(bpmInput, resetBpm);
    bpmEditor.append(bpmValueRow);

    const keyReadout = createElement("div", "hub-dj-key");
    keyReadout.title = seamless.detectedKey?.name ? `Detected key: ${seamless.detectedKey.name}` : "Musical key is detected automatically";
    keyReadout.append(
      createElement("span", "", "KEY"),
      createElement("strong", "", seamless.detectedKey?.camelot || (seamless.bpmStatus === "analyzing" ? "…" : "—")),
      createElement("small", "", seamless.detectedKey?.shortName || "")
    );

    const tap = createElement("button", "hub-dj-action hub-dj-compact-action", "Tap");
    tap.type = "button";
    tap.disabled = !seamless.enabled;
    tap.title = "Tap repeatedly to set this track's BPM";
    tap.addEventListener("click", () => {
      const now = performance.now();
      if (!bpmTapTimes.length || now - bpmTapTimes.at(-1) > 2200) bpmTapTimes = [];
      bpmTapTimes.push(now);
      bpmTapTimes = bpmTapTimes.slice(-7);
      if (bpmTapTimes.length < 2) return;
      const intervals = bpmTapTimes.slice(1).map((time, index) => time - bpmTapTimes[index]);
      let tappedBpm = 60000 / (intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length);
      while (tappedBpm < 70) tappedBpm *= 2;
      while (tappedBpm > 180) tappedBpm /= 2;
      tappedBpm = Math.round(tappedBpm * 10) / 10;
      bpmInput.value = String(tappedBpm);
      if (state.dj.autoTempo && bpm) {
        const detectedBase = Number(seamless.automaticBpm) || bpm;
        const targetRate = Math.max(0.35, Math.min(2, tappedBpm / detectedBase));
        state.dj.rate = targetRate;
        void seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, { rate: targetRate, preservePitch: state.dj.preservePitch });
      } else {
        void seamlessCommand(MESSAGES.SEAMLESS_SET_BPM, { bpm: tappedBpm });
      }
    });

    const autoBpm = createElement("button", `hub-dj-action hub-dj-compact-action hub-dj-status-button${state.dj.autoTempo ? " is-active" : ""}`, seamless.bpmStatus === "analyzing" ? "…" : "Auto");
    if (state.dj.autoTempo && seamless.bpmStatus !== "analyzing") autoBpm.append(createElement("span", "hub-dj-active-dot"));
    autoBpm.type = "button";
    autoBpm.disabled = seamless.bpmStatus === "analyzing" || !seamless.enabled;
    autoBpm.setAttribute("aria-pressed", String(state.dj.autoTempo));
    autoBpm.title = state.dj.autoTempo ? "Turn off automatic tempo control" : "Use the automatically detected BPM to control playback tempo";
    autoBpm.addEventListener("click", () => {
      bpmTapTimes = [];
      state.dj.autoTempo = !state.dj.autoTempo;
      if (!state.dj.autoTempo) state.dj.rate = 1;
      saveState();
      renderDjTools();
      if (state.dj.autoTempo) void seamlessCommand(MESSAGES.SEAMLESS_ANALYZE_BPM);
      else void seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, { rate: 1, preservePitch: state.dj.preservePitch });
    });
    analysisRow.append(bpmEditor, keyReadout, tap, autoBpm);
    card.append(analysisRow);

    const deckControls = createElement("div", "hub-dj-deck-controls");
    const formatDb = (value) => value === 0 ? "0" : `${value > 0 ? "+" : ""}${value}`;
    const addKnob = ({ label, value, min, max, size = "", step = 1, resetValue = 0, format = formatDb, onInput }) => {
      const knob = createElement("label", `hub-dj-knob${size ? ` ${size}` : ""}`);
      knob.append(createElement("span", "hub-dj-knob-label", label));
      const dial = createElement("span", "hub-dj-knob-dial");
      const control = createElement("input", "hub-dj-knob-input");
      control.type = "range";
      control.min = String(min);
      control.max = String(max);
      control.step = String(step);
      control.value = String(value);
      control.setAttribute("aria-label", `${label} control`);
      const readout = createElement("output", "hub-dj-knob-output");
      const update = (nextValue, apply = true) => {
        const precision = String(step).includes(".") ? String(step).split(".")[1].length : 0;
        const numeric = Math.max(min, Math.min(max, Number(Number(nextValue).toFixed(precision))));
        const rotation = -135 + ((numeric - min) / (max - min)) * 270;
        control.value = String(numeric);
        dial.style.setProperty("--hub-knob-angle", `${rotation}deg`);
        readout.textContent = format(numeric);
        if (apply) onInput(numeric);
      };
      control.addEventListener("input", () => update(control.value));
      control.addEventListener("keydown", (event) => {
        if (event.key === "Home") update(min);
        if (event.key === "End") update(max);
      });
      dial.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        control.focus({ preventScroll: true });
        dial.classList.add("is-dragging");
        const startX = event.clientX;
        const startY = event.clientY;
        const startValue = Number(control.value);
        const bounds = dial.getBoundingClientRect();
        const mode = state.dj.knobMode || "both";
        const pointerId = event.pointerId;
        let finished = false;
        const move = (moveEvent) => {
          if (moveEvent.pointerId !== pointerId) return;
          moveEvent.preventDefault();
          let nextValue = startValue;
          if (mode === "radial") {
            let angle = (Math.atan2(moveEvent.clientY - (bounds.top + bounds.height / 2), moveEvent.clientX - (bounds.left + bounds.width / 2)) * 180) / Math.PI + 90;
            if (angle > 180) angle -= 360;
            angle = Math.max(-135, Math.min(135, angle));
            nextValue = min + ((angle + 135) / 270) * (max - min);
          } else {
            const horizontal = moveEvent.clientX - startX;
            const vertical = startY - moveEvent.clientY;
            const dragDistance = mode === "vertical"
              ? vertical
              : mode === "horizontal"
                ? horizontal
                : Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
            nextValue = startValue + (dragDistance / 120) * (max - min);
          }
          update(nextValue);
        };
        const finish = () => {
          if (finished) return;
          finished = true;
          dial.classList.remove("is-dragging");
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", finish, true);
          window.removeEventListener("pointercancel", finish, true);
          window.removeEventListener("blur", finish, true);
          document.removeEventListener("visibilitychange", visibilityChanged, true);
          saveState();
        };
        const visibilityChanged = () => {
          if (document.visibilityState !== "visible") finish();
        };
        window.addEventListener("pointermove", move, { capture: true, passive: false });
        window.addEventListener("pointerup", finish, true);
        window.addEventListener("pointercancel", finish, true);
        window.addEventListener("blur", finish, true);
        document.addEventListener("visibilitychange", visibilityChanged, true);
      });
      knob.addEventListener("dblclick", (event) => {
        event.preventDefault();
        update(resetValue);
        saveState();
      });
      dial.append(control);
      knob.append(dial, readout);
      update(value, false);
      return knob;
    };

    const createPanelReset = (title, action) => {
      const button = createElement("button", "hub-dj-reset-symbol hub-dj-panel-reset");
      button.style.setProperty("--hub-reset-icon", `url('${asset("icon-reset.svg")}')`);
      button.type = "button";
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("click", () => {
        action();
        applyDjToAudio();
        saveState();
        render();
      });
      return button;
    };

    const eqPanel = createElement("section", "hub-dj-eq-panel");
    eqPanel.append(addKnob({
      label: "Filter", value: Math.round(state.dj.filterValue * 100), min: -100, max: 100,
      format: (value) => value < -1 ? "LP" : value > 1 ? "HP" : "Off",
      onInput: (value) => { state.dj.filterValue = value / 100; applyDjToAudio(); }
    }));
    for (const [label, key] of [["High", "eqHighDb"], ["Mid", "eqMidDb"], ["Low", "eqLowDb"]]) {
      eqPanel.append(addKnob({
        label, value: state.dj[key], min: -12, max: 12,
        onInput: (value) => { state.dj[key] = value; applyDjToAudio(); }
      }));
    }
    eqPanel.append(createPanelReset("Reset filter and EQ", () => {
      state.dj.filterValue = 0;
      state.dj.eqLowDb = 0;
      state.dj.eqMidDb = 0;
      state.dj.eqHighDb = 0;
    }));

    const performancePanel = createElement("section", "hub-dj-performance-panel");
    const platterAdjustments = createElement("div", "hub-dj-platter-adjustments");
    platterAdjustments.append(
      addKnob({
        label: "Jog adjust",
        value: Math.round(state.dj.jogAdjust * 100),
        min: 0,
        max: 100,
        size: "is-mini",
        resetValue: 50,
        format: (value) => value < 34 ? "Light" : value > 66 ? "Heavy" : "Mid",
        onInput: (value) => { state.dj.jogAdjust = value / 100; }
      }),
      addKnob({
        label: "Vinyl speed",
        value: Math.round(state.dj.vinylSpeedAdjust * 100),
        min: 0,
        max: 100,
        size: "is-mini",
        resetValue: 35,
        format: (value) => value < 34 ? "Fast" : value > 66 ? "Slow" : "Mid",
        onInput: (value) => { state.dj.vinylSpeedAdjust = value / 100; }
      })
    );
    const platter = createElement("div", "hub-dj-platter");
    platter.tabIndex = 0;
    platter.setAttribute("role", "slider");
    platter.setAttribute("aria-label", "Jog wheel. Flick up or right, or down or left, then release to coast.");
    platter.setAttribute("aria-valuemin", "-35");
    platter.setAttribute("aria-valuemax", "35");
    platter.setAttribute("aria-valuenow", "0");
    platter.append(
      createElement("span", "hub-dj-platter-dot"),
      createElement("span", "hub-dj-platter-spindle"),
      createElement("span", "hub-dj-platter-grip")
    );
    let scratchFrame = 0;
    let momentumFrame = 0;
    let vinylFrame = 0;
    let vinylMultiplier = 1;
    let pendingScratch = 1;
    let lastScratchSentAt = 0;
    const sendScratch = (multiplier, active = true) => {
      if (seamless.enabled) {
        pendingScratch = multiplier;
        if (!active) {
          window.cancelAnimationFrame(scratchFrame);
          scratchFrame = 0;
          void runtimeMessage({ type: MESSAGES.SEAMLESS_SCRATCH, active: false, multiplier: 1 });
        } else if (!scratchFrame) {
          const flush = (now) => {
            if (now - lastScratchSentAt < 32) {
              scratchFrame = window.requestAnimationFrame(flush);
              return;
            }
            scratchFrame = 0;
            lastScratchSentAt = now;
            void runtimeMessage({ type: MESSAGES.SEAMLESS_SCRATCH, active: true, multiplier: pendingScratch });
          };
          scratchFrame = window.requestAnimationFrame(flush);
        }
        return;
      }
      const target = getAudio();
      if (!target) return;
      if (active) {
        target.playbackRate = Math.max(0.35, Math.min(2, state.dj.rate * multiplier));
        if ("preservesPitch" in target) target.preservesPitch = false;
        if ("webkitPreservesPitch" in target) target.webkitPreservesPitch = false;
      } else {
        applyDjToAudio(target);
      }
    };
    const updatePlatter = (angle, velocity) => {
      const bend = Math.max(-0.48, Math.min(0.48, velocity * 0.28));
      platter.dataset.angle = String(angle);
      platter.style.setProperty("--hub-platter-angle", `${angle}deg`);
      platter.setAttribute("aria-valuenow", String(Math.round(bend * 100)));
      sendScratch(1 + bend);
    };
    const stopScratch = () => {
      window.cancelAnimationFrame(momentumFrame);
      window.cancelAnimationFrame(vinylFrame);
      momentumFrame = 0;
      vinylFrame = 0;
      vinylMultiplier = 1;
      platter.classList.remove("is-scratching", "is-coasting", "is-vinyl-releasing");
      platter.setAttribute("aria-valuenow", "0");
      sendScratch(1, false);
    };
    const vinylTransition = (from, to, releasing = false) => {
      window.cancelAnimationFrame(vinylFrame);
      const duration = 80 + Math.max(0, Math.min(1, state.dj.vinylSpeedAdjust)) * 820;
      const startedAt = performance.now();
      if (releasing) {
        platter.classList.remove("is-scratching");
        platter.classList.add("is-vinyl-releasing");
      }
      const transition = (now) => {
        const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
        const eased = 1 - Math.pow(1 - progress, 2);
        vinylMultiplier = from + (to - from) * eased;
        sendScratch(vinylMultiplier);
        if (progress < 1) {
          vinylFrame = window.requestAnimationFrame(transition);
        } else {
          vinylFrame = 0;
          if (releasing) stopScratch();
        }
      };
      vinylFrame = window.requestAnimationFrame(transition);
    };
    const startCoast = (initialVelocity, initialAngle) => {
      let velocity = initialVelocity;
      let angle = initialAngle;
      if (Math.abs(velocity) < 0.025) {
        stopScratch();
        return;
      }
      platter.classList.remove("is-scratching");
      platter.classList.add("is-coasting");
      let previousFrame = performance.now();
      const coast = (now) => {
        const elapsed = Math.max(8, Math.min(34, now - previousFrame));
        previousFrame = now;
        const resistance = Math.max(0, Math.min(1, state.dj.jogAdjust));
        velocity *= Math.pow(0.978 - resistance * 0.03, elapsed / 16.67);
        if (Math.abs(velocity) < 0.018) {
          stopScratch();
          return;
        }
        angle += velocity * elapsed * 3;
        updatePlatter(angle, velocity);
        momentumFrame = window.requestAnimationFrame(coast);
      };
      momentumFrame = window.requestAnimationFrame(coast);
    };
    platter.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try { platter.setPointerCapture(event.pointerId); } catch {}
      platter.classList.add("is-scratching");
      platter.classList.remove("is-coasting");
      window.cancelAnimationFrame(momentumFrame);
      window.cancelAnimationFrame(vinylFrame);
      momentumFrame = 0;
      vinylFrame = 0;
      sendScratch(1, false);
      vinylMultiplier = 1;
      vinylTransition(1, 0.35);
      const pointerId = event.pointerId;
      let dragging = true;
      let lastX = event.clientX;
      let lastY = event.clientY;
      let lastTime = event.timeStamp;
      let lastMoveAt = performance.now();
      let velocity = 0;
      let moved = false;
      let angle = Number(platter.dataset.angle) || 0;
      const move = (moveEvent) => {
        if (!dragging || moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        const elapsed = Math.max(8, moveEvent.timeStamp - lastTime);
        const deltaX = moveEvent.clientX - lastX;
        const deltaY = moveEvent.clientY - lastY;
        const travel = deltaX - deltaY;
        if (!moved && Math.abs(travel) >= 1) {
          moved = true;
          window.cancelAnimationFrame(vinylFrame);
          vinylFrame = 0;
        }
        const response = 1.15 - Math.max(0, Math.min(1, state.dj.jogAdjust)) * 0.3;
        const instantaneousVelocity = Math.max(-3.2, Math.min(3.2, (travel / elapsed) * response));
        velocity = velocity * 0.25 + instantaneousVelocity * 0.75;
        angle += travel * 3;
        updatePlatter(angle, velocity);
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        lastTime = moveEvent.timeStamp;
        lastMoveAt = performance.now();
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", cancel, true);
        window.removeEventListener("blur", cancel, true);
        document.removeEventListener("visibilitychange", visibilityChanged, true);
      };
      const finish = (finishEvent) => {
        if (!dragging || (finishEvent?.pointerId !== undefined && finishEvent.pointerId !== pointerId)) return;
        dragging = false;
        cleanup();
        try { platter.releasePointerCapture(pointerId); } catch {}
        if (!moved) {
          vinylTransition(vinylMultiplier, 1, true);
          return;
        }
        const idleTime = Math.max(0, performance.now() - lastMoveAt);
        velocity *= Math.exp(-idleTime / 90);
        startCoast(velocity, angle);
      };
      const cancel = () => {
        if (!dragging) return;
        dragging = false;
        cleanup();
        try { platter.releasePointerCapture(pointerId); } catch {}
        stopScratch();
      };
      const visibilityChanged = () => {
        if (document.visibilityState !== "visible") cancel();
      };
      window.addEventListener("pointermove", move, { capture: true, passive: false });
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", cancel, true);
      window.addEventListener("blur", cancel, true);
      document.addEventListener("visibilitychange", visibilityChanged, true);
    });
    platter.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      window.cancelAnimationFrame(momentumFrame);
      const positive = event.key === "ArrowUp" || event.key === "ArrowRight";
      startCoast(positive ? 0.75 : -0.75, Number(platter.dataset.angle) || 0);
    });
    const loopPages = [[1 / 16, 1 / 8, 1 / 4, 1 / 2], [1, 2, 4, 8]];
    const loopSizes = loopPages.flat();
    const formatLoopSize = (beats) => ({
      [1 / 16]: "1/16",
      [1 / 8]: "1/8",
      [1 / 4]: "1/4",
      [1 / 2]: "1/2"
    })[beats] || String(beats);
    const activeLoopSize = loopSizes.includes(Number(seamless.loopBeats)) ? Number(seamless.loopBeats) : 0;
    const savedLoopSize = loopSizes.includes(Number(state.dj.loopSize)) ? Number(state.dj.loopSize) : 4;
    const selectedLoopSize = activeLoopSize || savedLoopSize;
    state.dj.loopSize = selectedLoopSize;
    const savedLoopPage = [0, 1].includes(Number(state.dj.loopPage)) ? Number(state.dj.loopPage) : (selectedLoopSize < 1 ? 0 : 1);
    const visibleLoopSizes = loopPages[savedLoopPage];
    const loopControls = createElement("div", "hub-dj-loop-controls");
    const loopHeader = createElement("div", "hub-dj-loop-header");
    const changeLoopPage = (nextPage) => {
      if (nextPage === savedLoopPage || !loopPages[nextPage]) return;
      state.dj.loopPage = nextPage;
      saveState();
      renderDjTools();
    };
    const smallerLoop = createElement("button", "hub-dj-loop-arrow", "‹");
    smallerLoop.type = "button";
    smallerLoop.disabled = savedLoopPage === 0;
    smallerLoop.title = "Show smaller loop sizes";
    smallerLoop.setAttribute("aria-label", "Show smaller beat-loop sizes");
    smallerLoop.addEventListener("click", () => changeLoopPage(0));
    const largerLoop = createElement("button", "hub-dj-loop-arrow", "›");
    largerLoop.type = "button";
    largerLoop.disabled = savedLoopPage === loopPages.length - 1;
    largerLoop.title = "Show larger loop sizes";
    largerLoop.setAttribute("aria-label", "Show larger beat-loop sizes");
    largerLoop.addEventListener("click", () => changeLoopPage(1));
    loopHeader.append(smallerLoop, createElement("span", "hub-dj-loop-label", "Beat loop"), largerLoop);
    const loopOptions = createElement("div", "hub-dj-loop-options");
    for (const beats of visibleLoopSizes) {
      const active = activeLoopSize === beats;
      const option = createElement("button", `hub-dj-loop-button${active ? " is-active" : ""}`, formatLoopSize(beats));
      option.type = "button";
      option.disabled = !seamless.enabled || !bpm;
      option.setAttribute("aria-label", `${formatLoopSize(beats)}-beat loop`);
      option.setAttribute("aria-pressed", String(active));
      option.title = bpm ? `${active ? "Exit" : "Start"} ${formatLoopSize(beats)}-beat loop` : "Analyze BPM before starting a beat loop";
      option.addEventListener("click", () => {
        const nextLoopBeats = active ? 0 : beats;
        state.dj.loopSize = beats;
        state.dj.loopPage = savedLoopPage;
        pendingLoopBeats = nextLoopBeats;
        seamless.loopBeats = nextLoopBeats;
        saveState();
        renderDjTools();
        void seamlessCommand(MESSAGES.SEAMLESS_SET_LOOP, { beats: nextLoopBeats, bpm }).then((result) => {
          if (result || pendingLoopBeats !== nextLoopBeats) return;
          pendingLoopBeats = null;
          void syncSeamlessState();
        });
      });
      loopOptions.append(option);
    }
    loopControls.append(loopHeader, loopOptions);
    performancePanel.append(platterAdjustments, platter, loopControls);

    const faderPanel = createElement("section", "hub-dj-fader-panel");
    const rangeValues = [6, 10, 16, 50];
    const rangeLabel = (range) => range === 50 ? "Wide" : `±${range}`;
    const modeButtons = createElement("div", "hub-dj-mode-buttons");
    const tempoRange = createElement("button", "hub-dj-mode-button", rangeLabel(state.dj.range));
    tempoRange.type = "button";
    tempoRange.setAttribute("aria-label", `Tempo range ${rangeLabel(state.dj.range)}. Click for next range.`);
    const masterTempo = createElement("button", `hub-dj-mode-button hub-dj-master hub-dj-status-button${state.dj.preservePitch ? " is-active" : ""}`, "MT");
    if (state.dj.preservePitch) masterTempo.append(createElement("span", "hub-dj-active-dot"));
    masterTempo.type = "button";
    masterTempo.setAttribute("aria-label", "Master Tempo");
    masterTempo.setAttribute("aria-pressed", String(state.dj.preservePitch));
    modeButtons.append(tempoRange, masterTempo);
    const faders = createElement("div", "hub-dj-faders");
    const addFader = ({ label, value, min, max, step, className = "", format, onInput, resetTitle, onReset }) => {
      const fader = createElement("div", `hub-dj-fader${className ? ` ${className}` : ""}`);
      const output = createElement("output", "hub-dj-fader-output", format(value));
      const rail = createElement("span", "hub-dj-fader-rail");
      const control = createElement("input", "hub-dj-fader-input");
      control.type = "range";
      control.min = String(min);
      control.max = String(max);
      control.step = String(step);
      control.value = String(value);
      control.setAttribute("aria-label", label);
      control.addEventListener("input", () => {
        onInput(Number(control.value));
        output.textContent = format(Number(control.value));
      });
      control.addEventListener("change", saveState);
      rail.addEventListener("dblclick", (event) => {
        event.preventDefault();
        onReset();
        control.value = "0";
        output.textContent = format(0);
        applyDjToAudio();
        saveState();
        render();
      });
      rail.append(control);
      fader.append(
        createElement("span", "hub-dj-fader-label", label),
        output,
        rail,
        createPanelReset(resetTitle, onReset)
      );
      faders.append(fader);
      return control;
    };
    const tempoOutputFormat = (value) => signedPercent(value);
    const tempoSlider = addFader({
      label: "Tempo", value: tempoPercent, min: -state.dj.range, max: state.dj.range, step: 0.1,
      format: tempoOutputFormat,
      onInput: (value) => { setDjTempo(value); refreshDisplayedBpm(); },
      resetTitle: "Reset tempo",
      onReset: () => { state.dj.rate = 1; state.dj.preservePitch = true; }
    });
    addFader({
      label: "Gain", value: state.dj.gainDb, min: -30, max: 6, step: 1, className: "is-gain",
      format: (value) => value <= -30 ? "Mute" : `${formatDb(value)}dB`,
      onInput: (value) => { state.dj.gainDb = value; applyDjToAudio(); },
      resetTitle: "Reset gain",
      onReset: () => { state.dj.gainDb = 0; }
    });
    tempoRange.addEventListener("click", () => {
      const current = rangeValues.indexOf(state.dj.range);
      state.dj.range = rangeValues[(current + 1) % rangeValues.length];
      setDjTempo(Math.max(-state.dj.range, Math.min(state.dj.range, tempoPercentFromState())));
      tempoSlider.min = String(-state.dj.range);
      tempoSlider.max = String(state.dj.range);
      tempoSlider.value = String(tempoPercentFromState());
      tempoRange.textContent = rangeLabel(state.dj.range);
      tempoRange.setAttribute("aria-label", `Tempo range ${rangeLabel(state.dj.range)}. Click for next range.`);
      refreshDisplayedBpm();
      saveState();
    });
    masterTempo.addEventListener("click", () => {
      state.dj.preservePitch = !state.dj.preservePitch;
      masterTempo.classList.toggle("is-active", state.dj.preservePitch);
      masterTempo.setAttribute("aria-pressed", String(state.dj.preservePitch));
      masterTempo.querySelector(".hub-dj-active-dot")?.remove();
      if (state.dj.preservePitch) masterTempo.append(createElement("span", "hub-dj-active-dot"));
      applyDjToAudio();
      saveState();
    });
    faderPanel.append(modeButtons, faders);

    deckControls.append(eqPanel, performancePanel, faderPanel);
    card.append(deckControls);
    return card;
  }

  function drawDjWaveform(canvas) {
    window.requestAnimationFrame(() => {
      const points = seamless.waveform || [];
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const styles = getComputedStyle(host);
      const played = styles.getPropertyValue("--hub-accent").trim() || "#1da0c3";
      const remaining = styles.getPropertyValue("--hub-line").trim() || "#d1d5db";
      const progress = Math.max(0, Math.min(1, Number(seamless.progress) || 0));
      const barWidth = width / Math.max(1, points.length);
      for (let index = 0; index < points.length; index += 1) {
        const amplitude = Math.max(2 * ratio, (Number(points[index]) / 100) * (height - 4 * ratio));
        context.fillStyle = index / points.length <= progress ? played : remaining;
        context.fillRect(index * barWidth, (height - amplitude) / 2, Math.max(1, barWidth - ratio), amplitude);
      }
    });
  }

  function tempoPercentFromState() {
    return (state.dj.rate - 1) * 100;
  }

  function recordActivePlaylistAnalysis() {
    if (state.recordPlaylistMetadata === false || !seamless.track) return false;
    const bpm = normalizePlaylistBpm(seamless.detectedBpm);
    const key = normalizePlaylistKey(seamless.detectedKey);
    if (!bpm && !key) return false;
    let changed = false;
    const record = (item) => {
      if (!playlistTracksMatch(item, seamless.track)) return item;
      const next = {
        ...item,
        bpm: bpm ?? item.bpm,
        key: key ?? item.key
      };
      if (JSON.stringify(next) === JSON.stringify(item)) return item;
      changed = true;
      return next;
    };
    state.playlist = state.playlist.map(record);
    state.savedPlaylists = state.savedPlaylists.map((snapshot) => ({
      ...snapshot,
      items: (snapshot.items || []).map(record)
    }));
    if (changed) saveState();
    return changed;
  }

  function applySeamlessState(nextState) {
    if (!nextState || typeof nextState !== "object") return;
    if (nowPlayingExplicitlyCleared && nextState.enabled) return;
    const wasEnabled = seamless.enabled;
    const incomingState = { ...nextState };
    if (pendingLoopBeats !== null) {
      if (Number(incomingState.loopBeats) === pendingLoopBeats) {
        pendingLoopBeats = null;
      } else {
        delete incomingState.loopBeats;
        delete incomingState.loopStart;
        delete incomingState.loopEnd;
      }
    }
    seamless = { ...seamless, ...incomingState };
    if (seamless.enabled && !pendingFeedTrackId) silenceNativePagePlayback();
    if (pendingPlaylistItemId && seamless.status !== "loading") {
      const pendingItem = state.playlist.find((item) => item.playlistItemId === pendingPlaylistItemId);
      if (pendingItem && playlistItemMatchesActiveTrack(pendingItem)) pendingPlaylistItemId = "";
    }

    if (seamless.enabled && seamless.track) {
      if (Number.isFinite(Number(seamless.rate))) state.dj.rate = Number(seamless.rate);
      state.dj.preservePitch = seamless.preservePitch !== false;
      if (Number.isFinite(Number(seamless.filterValue))) state.dj.filterValue = Number(seamless.filterValue);
      if (Number.isFinite(Number(seamless.gainDb))) state.dj.gainDb = Number(seamless.gainDb);
      if (Number.isFinite(Number(seamless.eqLowDb))) state.dj.eqLowDb = Number(seamless.eqLowDb);
      if (Number.isFinite(Number(seamless.eqMidDb))) state.dj.eqMidDb = Number(seamless.eqMidDb);
      if (Number.isFinite(Number(seamless.eqHighDb))) state.dj.eqHighDb = Number(seamless.eqHighDb);
      live = {
        ...live,
        available: true,
        isPlaying: Boolean(seamless.isPlaying),
        hasPlaybackStarted: true,
        title: seamless.track.title || live.title,
        artist: seamless.track.artist || live.artist,
        art: seamless.track.art || live.art,
        pageUrl: seamless.track.pageUrl || live.pageUrl,
        artistUrl: seamless.track.artistUrl || artistUrlFromPageUrl(seamless.track.pageUrl) || live.artistUrl,
        currentTime: Number(seamless.currentTime) || 0,
        duration: Number(seamless.duration) || 0,
        progress: Number(seamless.progress) || 0,
        tracks: (seamless.queue || []).slice(Math.max(0, Number(seamless.index) + 1))
      };
      if (live.isPlaying) recordListeningActivity();
    } else if (nowPlayingExplicitlyCleared) {
      resetLoadedPlayback();
    } else if (wasEnabled) {
      resetLoadedPlayback();
      window.setTimeout(scanLivePlayer, 0);
    }

    const playlistAnalysisChanged = recordActivePlaylistAnalysis();

    syncPagePlayerUi();
    syncRecommendationPlaybackUi();
    const activeDjControl = shadow.activeElement;
    const activePageDjControl = pageDjShadow?.activeElement;
    const editingDjControl = bpmEditing
      || (activeDjControl && djDrawer.contains(activeDjControl) && activeDjControl.matches("input"))
      || (activePageDjControl && pageDjSurface?.contains(activePageDjControl) && activePageDjControl.matches("input"));
    const gestureSelector = ".hub-dj-knob-dial.is-dragging, .hub-dj-platter.is-scratching, .hub-dj-platter.is-coasting, .hub-dj-platter.is-vinyl-releasing";
    const activeDjGesture = djDrawer.querySelector(gestureSelector) || pageDjSurface?.querySelector(gestureSelector);
    if ((state.dj.open || pageDjOpen) && !editingDjControl && !activeDjGesture) renderDjTools();
    renderPlayer();
    if (playlistAnalysisChanged && ["playlist", "nowPlaying"].includes(state.activeTab)) {
      render();
      return;
    }
    if (state.activeTab === "nowPlaying") {
      if (state.playlist.length && content.querySelector(".hub-playlist-stack")) syncCurrentPlaylistPlaybackUi();
      else if (!(shadow.activeElement && content.contains(shadow.activeElement))) {
        content.replaceChildren();
        renderCurrentPlaylist();
      }
    }
  }

  async function syncSeamlessState() {
    const response = await runtimeMessage({ type: MESSAGES.GET_SEAMLESS_STATE });
    if (response?.ok && response.state) applySeamlessState(response.state);
  }

  function buildSeamlessQueue() {
    const modern = getModernPlayerState();
    if (modern?.queue.length) return modern.queue;
    const data = getBandcampPageData();
    const art = document.querySelector('meta[property="og:image"]')?.content || document.querySelector("#tralbumArt img")?.src || live.art;
    const album = document.querySelector('meta[property="og:title"]')?.content || document.title;
    if (data?.tralbum?.trackinfo) {
      return data.tralbum.trackinfo.map((track) => ({
        id: String(track.track_id || track.id || track.title),
        title: track.title,
        artist: track.artist || data.tralbum.artist || data.embed?.artist || "Bandcamp",
        album,
        art,
        pageUrl: individualTrackPageUrl(track) || resolvedTrackPageUrl(track) || location.href,
        artistUrl: artistUrlFromPageUrl(location.href),
        duration: Number(track.duration) || 0,
        url: track.file?.["mp3-128"]
      })).filter((track) => isReusableStreamUrl(track.url));
    }
    const generic = getGenericPageItem() || live;
    return [...document.querySelectorAll("audio")].map((audio, index) => ({
      id: `${location.href}|${generic.title}|${index}`,
      title: generic.title || `Bandcamp track ${index + 1}`,
      artist: generic.artist || "Bandcamp",
      album,
      art: generic.art || art,
      pageUrl: generic.pageUrl || location.href,
      artistUrl: generic.artistUrl || artistUrlFromPageUrl(generic.pageUrl || location.href),
      duration: Number(audio.duration) || 0,
      url: audio.currentSrc || audio.src
    })).filter((track) => isReusableStreamUrl(track.url));
  }

  function matchingQueueTrack(queue, requested = {}) {
    const tracks = Array.isArray(queue) ? queue : [];
    const requestedUrl = String(requested.url || "");
    if (requestedUrl) {
      const urlMatch = tracks.find((track) => String(track.url || "") === requestedUrl);
      if (urlMatch) return urlMatch;
    }
    const requestedId = String(requested.id || "");
    if (requestedId) {
      const idMatch = tracks.find((track) => String(track.id || "") === requestedId);
      if (idMatch) return idMatch;
    }
    const identityMatch = tracks.find((track) => playlistTracksMatch(track, requested));
    if (identityMatch) return identityMatch;
    const requestedPageUrl = resolvedTrackPageUrl(requested);
    const requestedTitle = normalizedTrackTitle(requested.title);
    if (requestedPageUrl) {
      const requestedKeyUrl = canonicalPlaylistPageUrl(requested);
      const pageMatch = tracks.find((track) => canonicalPlaylistPageUrl(track) === requestedKeyUrl
        && (!requestedTitle || normalizedTrackTitle(track.title) === requestedTitle));
      if (pageMatch) return pageMatch;
    }
    if (requestedTitle) return tracks.find((track) => normalizedTrackTitle(track.title) === requestedTitle) || null;
    return null;
  }

  function classicPageTrackForControl(control) {
    const queue = buildSeamlessQueue();
    const row = control?.closest(".track_row_view");
    const title = row
      ? elementText(row, [".track-title", ".title"])
      : elementText(control?.closest(".inline_player"), [".title", ".track-title"]);
    return matchingQueueTrack(queue, { title }) || (!row ? queue[0] : null);
  }

  async function handoffPageAudio(pageAudio, requestedTitle = "") {
    const pageQueue = buildSeamlessQueue();
    if (!pageQueue.length) return false;
    const currentTitle = requestedTitle || document.querySelector(".inline_player .title")?.textContent?.trim() || live.title;
    const matchedIndex = pageQueue.findIndex((track) => track.title === currentTitle);
    const pageIndex = matchedIndex >= 0 ? matchedIndex : currentTitle ? -1 : 0;
    if (pageIndex < 0) return false;
    silenceNativePagePlayback();
    const prepared = await prepareExternalNowPlaying(pageQueue[pageIndex], pageQueue, { trustProvidedStreams: true });
    if (prepared.index < 0) return false;
    const response = await runtimeMessage({
      type: MESSAGES.SEAMLESS_ENABLE,
      queue: prepared.queue,
      index: prepared.index,
      currentTime: Number(pageAudio?.currentTime) || 0,
      autoplay: true,
      rate: state.dj.rate,
      preservePitch: state.dj.preservePitch,
      filterValue: state.dj.filterValue,
      gainDb: state.dj.gainDb,
      eqLowDb: state.dj.eqLowDb,
      eqMidDb: state.dj.eqMidDb,
      eqHighDb: state.dj.eqHighDb
    });
    if (!response?.ok) {
      return false;
    }
    if (prepared.request !== playlistPlayRequest) return false;
    if (pageAudio && !pageAudio.paused) pageAudio.pause();
    applySeamlessState(response.state);
    return true;
  }

  async function seamlessCommand(type, details = {}) {
    const response = await runtimeMessage({ type, ...details });
    if (!response?.ok) {
      showToast(response?.error || "Seamless playback command failed.");
      return null;
    }
    if (response.state) applySeamlessState(response.state);
    return response.state;
  }

  function renderCartViewTabs(metaText) {
    const header = createElement("div", "hub-cart-view-header");
    const tabs = createElement("div", "hub-cart-view-tabs");
    tabs.setAttribute("role", "tablist");
    for (const tab of [
      { id: "current", label: "Cart", count: state.cart.length },
      { id: "saved", label: "Saved", count: state.savedCarts.length }
    ]) {
      const button = createElement("button", `hub-cart-view-tab${state.cartView === tab.id ? " is-active" : ""}`);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(state.cartView === tab.id));
      button.append(document.createTextNode(tab.label), createElement("span", "hub-cart-view-count", String(tab.count)));
      button.addEventListener("click", () => {
        state.cartView = tab.id;
        state.selectedSavedCartId = null;
        saveState();
        render();
      });
      tabs.append(button);
    }
    header.append(tabs, createElement("span", "hub-cart-view-meta", metaText));
    content.append(header);
  }

  function cartTotalLabel(items, summary = null) {
    if (Number.isFinite(Number(summary?.subtotal)) && summary?.currency) {
      return formatCartPrice(summary.subtotal, summary.currency);
    }
    const totals = new Map();
    for (const item of items || []) {
      const currency = /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD";
      totals.set(currency, (totals.get(currency) || 0) + (Number(item.price) || 0));
    }
    return [...totals].map(([currency, total]) => formatCartPrice(total, currency)).join(" + ") || formatCartPrice(0, "USD");
  }

  function cartItemArt(item) {
    if (Number(item.restore?.art_id)) return `https://f4.bcbits.com/img/a${Number(item.restore.art_id)}_7.jpg`;
    if (Number(item.restore?.image_id)) return `https://f4.bcbits.com/img/${String(Number(item.restore.image_id)).padStart(10, "0")}_37.jpg`;
    return item.art;
  }

  function renderCartItemCard(item, { removable = false } = {}) {
    if (isGenericCartArtist(item.artist)) queueCartArtistResolution([item]);
    const card = createElement("article", "hub-card");
    const main = createElement("div", "hub-product-main");
    const artLink = createPageLink("", item.url, "hub-art-link");
    artLink.setAttribute("aria-label", `Open ${item.title}`);
    artLink.append(createArt(cartItemArt(item)));
    main.append(artLink);
    const details = createElement("div", "hub-product-details");
    const row = createElement("div", "hub-row-title");
    row.append(createPageLink(item.title, item.url, "hub-cart-title hub-inline-link"), createElement("span", "hub-price", formatCartPrice(item.price, item.currency)));
    details.append(row);
    if (!isGenericCartArtist(item.artist)) {
      details.append(createPageLink(item.artist, artistUrlFromPageUrl(item.url) || item.url, "hub-track-artist hub-inline-link"));
    }
    const metaRow = createElement("div", "hub-row-title");
    metaRow.style.marginTop = "8px";
    metaRow.append(createElement("span", "hub-meta", item.kind));
    if (removable) {
      const remove = createElement("button", "hub-playlist-icon-button hub-cart-remove-button");
      remove.type = "button";
      remove.title = `Remove ${item.title} from cart`;
      remove.setAttribute("aria-label", remove.title);
      remove.append(createButtonIcon("icon-close.svg"));
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        remove.title = `Removing ${item.title} from cart`;
        remove.setAttribute("aria-label", remove.title);
        const result = await removeLiveCartItem(item);
        if (!result.removed) {
          remove.disabled = false;
          remove.title = `Remove ${item.title} from cart`;
          remove.setAttribute("aria-label", remove.title);
          showToast(result.error || "Bandcamp could not remove this item.");
          return;
        }
        state.cart = state.cart.filter((entry) => entry.id !== item.id);
        state.cartSavedAt = Date.now();
        saveState();
        render();
        showToast(`Removed “${item.title}” from your Bandcamp cart.`);
      });
      metaRow.append(remove);
    }
    details.append(metaRow);
    main.append(details);
    card.append(main);
    return card;
  }

  function renderCurrentCart() {
    const backup = createElement("div", "hub-cart-backup");
    const savedText = state.cartSavedAt ? `Auto-saved ${new Date(state.cartSavedAt).toLocaleString()}` : "Not captured yet";
    backup.append(createElement("div", "hub-cart-backup-time", savedText));
    const backupActions = createElement("div", "hub-toolbar");
    const saveButton = createPlaylistToolbarButton("Save cart", "icon-save.svg", saveCartSnapshot);
    saveButton.disabled = !state.cart.length;
    const exportButton = createPlaylistToolbarButton("Download cart HTML", "icon-download-all.svg", () => exportCart());
    exportButton.disabled = !state.cart.length;
    const shareButton = createPlaylistToolbarButton("Share cart HTML", "icon-share.svg", () => void shareCart());
    shareButton.disabled = !state.cart.length;
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".html,.htm,.json,text/html,application/json";
    importInput.hidden = true;
    const importButton = createPlaylistToolbarButton("Import cart HTML", "icon-import.svg", () => importInput.click());
    importInput.addEventListener("change", () => {
      const file = importInput.files?.[0];
      importInput.value = "";
      void importAndRestoreCart(file, importButton);
    });
    backupActions.append(saveButton, exportButton, shareButton, importButton, importInput);
    backup.append(backupActions);
    content.append(backup);

    const stack = createElement("div", "hub-stack");
    for (const item of state.cart) {
      stack.append(renderCartItemCard(item, { removable: true }));
    }
    content.append(stack);
    if (!state.cart.length) content.append(createElement("div", "hub-empty", "Your cart is empty. Bandkit will save items here when it finds them on a Bandcamp page."));

    const checkout = createElement("button", "hub-primary-button", "Checkout");
    checkout.type = "button";
    checkout.style.marginTop = "12px";
    checkout.disabled = !state.cart.length;
    checkout.addEventListener("click", openBandcampCheckout);
    content.append(checkout);
  }

  function deleteSavedCart(snapshot) {
    state.savedCarts = state.savedCarts.filter((entry) => entry.id !== snapshot.id);
    if (state.selectedSavedCartId === snapshot.id) state.selectedSavedCartId = null;
    saveState();
    render();
  }

  function openSavedCart(snapshot) {
    state.selectedSavedCartId = snapshot.id;
    saveState();
    render();
  }

  function createSavedCartOpenButton(snapshot) {
    const button = createElement("button", "hub-saved-playlist-play-button hub-saved-cart-open-button");
    button.type = "button";
    button.title = `Open ${snapshot.name || "saved cart"}`;
    button.setAttribute("aria-label", button.title);
    button.append(createButtonIcon("icon-open.svg"), document.createTextNode("Open"));
    button.addEventListener("click", () => openSavedCart(snapshot));
    return button;
  }

  function createSavedCartActions(snapshot) {
    const actions = createElement("div", "hub-saved-playlist-icon-actions hub-saved-cart-icon-actions");
    actions.append(
      createSavedItemActionButton(`Restore ${snapshot.name || "saved cart"}`, "icon-restore.svg", () => void restoreSavedCart(snapshot.items || [])),
      createSavedItemActionButton(`Share ${snapshot.name || "saved cart"} as HTML`, "icon-share.svg", () => void shareCart(snapshot.items || [], snapshot.name || "Bandcamp cart", snapshot.summary)),
      createSavedItemActionButton(`Delete ${snapshot.name || "saved cart"}`, "icon-trash.svg", () => deleteSavedCart(snapshot), "is-delete")
    );
    actions.firstElementChild.disabled = !snapshot.items?.length;
    return actions;
  }

  function renderSavedCartList() {
    const createRow = createElement("div", "hub-cart-backup hub-playlist-import-row");
    createRow.append(createElement("div", "hub-cart-backup-time", "Create separate carts for releases you want to keep together"));
    const createButton = createElement("button", "hub-text-button is-accent hub-create-cart-button", "New cart");
    createButton.type = "button";
    createButton.prepend(createButtonIcon("icon-plus.svg"));
    createButton.addEventListener("click", createEmptySavedCart);
    const createActions = createElement("div", "hub-toolbar");
    createActions.append(createButton);
    createRow.append(createActions);
    content.append(createRow);
    if (!state.savedCarts.length) {
      content.append(createElement("div", "hub-empty", "No saved carts yet. Create an empty cart now, or Bandkit will auto-save your current cart when it captures one."));
      return;
    }
    const stack = createElement("div", "hub-stack hub-saved-cart-stack");
    for (const snapshot of state.savedCarts) {
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const card = createElement("article", "hub-card hub-saved-cart-card hub-saved-playlist-card");
      const body = createElement("button", "hub-saved-cart-body hub-saved-playlist-open");
      body.type = "button";
      body.setAttribute("aria-label", `Open saved cart ${snapshot.name || "Saved cart"}`);
      body.addEventListener("click", () => openSavedCart(snapshot));
      const titleRow = createElement("div", "hub-row-title");
      titleRow.append(createElement("strong", "", snapshot.name || "Saved cart"), createElement("span", "hub-saved-cart-total", cartTotalLabel(items, snapshot.summary)));
      const savedAt = snapshot.savedAt ? new Date(snapshot.savedAt) : null;
      const validDate = savedAt && !Number.isNaN(savedAt.getTime());
      const bodyCopy = createElement("div", "hub-saved-playlist-card-copy");
      bodyCopy.append(
        titleRow,
        createElement("div", "hub-saved-cart-date", `${snapshot.autoSaved ? "Auto-saved · " : ""}${validDate ? savedAt.toLocaleString() : "Saved locally"}`),
        createElement("div", "hub-saved-cart-summary", `${items.length} item${items.length === 1 ? "" : "s"}${items.length ? ` · ${items.slice(0, 3).map((item) => item.title).join(", ")}${items.length > 3 ? ` +${items.length - 3} more` : ""}` : ""}`)
      );
      body.append(createPlaylistArtworkMosaic(items.map((item) => ({ ...item, art: cartItemArt(item) }))), bodyCopy);
      const footer = createElement("div", "hub-card-footer hub-saved-cart-actions");
      footer.append(createSavedCartOpenButton(snapshot), createSavedCartActions(snapshot));
      card.append(body, footer);
      stack.append(card);
    }
    content.append(stack);
  }

  function renderSavedCartDetail(snapshot) {
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const toolbar = createElement("div", "hub-saved-cart-detail-toolbar hub-saved-playlist-detail-toolbar");
    const back = createElement("button", "hub-saved-playlist-back hub-saved-cart-back");
    back.type = "button";
    back.title = "Back to saved carts";
    back.setAttribute("aria-label", "Back to saved carts");
    back.append(createButtonIcon("icon-back.svg"));
    const returnToSavedCarts = (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.selectedSavedCartId = null;
      saveState();
      render();
    };
    back.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      returnToSavedCarts(event);
    }, true);
    back.addEventListener("click", returnToSavedCarts);
    toolbar.append(back, createElement("h2", "hub-saved-playlist-detail-title", snapshot.name || "Saved cart"));
    content.append(toolbar);

    const actionRow = createElement("div", "hub-cart-backup hub-playlist-toolbar hub-saved-playlist-action-row hub-saved-cart-detail-action-row");
    actionRow.append(
      createElement("div", "hub-cart-backup-time", `${items.length} item${items.length === 1 ? "" : "s"} · ${cartTotalLabel(items, snapshot.summary)}`),
      createSavedCartActions(snapshot)
    );
    content.append(actionRow);

    const stack = createElement("div", "hub-stack");
    for (const item of items) stack.append(renderCartItemCard(item));
    content.append(stack);
    if (!items.length) content.append(createElement("div", "hub-empty", "This saved cart has no items."));
  }

  function renderCart() {
    if (!['current', 'saved'].includes(state.cartView)) state.cartView = "current";
    const snapshot = state.savedCarts.find((entry) => entry.id === state.selectedSavedCartId);
    if (!snapshot) state.selectedSavedCartId = null;
    if (snapshot && state.cartView === "saved") {
      renderSavedCartDetail(snapshot);
      return;
    }
    const total = state.cartView === "current" ? cartTotalLabel(state.cart, state.cartSummary) : state.savedCarts.length;
    renderCartViewTabs(state.cartView === "current" ? `Total: ${total}` : `${total} saved`);
    if (state.cartView === "current") renderCurrentCart();
    else renderSavedCartList();
  }


  function movePlaylistItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= state.playlist.length || toIndex >= state.playlist.length) return;
    const [item] = state.playlist.splice(fromIndex, 1);
    state.playlist.splice(toIndex, 0, item);
    state.playlistMode = "manual";
    saveState();
    void syncActivePlaylistQueue();
    render();
  }

  function moveSavedPlaylistItem(snapshot, fromIndex, toIndex) {
    if (!snapshot || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= snapshot.items.length || toIndex >= snapshot.items.length) return;
    const [item] = snapshot.items.splice(fromIndex, 1);
    snapshot.items.splice(toIndex, 0, item);
    snapshot.items = normalizePlaylist(snapshot.items);
    saveState();
    render();
  }

  function bindPlaylistCardReordering(card, item, index, items, moveItem) {
    card.draggable = true;
    card.tabIndex = 0;
    card.dataset.playlistItemId = item.playlistItemId;
    card.setAttribute("aria-label", `${item.title}, position ${index + 1} of ${items.length}. Drag or press Option/Alt plus Up or Down to reorder.`);
    card.addEventListener("pointerdown", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("a, button, input, select, textarea")) {
        card.draggable = true;
        return;
      }
      // A draggable ancestor can claim a slight pointer movement before its
      // button receives click. Suspend native dragging for this gesture so
      // card controls remain reliable physical click targets.
      card.draggable = false;
      const restoreDragging = () => {
        window.removeEventListener("pointerup", restoreDragging);
        window.removeEventListener("pointercancel", restoreDragging);
        window.setTimeout(() => { card.draggable = true; }, 0);
      };
      window.addEventListener("pointerup", restoreDragging);
      window.addEventListener("pointercancel", restoreDragging);
    }, true);
    card.addEventListener("dragstart", (event) => {
      if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) {
        event.preventDefault();
        return;
      }
      draggingPlaylistId = item.playlistItemId;
      event.dataTransfer?.setData("text/plain", item.playlistItemId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => {
      draggingPlaylistId = "";
      content.querySelectorAll(".hub-playlist-track").forEach((entry) => entry.classList.remove("is-dragging", "is-drag-target", "is-drop-before", "is-drop-after"));
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const after = event.clientY > card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2;
      card.classList.add("is-drag-target");
      card.classList.toggle("is-drop-before", !after);
      card.classList.toggle("is-drop-after", after);
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-drag-target", "is-drop-before", "is-drop-after"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const dropAfter = card.classList.contains("is-drop-after");
      card.classList.remove("is-drag-target", "is-drop-before", "is-drop-after");
      const sourceId = draggingPlaylistId || event.dataTransfer?.getData("text/plain");
      const sourceIndex = items.findIndex((entry) => entry.playlistItemId === sourceId);
      const destinationIndex = sourceIndex < index
        ? index - (dropAfter ? 0 : 1)
        : index + (dropAfter ? 1 : 0);
      moveItem(sourceIndex, Math.max(0, Math.min(items.length - 1, destinationIndex)));
    });
    card.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const destination = index + (event.key === "ArrowUp" ? -1 : 1);
      if (destination < 0 || destination >= items.length) return;
      moveItem(index, destination);
      requestAnimationFrame(() => content.querySelector(`[data-playlist-item-id="${CSS.escape(item.playlistItemId)}"]`)?.focus());
    });
  }

  function activePlaylistItemId() {
    if (pendingPlaylistItemId) return pendingPlaylistItemId;
    if (!seamless.enabled || !seamless.track) return "";
    const activeItem = state.playlist.find((item) => playlistItemMatchesActiveTrack(item));
    return activeItem?.playlistItemId || seamless.track.playlistItemId || "";
  }

  function playlistItemMatchesActiveTrack(item) {
    if (!item || !seamless.enabled || !seamless.track) return false;
    return Boolean(
      (item.playlistItemId && seamless.track.playlistItemId === item.playlistItemId)
      || matchingQueueTrack([seamless.track], item)
    );
  }

  function syncCurrentPlaylistPlaybackUi() {
    const activeId = activePlaylistItemId();
    const activeIsPlaying = !pendingPlaylistItemId && Boolean(seamless.isPlaying);
    for (const card of content.querySelectorAll(".hub-playlist-track[data-playlist-item-id]")) {
      const isCurrent = Boolean(activeId && card.dataset.playlistItemId === activeId);
      const isPlaying = isCurrent && activeIsPlaying;
      card.classList.toggle("is-playing", isCurrent);
      card.classList.toggle("is-actively-playing", isPlaying);
      card.setAttribute("aria-current", isCurrent ? "true" : "false");
      const toggle = card.querySelector(".hub-playlist-media-toggle");
      if (!toggle) continue;
      const item = state.playlist.find((track) => track.playlistItemId === card.dataset.playlistItemId);
      const activeTrackMatch = playlistItemMatchesActiveTrack(item);
      const isActuallyLoading = Boolean(pendingPlaylistItemId && isCurrent && !activeTrackMatch);
      const label = isActuallyLoading
        ? `Loading ${item?.title || "track"}`
        : isCurrent
          ? isPlaying ? `Pause ${item?.title || "track"}` : `Resume ${item?.title || "track"}`
        : `Play ${item?.title || "track"}`;
      toggle.title = label;
      toggle.setAttribute("aria-label", label);
      // Keep this control physically clickable even while a prior playback
      // request is settling. A second click can then recover/retry instead of
      // leaving the user with a permanently disabled Now Playing card.
      toggle.disabled = false;
      toggle.setAttribute("aria-busy", String(isActuallyLoading));
      const icon = toggle.querySelector(".hub-playlist-media-icon");
      icon?.replaceChildren(createButtonIcon(isPlaying ? "icon-pause.svg" : "icon-play.svg"));
    }
  }

  function formatPlaylistBpm(value) {
    const bpm = normalizePlaylistBpm(value);
    return bpm ? `${Number.isInteger(bpm) ? bpm : bpm.toFixed(1)} BPM` : "";
  }

  function createPlaylistAnalysisMeta(item) {
    if (state.recordPlaylistMetadata === false) return null;
    const bpm = formatPlaylistBpm(item.bpm);
    const key = normalizePlaylistKey(item.key);
    if (!bpm && !key) return null;
    const meta = createElement("div", "hub-playlist-analysis");
    const accessibleParts = [];
    if (bpm) {
      meta.append(createElement("span", "hub-playlist-analysis-chip is-bpm", bpm));
      accessibleParts.push(bpm);
    }
    if (key) {
      const keyLabel = [key.camelot, key.shortName].filter(Boolean).join(" · ") || key.name;
      const chip = createElement("span", "hub-playlist-analysis-chip is-key", keyLabel);
      if (key.name) chip.title = key.name;
      meta.append(chip);
      accessibleParts.push(key.name || keyLabel);
    }
    meta.setAttribute("aria-label", `Track analysis: ${accessibleParts.join(", ")}`);
    return meta;
  }

  function renderPlaylistTrack(item, index) {
    const isCurrentPlaylistTrack = activePlaylistItemId() === item.playlistItemId;
    const isCurrentLoading = isCurrentPlaylistTrack
      && pendingPlaylistItemId === item.playlistItemId
      && !playlistItemMatchesActiveTrack(item);
    const isCurrentPlaying = isCurrentPlaylistTrack && !isCurrentLoading && Boolean(seamless.isPlaying);
    const card = createElement("article", `hub-card hub-playlist-track${isCurrentPlaylistTrack ? " is-playing" : ""}${isCurrentPlaying ? " is-actively-playing" : ""}`);
    bindPlaylistCardReordering(card, item, index, state.playlist, movePlaylistItem);
    card.setAttribute("aria-current", isCurrentPlaylistTrack ? "true" : "false");

    const mediaToggle = createElement("button", "hub-playlist-media-toggle");
    mediaToggle.type = "button";
    mediaToggle.title = isCurrentLoading
      ? `Loading ${item.title}`
      : isCurrentPlaylistTrack
      ? isCurrentPlaying ? `Pause ${item.title}` : `Resume ${item.title}`
      : `Play ${item.title}`;
    mediaToggle.setAttribute("aria-label", mediaToggle.title);
    mediaToggle.disabled = false;
    mediaToggle.setAttribute("aria-busy", String(isCurrentLoading));
    const artwork = createElement("span", "hub-playlist-media-art");
    artwork.append(createArt(item.art, true));
    const mediaIcon = createElement("span", "hub-playlist-media-icon");
    mediaIcon.append(createButtonIcon(isCurrentPlaying ? "icon-pause.svg" : "icon-play.svg"));
    mediaToggle.append(artwork, mediaIcon);
    const activateMediaPlayback = () => {
      if (playlistItemMatchesActiveTrack(item)) void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      else void playPlaylistAt(index);
    };
    mediaToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
    mediaToggle.addEventListener("mousedown", (event) => event.stopPropagation());
    mediaToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      activateMediaPlayback();
    });
    const copy = createElement("div", "hub-track-copy");
    copy.append(
      createPageLink(item.title, item.pageUrl, "hub-track-title hub-inline-link"),
      createPageLink(item.artist, item.artistUrl || item.pageUrl, "hub-track-artist hub-inline-link")
    );
    const details = [item.album, item.duration ? formatDuration(item.duration) : "", item.restoreError].filter(Boolean).join(" · ");
    if (details) copy.append(createElement("span", `hub-playlist-meta${item.restoreError ? " is-error" : ""}`, details));
    const analysisMeta = createPlaylistAnalysisMeta(item);
    if (analysisMeta) copy.append(analysisMeta);

    const actions = createElement("div", "hub-playlist-track-actions");
    const remove = createElement("button", "hub-playlist-icon-button");
    remove.type = "button";
    remove.title = "Remove from playlist";
    remove.setAttribute("aria-label", `Remove ${item.title} from playlist`);
    remove.append(createButtonIcon("icon-close.svg"));
    remove.addEventListener("click", () => {
      suppressRemovedFeedTrack(item);
      if (pendingPlaylistItemId === item.playlistItemId) {
        playlistPlayRequest += 1;
        playlistPlaybackStartingRequest = 0;
        playlistPlaybackStarting = false;
        pendingPlaylistItemId = "";
      }
      state.playlist.splice(index, 1);
      if (!state.playlist.length) {
        void clearNowPlayingPlayback();
        return;
      }
      saveState();
      void syncActivePlaylistQueue();
      render();
      injectPlaylistButtons();
    });
    actions.append(remove);
    card.append(mediaToggle, copy, actions);
    return card;
  }

  function createPlaylistToolbarButton(label, icon, onClick, { addPage = false } = {}) {
    const button = createElement("button", `hub-playlist-toolbar-icon${addPage ? " is-add-page" : ""}`);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const iconElement = createElement("span", "hub-button-icon");
    iconElement.style.setProperty("--hub-icon", `url('${asset(icon)}')`);
    button.append(iconElement);
    if (addPage) {
      const badge = createElement("span", "hub-add-page-badge");
      badge.style.setProperty("--hub-icon", `url('${asset("icon-plus.svg")}')`);
      button.append(badge);
    }
    button.addEventListener("click", onClick);
    return button;
  }

  function renderPageQueueFallback() {
    const pageQueueSignature = `${live.pageUrl}|${live.title}`;
    if (clearedPageQueueSignature && clearedPageQueueSignature === pageQueueSignature) {
      content.append(createElement("div", "hub-empty", "Now Playing is clear. Use the ＋ buttons to add tracks."));
      return;
    }
    if (!live.hasPlaybackStarted || !live.title) {
      content.append(createElement("div", "hub-empty", "Play a Bandcamp track or use the ＋ buttons to build your queue."));
      return;
    }
    const activeTrack = seamless.enabled && seamless.track ? seamless.track : null;
    const queue = [activeTrack, ...live.tracks]
      .filter(Boolean)
      .filter((track, index, items) => items.findIndex((candidate) => Boolean(matchingQueueTrack([candidate], track))) === index)
      .slice(0, 20);
    if (!queue.length) {
      content.append(createElement("div", "hub-empty", live.available ? "Nothing else in the current page queue." : "Play something on this page to connect the queue."));
      return;
    }
    const list = createElement("div", "hub-queue-list hub-playlist-page-queue");
    queue.forEach((track, index) => {
      const item = createElement("div", "hub-card hub-queue-item");
      const isActiveTrack = Boolean(activeTrack && matchingQueueTrack([activeTrack], track));
      const number = createElement("div", "hub-queue-number", isActiveTrack ? "" : String(index + 1));
      if (isActiveTrack) number.append(createElement("span", "hub-playing-icon"));
      item.append(number);
      const artLink = createPageLink("", track.pageUrl, "hub-art-link hub-queue-art-link");
      artLink.setAttribute("aria-label", `Open ${track.title}`);
      if (track.art) artLink.append(createArt(track.art, true));
      else {
        const placeholder = createElement("span", "hub-queue-art-placeholder");
        placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
        artLink.append(placeholder);
      }
      const copy = createElement("div", "hub-track-copy");
      copy.append(
        createPageLink(track.title, track.pageUrl, "hub-track-title hub-inline-link"),
        createPageLink(track.artist, track.artistUrl || track.pageUrl, "hub-track-artist hub-inline-link")
      );
      const trackActions = createTrackActionControls(track);
      if (isActiveTrack) {
        const toggle = createElement("button", "hub-queue-action hub-current-track-toggle");
        toggle.type = "button";
        toggle.title = seamless.isPlaying ? `Pause ${track.title}` : `Resume ${track.title}`;
        toggle.setAttribute("aria-label", toggle.title);
        toggle.append(createButtonIcon(seamless.isPlaying ? "icon-pause.svg" : "icon-play.svg"));
        toggle.addEventListener("click", () => void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE));
        trackActions.prepend(toggle);
      }
      item.append(artLink, copy, trackActions);
      list.append(item);
    });
    content.append(list);
  }

  function renderCurrentPlaylist() {
    const heading = createSectionHeading("Now Playing");
    heading.classList.add("hub-now-playing-header");
    const pageTracks = buildSeamlessQueue();
    const toolbarItems = state.playlist.length ? state.playlist : pageTracks;
    content.append(heading);
    mountPanelClose();

    const toolbar = createElement("div", "hub-cart-backup hub-playlist-toolbar hub-now-playing-toolbar");
    const songCount = toolbarItems.length;
    toolbar.append(createElement(
      "div",
      "hub-cart-backup-time",
      `${songCount} song${songCount === 1 ? "" : "s"} in Now Playing`
    ));
    const actions = createElement("div", "hub-toolbar");
    const addPage = createPlaylistToolbarButton("Add page to queue", "icon-queue.svg", () => {
      if (!pageTracks.length) showToast("This page does not expose a streamable track list.");
      else addTracksToPlaylist(pageTracks);
    }, { addPage: true });
    addPage.disabled = !pageTracks.length;
    const save = createPlaylistToolbarButton("Save queue", "icon-save.svg", () => savePlaylistSnapshot(toolbarItems));
    save.disabled = !toolbarItems.length;
    const download = createPlaylistToolbarButton("Download queue", "icon-download-all.svg", () => exportPlaylist(toolbarItems));
    download.disabled = !toolbarItems.length;
    const share = createPlaylistToolbarButton("Share queue as HTML", "icon-share.svg", () => void sharePlaylist(toolbarItems, "Now Playing"));
    share.disabled = !toolbarItems.length;
    const clear = createPlaylistToolbarButton("Clear Now Playing", "icon-clear.svg", async () => {
      if (!window.confirm("Clear Now Playing? Your saved playlists will not be affected.")) return;
      await clearNowPlayingPlayback();
    });
    clear.disabled = !state.playlist.length && !toolbarItems.length && !live.hasPlaybackStarted;
    actions.append(addPage, save, download, share, clear);
    toolbar.append(actions);
    content.append(toolbar);

    if (!state.playlist.length) {
      renderPageQueueFallback();
      return;
    }
    const stack = createElement("div", "hub-stack hub-playlist-stack");
    state.playlist.forEach((item, index) => stack.append(renderPlaylistTrack(item, index)));
    content.append(stack);
  }

  function renameSavedPlaylist(snapshot) {
    const name = window.prompt("Rename this playlist", snapshot.name)?.trim();
    if (!name) return;
    snapshot.name = name.slice(0, 120);
    saveState();
    render();
  }

  function deleteSavedPlaylist(snapshot) {
    if (!window.confirm(`Delete the playlist “${snapshot.name}”?`)) return;
    state.savedPlaylists = state.savedPlaylists.filter((entry) => entry.id !== snapshot.id);
    if (state.selectedSavedPlaylistId === snapshot.id) state.selectedSavedPlaylistId = null;
    saveState();
    render();
  }

  function createSavedItemActionButton(label, icon, onClick, className = "") {
    const button = createElement("button", `hub-saved-playlist-icon-button${className ? ` ${className}` : ""}`);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const glyph = createElement("span", "hub-button-icon");
    glyph.style.setProperty("--hub-icon", `url('${asset(icon)}')`);
    button.append(glyph);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void onClick();
    });
    return button;
  }

  function createSavedPlaylistActions(snapshot, { includeDownload = false, includePlay = true, includeRestoreCart = false } = {}) {
    const actions = createElement("div", "hub-saved-playlist-icon-actions");
    if (includePlay) {
      const play = createSavedItemActionButton(`Play ${snapshot.name}`, "icon-play.svg", () => {
        restoreSavedPlaylist(snapshot, "replace", { syncPlayback: false });
        void playPlaylistAt(0, { forceRefresh: true });
      });
      play.disabled = !snapshot.items.length;
      actions.append(play);
    }
    const addToPlaying = createSavedItemActionButton(`Add ${snapshot.name} to Now Playing`, "icon-plus.svg", () => restoreSavedPlaylist(snapshot, "append"));
    addToPlaying.disabled = !snapshot.items.length;
    actions.append(
      addToPlaying,
      createSavedItemActionButton(`Rename ${snapshot.name}`, "icon-edit.svg", () => renameSavedPlaylist(snapshot)),
      createSavedItemActionButton(`Share ${snapshot.name} as HTML`, "icon-share.svg", () => void sharePlaylist(snapshot.items, snapshot.name))
    );
    if (includeDownload) {
      actions.append(createSavedItemActionButton(`Download ${snapshot.name}`, "icon-download-all.svg", () => exportPlaylist(snapshot.items, snapshot.name)));
    }
    if (includeRestoreCart) {
      const restoreCart = createSavedItemActionButton(`Restore ${snapshot.name} to cart`, "icon-cart.svg", () => void restoreSavedCart(snapshot.items));
      restoreCart.disabled = !snapshot.items.length;
      actions.append(restoreCart);
    }
    actions.append(createSavedItemActionButton(`Delete ${snapshot.name}`, "icon-trash.svg", () => deleteSavedPlaylist(snapshot), "is-delete"));
    return actions;
  }

  function createSavedPlaylistPlayButton(snapshot) {
    const button = createElement("button", "hub-saved-playlist-play-button");
    button.type = "button";
    button.title = `Play ${snapshot.name}`;
    button.setAttribute("aria-label", button.title);
    button.disabled = !snapshot.items.length;
    button.append(createButtonIcon("icon-play.svg"), document.createTextNode("Play"));
    button.addEventListener("click", () => {
      restoreSavedPlaylist(snapshot, "replace", { syncPlayback: false });
      void playPlaylistAt(0, { forceRefresh: true });
    });
    return button;
  }

  function createPlaylistArtworkMosaic(items) {
    const mosaic = createElement("div", "hub-playlist-mosaic");
    const artwork = [];
    const seen = new Set();
    for (const item of items || []) {
      const imageUrl = resolveImage(item.art);
      if (!imageUrl || seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      artwork.push(imageUrl);
      if (artwork.length === 4) break;
    }
    mosaic.classList.add(`has-${artwork.length || 0}`);
    if (!artwork.length) {
      const placeholder = createElement("span", "hub-playlist-mosaic-placeholder");
      placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
      mosaic.append(placeholder);
      return mosaic;
    }
    for (const imageUrl of artwork) {
      const image = createElement("img", "hub-playlist-mosaic-image");
      image.src = imageUrl;
      image.alt = "";
      mosaic.append(image);
    }
    return mosaic;
  }

  function renderSavedPlaylistDetail(snapshot) {
    const toolbar = createElement("div", "hub-saved-cart-detail-toolbar hub-saved-playlist-detail-toolbar");
    const back = createElement("button", "hub-saved-playlist-back");
    back.type = "button";
    back.title = "Back to playlists";
    back.setAttribute("aria-label", "Back to playlists");
    const backIcon = createElement("span", "hub-button-icon");
    backIcon.style.setProperty("--hub-icon", `url('${asset("icon-back.svg")}')`);
    back.append(backIcon);
    const returnToSavedPlaylists = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.selectedSavedPlaylistId) return;
      state.selectedSavedPlaylistId = "";
      state.playlistView = "saved";
      saveState();
      render();
    };
    back.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      returnToSavedPlaylists(event);
    }, true);
    back.addEventListener("click", returnToSavedPlaylists);
    const title = createElement("h2", "hub-saved-playlist-detail-title", snapshot.name);
    toolbar.append(back, title);
    content.append(toolbar);

    const actionRow = createElement("div", "hub-cart-backup hub-playlist-toolbar hub-saved-playlist-action-row");
    const duration = snapshot.items.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
    actionRow.append(
      createElement(
        "div",
        "hub-cart-backup-time",
        `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"} · ${formatDuration(duration)}`
      ),
      createSavedPlaylistActions(snapshot, { includeDownload: true })
    );
    content.append(actionRow);

    const list = createElement("div", "hub-stack hub-saved-playlist-track-list");
    snapshot.items.forEach((item, index) => {
      const row = createElement("article", "hub-card hub-queue-item hub-playlist-track hub-saved-playlist-track");
      bindPlaylistCardReordering(row, item, index, snapshot.items, (fromIndex, toIndex) => moveSavedPlaylistItem(snapshot, fromIndex, toIndex));
      row.append(createElement("div", "hub-queue-number", String(index + 1)));
      const artwork = createElement("div", "hub-art-link hub-queue-art-link hub-playlist-drag-art");
      if (item.art) artwork.append(createArt(item.art, true));
      else {
        const placeholder = createElement("span", "hub-queue-art-placeholder");
        placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
        artwork.append(placeholder);
      }
      const trackCopy = createElement("div", "hub-track-copy");
      trackCopy.append(
        createPageLink(item.title, item.pageUrl, "hub-track-title hub-inline-link"),
        createPageLink(item.artist, item.artistUrl || item.pageUrl, "hub-track-artist hub-inline-link")
      );
      const analysisMeta = createPlaylistAnalysisMeta(item);
      if (analysisMeta) trackCopy.append(analysisMeta);
      row.append(artwork, trackCopy, createTrackActionControls(item));
      list.append(row);
    });
    content.append(list);
    if (!snapshot.items.length) content.append(createElement("div", "hub-empty", "This playlist is empty. Use any ＋ menu to add tracks to it."));
  }

  function renderSavedPlaylists() {
    if (!state.savedPlaylists.length) {
      content.append(createElement("div", "hub-empty", "Create a playlist from any track’s ＋ menu, or save the current Now Playing list."));
      return;
    }
    const stack = createElement("div", "hub-stack hub-saved-playlist-stack");
    for (const snapshot of state.savedPlaylists) {
      const duration = snapshot.items.reduce((total, item) => total + (Number(item.duration) || 0), 0);
      const card = createElement("article", "hub-card hub-saved-cart-card hub-saved-playlist-card");
      const body = createElement("button", "hub-saved-cart-body hub-saved-playlist-open");
      body.type = "button";
      body.setAttribute("aria-label", `Open playlist ${snapshot.name}`);
      body.addEventListener("click", () => {
        state.selectedSavedPlaylistId = snapshot.id;
        saveState();
        render();
      });
      const titleRow = createElement("div", "hub-row-title");
      titleRow.append(createElement("strong", "", snapshot.name), createElement("span", "hub-saved-cart-total", formatDuration(duration)));
      const savedAt = new Date(snapshot.savedAt);
      const bodyCopy = createElement("div", "hub-saved-playlist-card-copy");
      bodyCopy.append(
        titleRow,
        createElement("div", "hub-saved-cart-date", Number.isNaN(savedAt.getTime()) ? "Saved locally" : savedAt.toLocaleString()),
        createElement("div", "hub-saved-cart-summary", `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"}${snapshot.items.length ? ` · ${snapshot.items.slice(0, 3).map((item) => item.title).join(", ")}${snapshot.items.length > 3 ? ` +${snapshot.items.length - 3} more` : ""}` : ""}`)
      );
      body.append(createPlaylistArtworkMosaic(snapshot.items), bodyCopy);
      const footer = createElement("div", "hub-card-footer hub-saved-cart-actions");
      footer.append(
        createSavedPlaylistPlayButton(snapshot),
        createSavedPlaylistActions(snapshot, { includePlay: false, includeRestoreCart: true })
      );
      card.append(body, footer);
      stack.append(card);
    }
    content.append(stack);
  }

  function renderPlaylist() {
    state.playlistView = "saved";
    const selected = state.savedPlaylists.find((entry) => entry.id === state.selectedSavedPlaylistId);
    if (!selected) state.selectedSavedPlaylistId = null;
    if (selected) renderSavedPlaylistDetail(selected);
    else {
      content.append(createSectionHeading("Playlists", `${state.savedPlaylists.length} saved`));
      const importRow = createElement("div", "hub-cart-backup hub-playlist-import-row");
      importRow.append(createElement("div", "hub-cart-backup-time", "Import a downloaded Bandkit playlist"));
      const actions = createElement("div", "hub-toolbar");
      const importInput = document.createElement("input");
      importInput.type = "file";
      importInput.accept = ".html,.htm,.json,text/html,application/json";
      importInput.hidden = true;
      const importButton = createElement("button", "hub-text-button is-accent hub-playlist-import-button", "Import");
      importButton.type = "button";
      importButton.prepend(createButtonIcon("icon-import.svg"));
      importButton.addEventListener("click", () => importInput.click());
      importInput.addEventListener("change", () => {
        const file = importInput.files?.[0];
        importInput.value = "";
        void importPlaylist(file, importButton);
      });
      const createButton = createElement("button", "hub-text-button is-accent hub-create-playlist-button", "New playlist");
      createButton.type = "button";
      createButton.prepend(createButtonIcon("icon-plus.svg"));
      createButton.addEventListener("click", createEmptySavedPlaylist);
      actions.append(createButton, importButton, importInput);
      importRow.append(actions);
      content.append(importRow);
      renderSavedPlaylists();
    }
  }

  function renderActivity() {
    content.append(createSectionHeading("Activity", `${state.activity.length} entr${state.activity.length === 1 ? "y" : "ies"}`));
    const latestActivityAt = state.activity.reduce((latest, item) => {
      const timestamp = new Date(item.createdAt || item.time || 0).getTime();
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
    const backup = createElement("div", "hub-cart-backup hub-activity-backup");
    backup.append(createElement(
      "div",
      "hub-cart-backup-time",
      latestActivityAt ? `Last updated ${new Date(latestActivityAt).toLocaleString()}` : "Not updated yet"
    ));
    const actions = createElement("div", "hub-toolbar");
    const exportButton = createElement("button", "hub-text-button is-accent hub-activity-download", "Download");
    exportButton.type = "button";
    exportButton.addEventListener("click", exportActivity);
    const downloadIcon = createElement("span", "hub-button-icon");
    downloadIcon.style.setProperty("--hub-icon", `url('${asset("icon-download-all.svg")}')`);
    exportButton.prepend(downloadIcon);
    actions.append(exportButton);
    backup.append(actions);
    content.append(backup);
    const list = createElement("div", "hub-activity-list");
    for (const item of state.activity.slice(0, 20)) {
      const row = createElement("article", "hub-activity-item");
      const artLink = createPageLink("", item.url, "hub-art-link");
      artLink.setAttribute("aria-label", `Open ${item.title}`);
      artLink.append(createArt(item.art, true));
      row.append(artLink);
      const details = createElement("div", "hub-activity-details");
      const copy = createElement("div", "hub-activity-copy");
      copy.append(document.createTextNode(`You ${item.action} `));
      copy.append(createPageLink(item.title, item.url, "hub-inline-link"));
      copy.append(document.createTextNode(" by "));
      copy.append(createPageLink(item.artist, item.artistUrl || item.url, "hub-inline-link"));
      details.append(copy);
      const meta = createElement("div", "hub-activity-meta");
      const time = item.createdAt ? new Date(item.createdAt).toLocaleString() : item.time || "Recorded locally";
      meta.append(createElement("span", `hub-event-chip ${item.action}`, item.action), createElement("span", "hub-meta", time));
      details.append(meta);
      row.append(details);
      list.append(row);
    }
    content.append(list);
    if (!state.activity.length) content.append(createElement("div", "hub-empty", "Nothing recorded yet. Tracks you play will appear here with a link back to their Bandcamp page."));
  }

  function renderSettings() {
    content.append(createSectionHeading("Settings"));

    const playback = createElement("section", "hub-card hub-settings-card");
    playback.append(createElement("h2", "hub-settings-heading", "Playback"));
    const knobRow = createElement("div", "hub-settings-row");
    const knobCopy = createElement("div", "hub-settings-copy");
    knobCopy.append(
      createElement("strong", "", "Knob gesture"),
      createElement("span", "", "Choose how DJ knobs respond.")
    );
    const knobMode = createElement("select", "hub-settings-select");
    knobMode.setAttribute("aria-label", "Knob gesture");
    for (const [value, label] of [
      ["both", "Up/down + left/right"],
      ["vertical", "Up and down"],
      ["horizontal", "Left and right"],
      ["radial", "Turn around the dial"]
    ]) {
      const option = createElement("option", "", label);
      option.value = value;
      option.selected = state.dj.knobMode === value;
      knobMode.append(option);
    }
    knobMode.addEventListener("change", () => {
      state.dj.knobMode = knobMode.value;
      saveState();
    });
    knobRow.append(knobCopy, knobMode);
    playback.append(knobRow);

    const scrubberRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const scrubberCopy = createElement("div", "hub-settings-copy");
    scrubberCopy.append(
      createElement("strong", "", "Scrubber style"),
      createElement("span", "", "Use the same timeline in the page player and music bar.")
    );
    const scrubberStyle = createElement("select", "hub-settings-select");
    scrubberStyle.setAttribute("aria-label", "Scrubber style");
    for (const [value, label] of [["traditional", "Traditional scrub head"], ["waveform", "Waveform"]]) {
      const option = createElement("option", "", label);
      option.value = value;
      option.selected = state.scrubberStyle === value;
      scrubberStyle.append(option);
    }
    scrubberStyle.addEventListener("change", () => {
      state.scrubberStyle = scrubberStyle.value === "traditional" ? "traditional" : "waveform";
      syncScrubberStyles();
      ensurePagePlayerWaveforms();
      saveState();
      showToast(state.scrubberStyle === "traditional" ? "Traditional scrub heads enabled" : "Waveform scrubbers enabled");
    });
    scrubberRow.append(scrubberCopy, scrubberStyle);
    playback.append(scrubberRow);

    const musicBarRow = createElement("div", "hub-settings-row hub-settings-subrow hub-settings-combined-row");
    const musicBarCopy = createElement("div", "hub-settings-copy");
    musicBarCopy.append(
      createElement("strong", "", "Music bar"),
      createElement("span", "", "Adjust its size and width.")
    );
    const musicBarSize = createElement("select", "hub-settings-select");
    musicBarSize.setAttribute("aria-label", "Music bar size");
    for (const [value, label] of [["compact", "Compact"], ["standard", "Standard"]]) {
      const option = createElement("option", "", label);
      option.value = value;
      option.selected = state.musicBarSize === value;
      musicBarSize.append(option);
    }
    musicBarSize.addEventListener("change", () => {
      state.musicBarSize = musicBarSize.value === "compact" ? "compact" : "standard";
      syncMusicBarSize();
      renderPlayer();
      saveState();
      showToast(state.musicBarSize === "compact" ? "Compact music bar enabled" : "Standard music bar enabled");
    });
    const musicBarWidth = createElement("select", "hub-settings-select");
    musicBarWidth.setAttribute("aria-label", "Music bar width");
    for (const [value, label] of [
      ["default", "Default (800 px)"],
      ["tight", "Tight (640 px)"],
      ["wide", "Wide (1120 px)"],
      ["full", "Full width"],
      ["custom", "Custom"]
    ]) {
      const option = createElement("option", "", label);
      option.value = value;
      option.selected = state.musicBarWidth === value;
      musicBarWidth.append(option);
    }
    const customMusicBarWidth = createElement("input", "hub-settings-number");
    customMusicBarWidth.type = "number";
    customMusicBarWidth.min = "480";
    customMusicBarWidth.max = "2000";
    customMusicBarWidth.step = "10";
    customMusicBarWidth.value = String(state.musicBarCustomWidth);
    customMusicBarWidth.hidden = state.musicBarWidth !== "custom";
    customMusicBarWidth.setAttribute("aria-label", "Custom music bar width in pixels");
    const musicBarWidthUnit = createElement("span", "hub-settings-unit", "px");
    musicBarWidthUnit.hidden = customMusicBarWidth.hidden;
    const musicBarWidthControl = createElement("div", "hub-settings-width-control");
    musicBarWidthControl.append(musicBarWidth, customMusicBarWidth, musicBarWidthUnit);
    const syncCustomWidthVisibility = () => {
      const custom = musicBarWidth.value === "custom";
      customMusicBarWidth.hidden = !custom;
      musicBarWidthUnit.hidden = !custom;
    };
    musicBarWidth.addEventListener("change", () => {
      state.musicBarWidth = MUSIC_BAR_WIDTHS.includes(musicBarWidth.value) ? musicBarWidth.value : "default";
      syncCustomWidthVisibility();
      syncMusicBarWidth();
      renderPlayer();
      saveState();
      const label = musicBarWidth.selectedOptions[0]?.textContent || "Default";
      showToast(`${label} music bar width enabled`);
    });
    customMusicBarWidth.addEventListener("input", () => {
      state.musicBarCustomWidth = customMusicBarWidth.value;
      syncMusicBarWidth();
    });
    customMusicBarWidth.addEventListener("change", () => {
      syncMusicBarWidth();
      customMusicBarWidth.value = String(state.musicBarCustomWidth);
      saveState();
      showToast(`Custom music bar width set to ${state.musicBarCustomWidth}px`);
    });
    const musicBarControls = createElement("div", "hub-settings-paired-controls");
    const musicBarSizeField = createElement("label", "hub-settings-inline-field");
    musicBarSizeField.append(createElement("span", "", "Size"), musicBarSize);
    const musicBarWidthField = createElement("label", "hub-settings-inline-field");
    musicBarWidthField.append(createElement("span", "", "Width"), musicBarWidthControl);
    musicBarControls.append(musicBarSizeField, musicBarWidthField);
    musicBarRow.append(musicBarCopy, musicBarControls);
    playback.append(musicBarRow);

    const playlistMetadataRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const playlistMetadataCopy = createElement("div", "hub-settings-copy");
    playlistMetadataCopy.append(
      createElement("strong", "", "Playlist BPM and key"),
      createElement("span", "", "Save detected analysis and show it on track cards.")
    );
    const recordPlaylistMetadata = state.recordPlaylistMetadata !== false;
    const playlistMetadataToggle = createElement("button", `hub-settings-toggle hub-playlist-metadata-toggle${recordPlaylistMetadata ? " is-active" : ""}`);
    playlistMetadataToggle.type = "button";
    playlistMetadataToggle.setAttribute("role", "switch");
    playlistMetadataToggle.setAttribute("aria-label", "Save BPM and key on playlists");
    playlistMetadataToggle.setAttribute("aria-checked", String(recordPlaylistMetadata));
    playlistMetadataToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    playlistMetadataToggle.addEventListener("click", () => {
      state.recordPlaylistMetadata = !(state.recordPlaylistMetadata !== false);
      saveState();
      render();
      showToast(state.recordPlaylistMetadata ? "Playlist BPM and key enabled" : "Playlist BPM and key disabled");
    });
    playlistMetadataRow.append(playlistMetadataCopy, playlistMetadataToggle);
    playback.append(playlistMetadataRow);

    const autoAnalyzeRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const autoAnalyzeCopy = createElement("div", "hub-settings-copy");
    autoAnalyzeCopy.append(
      createElement("strong", "", "Auto-analyze tracks"),
      createElement("span", "", "Show BPM and musical key beside tracks when an artist page opens.")
    );
    const autoAnalyzeTracks = state.autoAnalyzeTracks !== false;
    const autoAnalyzeToggle = createElement("button", `hub-settings-toggle hub-auto-analyze-toggle${autoAnalyzeTracks ? " is-active" : ""}`);
    autoAnalyzeToggle.type = "button";
    autoAnalyzeToggle.setAttribute("role", "switch");
    autoAnalyzeToggle.setAttribute("aria-label", "Auto-analyze tracks");
    autoAnalyzeToggle.setAttribute("aria-checked", String(autoAnalyzeTracks));
    autoAnalyzeToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    autoAnalyzeToggle.addEventListener("click", () => {
      state.autoAnalyzeTracks = state.autoAnalyzeTracks === false;
      saveState();
      injectPageDjToolsLink();
      render();
      showToast(state.autoAnalyzeTracks ? "Automatic track analysis enabled" : "Manual track analysis enabled");
    });
    autoAnalyzeRow.append(autoAnalyzeCopy, autoAnalyzeToggle);
    playback.append(autoAnalyzeRow);

    const showTrackKeysRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const showTrackKeysCopy = createElement("div", "hub-settings-copy");
    showTrackKeysCopy.append(
      createElement("strong", "", "Show track keys"),
      createElement("span", "", "Include Camelot and musical key columns beside analyzed BPM.")
    );
    const showTrackKeys = state.showTrackKeys !== false;
    const showTrackKeysToggle = createElement("button", `hub-settings-toggle hub-show-track-keys-toggle${showTrackKeys ? " is-active" : ""}`);
    showTrackKeysToggle.type = "button";
    showTrackKeysToggle.setAttribute("role", "switch");
    showTrackKeysToggle.setAttribute("aria-label", "Show track keys");
    showTrackKeysToggle.setAttribute("aria-checked", String(showTrackKeys));
    showTrackKeysToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    showTrackKeysToggle.addEventListener("click", () => {
      state.showTrackKeys = state.showTrackKeys === false;
      syncTrackKeyVisibilityMode();
      syncPageTrackAnalysisUi();
      saveState();
      render();
      showToast(state.showTrackKeys ? "Track keys shown" : "Track keys hidden");
    });
    showTrackKeysRow.append(showTrackKeysCopy, showTrackKeysToggle);
    playback.append(showTrackKeysRow);
    content.append(playback);

    const browsing = createElement("section", "hub-card hub-settings-card");
    browsing.append(createElement("h2", "hub-settings-heading", "Browsing"));
    const feedRow = createElement("div", "hub-settings-row");
    const feedCopy = createElement("div", "hub-settings-copy");
    feedCopy.append(
      createElement("strong", "", "Open Bandcamp to your feed"),
      createElement("span", "", "Use your music feed as the homepage.")
    );
    const openHomeToFeed = Boolean(state.openHomeToFeed);
    const feedToggle = createElement("button", `hub-settings-toggle hub-feed-home-toggle${openHomeToFeed ? " is-active" : ""}`);
    feedToggle.type = "button";
    feedToggle.setAttribute("role", "switch");
    feedToggle.setAttribute("aria-label", "Open Bandcamp to your feed");
    feedToggle.setAttribute("aria-checked", String(openHomeToFeed));
    feedToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    feedToggle.addEventListener("click", () => {
      state.openHomeToFeed = !state.openHomeToFeed;
      saveState();
      render();
    });
    feedRow.append(feedCopy, feedToggle);
    browsing.append(feedRow);
    content.append(browsing);

    const appearance = createElement("section", "hub-card hub-settings-card");
    appearance.append(createElement("h2", "hub-settings-heading", "Appearance"));
    const appearanceMode = state.appearance.applyToPage ? "theme" : "match";
    const appearanceModeRow = createElement("div", "hub-settings-row hub-appearance-mode-row");
    const appearanceModeCopy = createElement("div", "hub-settings-copy");
    appearanceModeCopy.append(
      createElement("strong", "", "Page colours"),
      createElement("span", "", appearanceMode === "theme" ? "Apply a Bandkit theme across Bandcamp." : "Follow each Bandcamp page’s colours.")
    );
    const appearanceModeControl = createElement("div", "hub-settings-segmented");
    appearanceModeControl.setAttribute("role", "radiogroup");
    appearanceModeControl.setAttribute("aria-label", "Page colour mode");
    for (const [mode, label] of [["match", "Match page"], ["theme", "Theme pages"]]) {
      const modeButton = createElement("button", `hub-settings-segment${appearanceMode === mode ? " is-active" : ""}`, label);
      modeButton.type = "button";
      modeButton.setAttribute("role", "radio");
      modeButton.setAttribute("aria-checked", String(appearanceMode === mode));
      modeButton.dataset.appearanceMode = mode;
      modeButton.addEventListener("click", () => {
        state.appearance.pageAware = mode === "match";
        state.appearance.applyToPage = mode === "theme";
        applyAppearance();
        saveState();
        render();
        showToast(mode === "theme" ? "Bandkit theme applied to Bandcamp" : "Matching Bandcamp page colours");
      });
      appearanceModeControl.append(modeButton);
    }
    appearanceModeRow.append(appearanceModeCopy, appearanceModeControl);
    appearance.append(appearanceModeRow);

    const availableThemes = [...BUILT_IN_THEMES, ...(state.appearance.savedThemes || []), {
      id: "custom",
      label: "Custom",
      accent: state.appearance.customAccent,
      scrubAccent: state.appearance.customScrubAccent || state.appearance.customAccent,
      surface: state.appearance.customSurface,
      card: state.appearance.customCard,
      background: state.appearance.customPageBackground,
      pageSurface: state.appearance.customPageSurface,
      navbar: state.appearance.customNavbar,
      text: state.appearance.customText,
      secondaryText: state.appearance.customSecondaryText
    }].map(({ id, label, accent, scrubAccent, surface, card, background, pageSurface, navbar, text, secondaryText }) => {
      const surfaceColor = hexColor(surface, { r: 255, g: 255, b: 255, a: 1 });
      const resolvedCard = card || hexString(luminance(surfaceColor) < 0.34
        ? mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.07)
        : mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.4));
      const resolvedText = text || (luminance(hexColor(pageSurface || surface, { r: 255, g: 255, b: 255, a: 1 })) < 0.34 ? "#f8fafc" : "#111827");
      const resolvedNavbar = navbar || pageSurface || surface;
      const resolvedSecondaryText = secondaryText || hexString(mixColor(
        hexColor(resolvedText, { r: 17, g: 24, b: 39, a: 1 }),
        hexColor(pageSurface || surface, surfaceColor),
        luminance(hexColor(pageSurface || surface, surfaceColor)) < 0.34 ? 0.35 : 0.42
      ));
      return {
        id, label, accent, scrubAccent, surface, card, background, pageSurface, navbar, text, secondaryText,
        resolvedCard, resolvedText, resolvedNavbar, resolvedSecondaryText
      };
    });

    const createThemePalette = (theme) => {
      const palette = createElement("span", "hub-theme-option-palette");
      palette.setAttribute("aria-hidden", "true");
      for (const colour of [theme.accent, theme.background || theme.surface, theme.pageSurface || theme.surface, theme.resolvedText]) {
        const swatch = createElement("span", "hub-theme-option-swatch");
        swatch.style.backgroundColor = colour;
        palette.append(swatch);
      }
      return palette;
    };
    const selectAppearanceTheme = (theme) => {
      state.appearance.preset = theme.id;
      if (theme.id !== "custom") {
        state.appearance.customAccent = theme.accent;
        state.appearance.customScrubAccent = theme.scrubAccent && theme.scrubAccent !== theme.accent ? theme.scrubAccent : null;
        state.appearance.customSurface = theme.surface;
        state.appearance.customCard = theme.resolvedCard;
        state.appearance.customPageBackground = theme.background || theme.surface;
        state.appearance.customPageSurface = theme.pageSurface || theme.surface;
        state.appearance.customNavbar = theme.resolvedNavbar;
        state.appearance.customText = theme.resolvedText;
        state.appearance.customSecondaryText = theme.resolvedSecondaryText;
      }
      applyAppearance();
      saveState();
      render();
    };

    if (appearanceMode === "theme") {
      const selectedTheme = availableThemes.find((theme) => theme.id === state.appearance.preset) || availableThemes[0];
      const themeField = createElement("div", "hub-theme-picker-field");
      themeField.append(createElement("p", "hub-settings-field-label", "Theme"));
      const themePicker = createElement("div", "hub-theme-picker");
      const listboxId = "hub-theme-picker-options";
      const themeTrigger = createElement("button", "hub-theme-combobox");
      themeTrigger.type = "button";
      themeTrigger.setAttribute("role", "combobox");
      themeTrigger.setAttribute("aria-label", "Theme");
      themeTrigger.setAttribute("aria-controls", listboxId);
      themeTrigger.setAttribute("aria-haspopup", "listbox");
      themeTrigger.setAttribute("aria-expanded", "false");
      themeTrigger.append(
        createThemePalette(selectedTheme),
        createElement("span", "hub-theme-combobox-label", selectedTheme.label),
        createElement("span", "hub-theme-combobox-chevron")
      );
      const themeOptions = createElement("div", "hub-theme-options");
      themeOptions.id = listboxId;
      themeOptions.setAttribute("role", "listbox");
      themeOptions.hidden = true;
      const setThemePickerOpen = (open) => {
        themeOptions.hidden = !open;
        themeTrigger.setAttribute("aria-expanded", String(open));
        themePicker.classList.toggle("is-open", open);
      };
      themeTrigger.addEventListener("click", () => setThemePickerOpen(themeOptions.hidden));
      themePicker.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || themeOptions.hidden) return;
        event.preventDefault();
        setThemePickerOpen(false);
        themeTrigger.focus();
      });
      themePicker.addEventListener("focusout", () => {
        window.setTimeout(() => {
          if (!themePicker.contains(shadow.activeElement)) setThemePickerOpen(false);
        }, 0);
      });
      for (const theme of availableThemes) {
        const option = createElement("button", `hub-theme-option${theme.id === selectedTheme.id ? " is-selected" : ""}`);
        option.type = "button";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(theme.id === selectedTheme.id));
        option.dataset.themeId = theme.id;
        option.append(
          createThemePalette(theme),
          createElement("span", "hub-theme-option-label", theme.label),
          createElement("span", "hub-theme-option-check", "✓")
        );
        option.addEventListener("click", () => selectAppearanceTheme(theme));
        themeOptions.append(option);
      }
      themePicker.append(themeTrigger, themeOptions);
      themeField.append(themePicker);
      appearance.append(themeField);

      const themeSharing = createElement("div", "hub-theme-sharing-row");
      const downloadTheme = createElement("button", "hub-settings-action hub-theme-sharing-action", "Download selected");
      downloadTheme.type = "button";
      downloadTheme.prepend(createButtonIcon("icon-download-all.svg"));
      downloadTheme.addEventListener("click", exportAppearanceTheme);
      const importThemeInput = document.createElement("input");
      importThemeInput.type = "file";
      importThemeInput.accept = ".json,application/json";
      importThemeInput.hidden = true;
      const importTheme = createElement("button", "hub-settings-action hub-theme-sharing-action", "Import theme");
      importTheme.type = "button";
      importTheme.prepend(createButtonIcon("icon-import.svg"));
      importTheme.addEventListener("click", () => importThemeInput.click());
      importThemeInput.addEventListener("change", () => {
        const file = importThemeInput.files?.[0];
        importThemeInput.value = "";
        void importAppearanceTheme(file, importTheme);
      });
      themeSharing.append(downloadTheme, importTheme, importThemeInput);
      appearance.append(themeSharing);
    }

    if (appearanceMode === "theme" && state.appearance.preset === "custom") {
      const customPanel = createElement("div", "hub-custom-theme-panel");
      const customColours = createElement("div", "hub-custom-colours");
      for (const [key, label] of [
        ["customAccent", "Accent"],
        ["customSurface", "Bandkit panel"],
        ["customCard", "Bandkit content"],
        ["customPageBackground", "Page background"],
        ["customPageSurface", "Page content"],
        ["customNavbar", "Artist navigation"],
        ["customText", "Primary text"],
        ["customSecondaryText", "Secondary text"]
      ]) {
        const field = createElement("label", "hub-colour-field");
        const input = createElement("input");
        input.type = "color";
        input.value = state.appearance[key];
        input.dataset.themeColour = key;
        input.setAttribute("aria-label", `${label} colour`);
        input.addEventListener("input", () => {
          state.appearance[key] = input.value;
          if (key === "customAccent" && !state.appearance.customScrubAccent) {
            const scrubInput = customColours.querySelector('[data-theme-colour="customScrubAccent"]');
            if (scrubInput) scrubInput.value = input.value;
          }
          applyAppearance();
          saveState();
        });
        input.addEventListener("change", render);
        field.append(createElement("span", "", label), input);
        customColours.append(field);
      }
      const scrubField = createElement("div", "hub-colour-field");
      const scrubControls = createElement("div", "hub-colour-controls");
      const matchAccent = createElement("button", "hub-colour-link", "Use accent");
      matchAccent.type = "button";
      matchAccent.disabled = !state.appearance.customScrubAccent;
      matchAccent.title = state.appearance.customScrubAccent ? "Reset track scrub to follow the accent colour" : "Track scrub is following the accent colour";
      const scrubInput = createElement("input");
      scrubInput.type = "color";
      scrubInput.value = state.appearance.customScrubAccent || state.appearance.customAccent;
      scrubInput.dataset.themeColour = "customScrubAccent";
      scrubInput.setAttribute("aria-label", "Track scrub colour");
      scrubInput.addEventListener("input", () => {
        state.appearance.customScrubAccent = scrubInput.value;
        matchAccent.disabled = false;
        matchAccent.title = "Reset track scrub to follow the accent colour";
        applyAppearance();
        saveState();
      });
      scrubInput.addEventListener("change", render);
      matchAccent.addEventListener("click", () => {
        state.appearance.customScrubAccent = null;
        applyAppearance();
        saveState();
        render();
      });
      scrubControls.append(matchAccent, scrubInput);
      scrubField.append(createElement("span", "", "Track scrub"), scrubControls);
      customColours.append(scrubField);
      const saveRow = createElement("div", "hub-save-theme-row");
      const themeName = createElement("input", "hub-theme-name");
      themeName.type = "text";
      themeName.maxLength = 28;
      themeName.placeholder = "Theme name";
      themeName.setAttribute("aria-label", "Theme name");
      const saveTheme = createElement("button", "hub-settings-action hub-save-theme", "Save theme");
      saveTheme.type = "button";
      saveTheme.addEventListener("click", () => {
        const number = (state.appearance.savedThemes || []).length + 1;
        const label = themeName.value.trim() || `Custom ${number}`;
        const savedTheme = {
          id: `saved-${Date.now()}`,
          label: label.slice(0, 28),
          accent: state.appearance.customAccent,
          scrubAccent: state.appearance.customScrubAccent || state.appearance.customAccent,
          surface: state.appearance.customSurface,
          card: state.appearance.customCard,
          background: state.appearance.customPageBackground,
          pageSurface: state.appearance.customPageSurface,
          navbar: state.appearance.customNavbar,
          text: state.appearance.customText,
          secondaryText: state.appearance.customSecondaryText
        };
        state.appearance.savedThemes = [...(state.appearance.savedThemes || []), savedTheme].slice(-12);
        state.appearance.preset = savedTheme.id;
        saveState();
        render();
        showToast(`Saved theme “${savedTheme.label}”`);
      });
      saveRow.append(themeName, saveTheme);
      customPanel.append(customColours, saveRow);
      appearance.append(customPanel);
    }
    const modernReleaseRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const modernReleaseCopy = createElement("div", "hub-settings-copy");
    modernReleaseCopy.append(
      createElement("strong", "", "Modern Bandcamp pages"),
      createElement("span", "", "Refresh legacy feeds and artist pages.")
    );
    const modernReleaseToggle = createElement("button", `hub-settings-toggle hub-modern-release-toggle${state.appearance.modernReleasePages ? " is-active" : ""}`);
    modernReleaseToggle.type = "button";
    modernReleaseToggle.setAttribute("role", "switch");
    modernReleaseToggle.setAttribute("aria-label", "Use modern Bandcamp pages");
    modernReleaseToggle.setAttribute("aria-checked", String(state.appearance.modernReleasePages));
    modernReleaseToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    modernReleaseToggle.addEventListener("click", () => {
      state.appearance.modernReleasePages = !state.appearance.modernReleasePages;
      applyAppearance();
      saveState();
      render();
      showToast(state.appearance.modernReleasePages ? "Modern Bandcamp pages enabled" : "Classic Bandcamp pages restored");
    });
    modernReleaseRow.append(modernReleaseCopy, modernReleaseToggle);
    appearance.append(modernReleaseRow);

    const pageActionLabelsRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const pageActionLabelsCopy = createElement("div", "hub-settings-copy");
    pageActionLabelsCopy.append(
      createElement("strong", "", "Page icon labels"),
      createElement("span", "", "Show text beside Bandkit-enhanced page actions.")
    );
    const pageActionLabels = Boolean(state.pageActionLabels);
    const pageActionLabelsToggle = createElement("button", `hub-settings-toggle hub-page-action-labels-toggle${pageActionLabels ? " is-active" : ""}`);
    pageActionLabelsToggle.type = "button";
    pageActionLabelsToggle.setAttribute("role", "switch");
    pageActionLabelsToggle.setAttribute("aria-label", "Show page icon labels");
    pageActionLabelsToggle.setAttribute("aria-checked", String(pageActionLabels));
    pageActionLabelsToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    pageActionLabelsToggle.addEventListener("click", () => {
      state.pageActionLabels = !state.pageActionLabels;
      syncPageActionLabelMode();
      saveState();
      pageActionsDirty = true;
      injectPageDjToolsLink();
      injectPlaylistButtons();
      render();
      showToast(state.pageActionLabels ? "Page icon labels enabled" : "Compact page icons enabled");
    });
    pageActionLabelsRow.append(pageActionLabelsCopy, pageActionLabelsToggle);
    appearance.append(pageActionLabelsRow);

    const hideCartRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const hideCartCopy = createElement("div", "hub-settings-copy");
    hideCartCopy.append(
      createElement("strong", "", "Hide shopping cart"),
      createElement("span", "", "Use Bandkit’s Cart panel instead of Bandcamp’s carts.")
    );
    const hideShoppingCart = Boolean(state.appearance.hidePageCart || state.appearance.hideHeaderCart);
    const hideCartToggle = createElement("button", `hub-settings-toggle hub-hide-cart-toggle${hideShoppingCart ? " is-active" : ""}`);
    hideCartToggle.type = "button";
    hideCartToggle.setAttribute("role", "switch");
    hideCartToggle.setAttribute("aria-label", "Hide shopping cart");
    hideCartToggle.setAttribute("aria-checked", String(hideShoppingCart));
    hideCartToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    hideCartToggle.addEventListener("click", () => {
      const enabled = !hideShoppingCart;
      state.appearance.hidePageCart = enabled;
      state.appearance.hideHeaderCart = enabled;
      applyNativeCartVisibility();
      saveState();
      render();
    });
    hideCartRow.append(hideCartCopy, hideCartToggle);
    appearance.append(hideCartRow);

    const nativePlayerRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const nativePlayerCopy = createElement("div", "hub-settings-copy");
    nativePlayerCopy.append(
      createElement("strong", "", "Hide Bandcamp music player"),
      createElement("span", "", "Use only Bandkit’s music player.")
    );
    const hideBandcampPlayer = Boolean(state.appearance.hideBandcampPlayer);
    const nativePlayerToggle = createElement("button", `hub-settings-toggle${hideBandcampPlayer ? " is-active" : ""}`);
    nativePlayerToggle.type = "button";
    nativePlayerToggle.setAttribute("role", "switch");
    nativePlayerToggle.setAttribute("aria-label", "Hide Bandcamp music player");
    nativePlayerToggle.setAttribute("aria-checked", String(hideBandcampPlayer));
    nativePlayerToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    nativePlayerToggle.addEventListener("click", () => {
      state.appearance.hideBandcampPlayer = !state.appearance.hideBandcampPlayer;
      applyNativePlayerVisibility();
      saveState();
      render();
    });
    nativePlayerRow.append(nativePlayerCopy, nativePlayerToggle);
    appearance.append(nativePlayerRow);

    if (!state.appearance.pageAware) {
      const accessibleTheme = accessibleAppearanceTheme();
      const accessibility = createElement("div", `hub-theme-accessibility${accessibleTheme.adjusted ? " is-adjusted" : ""}`);
      accessibility.append(
        createElement("strong", "", accessibleTheme.adjusted ? "Contrast adjusted automatically" : "Accessible contrast"),
        createElement("span", "", `Text ${accessibleTheme.textContrast.toFixed(1)}:1 · controls ${accessibleTheme.accentContrast.toFixed(1)}:1`)
      );
      appearance.append(accessibility);
    }
    content.append(appearance);

    const feedback = createElement("section", "hub-card hub-settings-card");
    feedback.append(createElement("h2", "hub-settings-heading", "Feedback"));
    const feedbackCopy = createElement("div", "hub-settings-copy");
    feedbackCopy.append(
      createElement("strong", "", "Help improve Bandkit"),
      createElement("span", "", "Report a bug or suggest a feature. Submissions and attachments are public.")
    );
    const feedbackActions = createElement("div", "hub-settings-feedback-actions");
    const sendFeedback = createElement("a", "hub-settings-action", "Send feedback");
    sendFeedback.href = FEEDBACK_FORM_URL;
    sendFeedback.target = "_blank";
    sendFeedback.rel = "noopener noreferrer";
    const viewFeedback = createElement("a", "hub-settings-action", "View feedback");
    viewFeedback.href = FEEDBACK_LIST_URL;
    viewFeedback.target = "_blank";
    viewFeedback.rel = "noopener noreferrer";
    feedbackActions.append(sendFeedback, viewFeedback);
    feedback.append(feedbackCopy, feedbackActions);
    content.append(feedback);

    const privacy = createElement("section", "hub-card hub-settings-card");
    privacy.append(createElement("h2", "hub-settings-heading", "Privacy and data"));
    const dataHomeRow = createElement("div", "hub-settings-row hub-data-home-row");
    const dataHomeCopy = createElement("div", "hub-settings-copy");
    dataHomeCopy.append(
      createElement("strong", "", "Your data folder"),
      createElement("span", "hub-data-home-location", state.dataFolderName
        ? `Location: ${state.dataFolderName}`
        : `Not set · default: Documents/${DEFAULT_DATA_FOLDER}`)
    );
    const chooseDataHome = createElement("button", "hub-settings-action hub-data-home-action", state.dataFolderName ? "Change" : "Choose");
    chooseDataHome.type = "button";
    chooseDataHome.addEventListener("click", async () => {
      chooseDataHome.disabled = true;
      try {
        await savePortableDataHome();
        render();
      } catch (error) {
        if (error?.name !== "AbortError") showToast(error?.message || "Bandkit could not write to that folder.");
      } finally {
        chooseDataHome.disabled = false;
      }
    });
    dataHomeRow.append(dataHomeCopy, chooseDataHome);
    const deleteData = createElement("button", "hub-settings-action hub-settings-danger", "Delete all Bandkit data");
    deleteData.type = "button";
    deleteData.addEventListener("click", async () => {
      if (!window.confirm("Delete all Bandkit settings, playlists, cart backups, activity and playback data from this browser? Portable copies in your data folder will not be deleted. This cannot be undone.")) return;
      deleteData.disabled = true;
      storageDisabled = true;
      const response = await runtimeMessage({ type: MESSAGES.DELETE_ALL_DATA });
      if (!response?.ok) {
        storageDisabled = false;
        deleteData.disabled = false;
        showToast(response?.error || "Bandkit data could not be deleted.");
        return;
      }
      state = structuredClone(defaultState);
      layoutRevision = 0;
      showToast("All Bandkit data deleted");
      window.setTimeout(() => location.reload(), 500);
    });
    privacy.append(
      dataHomeRow,
      deleteData
    );
    content.append(privacy);

    const about = createElement("section", "hub-card hub-settings-card");
    about.append(createElement("h2", "hub-settings-heading", "About"));
    const aboutRow = createElement("div", "hub-settings-row hub-about-brand");
    const aboutIcon = document.createElement("img");
    aboutIcon.className = "hub-about-brand-icon";
    aboutIcon.src = asset("icon-bandkit.svg");
    aboutIcon.alt = "";
    const aboutCopy = createElement("div", "hub-settings-copy");
    aboutCopy.append(
      createElement("strong", "", "Bandkit"),
      createElement("span", "hub-settings-version", `Release v${chrome.runtime.getManifest().version}`)
    );
    aboutRow.append(aboutIcon, aboutCopy);
    about.append(createElement("p", "hub-settings-note", "Shortcut: Alt+Shift+B toggles the panel."), aboutRow);
    content.append(about);

    const support = createElement("section", "hub-card hub-settings-card hub-support-card");
    support.append(createElement("h2", "hub-settings-heading", "Support"));
    const supportCopy = createElement("div", "hub-settings-copy hub-support-copy");
    supportCopy.append(
      createElement("strong", "", "Enjoying Bandkit?"),
      createElement("span", "", "Support continued development with a one-off tip. Payment is handled securely by Stripe.")
    );
    const supportLink = createElement("a", "hub-settings-action hub-support-action", "Support Bandkit");
    supportLink.href = SUPPORT_PAYMENT_URL;
    supportLink.target = "_blank";
    supportLink.rel = "noopener noreferrer";
    support.append(supportCopy, supportLink);
    content.append(support);
  }

  function syncPlayerSectionGeometry() {
    playerSectionGeometryFrame = 0;
    const rect = panel.getBoundingClientRect();
    if (!rect.width) return;
    const signature = `${Math.round(rect.left)}|${Math.round(rect.width)}`;
    if (signature === playerSectionGeometrySignature) return;
    playerSectionGeometrySignature = signature;
    player.style.setProperty("--hub-sections-center-x", `${Math.round(rect.left + rect.width / 2)}px`);
    player.style.setProperty("--hub-sections-panel-width", `${Math.round(rect.width)}px`);
  }

  function schedulePlayerSectionGeometry() {
    if (playerSectionGeometryFrame) return;
    playerSectionGeometryFrame = window.requestAnimationFrame(syncPlayerSectionGeometry);
  }

  function renderPlayer() {
    syncMusicBarSize();
    syncMusicBarWidth();
    syncScrubberStyles();
    const hasCurrentTrack = Boolean(live.hasPlaybackStarted && live.title);
    const playbackLoading = Boolean(seamless.enabled && seamless.status === "loading");
    playButton.disabled = !hasCurrentTrack || playbackLoading;
    playButton.setAttribute("aria-disabled", String(!hasCurrentTrack || playbackLoading));
    playButton.setAttribute("aria-label", playbackLoading ? `Loading ${live.title || "track"}` : "Play or pause");
    playerTrack.classList.toggle("is-empty", !hasCurrentTrack);
    const trackRenderSignature = hasCurrentTrack
      ? `${live.title}\u0000${live.artist}\u0000${live.art}\u0000${live.pageUrl}\u0000${live.artistUrl}`
      : "empty";
    if (trackRenderSignature !== playerTrackRenderSignature) {
      playerTrackRenderSignature = trackRenderSignature;
      if (hasCurrentTrack) {
        const playerArtUrl = resolveImage(live.art);
        if (playerArtUrl) playerArt.src = playerArtUrl;
        else playerArt.removeAttribute("src");
        playerArtLink.hidden = !playerArtUrl;
        playerArt.alt = "";
        playerTitle.textContent = live.title;
        playerArtist.textContent = live.artist;
        updatePageLink(playerArtLink, live.pageUrl);
        playerArtLink.setAttribute("aria-label", `Open ${live.title}`);
        updatePageLink(playerTitle, live.pageUrl);
        updatePageLink(playerArtist, live.artistUrl || live.pageUrl);
      } else {
        playerArt.removeAttribute("src");
        playerArtLink.hidden = true;
        playerArt.alt = "";
        playerTitle.textContent = "";
        playerArtist.textContent = "";
        updatePageLink(playerArtLink, "");
        playerArtLink.removeAttribute("aria-label");
        updatePageLink(playerTitle, "");
        updatePageLink(playerArtist, "");
      }
    }
    const playbackRenderState = live.isPlaying ? "playing" : "paused";
    if (playbackRenderState !== playerPlaybackRenderState) {
      playerPlaybackRenderState = playbackRenderState;
      playButton.replaceChildren(createElement("span", live.isPlaying ? "hub-pause-glyph" : "hub-play-glyph"));
    }
    const audio = seamless.enabled ? null : getAudio();
    const duration = seamless.enabled ? Number(seamless.duration) || 0 : Number(audio?.duration) || Number(live.duration) || 0;
    const currentTime = seamless.enabled ? Number(seamless.currentTime) || 0 : Number(audio?.currentTime) || Number(live.currentTime) || 0;
    if (!scrubbing) {
      scrubSlider.value = String(duration ? Math.round(Math.max(0, Math.min(1, currentTime / duration)) * 1000) : 0);
      currentTimeLabel.textContent = formatDuration(currentTime);
    }
    syncScrubVisual();
    refreshScrubWaveform();
    scrubSlider.setAttribute("aria-valuetext", `${formatDuration((Number(scrubSlider.value) / 1000) * duration)} of ${formatDuration(duration)}`);
    scrubControl.classList.toggle("is-empty", !duration);
    durationLabel.textContent = formatDuration(duration);
    const queuedTracks = state.playlist.length
      ? state.playlist.length
      : seamless.enabled && Array.isArray(seamless.queue) && seamless.queue.length
      ? seamless.queue.length
      : (live.hasPlaybackStarted ? 1 : 0) + (Array.isArray(live.tracks) ? live.tracks.length : 0);
    nowPlayingCount.textContent = String(queuedTracks);
    nowPlayingButton.classList.toggle("is-active", state.open && state.activeTab === "nowPlaying");
    nowPlayingButton.setAttribute("aria-expanded", String(state.open && state.activeTab === "nowPlaying"));
    const djPlayerButtonRect = djPlayerButton.getBoundingClientRect();
    player.style.setProperty("--hub-dj-anchor-x", `${Math.round(djPlayerButtonRect.left + djPlayerButtonRect.width / 2)}px`);
    renderPlayerMoreActions();
  }

  function setOpen(open) {
    state.open = open;
    saveState();
    saveLayoutState();
    render();
  }

  function openBandKitCart() {
    closePagePlaylistMenu();
    state.open = true;
    state.activeTab = "cart";
    state.cartView = "current";
    state.selectedSavedCartId = null;
    saveState();
    saveLayoutState();
    render();
  }

  function handleNativeHeaderCart(event) {
    if (!state.appearance.hideHeaderCart) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("#user-nav, ul[role='menubar'].menu-items") || target.closest("#bandcamp-hub-extension-root")) return;
    const cartControl = target.closest([
      "a[href*='/cart']",
      "a[href*='bandcamp.com/cart']",
      "[aria-label*='cart' i]",
      "[title*='cart' i]",
      ".cart-link",
      "#cart-link",
      "#cart-control"
    ].join(","));
    if (!cartControl) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openBandKitCart();
  }

  function syncPageDjToolsUi() {
    for (const button of document.querySelectorAll(".bandcamp-hub-page-dj")) {
      button.classList.toggle("is-active", pageDjOpen);
      button.setAttribute("aria-expanded", String(pageDjOpen));
      button.setAttribute("aria-pressed", String(pageDjOpen));
      button.title = pageDjOpen ? "Hide DJ tools on this page" : "Show DJ tools on this page";
      button.setAttribute("aria-label", button.title);
    }
  }

  function renderPageDjTools() {
    if (!pageDjHost?.isConnected || !pageDjSurface) return;
    pageDjHost.hidden = !pageDjOpen;
    pageDjSurface.replaceChildren();
    if (pageDjOpen) pageDjSurface.append(createDjToolsCard({ includeWaveform: false }));
    syncPageDjToolsUi();
  }

  function toggleDjTools() {
    state.dj.open = !state.dj.open;
    saveState();
    renderDjTools();
  }

  function togglePageDjTools() {
    pageDjOpen = !pageDjOpen;
    state.dj.pageOpen = pageDjOpen;
    saveState();
    renderPageDjTools();
  }

  function parseJsonAttribute(element, attribute) {
    try {
      return JSON.parse(element?.getAttribute(attribute) || "null");
    } catch {
      return null;
    }
  }

  function getBandcampPageData() {
    const script = document.querySelector("script[data-tralbum]");
    if (!script) return null;
    const tralbum = parseJsonAttribute(script, "data-tralbum");
    const embed = parseJsonAttribute(script, "data-embed");
    if (!tralbum) return null;
    return { tralbum, embed };
  }

  function getAudio() {
    const all = [...document.querySelectorAll("audio")];
    return all.find((audio) => !audio.paused && !audio.ended) || all[0] || null;
  }

  function setDjTempo(percent) {
    const clamped = Math.max(-state.dj.range, Math.min(state.dj.range, Number(percent) || 0));
    state.dj.rate = Math.round((1 + clamped / 100) * 1000) / 1000;
    applyDjToAudio();
  }

  function applyDjToAudio(target = getAudio()) {
    if (seamless.enabled) {
      void seamlessCommand(MESSAGES.SEAMLESS_SET_DJ, {
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        filterValue: state.dj.filterValue,
        gainDb: state.dj.gainDb,
        eqLowDb: state.dj.eqLowDb,
        eqMidDb: state.dj.eqMidDb,
        eqHighDb: state.dj.eqHighDb
      });
      return true;
    }
    if (!target && getDiscoverPlayerState()) {
      pageMediaCommand("setDj", {
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        gainDb: state.dj.gainDb
      });
      return true;
    }
    if (!target) return false;
    if (Math.abs(target.playbackRate - state.dj.rate) > 0.001) target.playbackRate = state.dj.rate;
    target.defaultPlaybackRate = state.dj.rate;
    if ("preservesPitch" in target) target.preservesPitch = state.dj.preservePitch;
    if ("webkitPreservesPitch" in target) target.webkitPreservesPitch = state.dj.preservePitch;
    target.volume = state.dj.gainDb <= -30 ? 0 : Math.min(1, Math.pow(10, state.dj.gainDb / 20));
    return true;
  }

  function itemFromNode(node) {
    if (!node) return null;
    const title = node.dataset.title || node.dataset.albumtitle || elementText(node, [".track-title", ".release-title", ".title", "h3", "h4"]);
    if (!title) return null;
    const pageUrl = node.querySelector("a[href*='bandcamp.com'], a[href^='/']")?.href || location.href;
    return {
      title,
      artist: node.dataset.artist || elementText(node, [".artist", ".by-artist", ".band-name", ".subtitle"]) || "Bandcamp",
      art: node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || live.art,
      pageUrl,
      artistUrl: artistUrlFromPageUrl(pageUrl)
    };
  }

  function modernPlayerSourceContext(player, key) {
    if (!key) return null;
    const sourceControl = [...document.querySelectorAll(".play-pause-button[tracklistkey]")]
      .find((control) => !player.contains(control) && control.getAttribute("tracklistkey") === key);
    return sourceControl?.closest([
      ".collection-item-container",
      ".results-grid-item",
      ".carousel-item",
      ".story",
      ".story-innards",
      "li",
      "article",
      "section"
    ].join(",")) || sourceControl?.parentElement || null;
  }

  function modernReleasePageUrl(value) {
    const safeUrl = safeBandcampReleaseUrl(value);
    if (!safeUrl) return "";
    try {
      return /^\/(?:album|track)\/[^/]+/.test(new URL(safeUrl).pathname) ? safeUrl : "";
    } catch {
      return "";
    }
  }

  function modernTrackPageUrl(node, sourceContext) {
    const scopes = [node, node.closest("li"), sourceContext].filter(Boolean);
    for (const scope of scopes) {
      const metadataNode = scope.matches?.("[data-item-json]") ? scope : scope.querySelector?.("[data-item-json]");
      const itemData = parseJsonAttribute(metadataNode, "data-item-json") || {};
      const attributeUrl = itemData.item_url
        || node.getAttribute("data-track-url")
        || node.getAttribute("trackurl")
        || node.getAttribute("data-item-url")
        || node.getAttribute("itemurl");
      const resolvedAttributeUrl = modernReleasePageUrl(attributeUrl);
      if (resolvedAttributeUrl) return resolvedAttributeUrl;
      for (const link of scope.querySelectorAll?.("a[href]") || []) {
        const resolvedLink = modernReleasePageUrl(link.href);
        if (resolvedLink) return resolvedLink;
      }
    }
    return modernReleasePageUrl(location.href);
  }

  function modernTrackArtistUrl(node, pageUrl) {
    for (const scope of [node, node.closest("li")].filter(Boolean)) {
      for (const link of scope.querySelectorAll?.("a[href]") || []) {
        const identifiesArtist = link.querySelector?.(".artist-name")
          || /^by\s+/i.test(String(link.textContent || "").trim());
        if (!identifiesArtist) continue;
        const artistUrl = safeBandcampUrl(link.href);
        if (!artistUrl || modernReleasePageUrl(artistUrl)) continue;
        return artistUrl;
      }
    }
    return artistUrlFromPageUrl(pageUrl);
  }

  function getModernPlaylistSeed(key = "") {
    const page = document.querySelector("#PlaylistPage[data-blob]");
    const payload = parseJsonAttribute(page, "data-blob");
    const tracklist = payload?.appData?.tracklist;
    const itemId = Number(tracklist?.itemId || payload?.appData?.playlistId);
    if (!itemId || tracklist?.itemType !== "playlist" || !Array.isArray(tracklist.tracks)) return null;
    if (key && key !== `playlist:${itemId}`) return null;
    return {
      itemId,
      title: String(tracklist.title || payload?.appData?.title || document.title),
      tracks: tracklist.tracks,
      nextCursor: tracklist.nextCursor ?? null,
      totalCount: Number(tracklist.tracksSummary?.totalCount) || tracklist.tracks.length
    };
  }

  function modernPlaylistTrack(item, playlistTitle, sourceIndex) {
    if (!item || !isReusableStreamUrl(item.streamUrl)) return null;
    const artId = Number(item.artId || item.album?.artId);
    const pageUrl = modernReleasePageUrl(item.url || item.album?.url) || safeBandcampUrl(item.url || item.album?.url);
    const artistUrl = safeBandcampUrl(item.bandUrl) || artistUrlFromPageUrl(pageUrl);
    return {
      id: String(item.id || `${item.streamUrl}|${sourceIndex}`),
      title: String(item.title || `Bandcamp track ${sourceIndex + 1}`),
      artist: String(item.artistName || "Bandcamp"),
      album: playlistTitle,
      art: artId ? `https://f4.bcbits.com/img/a${artId}_7.jpg` : "",
      pageUrl,
      artistUrl,
      duration: Number(item.duration) || 0,
      url: item.streamUrl,
      sourceIndex
    };
  }

  async function loadModernPlaylistQueue(modern) {
    const seed = modern?.playlistSeed;
    if (!seed) return {
      queue: modern?.queue || [],
      sourceToQueue: new Map((modern?.queue || []).map((_, index) => [index, index]))
    };
    const cacheKey = `${seed.itemId}|${seed.tracks[0]?.streamUrl || ""}`;
    if (!modernPlaylistQueueCache.has(cacheKey)) {
      modernPlaylistQueueCache.set(cacheKey, (async () => {
        const tracks = [...seed.tracks];
        let nextCursor = seed.nextCursor;
        const seenCursors = new Set();
        while (nextCursor !== null && nextCursor !== undefined && tracks.length < Math.min(MAX_PLAYLIST_ITEMS, seed.totalCount)) {
          const cursorKey = String(nextCursor);
          if (seenCursors.has(cursorKey)) break;
          seenCursors.add(cursorKey);
          try {
            const response = await fetch("/api/player/2/player_data_web", {
              method: "POST",
              headers: { "Content-Type": "application/json; charset=UTF-8" },
              body: JSON.stringify({ item_type: "playlist", item_id: seed.itemId, next_cursor: nextCursor })
            });
            if (!response.ok) break;
            const payload = await response.json();
            const page = payload?.tracklist;
            if (!page || !Array.isArray(page.tracks) || !page.tracks.length) break;
            tracks.push(...page.tracks);
            nextCursor = page.nextCursor ?? null;
          } catch {
            break;
          }
        }
        return tracks.slice(0, MAX_PLAYLIST_ITEMS);
      })());
    }
    const sourceTracks = await modernPlaylistQueueCache.get(cacheKey);
    const queue = [];
    const sourceToQueue = new Map();
    sourceTracks.forEach((item, sourceIndex) => {
      const track = modernPlaylistTrack(item, seed.title, sourceIndex);
      if (!track) return;
      sourceToQueue.set(sourceIndex, queue.length);
      queue.push(track);
    });
    return { queue, sourceToQueue };
  }

  function getModernPlayerState() {
    const player = document.querySelector("section.floating-player.has-track, section.floating-player:has(.track-meta[streamurl])");
    if (!player) return null;
    const key = player.querySelector(".play-pause-button:is(.outline, .outline-opaque)[tracklistkey], .play-pause-button[tracklistkey]")?.getAttribute("tracklistkey") || "";
    const sourceContext = modernPlayerSourceContext(player, key);
    const playlistSeed = getModernPlaylistSeed(key);
    const sourceMetadataNode = sourceContext?.matches?.("[data-item-json]") ? sourceContext : sourceContext?.querySelector?.("[data-item-json]");
    const sourceItemData = parseJsonAttribute(sourceMetadataNode, "data-item-json") || {};
    const sourceAlbum = sourceItemData.item_title
      || (sourceContext ? elementText(sourceContext, [".collection-item-title", ".release-title", ".title"]) : "")
      || "";
    const candidates = [...player.querySelectorAll(".meta-wrapper-wide .track-meta[streamurl], .track-meta[streamurl]")];
    const unique = [...new Map(candidates.map((node) => [node.getAttribute("streamurl"), node])).values()];
    const domQueue = unique.map((node, index) => {
      const pageUrl = modernTrackPageUrl(node, sourceContext);
      const artist = elementText(node, [".artist-name"]).replace(/^by\s+/i, "") || "Bandcamp";
      return {
        id: node.id || `${node.getAttribute("streamurl")}|${index}`,
        title: elementText(node, [".title-text", ".track-title", ".title"]) || `Bandcamp track ${index + 1}`,
        artist,
        album: sourceAlbum || document.title,
        art: node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || sourceContext?.querySelector("img")?.currentSrc || sourceContext?.querySelector("img")?.src || "",
        pageUrl,
        artistUrl: modernTrackArtistUrl(node, pageUrl),
        duration: Number(node.getAttribute("duration")) || 0,
        url: node.getAttribute("streamurl") || ""
      };
    }).filter((track) => /^https:\/\/[^/]*\.bcbits\.com\//.test(track.url));
    const seedQueue = playlistSeed?.tracks
      .map((item, sourceIndex) => modernPlaylistTrack(item, playlistSeed.title, sourceIndex))
      .filter(Boolean) || [];
    const queue = seedQueue.length ? seedQueue : domQueue;
    if (!queue.length) return null;
    const currentNode = unique.find((node) => node.closest(".currently-playing"));
    const currentUrl = currentNode?.getAttribute("streamurl") || "";
    const index = Math.max(0, queue.findIndex((track) => track.url === currentUrl));
    const currentControl = currentNode?.closest(".track-list-item")?.querySelector(".play-pause-button[trackindex]");
    const sourceIndex = currentControl?.hasAttribute("trackindex")
      ? Number(currentControl.getAttribute("trackindex"))
      : Number(queue[index]?.sourceIndex ?? index);
    const timeline = player.querySelector("input[type='range']");
    const isPlaying = Boolean(player.querySelector(".play-pause-button[aria-label='Pause']"));
    return {
      player,
      queue,
      index,
      sourceIndex,
      track: queue[index],
      currentTime: Number(timeline?.value) || 0,
      duration: Number(timeline?.max) || queue[index]?.duration || 0,
      isPlaying,
      key,
      isPlaylistPage: Boolean(playlistSeed),
      playlistSeed
    };
  }

  function modernPlayerLinksReady(modern) {
    return Boolean(modern?.queue.length && modern.queue.every((track) => modernReleasePageUrl(track.pageUrl)));
  }

  function getDiscoverPlayerState() {
    const player = document.querySelector(".discover-player");
    if (!player) return null;
    const control = player.querySelector(".play-pause-button");
    const focused = player.closest(".focused-result") || player.parentElement;
    const links = [...player.querySelectorAll(".player-info a[href], a[href]")];
    const albumLink = links.find((link) => /^from\s+/i.test(link.textContent || "")) || links.find((link) => /album\//.test(link.href));
    const artistLink = links.find((link) => /^by\s+/i.test(link.textContent || ""));
    const title = elementText(player, [".player-info .title", ".title"]);
    if (!title) return null;
    const pageUrl = albumLink?.href || focused?.querySelector("a[href*='bandcamp.com']")?.href || location.href;
    const artistUrl = artistLink?.href || artistUrlFromPageUrl(pageUrl);
    const artist = (artistLink?.textContent || "Bandcamp").replace(/^by\s+/i, "").trim() || "Bandcamp";
    const displayedCurrentTime = parseClock(elementText(player, [".playback-time.current"]));
    const displayedDuration = parseClock(elementText(player, [".playback-time.total"]));
    const currentTime = Number(bridgedMedia?.currentTime) || displayedCurrentTime;
    const duration = Number(bridgedMedia?.duration) || displayedDuration;
    const timeline = player.querySelector("input[type='range']");
    const sliderProgress = Number(timeline?.value);
    const progress = Number.isFinite(sliderProgress) ? sliderProgress : duration ? currentTime / duration : 0;
    return {
      player,
      control,
      timeline,
      isPlaying: control?.getAttribute("aria-label") === "Pause" || Boolean(bridgedMedia && !bridgedMedia.paused && !bridgedMedia.ended),
      currentTime,
      duration,
      progress: Math.max(0, Math.min(1, progress)),
      track: {
        id: `${pageUrl}|${title}`,
        title,
        artist,
        album: (albumLink?.textContent || "").replace(/^from\s+/i, "").trim(),
        art: focused?.querySelector("img[alt^='View'], img")?.currentSrc || focused?.querySelector("img[alt^='View'], img")?.src || live.art,
        pageUrl,
        artistUrl,
        duration,
        url: bridgedMedia?.src || ""
      },
      queue: []
    };
  }

  function feedStreamTrackId(value) {
    try {
      return new URL(value || "", location.href).searchParams.get("track_id") || "";
    } catch {
      return "";
    }
  }

  function getFeedPlayerState(preferredTrackId = "") {
    if (!document.body.classList.contains("feed") && !/\/feed\/?$/.test(location.pathname)) return null;
    const audio = getAudio();
    const audioTrackId = feedStreamTrackId(audio?.currentSrc || audio?.src);
    const playingNode = document.querySelector(".collection-item-container.playing[data-trackid]");
    const trackId = String(preferredTrackId || playingNode?.dataset.trackid || audioTrackId);
    if (!trackId) return null;
    if (preferredTrackId && audioTrackId !== trackId) return null;
    const matchingNodes = [...document.querySelectorAll(".collection-item-container[data-trackid]")]
      .filter((node) => node.dataset.trackid === trackId);
    const metadataNode = matchingNodes.find((node) => node.dataset.itemJson) || playingNode || matchingNodes[0];
    if (!metadataNode) return null;
    const itemData = parseJsonAttribute(metadataNode, "data-item-json") || {};
    const storyNode = matchingNodes.find((node) => node.classList.contains("story-innards")) || metadataNode;
    const itemLink = storyNode.querySelector("a.item-link[href]") || metadataNode.querySelector("a.item-link[href], a[href*='bandcamp.com/album/'], a[href*='bandcamp.com/track/']");
    const artistLink = storyNode.querySelector("a.artist-name[href]");
    const pageUrl = itemData.item_url || itemLink?.href || location.href;
    const artistUrl = itemData.band_url || artistLink?.href || artistUrlFromPageUrl(pageUrl);
    const title = itemData.featured_track_title || elementText(storyNode, [".fav-track-title", ".collection-item-title", ".waypoint-item-title"]);
    if (!title) return null;
    const artist = itemData.band_name || elementText(storyNode, [".collection-item-artist", ".artist-name", ".waypoint-artist-title"]).replace(/^by\s+/i, "") || "Bandcamp";
    const duration = Number(audio?.duration) || Number(itemData.featured_track_duration) || parseClock(elementText(storyNode, [".time_total"]));
    const currentTime = Number(audio?.currentTime) || parseClock(elementText(storyNode, [".time_elapsed"]));
    const control = storyNode.querySelector(".track_play_auxiliary") || metadataNode.querySelector(".track_play_auxiliary") || document.querySelector(`.track_play_auxiliary[data-trackid="${trackId}"]`);
    return {
      player: storyNode,
      control,
      isPlaying: Boolean(audio && !audio.paused && !audio.ended),
      currentTime,
      duration,
      progress: duration ? Math.max(0, Math.min(1, currentTime / duration)) : 0,
      track: {
        id: String(trackId),
        title,
        artist,
        album: itemData.item_title || elementText(storyNode, [".collection-item-title"]),
        art: itemData.item_art_url || storyNode.querySelector(".tralbum-art-large, img")?.currentSrc || storyNode.querySelector(".tralbum-art-large, img")?.src || live.art,
        pageUrl,
        artistUrl,
        duration,
        url: audio?.currentSrc || audio?.src || ""
      },
      queue: []
    };
  }

  function suppressRemovedFeedTrack(item) {
    const feed = getFeedPlayerState();
    if (!feed?.track || !matchingQueueTrack([item], feed.track)) return;
    suppressedFeedTrackId = String(feed.track.id || item?.id || "");
    pendingFeedTrackId = "";
    window.clearTimeout(feedHandoffTimer);
    const audio = getAudio();
    if (audio && !audio.paused) audio.pause();
  }

  function muteFeedAudioForHandoff(trackId) {
    const audio = getAudio();
    if (!audio) return;
    if (mutedFeedAudio !== audio) {
      if (mutedFeedAudio) mutedFeedAudio.muted = mutedFeedAudioWasMuted;
      mutedFeedAudio = audio;
      mutedFeedAudioWasMuted = Boolean(audio.muted);
    }
    mutedFeedTrackId = String(trackId || "");
    audio.muted = true;
  }

  function restoreFeedAudioMute(trackId = "") {
    if (!mutedFeedAudio || (trackId && mutedFeedTrackId && String(trackId) !== mutedFeedTrackId)) return;
    mutedFeedAudio.muted = mutedFeedAudioWasMuted;
    mutedFeedAudio = null;
    mutedFeedAudioWasMuted = false;
    mutedFeedTrackId = "";
  }

  function stopModernPagePlayer() {
    const button = document.querySelector("section.floating-player .play-pause-button.outline[aria-label='Pause'], section.floating-player .player-controls .play-pause-button[aria-label='Pause']");
    if (!button) return;
    suppressModernControl = true;
    button.click();
    window.setTimeout(() => {
      suppressModernControl = false;
    }, 0);
  }

  function silenceNativePagePlayback() {
    pageMediaCommand("pauseAll");
    for (const media of document.querySelectorAll("audio, video")) {
      if (!media.paused) media.pause();
    }
    stopModernPagePlayer();
  }

  async function handoffModernPlayer(requestedIndex = null) {
    const modern = getModernPlayerState();
    if (!modern) return false;
    const sourceIndex = requestedIndex === null ? modern.sourceIndex : Math.max(0, Number(requestedIndex) || 0);
    const requestedTrackKey = playlistTrackKey(modern.queue.find((track) => Number(track.sourceIndex) === sourceIndex))
      || `${modern.key}:${sourceIndex}`;
    if (modernHandoffBusy) {
      if (requestedTrackKey && (requestedTrackKey !== modernHandoffTrackKey || modernHandoffSuperseded)) {
        if (!modernHandoffSuperseded) playlistPlayRequest += 1;
        modernHandoffSuperseded = true;
        modernHandoffPendingIndex = sourceIndex;
      }
      return false;
    }
    modernHandoffBusy = true;
    modernHandoffTrackKey = requestedTrackKey;
    modernHandoffSuperseded = false;
    silenceNativePagePlayback();
    try {
      const loaded = await loadModernPlaylistQueue(modern);
      if (modernHandoffSuperseded) return false;
      const index = loaded.sourceToQueue.get(sourceIndex);
      if (index === undefined || !loaded.queue[index]) return false;
      const prepared = await prepareExternalNowPlaying(loaded.queue[index], loaded.queue, {
        trustProvidedStreams: true,
        replaceQueue: modern.isPlaylistPage
      });
      if (modernHandoffSuperseded) return false;
      if (prepared.index < 0) return false;
      const response = await runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE,
        queue: prepared.queue,
        index: prepared.index,
        currentTime: requestedIndex === null ? modern.currentTime : 0,
        autoplay: true,
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        filterValue: state.dj.filterValue,
        gainDb: state.dj.gainDb,
        eqLowDb: state.dj.eqLowDb,
        eqMidDb: state.dj.eqMidDb,
        eqHighDb: state.dj.eqHighDb
      });
      if (!response?.ok) return false;
      if (prepared.request !== playlistPlayRequest) return false;
      stopModernPagePlayer();
      applySeamlessState(response.state);
      return true;
    } finally {
      modernHandoffBusy = false;
      modernHandoffTrackKey = "";
      modernHandoffSuperseded = false;
      if (modernHandoffPendingIndex !== null) {
        const pendingIndex = modernHandoffPendingIndex;
        modernHandoffPendingIndex = null;
        window.setTimeout(() => void handoffModernPlayer(pendingIndex), 0);
      }
    }
  }

  function scheduleModernHandoff(requestedKey = "", requestedIndex = null) {
    const request = ++modernHandoffRequest;
    const poll = (attempt = 0) => {
      window.setTimeout(() => {
        if (request !== modernHandoffRequest) return;
        const modern = getModernPlayerState();
        if (modern && (!requestedKey || modern.key === requestedKey)) {
          if (modernPlayerLinksReady(modern) || attempt >= 6) {
            void handoffModernPlayer(requestedIndex);
            return;
          }
        }
        if (attempt < 6) poll(attempt + 1);
      }, attempt ? Math.min(500, 100 + attempt * 75) : 40);
    };
    poll();
  }

  function isReusableStreamUrl(value) {
    try {
      const url = new URL(value);
      const isBcbits = url.hostname === "bcbits.com" || url.hostname.endsWith(".bcbits.com");
      const isBandcampRedirect = url.hostname === "bandcamp.com" && url.pathname === "/stream_redirect" && url.searchParams.has("track_id");
      return url.protocol === "https:" && (isBcbits || isBandcampRedirect);
    } catch {
      return false;
    }
  }

  async function handoffDiscoverPlayer() {
    if (discoverHandoffBusy) return false;
    const discover = getDiscoverPlayerState();
    if (!discover?.track || !isReusableStreamUrl(discover.track.url)) return false;
    discoverHandoffBusy = true;
    discoverHandoffTrackKey = playlistTrackKey(discover.track);
    try {
      const prepared = await prepareExternalNowPlaying(discover.track, [], { trustProvidedStreams: true });
      if (prepared.index < 0) return false;
      const latestDiscover = getDiscoverPlayerState();
      if (!latestDiscover?.track || playlistTrackKey(latestDiscover.track) !== discoverHandoffTrackKey) {
        discoverHandoffPending = true;
        return false;
      }
      const latestCurrentTime = Number(latestDiscover.currentTime);
      const handoffCurrentTime = Number.isFinite(latestCurrentTime)
        ? Math.max(0, latestCurrentTime)
        : Math.max(0, Number(discover.currentTime) || 0);
      silenceNativePagePlayback();
      const response = await runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE,
        queue: prepared.queue,
        index: prepared.index,
        currentTime: handoffCurrentTime,
        autoplay: true,
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        filterValue: state.dj.filterValue,
        gainDb: state.dj.gainDb,
        eqLowDb: state.dj.eqLowDb,
        eqMidDb: state.dj.eqMidDb,
        eqHighDb: state.dj.eqHighDb
      });
      if (!response?.ok) return false;
      if (prepared.request !== playlistPlayRequest) return false;
      pageMediaCommand("pause");
      applySeamlessState(response.state);
      return true;
    } finally {
      discoverHandoffBusy = false;
      discoverHandoffTrackKey = "";
      if (discoverHandoffPending) {
        discoverHandoffPending = false;
        window.setTimeout(scanLivePlayer, 0);
      }
    }
  }

  async function handoffFeedPlayer(requestedTrackId = "") {
    if (feedHandoffBusy) {
      return Boolean(requestedTrackId && String(requestedTrackId) === feedHandoffTrackId);
    }
    const feed = getFeedPlayerState(requestedTrackId);
    if (!feed?.track || !feed.isPlaying || !isReusableStreamUrl(feed.track.url)) return false;
    if (suppressedFeedTrackId && String(feed.track.id || requestedTrackId || "") === suppressedFeedTrackId) {
      pendingFeedTrackId = "";
      const suppressedAudio = getAudio();
      if (suppressedAudio && !suppressedAudio.paused) suppressedAudio.pause();
      restoreFeedAudioMute(feed.track.id || requestedTrackId);
      return true;
    }
    const sameSeamlessTrack = Boolean(seamless.enabled && matchingQueueTrack([seamless.track], feed.track));
    if (sameSeamlessTrack) {
      const currentAudio = getAudio();
      if (currentAudio && !currentAudio.paused) currentAudio.pause();
      restoreFeedAudioMute(feed.track.id || requestedTrackId);
      return true;
    }
    feedHandoffBusy = true;
    feedHandoffTrackId = String(feed.track.id || requestedTrackId || "");
    try {
      const prepared = await prepareExternalNowPlaying(feed.track, [], { trustProvidedStreams: true });
      if (prepared.index < 0) return false;
      if (prepared.request !== playlistPlayRequest) return false;
      silenceNativePagePlayback();
      const response = await runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE,
        queue: prepared.queue,
        index: prepared.index,
        currentTime: feed.currentTime,
        autoplay: true,
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        filterValue: state.dj.filterValue,
        gainDb: state.dj.gainDb,
        eqLowDb: state.dj.eqLowDb,
        eqMidDb: state.dj.eqMidDb,
        eqHighDb: state.dj.eqHighDb
      });
      if (!response?.ok) return false;
      if (prepared.request !== playlistPlayRequest) return false;
      applySeamlessState(response.state);
      if (!requestedTrackId || pendingFeedTrackId === requestedTrackId) pendingFeedTrackId = "";
      const audio = getAudio();
      if (audio && !audio.paused) audio.pause();
      restoreFeedAudioMute(feedHandoffTrackId);
      return true;
    } finally {
      feedHandoffBusy = false;
      feedHandoffTrackId = "";
    }
  }

  function scheduleFeedHandoff(trackId, attempt = 0) {
    const requestedTrackId = String(trackId || "");
    if (!requestedTrackId) return;
    if (requestedTrackId === suppressedFeedTrackId) {
      pendingFeedTrackId = "";
      return;
    }
    pendingFeedTrackId = requestedTrackId;
    window.clearTimeout(feedHandoffTimer);
    feedHandoffTimer = window.setTimeout(async () => {
      if (pendingFeedTrackId !== requestedTrackId) return;
      if (feedSwitchPendingDisable) {
        if (attempt < 15) scheduleFeedHandoff(requestedTrackId, attempt + 1);
        return;
      }
      if (await handoffFeedPlayer(requestedTrackId)) return;
      if (pendingFeedTrackId !== requestedTrackId) return;
      if (attempt < 15) scheduleFeedHandoff(requestedTrackId, attempt + 1);
      else {
        pendingFeedTrackId = "";
        restoreFeedAudioMute(requestedTrackId);
      }
    }, attempt ? 90 : 40);
  }

  function getGenericPageItem() {
    const feed = getFeedPlayerState();
    if (feed?.track) return feed.track;
    const media = navigator.mediaSession?.metadata;
    if (media?.title) {
      return {
        title: media.title,
        artist: media.artist || media.album || "Bandcamp",
        art: media.artwork?.at(-1)?.src || live.art,
        pageUrl: location.href,
        artistUrl: artistUrlFromPageUrl(location.href)
      };
    }
    const modern = getModernPlayerState();
    if (modern?.track) return modern.track;
    const active = document.querySelector("[data-trackid].playing, [data-audiourl].playing, .playing[data-track-id], .current-track, .now-playing");
    return itemFromNode(active) || lastPageItem;
  }

  function normalizedTrackTitle(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function matchingPagePlaybackTrack(queue, requested = {}) {
    const tracks = Array.isArray(queue) ? queue : [];
    const requestedUrl = String(requested.url || "");
    if (requestedUrl) {
      const streamMatch = tracks.find((track) => String(track.url || "") === requestedUrl);
      if (streamMatch) return streamMatch;
    }
    const requestedId = String(requested.id || "");
    if (requestedId) {
      const idMatch = tracks.find((track) => String(track.id || "") === requestedId);
      if (idMatch) return idMatch;
    }
    const requestedPageUrl = safeBandcampUrl(requested.pageUrl);
    if (requestedPageUrl) {
      const pageMatch = tracks.find((track) => safeBandcampUrl(track.pageUrl) === requestedPageUrl);
      if (pageMatch) return pageMatch;
    }
    const requestedTitle = normalizedTrackTitle(requested.title);
    const requestedArtist = normalizedTrackTitle(requested.artist);
    if (!requestedTitle || !requestedArtist) return null;
    return tracks.find((track) => normalizedTrackTitle(track.title) === requestedTitle
      && normalizedTrackTitle(track.artist) === requestedArtist) || null;
  }

  function classicTrackRowMatches(row, track, pageData) {
    if (!row?.matches(".track_row_view") || !track) return false;
    const relation = row.getAttribute("rel") || "";
    const trackNumber = Number(relation.match(/(?:^|[&;\s])tracknum=(\d+)/i)?.[1] || 0);
    const pageTrack = trackNumber > 0 ? pageData?.tralbum?.trackinfo?.[trackNumber - 1] : null;
    const currentId = String(track.id || "");
    const pageTrackId = String(pageTrack?.track_id || pageTrack?.id || "");
    if (currentId && pageTrackId && currentId === pageTrackId) return true;
    const rowLink = safeBandcampUrl(row.querySelector(".track-title[href], a[href*='/track/']")?.href);
    const currentPageUrl = safeBandcampUrl(track.pageUrl);
    if (rowLink && currentPageUrl && rowLink === currentPageUrl) return true;
    const rowTitle = normalizedTrackTitle(elementText(row, [".track-title", ".title"]));
    const currentTitle = normalizedTrackTitle(track.title);
    return Boolean(rowTitle && currentTitle && rowTitle === currentTitle);
  }

  function clearBandKitPagePlaybackState() {
    for (const player of document.querySelectorAll(".inline_player, .track_row_view")) {
      player.classList.remove("bandcamp-hub-current", "bandcamp-hub-is-playing");
    }
    for (const control of document.querySelectorAll("[data-bandkit-playback-state]")) {
      control.classList.remove("playing");
      control.classList.add("paused");
      control.removeAttribute("data-bandkit-playback-state");
      const action = control.closest("a, button, [role='button']") || control;
      action.setAttribute("aria-label", "Play");
      action.setAttribute("aria-pressed", "false");
    }
  }

  function capturePagePlayerUi() {
    if (pagePlayerSnapshot) return;
    const inlinePlayer = document.querySelector(".inline_player");
    const textElements = [
      inlinePlayer?.querySelector(".title"),
      inlinePlayer?.querySelector(".time_elapsed"),
      inlinePlayer?.querySelector(".time_total")
    ].filter(Boolean).map((element) => ({ element, text: element.textContent }));
    const visibilityElements = [
      inlinePlayer?.querySelector(".title-section"),
      inlinePlayer?.querySelector(".time"),
      inlinePlayer?.querySelector(".prevbutton"),
      inlinePlayer?.querySelector(".nextbutton")
    ].filter(Boolean).map((element) => ({ element, hidden: element.classList.contains("hiddenelem") }));
    const visualControls = [...document.querySelectorAll(".inline_player .playbutton, .inline_player .play_status, .track_row_view .playbutton, .track_row_view .play_status")]
      .map((element) => ({
        element,
        playing: element.classList.contains("playing"),
        paused: element.classList.contains("paused"),
        playbackState: element.getAttribute("data-bandkit-playback-state")
      }));
    const actions = [...new Set(visualControls.map(({ element }) => element.closest("a, button, [role='button']") || element))]
      .map((element) => ({
        element,
        ariaLabel: element.getAttribute("aria-label"),
        ariaPressed: element.getAttribute("aria-pressed")
      }));
    const fill = inlinePlayer?.querySelector(".progbar_fill");
    const thumb = inlinePlayer?.querySelector(".thumb");
    const modernTimeline = document.querySelector("section.floating-player.has-track input[type='range']");
    pagePlayerSnapshot = {
      textElements,
      visibilityElements,
      visualControls,
      actions,
      fill: fill ? { element: fill, value: fill.style.getPropertyValue("width"), priority: fill.style.getPropertyPriority("width") } : null,
      thumb: thumb ? { element: thumb, value: thumb.style.getPropertyValue("left"), priority: thumb.style.getPropertyPriority("left") } : null,
      modernTimeline: modernTimeline ? {
        element: modernTimeline,
        max: modernTimeline.getAttribute("max"),
        value: modernTimeline.value
      } : null
    };
  }

  function restorePagePlayerUi() {
    clearBandKitPagePlaybackState();
    if (!pagePlayerSnapshot) return;
    for (const { element, text } of pagePlayerSnapshot.textElements) {
      if (element.isConnected) element.textContent = text;
    }
    for (const { element, hidden } of pagePlayerSnapshot.visibilityElements) {
      if (element.isConnected) element.classList.toggle("hiddenelem", hidden);
    }
    for (const { element, playing, paused, playbackState } of pagePlayerSnapshot.visualControls) {
      if (!element.isConnected) continue;
      element.classList.toggle("playing", playing);
      element.classList.toggle("paused", paused);
      if (playbackState === null) element.removeAttribute("data-bandkit-playback-state");
      else element.setAttribute("data-bandkit-playback-state", playbackState);
    }
    for (const { element, ariaLabel, ariaPressed } of pagePlayerSnapshot.actions) {
      if (!element.isConnected) continue;
      if (ariaLabel === null) element.removeAttribute("aria-label");
      else element.setAttribute("aria-label", ariaLabel);
      if (ariaPressed === null) element.removeAttribute("aria-pressed");
      else element.setAttribute("aria-pressed", ariaPressed);
    }
    for (const snapshot of [pagePlayerSnapshot.fill, pagePlayerSnapshot.thumb]) {
      if (!snapshot?.element.isConnected) continue;
      const property = snapshot === pagePlayerSnapshot.fill ? "width" : "left";
      if (snapshot.value) snapshot.element.style.setProperty(property, snapshot.value, snapshot.priority);
      else snapshot.element.style.removeProperty(property);
    }
    const timeline = pagePlayerSnapshot.modernTimeline;
    if (timeline?.element.isConnected) {
      if (timeline.max === null) timeline.element.removeAttribute("max");
      else timeline.element.setAttribute("max", timeline.max);
      timeline.element.value = timeline.value;
    }
    pagePlayerSnapshot = null;
  }

  function syncPagePlayerUi() {
    if (!seamless.enabled) {
      document.body.classList.remove("bandcamp-hub-remote-playing");
      restorePagePlayerUi();
      return;
    }
    ensurePageStyles();
    const pageData = getBandcampPageData();
    const inlineTitle = document.querySelector(".inline_player .title");
    const currentPageTrack = matchingPagePlaybackTrack(buildSeamlessQueue(), seamless.track || {});
    if (!currentPageTrack) {
      document.body.classList.remove("bandcamp-hub-remote-playing");
      restorePagePlayerUi();
      return;
    }
    capturePagePlayerUi();
    document.body.classList.toggle("bandcamp-hub-remote-playing", Boolean(seamless.isPlaying));
    if (inlineTitle && seamless.track?.title) inlineTitle.textContent = seamless.track.title;
    for (const player of document.querySelectorAll(".inline_player, .track_row_view")) {
      const isInlinePlayer = player.matches(".inline_player");
      const isCurrent = isInlinePlayer || classicTrackRowMatches(player, seamless.track, pageData);
      player.classList.toggle("bandcamp-hub-current", isCurrent);
      player.classList.toggle("bandcamp-hub-is-playing", isCurrent && seamless.isPlaying);
      const control = player.querySelector(".playbutton, .play_status, .play_cell a, [aria-label*='Play'], [aria-label*='Pause']");
      if (control && isCurrent) {
        const action = control.closest("a, button, [role='button']") || control;
        action.setAttribute("aria-label", seamless.isPlaying ? "Pause" : "Play");
        action.setAttribute("aria-pressed", String(Boolean(seamless.isPlaying)));
      }
      const visualControls = [...player.querySelectorAll(".playbutton, .play_status")];
      if (!visualControls.length && control) visualControls.push(control);
      const wasBandKitCurrent = visualControls.some((visualControl) => visualControl.hasAttribute("data-bandkit-playback-state"));
      if (control && !isCurrent && wasBandKitCurrent) {
        const action = control.closest("a, button, [role='button']") || control;
        action.setAttribute("aria-label", "Play");
        action.setAttribute("aria-pressed", "false");
      }
      for (const visualControl of visualControls) {
        if (isCurrent) visualControl.setAttribute("data-bandkit-playback-state", "true");
        else visualControl.removeAttribute("data-bandkit-playback-state");
        visualControl.classList.toggle("playing", isCurrent && Boolean(seamless.isPlaying));
        visualControl.classList.toggle("paused", isCurrent && !seamless.isPlaying);
      }
    }
    const inlinePlayer = document.querySelector(".inline_player");
    inlinePlayer?.querySelector(".title-section")?.classList.remove("hiddenelem");
    inlinePlayer?.querySelector(".time")?.classList.remove("hiddenelem");
    inlinePlayer?.querySelector(".prevbutton")?.classList.remove("hiddenelem");
    inlinePlayer?.querySelector(".nextbutton")?.classList.remove("hiddenelem");
    const elapsed = inlinePlayer?.querySelector(".time_elapsed");
    const total = inlinePlayer?.querySelector(".time_total");
    if (elapsed) elapsed.textContent = formatDuration(seamless.currentTime);
    if (total) total.textContent = formatDuration(seamless.duration);
    const fill = inlinePlayer?.querySelector(".progbar_fill");
    const thumb = inlinePlayer?.querySelector(".thumb");
    const percent = `${Math.max(0, Math.min(100, Number(seamless.progress) * 100 || 0))}%`;
    if (fill) fill.style.width = percent;
    if (thumb) thumb.style.left = percent;

    const modernPlayer = document.querySelector("section.floating-player.has-track");
    const modernTimeline = modernPlayer?.querySelector("input[type='range']");
    if (modernTimeline && !modernTimeline.closest(".bandkit-page-scrub-control")?.classList.contains("is-scrubbing")) {
      modernTimeline.max = String(Math.max(0, Number(seamless.duration) || 0));
      modernTimeline.value = String(Math.max(0, Number(seamless.currentTime) || 0));
    }
    ensurePagePlayerWaveforms();
  }

  function populatePageWaveform(control, signature, width = 0) {
    const svg = control.querySelector(":scope > .bandkit-page-scrub-waveform");
    if (!svg) return;
    const pixelWidth = Math.max(80, Math.round(width || control.getBoundingClientRect().width || 320));
    if (control.dataset.bandkitWaveformSignature === signature
      && Math.abs(Number(control.dataset.bandkitWaveformWidth) - pixelWidth) < 4) return;
    const waveform = waveformPathData(signature, pixelWidth);
    svg.setAttribute("viewBox", `0 0 ${waveform.pixelWidth} 24`);
    for (const path of svg.querySelectorAll("path")) path.setAttribute("d", waveform.pathData);
    control.dataset.bandkitWaveformSignature = signature;
    control.dataset.bandkitWaveformWidth = String(waveform.pixelWidth);
  }

  function pageWaveformSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "bandkit-page-scrub-waveform");
    svg.setAttribute("viewBox", "0 0 320 24");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const className of ["bandkit-page-waveform-remaining", "bandkit-page-waveform-played"]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", className);
      svg.append(path);
    }
    return svg;
  }

  function pageScrubDuration(control) {
    const timeline = control.querySelector(":scope > .bandkit-page-scrub-slider");
    const minimum = Number(timeline?.min) || 0;
    const maximum = Number(timeline?.max) || 0;
    if (timeline && maximum > minimum) return maximum - minimum;
    if (seamless.enabled && Number(seamless.duration) > 0) return Number(seamless.duration);
    const audio = getAudio();
    if (Number(audio?.duration) > 0) return Number(audio.duration);
    if (Number(bridgedMedia?.duration) > 0) return Number(bridgedMedia.duration);
    return Number(live.duration) || 0;
  }

  function previewPageScrub(control, clientX) {
    const rect = control.getBoundingClientRect();
    const fraction = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    control.style.setProperty("--bandkit-page-scrub-progress", `${(fraction * 100).toFixed(2)}%`);
    const timeline = control.querySelector(":scope > .bandkit-page-scrub-slider");
    if (timeline) {
      const minimum = Number(timeline.min) || 0;
      const maximum = Number(timeline.max) || 1;
      timeline.value = String(minimum + (maximum - minimum) * fraction);
      timeline.setAttribute("aria-valuetext", `${formatDuration(pageScrubDuration(control) * fraction)} of ${formatDuration(pageScrubDuration(control))}`);
    }
    const elapsed = control.closest(".inline_player")?.querySelector(".time_elapsed");
    if (elapsed) elapsed.textContent = formatDuration(pageScrubDuration(control) * fraction);
    return fraction;
  }

  async function commitPageScrub(control, fraction) {
    const timeline = control.querySelector(":scope > .bandkit-page-scrub-slider");
    if (timeline) {
      timeline.dispatchEvent(new Event("input", { bubbles: true }));
      timeline.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const duration = pageScrubDuration(control);
    if (!duration) return;
    const currentTime = duration * fraction;
    if (seamless.enabled) {
      await seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime });
      return;
    }
    const audio = getAudio();
    if (Number(audio?.duration) > 0) {
      audio.currentTime = currentTime;
      return;
    }
    if (Number(bridgedMedia?.duration) > 0) pageMediaCommand("seek", { currentTime });
  }

  function bindPageScrubDrag(control) {
    if (control.dataset.bandkitScrubDragBound === "true") return;
    control.dataset.bandkitScrubDragBound = "true";
    let drag = null;
    const finish = async (event, cancelled = false) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const fraction = cancelled ? drag.fraction : previewPageScrub(control, event.clientX);
      drag = null;
      try { control.releasePointerCapture(event.pointerId); } catch {}
      try {
        if (!cancelled) await commitPageScrub(control, fraction);
      } finally {
        control.classList.remove("is-scrubbing");
        ensurePagePlayerWaveforms();
      }
    };
    control.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !pageScrubDuration(control)) return;
      drag = { pointerId: event.pointerId, fraction: previewPageScrub(control, event.clientX) };
      control.classList.add("is-scrubbing");
      try { control.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    }, true);
    control.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.fraction = previewPageScrub(control, event.clientX);
      event.preventDefault();
      event.stopPropagation();
    }, true);
    control.addEventListener("pointerup", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      void finish(event);
    }, true);
    control.addEventListener("pointercancel", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      void finish(event, true);
    }, true);
  }

  function finishPageWaveformControl(control) {
    if (!control.querySelector(":scope > .bandkit-page-scrub-waveform")) control.append(pageWaveformSvg());
    if (!control.querySelector(":scope > .bandkit-page-scrub-playhead")) {
      const playhead = document.createElement("span");
      playhead.className = "bandkit-page-scrub-playhead";
      playhead.setAttribute("aria-hidden", "true");
      control.append(playhead);
    }
    bindPageScrubDrag(control);
  }

  function ensureClassicTransportRow(inlinePlayer) {
    const transportControls = [
      inlinePlayer.querySelector(".prevbutton"),
      inlinePlayer.querySelector(".nextbutton")
    ].filter(Boolean).map((control) => control.closest("a, button, [role='button']") || control);
    if (!transportControls.length) return;
    let tools = inlinePlayer.querySelector(":scope > .bandcamp-hub-page-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "bandcamp-hub-page-tools";
      inlinePlayer.append(tools);
    }
    let row = tools.querySelector(":scope > .bandkit-page-transport-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "bandkit-page-transport-row";
      row.setAttribute("aria-label", "Track navigation");
      tools.append(row);
    }
    transportControls.forEach((control, index) => {
      const sourceCell = control.closest(".prev_cell, .next_cell");
      if (sourceCell) sourceCell.classList.add("bandkit-page-transport-cell-empty");
      if (!control.hasAttribute("aria-label")) control.setAttribute("aria-label", index ? "Next track" : "Previous track");
      setPageActionLabel(control, "");
      if (control.parentElement !== row) row.append(control);
    });
  }

  function syncPageScrubberContrast(control) {
    let surface = null;
    for (let element = control; element && !surface; element = element.parentElement) {
      const candidate = parseColor(getComputedStyle(element).backgroundColor);
      if (candidate && candidate.a > 0.5) surface = candidate;
    }
    surface ||= luminance(parseColor(getComputedStyle(document.body).color) || { r: 17, g: 24, b: 39, a: 1 }) > 0.5
      ? { r: 17, g: 24, b: 39, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };
    const styles = getComputedStyle(control);
    const playerStyles = getComputedStyle(host);
    const sharedAccentValue = playerStyles.getPropertyValue("--hub-scrub-accent").trim();
    const sharedRemainingValue = playerStyles.getPropertyValue("--hub-scrub-remaining").trim();
    const sharedPlayerAccent = parseColor(sharedAccentValue) || hexColor(sharedAccentValue, null);
    const preferredAccent = sharedPlayerAccent || parseColor(
      styles.getPropertyValue("--hub-scrub-accent")
      || styles.getPropertyValue("--hub-accent")
      || styles.getPropertyValue("--bandkit-page-accent")
      || styles.getPropertyValue("--link-color")
    ) || firstComputedColor(["a.primaryText", ".download-link", ".buy-link", "a"], "color") || { r: 29, g: 160, b: 195, a: 1 };
    const palette = accessibleScrubberPalette(preferredAccent, surface);
    control.style.setProperty("--bandkit-scrub-accent", colorString(palette.accent));
    control.style.setProperty("--bandkit-scrub-remaining", sharedRemainingValue || colorString(mixColor(surface, palette.halo, 0.22)));
    control.style.setProperty("--bandkit-scrub-surface", colorString(palette.surface));
    control.style.setProperty("--bandkit-scrub-halo", colorString(palette.halo, 0.62));
  }

  function ensurePagePlayerWaveforms() {
    ensurePageStyles();

    const modernPlayer = document.querySelector("section.floating-player.has-track");
    const modernTimeline = modernPlayer?.querySelector("input[type='range']");
    if (modernTimeline) {
      let control = modernTimeline.closest(".bandkit-page-scrub-control");
      if (!control) {
        control = document.createElement("div");
        control.className = "bandkit-page-scrub-control is-modern";
        modernTimeline.before(control);
        control.append(modernTimeline);
      }
      modernTimeline.classList.add("bandkit-page-scrub-slider");
      if (!modernTimeline.hasAttribute("aria-label")) modernTimeline.setAttribute("aria-label", "Playback position");
      finishPageWaveformControl(control);
      control.classList.toggle("is-traditional", usesTraditionalScrubber());
      syncPageScrubberContrast(control);
      const modernState = getModernPlayerState();
      const signature = `${modernState?.track?.title || ""}\u0000${modernState?.track?.artist || ""}\u0000${modernState?.track?.pageUrl || "modern-player"}`;
      const maximum = Number(modernTimeline.max) || modernState?.duration || 1;
      const progress = Math.max(0, Math.min(1, (Number(modernTimeline.value) || 0) / maximum));
      if (!control.classList.contains("is-scrubbing")) control.style.setProperty("--bandkit-page-scrub-progress", `${(progress * 100).toFixed(2)}%`);
      populatePageWaveform(control, signature);
    }

    const inlinePlayer = document.querySelector(".inline_player");
    const classicControl = inlinePlayer?.querySelector(".progbar");
    if (classicControl) {
      classicControl.classList.add("bandkit-page-scrub-control", "is-classic");
      finishPageWaveformControl(classicControl);
      ensureClassicTransportRow(inlinePlayer);
      classicControl.classList.toggle("is-traditional", usesTraditionalScrubber());
      syncPageScrubberContrast(classicControl);
      const track = currentInlinePlaylistTrack();
      const signature = `${track?.title || elementText(inlinePlayer, [".title", ".track-title"])}\u0000${track?.artist || ""}\u0000${track?.pageUrl || location.href}`;
      const fill = classicControl.querySelector(".progbar_fill");
      const inlineProgress = fill?.style.width.endsWith("%") ? Number.parseFloat(fill.style.width) : NaN;
      const controlWidth = classicControl.getBoundingClientRect().width;
      const measuredProgress = controlWidth ? (fill?.getBoundingClientRect().width || 0) / controlWidth * 100 : 0;
      const progress = Math.max(0, Math.min(100, Number.isFinite(inlineProgress) ? inlineProgress : measuredProgress));
      if (!classicControl.classList.contains("is-scrubbing")) classicControl.style.setProperty("--bandkit-page-scrub-progress", `${progress.toFixed(2)}%`);
      populatePageWaveform(classicControl, signature);
    }
  }

  function ensurePageStyles() {
    if (!document.querySelector("#bandcamp-hub-page-style")) {
      const pageStyle = document.createElement("style");
      pageStyle.id = "bandcamp-hub-page-style";
      pageStyle.textContent = `.bandcamp-hub-page-dj{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:flex;height:32px;justify-content:center;margin:8px 0 0;padding:0;width:32px}.bandcamp-hub-page-dj::before{background:currentColor;content:"";height:18px;mask:var(--hub-dj-icon) center/contain no-repeat;-webkit-mask:var(--hub-dj-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-dj:hover,.bandcamp-hub-page-dj:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-dj.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-dj-host{box-sizing:border-box;display:block;margin-top:8px;min-width:0;width:100%}.bandcamp-hub-page-dj-host[hidden]{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline>svg{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline::after{background:linear-gradient(90deg,currentColor 0 34%,transparent 34% 66%,currentColor 66%);content:"";display:block;height:18px;width:14px}`;
      pageStyle.textContent += `.bandkit-page-scrub-control{--bandkit-page-scrub-progress:0%;--bandkit-scrub-accent:#087f9e;--bandkit-scrub-remaining:#cbd0d5;--bandkit-scrub-surface:#fff;--bandkit-scrub-halo:rgba(17,24,39,.62);align-items:center;box-sizing:border-box;display:flex;height:28px;min-width:0;position:relative;touch-action:none;width:100%}.bandkit-page-scrub-control.is-modern{flex:1 1 240px;grid-column:1/-1}.bandkit-page-scrub-slider{appearance:none!important;background:transparent!important;cursor:pointer;height:28px!important;inset:0;margin:0!important;opacity:0;position:absolute!important;width:100%!important;z-index:3}.bandkit-page-scrub-waveform{display:block;height:24px;overflow:visible;pointer-events:none;width:100%}.bandkit-page-scrub-waveform path{fill:none;stroke-linecap:round;stroke-width:2.4}.bandkit-page-waveform-remaining{stroke:var(--bandkit-scrub-remaining)}.bandkit-page-waveform-played{clip-path:inset(0 calc(100% - var(--bandkit-page-scrub-progress)) 0 0);stroke:var(--bandkit-scrub-accent)}.bandkit-page-scrub-playhead{background:var(--bandkit-scrub-surface);border:2px solid var(--bandkit-scrub-accent);border-radius:999px;box-shadow:0 0 0 1px var(--bandkit-scrub-halo),0 1px 4px rgba(0,0,0,.22);height:8px;left:var(--bandkit-page-scrub-progress);opacity:0;pointer-events:none;position:absolute;top:50%;transform:translate(-50%,-50%) scale(.75);transition:opacity 120ms ease,transform 120ms ease;width:8px;z-index:2}.bandkit-page-scrub-control:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{opacity:1;transform:translate(-50%,-50%) scale(1)}.inline_player .progbar.bandkit-page-scrub-control{height:28px!important;overflow:visible!important}.inline_player .progbar.bandkit-page-scrub-control :is(.progbar_empty,.progbar_fill,.thumb){background:transparent!important}.inline_player .progbar.bandkit-page-scrub-control>.progbar_empty{height:28px!important;inset:0;opacity:0!important;position:absolute;width:100%;z-index:3}.inline_player .progbar.bandkit-page-scrub-control .progbar_fill,.inline_player .progbar.bandkit-page-scrub-control .thumb{opacity:0!important}`;
      pageStyle.textContent += `.bandkit-page-scrub-control.is-traditional::before,.bandkit-page-scrub-control.is-traditional::after{border-radius:999px;content:"";height:4px;left:0;pointer-events:none;position:absolute;top:50%;transform:translateY(-50%)}.bandkit-page-scrub-control.is-traditional::before{background:var(--bandkit-scrub-remaining);right:0}.bandkit-page-scrub-control.is-traditional::after{background:var(--bandkit-scrub-accent);width:var(--bandkit-page-scrub-progress)}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-waveform{opacity:0}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-playhead{box-sizing:border-box;height:12px;opacity:1;transform:translate(-50%,-50%) scale(1);width:12px}.bandkit-page-scrub-control.is-traditional:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{transform:translate(-50%,-50%) scale(1.08)}`;
      pageStyle.textContent += `.bandkit-page-scrub-playhead{background:var(--bandkit-scrub-accent);border:2px solid var(--bandkit-scrub-surface);height:18px;transition:box-shadow 140ms ease,height 140ms ease,opacity 120ms ease,transform 140ms ease,width 140ms ease;width:7px}.bandkit-page-scrub-control:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-scrubbing>.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{box-shadow:0 0 0 1px var(--bandkit-scrub-halo),0 2px 7px color-mix(in srgb,var(--bandkit-scrub-accent) 38%,transparent);height:22px;opacity:1;transform:translate(-50%,-50%) scale(1);width:9px}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-playhead{height:18px;transform:translate(-50%,-50%) scale(1);width:7px}.bandkit-page-scrub-control.is-traditional:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional.is-scrubbing>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{height:22px;opacity:1;transform:translate(-50%,-50%) scale(1);width:9px}`;
      pageStyle.textContent += `.bandkit-page-transport-row{align-items:center;display:flex;gap:10px;margin-left:auto;margin-right:-8px;min-height:32px}.bandkit-page-transport-row>:is(a,button,[role="button"],.prevbutton,.nextbutton){align-items:center;display:inline-flex!important;height:32px;justify-content:center;margin:0!important;min-width:32px;top:auto!important}.bandkit-page-transport-cell-empty{display:none!important}`;
      pageStyle.textContent += `[data-bandkit-extension-stacking]{z-index:2147483646!important}`;
      pageStyle.textContent += `#DiscoverApp .focused-result{scroll-padding-bottom:calc(var(--bandkit-player-reserved-height,84px) + 16px)}`;
      pageStyle.textContent += `html[data-bandkit-hide-bandcamp-player="true"] :is(.discover-player,section.floating-player){display:none!important}html[data-bandkit-feed-page="true"] :is(#track_play_waypoint,.track_play_waypoint){display:none!important}`;
      pageStyle.textContent += `html[data-bandkit-hide-page-cart="true"] #sidecart{display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,.menubar-cart-icon,#cart-link,#cart-control){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a,button,[role="button"],li):has(use[href$="#menubar-cart-icon"],use[xlink\\:href$="#menubar-cart-icon"],svg.menubar-cart-icon){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) li:has(> :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,#cart-link,#cart-control)){display:none!important}`;
      pageStyle.textContent += `.bandcamp-hub-page-tools{align-items:center;box-sizing:border-box;display:flex;flex-wrap:nowrap;gap:8px;margin:12px 0 0;max-width:100%;min-width:0;white-space:nowrap;width:100%}.bandcamp-hub-page-tools>:not(.bandkit-page-transport-row){flex:0 0 auto}.bandcamp-hub-page-tools .bandcamp-hub-page-dj{margin:0}.bandcamp-hub-page-playlist{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;font-size:0;height:32px;justify-content:center;line-height:0;margin:8px 0 0;padding:0;text-decoration:none!important;vertical-align:middle;width:32px}.bandcamp-hub-page-playlist::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-plus-icon) center/contain no-repeat;-webkit-mask:var(--hub-plus-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-playlist:hover,.bandcamp-hub-page-playlist:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandcamp-hub-page-playlist.is-added{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-playlist.is-player-control{margin:0}.bandcamp-hub-page-playlist.is-track-action{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-line,rgba(127,127,127,.35))!important;color:var(--hub-accent,var(--link-color,#1da0c3))!important;height:24px;margin:0 8px 0 0!important;opacity:0;pointer-events:none;text-decoration:none!important;width:24px}.bandcamp-hub-page-playlist.is-track-action::before{height:14px;width:14px}.bandcamp-hub-page-playlist.is-track-action:hover,.bandcamp-hub-page-playlist.is-track-action:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;text-decoration:none!important}.bandcamp-hub-page-playlist.is-track-action.is-added{background:var(--hub-accent,var(--link-color,#1da0c3))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;color:var(--hub-on-accent,#fff)!important}.track_row_view:hover .bandcamp-hub-page-playlist.is-track-action,.track_row_view:focus-within .bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-playlist.is-track-action:focus-visible{opacity:1;pointer-events:auto}`;
      pageStyle.textContent += `html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to{appearance:none;background:transparent!important;border:0!important;border-radius:0!important;color:var(--link-color,#0687f5)!important;font:inherit!important;font-weight:700!important;height:auto!important;line-height:inherit!important;margin:0 10px 0 0!important;padding:0!important;width:auto!important}html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to::before{display:none!important}html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to.is-added{background:transparent!important;color:var(--link-color,#0687f5)!important}`;
      pageStyle.textContent += `html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions>li{align-items:center!important;display:flex!important;gap:4px!important;margin:0!important;padding:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions>li::before{display:none!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-action .wishlist-msg,.bandkit-feed-wishlist-action .wishlisted-msg>span:first-child){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;height:28px!important;justify-content:center!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action):hover,html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action):focus-visible,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child):hover,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child):focus-visible{background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandcamp-hub-page-playlist.is-feed-sidebar-action{font-size:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandcamp-hub-page-playlist.is-feed-sidebar-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action){font-size:0!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .wishlist-msg>span,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .wishlisted-msg>span:first-child>span{display:none!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .text{clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;height:1px!important;overflow:hidden!important;position:absolute!important;white-space:nowrap!important;width:1px!important}`;
      pageStyle.textContent += `html[data-bandkit-feed-page="true"] .bandkit-feed-action-row{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row>li{align-items:center!important;display:flex!important;gap:4px!important;margin:0!important;padding:0!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row>li::before{display:none!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;font-size:0!important;height:28px!important;justify-content:center!important;line-height:0!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control):is(:hover,:focus-visible){background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandcamp-hub-page-playlist.is-feed-compact-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandkit-feed-wishlist-control>*{display:none!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandkit-feed-wishlist-control::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;width:16px}`;
      pageStyle.textContent += `html[data-bandkit-collection-page="true"] .bandkit-collection-action-row{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-collection-page="true"] .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;font-size:0!important;height:28px!important;justify-content:center!important;line-height:0!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-collection-page="true"] .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):is(:hover,:focus-visible){background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-collection-page="true"] .bandkit-collection-action-row .bandcamp-hub-page-playlist.is-feed-compact-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-collection-page="true"] .bandkit-collection-download-action::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-collection-page="true"] #collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .bottom-owner-controls .redownload-item{display:none!important}`;
      pageStyle.textContent += `html[data-bandkit-feed-page="true"] .story-innards>.story-body{padding-bottom:6px!important}html[data-bandkit-feed-page="true"] .story-innards>.tralbum-wrapper-collect-controls{margin-bottom:18px!important}html[data-bandkit-feed-page="true"] .story-innards>.tralbum-wrapper-collect-controls .bandkit-feed-action-row{margin-top:4px!important}`;
      pageStyle.textContent += `#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button,.bandcamp-hub-page-playlist.is-discover-add-to){align-items:center!important;appearance:none!important;background:var(--bandkit-page-card,var(--hub-card,#fff))!important;border:1px solid var(--bandkit-page-border,var(--hub-line,rgba(127,127,127,.35)))!important;border-radius:8px!important;box-shadow:0 1px 2px rgba(0,0,0,.12)!important;box-sizing:border-box!important;color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;display:inline-flex!important;filter:none!important;height:36px!important;justify-content:center!important;margin:0!important;width:36px!important}#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button,.bandcamp-hub-page-playlist.is-discover-add-to):is(:hover,:focus-visible){background:var(--bandkit-page-card,var(--hub-card,#fff))!important;background:color-mix(in srgb,var(--bandkit-page-accent,var(--hub-accent,#1da0c3)) 16%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;filter:none!important;opacity:1!important;outline:0!important}#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button):is(:hover,:focus-visible)>*{opacity:1!important}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to{position:absolute!important;z-index:8}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to::before{height:16px!important;width:16px!important}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to.is-added{background:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;border-color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;color:var(--bandkit-page-on-accent,var(--hub-on-accent,#fff))!important}`;
      pageStyle.textContent += `.results-grid-item .bandcamp-hub-page-playlist.is-discover-add-to{opacity:0;pointer-events:none;transition:opacity .12s ease}.results-grid-item:hover .bandcamp-hub-page-playlist.is-discover-add-to,.results-grid-item:focus-within .bandcamp-hub-page-playlist.is-discover-add-to,.results-grid-item .bandcamp-hub-page-playlist.is-discover-add-to:focus-visible{opacity:1;pointer-events:auto}`;
      pageStyle.textContent += `#recommendations_container .recommended-album .album-art-container{position:relative}#recommendations_container .recommended-album .bandcamp-hub-page-playlist.is-recommendation-add-to{opacity:0;pointer-events:none;transition:opacity .12s ease}#recommendations_container .recommended-album:is(:hover,:focus-within,.bandkit-recommendation-current) .bandcamp-hub-page-playlist.is-recommendation-add-to,#recommendations_container .recommended-album .bandcamp-hub-page-playlist.is-recommendation-add-to:focus-visible{opacity:1;pointer-events:auto}#recommendations_container .recommended-album.bandkit-recommendation-current .play-button{opacity:1!important}`;
      pageStyle.textContent += `.bandcamp-hub-page-cart{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;height:32px;justify-content:center;margin:0;padding:0;width:32px}.bandcamp-hub-page-cart::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-cart-icon) center/contain no-repeat;-webkit-mask:var(--hub-cart-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-cart:hover,.bandcamp-hub-page-cart:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-cart.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-cart:disabled{cursor:not-allowed;opacity:.45}`;
      pageStyle.textContent += `.bandcamp-hub-page-cart.has-price{gap:5px;padding:0 9px 0 7px;width:auto}.bandcamp-hub-page-cart.has-price::before{height:16px;width:16px}.bandcamp-hub-page-cart-price{font-family:inherit;font-size:11px;font-weight:700;line-height:1;white-space:nowrap}.bandcamp-hub-page-analyze{align-items:center;appearance:none;background:transparent;border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:4px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;font-family:inherit;font-size:0;height:32px;justify-content:center;line-height:0;margin:0;min-height:32px;padding:0;text-decoration:none!important;width:32px}.bandcamp-hub-page-analyze::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-analyze-icon) center/contain no-repeat;-webkit-mask:var(--hub-analyze-icon) center/contain no-repeat;transform:rotate(0deg);transform-origin:50% 50%;width:18px}.bandcamp-hub-page-analyze:hover,.bandcamp-hub-page-analyze:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandcamp-hub-page-analyze.is-analyzing{cursor:progress}.bandcamp-hub-page-analyze.is-analyzing::before{animation:bandkit-page-analysis-spin .8s linear infinite}@keyframes bandkit-page-analysis-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.bandkit-track-analysis{color:var(--bandkit-release-muted,var(--hub-faint,#6b7280));font-size:11px;font-weight:600;margin-left:8px;white-space:nowrap}.bandkit-track-analysis:is(.is-analyzing,.is-unavailable){font-weight:400;opacity:.75}`;
      pageStyle.textContent += `.bandkit-track-analysis{align-items:center;column-gap:6px;display:inline-grid;grid-template-columns:72px 28px minmax(48px,auto);margin-left:0;min-width:0;width:160px}.bandkit-track-analysis-bpm{text-align:right}.bandkit-track-analysis-camelot{text-align:center}.bandkit-track-analysis-key{text-align:left}.bandkit-track-analysis-pending{grid-column:1/-1;text-align:right}html[data-bandkit-show-track-keys="false"] .bandkit-track-analysis{grid-template-columns:72px;width:72px}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{align-items:center;column-gap:10px;display:grid!important;grid-template-columns:minmax(0,1fr) 52px 160px;white-space:nowrap;width:100%!important}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis>a{display:block;min-width:0;overflow:hidden;width:100%}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis .track-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis>.time{margin-left:0!important;text-align:right}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 52px 72px}html[data-bandkit-modern-release="true"] body.tralbum-page .inline_player .bandkit-track-analysis.is-inline{margin-left:12px}@media(max-width:700px){html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{column-gap:6px;grid-template-columns:minmax(0,1fr) 48px 142px}.bandkit-track-analysis{column-gap:4px;font-size:10px;grid-template-columns:64px 26px minmax(44px,auto);width:142px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 48px 64px}html[data-bandkit-show-track-keys="false"] .bandkit-track-analysis{grid-template-columns:64px;width:64px}}`;
      pageStyle.textContent += `.bandcamp-hub-page-buy{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border:1px solid var(--hub-line,rgba(127,127,127,.35))!important;border-radius:999px!important;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3))!important;display:inline-flex!important;flex:0 0 24px;font-size:0!important;height:24px;justify-content:center;line-height:0!important;margin:0!important;overflow:hidden;padding:0!important;text-decoration:none!important;vertical-align:middle;width:24px!important}.bandcamp-hub-page-buy::before{background:currentColor;content:"";display:block;height:14px;mask:var(--hub-buy-icon) center/contain no-repeat;-webkit-mask:var(--hub-buy-icon) center/contain no-repeat;width:14px}.bandcamp-hub-page-buy:hover,.bandcamp-hub-page-buy:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0;text-decoration:none!important}`;
      pageStyle.textContent += `.track_row_view .bandkit-generated-track-buy{opacity:0;pointer-events:none}.track_row_view:hover .bandkit-generated-track-buy,.track_row_view:focus-within .bandkit-generated-track-buy,.bandkit-generated-track-buy:focus-visible{opacity:1;pointer-events:auto}`;
      pageStyle.textContent += `.bandcamp-hub-page-playlist-menu{background:var(--hub-card,#fff);border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.22);box-sizing:border-box;color:var(--hub-text,#111);font-family:var(--hub-font-family,"Helvetica Neue",Helvetica,Arial,sans-serif);min-width:180px;padding:4px;position:absolute;z-index:2147483647}.bandcamp-hub-page-playlist-menu button{background:transparent;border:0;border-radius:3px;color:inherit;cursor:pointer;display:block;font-family:inherit;font-size:11px;line-height:1.3;padding:8px;text-align:left;width:100%}.bandcamp-hub-page-playlist-menu button:hover:not(:disabled),.bandcamp-hub-page-playlist-menu button:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-playlist-menu button:disabled{color:var(--hub-faint,#9ca3af);cursor:default}.bandcamp-hub-page-playlist-menu .is-back{border-bottom:1px solid var(--hub-line,rgba(127,127,127,.35));margin-bottom:3px}.bandcamp-hub-page-playlist-menu-empty{color:var(--hub-faint,#9ca3af);font-family:inherit;font-size:10px;line-height:1.3;padding:8px}`;
      pageStyle.textContent += `.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-analyze),.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy{border-radius:4px!important}.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-analyze):not(.is-active):not(.is-added){background:transparent!important}`;
      pageStyle.textContent += `section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action{align-self:center!important;background:transparent!important;border:1px solid var(--hub-line,rgba(127,127,127,.35))!important;border-radius:4px!important;box-shadow:none!important;flex:0 0 24px!important;height:24px!important;margin:0 0 0 auto!important;min-height:24px!important;opacity:1!important;padding:0!important;pointer-events:auto!important;position:static!important;width:24px!important}section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action::before{height:14px!important;width:14px!important}section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action:is(:hover,:focus-visible,.is-active,.is-added){background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0!important}`;
      pageStyle.textContent += `.bandkit-page-action-label{display:none!important}.bandkit-page-action-label::after{content:attr(data-bandkit-label-text)}html[data-bandkit-page-action-labels="true"] [data-bandkit-label]>.bandkit-page-action-label{display:inline-block!important;font-family:var(--hub-font-family,"Helvetica Neue",Helvetica,Arial,sans-serif)!important;font-size:11px!important;font-weight:700!important;line-height:1.15!important;order:1;white-space:nowrap}html[data-bandkit-page-action-labels="true"] :is(.bandcamp-hub-page-tools,.track_row_view,section.floating-player) [data-bandkit-label]{gap:6px!important;padding-left:8px!important;padding-right:8px!important;width:auto!important}html[data-bandkit-page-action-labels="true"] .bandcamp-hub-page-cart-price{order:2}html[data-bandkit-page-action-labels="true"] #DiscoverApp [data-bandkit-label]{gap:6px!important;padding-left:9px!important;padding-right:9px!important;width:auto!important}html[data-bandkit-page-action-labels="true"] #recommendations_container .recommended-album [data-bandkit-label]{align-items:center!important;display:inline-flex!important;gap:6px!important;justify-content:center!important;padding-left:8px!important;padding-right:8px!important;width:auto!important}html[data-bandkit-page-action-labels="true"][data-bandkit-feed-page="true"] :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions) [data-bandkit-label],html[data-bandkit-page-action-labels="true"][data-bandkit-collection-page="true"] .bandkit-collection-action-row [data-bandkit-label]{gap:6px!important;padding-left:8px!important;padding-right:8px!important;width:auto!important}html[data-bandkit-page-action-labels="true"][data-bandkit-feed-page="true"] :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) [data-bandkit-label]>.bandkit-page-action-label{display:inline-block!important}`;
      pageStyle.textContent += `html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col{min-width:136px!important;width:136px!important}html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col .dl_link{align-items:center!important;display:flex!important;flex-wrap:nowrap!important;gap:4px!important;justify-content:flex-end!important;white-space:nowrap!important;width:100%!important}html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col :is(.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy){flex:0 0 auto!important}html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col .bandcamp-hub-page-buy{min-width:max-content!important;overflow:visible!important;width:auto!important}`;
      document.head.append(pageStyle);
    }
  }

  function updatePagePlaylistButton(button, track) {
    button._bandkitTrack = track || null;
    button.hidden = !track;
    if (!track) return;
    button.textContent = button.classList.contains("is-feed-add-to") ? "add to..." : "";
    setPageActionLabel(button, button.classList.contains("is-feed-add-to") ? "" : "Add");
    button.classList.remove("is-added");
    button.removeAttribute("aria-pressed");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", pagePlaylistMenuAnchor === button ? "true" : "false");
    button.setAttribute("aria-label", `Add ${track.title} to Now Playing, a playlist, or a cart`);
    button.title = button.getAttribute("aria-label");
    applyPageActionTheme(button);
  }

  function closePagePlaylistMenu() {
    pagePlaylistMenu?.remove();
    pagePlaylistMenu = null;
    pagePlaylistMenuAnchor?.setAttribute("aria-expanded", "false");
    pagePlaylistMenuAnchor?.classList.remove("is-active");
    pagePlaylistMenuAnchor = null;
  }

  function positionPagePlaylistMenu() {
    if (!pagePlaylistMenu || !pagePlaylistMenuAnchor?.isConnected) return;
    const rect = pagePlaylistMenuAnchor.getBoundingClientRect();
    pagePlaylistMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - pagePlaylistMenu.offsetWidth - 8, rect.left + window.scrollX))}px`;
    pagePlaylistMenu.style.top = `${rect.bottom + window.scrollY + 5}px`;
  }

  function pagePlaylistSelection(selection) {
    const isBatch = selection?.type === "bandkit-track-batch" && Array.isArray(selection.tracks);
    const source = isBatch ? selection.tracks : [selection];
    return {
      isBatch,
      tracks: normalizePlaylist(source.filter(Boolean).map(capturePlaylistAnalysis))
    };
  }

  function renderPagePlaylistMenu(selection, view = "destinations") {
    if (!pagePlaylistMenu) return;
    const { tracks, isBatch } = pagePlaylistSelection(selection);
    const firstTrack = tracks[0];
    if (!firstTrack) {
      closePagePlaylistMenu();
      return;
    }
    const option = (label, action, disabled = false, className = "") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;
      button.className = className;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        action();
      });
      return button;
    };
    pagePlaylistMenu.replaceChildren();
    if (view === "playlists") {
      pagePlaylistMenu.append(option("← Add destination", () => renderPagePlaylistMenu(selection), false, "is-back"));
      pagePlaylistMenu.append(option("＋ New playlist", () => {
        closePagePlaylistMenu();
        createSavedPlaylistWithTracks(tracks, isBatch
          ? firstTrack.album || `${firstTrack.artist || "Bandcamp"} playlist`
          : `${firstTrack.artist || "Bandcamp"} playlist`);
      }));
      for (const snapshot of state.savedPlaylists) {
        const alreadyAdded = tracks.every((track) => snapshot.items.some((item) => playlistTracksMatch(item, track)));
        pagePlaylistMenu.append(option(`${alreadyAdded ? "✓" : "＋"} ${snapshot.name}`, () => {
          closePagePlaylistMenu();
          addTracksToSavedPlaylist(tracks, snapshot.id);
        }, alreadyAdded));
      }
      if (!state.savedPlaylists.length) {
        const empty = document.createElement("div");
        empty.className = "bandcamp-hub-page-playlist-menu-empty";
        empty.textContent = "No playlists yet";
        pagePlaylistMenu.append(empty);
      }
    } else if (view === "carts") {
      const savedCarts = state.savedCarts.filter((snapshot) => !cartAutosave.isAutoSavedCart(snapshot));
      pagePlaylistMenu.append(
        option("← Add destination", () => renderPagePlaylistMenu(selection), false, "is-back"),
        option(isBatch ? "＋ Add all to current cart" : "＋ Add to current cart", () => {
          closePagePlaylistMenu();
          void addTracksToCurrentCart(tracks);
        })
      );
      for (const snapshot of savedCarts) {
        pagePlaylistMenu.append(option(`＋ ${snapshot.name}`, () => {
          closePagePlaylistMenu();
          void addTracksToSavedCart(tracks, snapshot.id);
        }));
      }
      if (!savedCarts.length) {
        const empty = document.createElement("div");
        empty.className = "bandcamp-hub-page-playlist-menu-empty";
        empty.textContent = "No saved carts yet";
        pagePlaylistMenu.append(empty);
      }
    } else {
      const inPlaying = tracks.every((track) => state.playlist.some((item) => playlistTracksMatch(item, track)));
      pagePlaylistMenu.append(
        option(inPlaying
          ? isBatch ? "✓ All in Now Playing" : "✓ In Now Playing"
          : isBatch ? "＋ Add all to Now Playing" : "＋ Add to Now Playing", () => {
          closePagePlaylistMenu();
          addTracksToPlaylist(tracks);
        }, inPlaying),
        option(isBatch ? "＋ Add all to Playlist…" : "＋ Add to Playlist…", () => renderPagePlaylistMenu(selection, "playlists")),
        option(isBatch ? "＋ Add all to Cart…" : "＋ Add to Cart…", () => renderPagePlaylistMenu(selection, "carts"))
      );
    }
    positionPagePlaylistMenu();
  }

  function openPagePlaylistMenu(anchor, selection) {
    if (pagePlaylistMenuAnchor === anchor) {
      closePagePlaylistMenu();
      return;
    }
    closePagePlaylistMenu();
    pagePlaylistMenuAnchor = anchor;
    pagePlaylistMenu = document.createElement("div");
    pagePlaylistMenu.className = "bandcamp-hub-page-playlist-menu";
    pagePlaylistMenu.setAttribute("role", "menu");
    for (const name of ["--hub-card", "--hub-line", "--hub-text", "--hub-faint", "--hub-accent", "--hub-accent-soft"]) {
      const value = panel.style.getPropertyValue(name);
      if (value) pagePlaylistMenu.style.setProperty(name, value);
    }
    document.body.append(pagePlaylistMenu);
    syncPageTypography();
    anchor.classList.add("is-active");
    anchor.setAttribute("aria-expanded", "true");
    renderPagePlaylistMenu(selection);
    window.setTimeout(() => document.addEventListener("click", closePagePlaylistMenu, { once: true }), 0);
  }


  function createPagePlaylistButton(tagName = "button") {
    const button = document.createElement(tagName);
    button.className = "bandcamp-hub-page-playlist";
    button.style.setProperty("--hub-plus-icon", `url('${asset("icon-plus.svg")}')`);
    button.style.fontFamily = 'var(--hub-font-family, "Helvetica Neue", Helvetica, Arial, sans-serif)';
    applyPageActionTheme(button);
    if (tagName === "button") button.type = "button";
    else {
      button.href = "#";
      button.setAttribute("role", "button");
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button._bandkitTracks?.length) {
        openPagePlaylistMenu(button, { type: "bandkit-track-batch", tracks: button._bandkitTracks });
      } else if (button._bandkitTrack) {
        openPagePlaylistMenu(button, button._bandkitTrack);
      }
    });
    return button;
  }

  function createPageCartButton() {
    const button = document.createElement("button");
    button.className = "bandcamp-hub-page-cart";
    button.type = "button";
    button.style.setProperty("--hub-cart-icon", `url('${asset("icon-cart.svg")}')`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openBandKitCart();
      if (!activateNativeTrackAction("cart")) {
        showToast("Bandcamp's purchase options are not available for this item.");
      }
    });
    return button;
  }

  function compactPagePrice(value, currency = "USD") {
    const amount = Number(value);
    const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
    if (!Number.isFinite(amount) || amount < 0) return "";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${code} ${amount.toFixed(Number.isInteger(amount) ? 0 : 2)}`;
    }
  }

  function pageCartCurrency() {
    const cart = parseJsonAttribute(document.querySelector("script[data-cart]"), "data-cart");
    const currency = String(cart?.currency || "").toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  }

  function pageTrackPriceKey(track) {
    const url = safeBandcampUrl(track?.pageUrl);
    return url && new URL(url).pathname.includes("/track/") ? url : "";
  }

  function localTrackPrice(track) {
    const pageData = getBandcampPageData()?.tralbum;
    const current = pageData?.current;
    const currentId = String(current?.id || current?.track_id || "");
    const matchesCurrentTrack = current?.type === "track" && (
      (currentId && currentId === String(track?.id || ""))
      || normalizedTrackTitle(current?.title) === normalizedTrackTitle(track?.title)
    );
    const minimumPrice = Number(current?.minimum_price);
    if (!matchesCurrentTrack || !Number.isFinite(minimumPrice) || minimumPrice < 0) return null;
    return { label: compactPagePrice(minimumPrice, pageCartCurrency()), minimumPrice };
  }

  function resolvedTrackPrice(track) {
    const local = localTrackPrice(track);
    if (local) return local;
    const key = pageTrackPriceKey(track);
    return key && pageTrackPriceCache.has(key) ? pageTrackPriceCache.get(key) : null;
  }

  function resolveTrackPrice(button, track) {
    const key = pageTrackPriceKey(track);
    if (!key || pageTrackPriceCache.has(key) || pageTrackPricePending.has(key)) return;
    pageTrackPricePending.add(key);
    void runtimeMessage({ type: MESSAGES.RESOLVE_CART_METADATA, items: [{ url: key }] }).then((response) => {
      const metadata = response?.items?.[0];
      const minimumPrice = Number(metadata?.minimumPrice);
      const price = metadata?.itemType === "track" && Number.isFinite(minimumPrice) && minimumPrice >= 0
        ? { label: compactPagePrice(minimumPrice, metadata.currency || pageCartCurrency()), minimumPrice }
        : null;
      pageTrackPriceCache.set(key, price);
      if (button.isConnected && pageTrackPriceKey(button._bandkitTrack) === key) {
        updatePageCartButton(button, button._bandkitTrack);
      }
    }).catch(() => {
      pageTrackPriceCache.set(key, null);
    }).finally(() => {
      pageTrackPricePending.delete(key);
    });
  }

  function digitalAlbumPriceLabel() {
    const digitalOffer = document.querySelector(".buyItem.digital");
    const priceCopy = digitalOffer?.querySelector(".ft.compound-button.main-button, .ft .main-button, .ft")?.textContent
      ?.replace(/buy\s+digital\s+(?:album|track)/ig, " ")
      .replace(/or\s+more/ig, " ")
      .replace(/\s+/g, " ")
      .trim() || "";
    const visiblePrice = priceCopy.match(/(?:(?:A|C|NZ|US)\$|[$£€¥])\s?\d[\d,.]*(?:\s*[A-Z]{3})?|\d[\d,.]*\s+[A-Z]{3}/)?.[0];
    if (visiblePrice) return visiblePrice.replace(/\s+/g, " ").trim();
    const current = getBandcampPageData()?.tralbum?.current;
    const minimumPrice = Number(current?.minimum_price);
    const currency = String(current?.currency || current?.currency_code || "").toUpperCase();
    return minimumPrice > 0 && /^[A-Z]{3}$/.test(currency) ? formatCartPrice(minimumPrice, currency) : "";
  }

  function updatePageCartButton(button, track) {
    button._bandkitTrack = track || null;
    button.hidden = false;
    button.disabled = false;
    resolveTrackPrice(button, track);
    const trackPrice = resolvedTrackPrice(track);
    const price = track ? trackPrice?.label || "" : digitalAlbumPriceLabel();
    button.classList.toggle("has-price", Boolean(price));
    button.replaceChildren();
    setPageActionLabel(button, "Cart");
    if (price) {
      const priceLabel = document.createElement("span");
      priceLabel.className = "bandcamp-hub-page-cart-price";
      priceLabel.textContent = price;
      button.append(priceLabel);
    }
    const itemLabel = track?.title ? `track ${track.title}` : "digital album";
    const label = price
      ? `Buy ${itemLabel} for ${price} or more, or open the Bandkit cart`
      : "Open Bandcamp purchase options and Bandkit cart";
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  function pageAnalysisTrackKey(track) {
    return `${String(track?.id || "")}\u0000${String(track?.url || "")}`;
  }

  function pageAnalysisSignature(tracks) {
    return tracks.map(pageAnalysisTrackKey).join("\u0001");
  }

  function pageAnalysisParts(result) {
    if (!result) return null;
    const bpm = Number(result.bpm);
    const hasBpm = Number.isFinite(bpm) && bpm > 0;
    return {
      bpm: hasBpm ? `${Number.isInteger(bpm) ? bpm : bpm.toFixed(1)} BPM` : "— BPM",
      camelot: String(result.key?.camelot || ""),
      key: String(result.key?.shortName || ""),
      unavailable: Boolean(result.error || !hasBpm)
    };
  }

  function pageAnalysisLabel(result) {
    const parts = pageAnalysisParts(result);
    if (!parts) return "";
    return [
      parts.bpm,
      ...(state.showTrackKeys !== false ? [parts.camelot, parts.key] : [])
    ].filter(Boolean).join(" · ");
  }

  function renderPageAnalysisLabel(label, result, analyzing = false) {
    label.replaceChildren();
    const parts = analyzing ? null : pageAnalysisParts(result);
    label.classList.toggle("is-analyzing", analyzing);
    label.classList.toggle("is-unavailable", Boolean(parts?.unavailable));
    label.classList.toggle("has-key", state.showTrackKeys !== false && Boolean(result?.key));
    if (analyzing) {
      label.append(createElement("span", "bandkit-track-analysis-pending", "Analyzing…"));
      label.setAttribute("aria-label", "Analyzing track");
      label.removeAttribute("title");
      return;
    }
    if (!parts) return;
    if (parts.bpm) label.append(createElement("span", "bandkit-track-analysis-bpm", parts.bpm));
    if (state.showTrackKeys !== false && parts.camelot) {
      label.append(createElement("span", "bandkit-track-analysis-camelot", parts.camelot));
    }
    if (state.showTrackKeys !== false && parts.key) {
      label.append(createElement("span", "bandkit-track-analysis-key", parts.key));
    }
    const text = pageAnalysisLabel(result);
    label.setAttribute("aria-label", parts.unavailable
      ? `Track analysis: BPM unavailable${text.replace(/^— BPM(?: · )?/, "").trim() ? ` · ${text.replace(/^— BPM(?: · )?/, "")}` : ""}`
      : `Track analysis: ${text}`);
    if (parts.unavailable) label.title = "BPM could not be detected for this track";
    else if (result.key?.name && state.showTrackKeys !== false) label.title = `${text} · ${result.key.name}`;
    else label.removeAttribute("title");
  }

  function syncPageTrackAnalysisUi() {
    const queue = buildSeamlessQueue();
    const trackInfo = getBandcampPageData()?.tralbum?.trackinfo || [];
    for (const [index, row] of [...document.querySelectorAll(".track_row_view")].entries()) {
      const title = elementText(row, [".track-title", ".title"]);
      const trackNumber = Number((row.getAttribute("rel") || "").match(/(?:^|[&;\s])tracknum=(\d+)/i)?.[1] || 0);
      const sourceTrack = trackInfo[trackNumber > 0 ? trackNumber - 1 : index];
      const track = matchingQueueTrack(queue, { id: sourceTrack?.track_id || sourceTrack?.id, title });
      const result = track ? pageTrackAnalysis.get(pageAnalysisTrackKey(track)) : null;
      const text = pageAnalysisLabel(result) || (track && pageTrackAnalysisStatus === "analyzing" ? "Analyzing…" : "");
      let label = row.querySelector(".bandkit-track-analysis");
      const analysisLayout = row.querySelector(".title-col .title");
      if (!text) {
        label?.remove();
        analysisLayout?.classList.remove("bandkit-has-track-analysis");
        continue;
      }
      if (!label) {
        label = document.createElement("span");
        label.className = "bandkit-track-analysis";
        const duration = row.querySelector(".title-col .time, .title .time, .time");
        if (duration) duration.after(label);
        else (row.querySelector(".title-col .title, .title-col, .title") || row).append(label);
      }
      analysisLayout?.classList.add("bandkit-has-track-analysis");
      renderPageAnalysisLabel(label, result, !result);
    }

    const inlinePlayer = document.querySelector(".inline_player");
    const inlineTrack = currentInlinePlaylistTrack();
    const inlineResult = inlineTrack ? pageTrackAnalysis.get(pageAnalysisTrackKey(inlineTrack)) : null;
    const inlineText = pageAnalysisLabel(inlineResult)
      || (inlineTrack && pageTrackAnalysisStatus === "analyzing" ? "Analyzing…" : "");
    let inlineLabel = inlinePlayer?.querySelector(":scope .bandkit-track-analysis.is-inline");
    if (!inlineText) inlineLabel?.remove();
    else if (inlinePlayer) {
      if (!inlineLabel) {
        inlineLabel = document.createElement("span");
        inlineLabel.className = "bandkit-track-analysis is-inline";
        const duration = inlinePlayer.querySelector(".track_info > .time, .time");
        if (duration) duration.after(inlineLabel);
      }
      if (inlineLabel) {
        renderPageAnalysisLabel(inlineLabel, inlineResult, !inlineResult);
      }
    }
  }

  function syncPageAnalyzeButtons() {
    for (const button of document.querySelectorAll(".bandcamp-hub-page-analyze")) {
      const analyzing = pageTrackAnalysisStatus === "analyzing";
      button.classList.toggle("is-analyzing", analyzing);
      button.disabled = analyzing;
      button.title = analyzing ? "Analyzing all page tracks" : "Analyze BPM and key for all tracks";
      button.setAttribute("aria-label", button.title);
    }
  }

  async function analyzePageTracks({ manual = false, force = false } = {}) {
    const tracks = buildSeamlessQueue();
    if (!tracks.length || pageTrackAnalysisStatus === "analyzing") return;
    const signature = pageAnalysisSignature(tracks);
    if (signature !== pageTrackAnalysisSignature) pageTrackAnalysis = new Map();
    pageTrackAnalysisSignature = signature;
    pageTrackAnalysisStatus = "analyzing";
    const request = ++pageTrackAnalysisRequest;
    syncPageAnalyzeButtons();
    syncPageTrackAnalysisUi();
    if (manual) showToast(`Analyzing ${tracks.length} track${tracks.length === 1 ? "" : "s"}…`);
    try {
      let cursor = 0;
      const worker = async () => {
        while (cursor < tracks.length) {
          const track = tracks[cursor];
          cursor += 1;
          const response = await runtimeMessage({ type: MESSAGES.ANALYZE_TRACKS, tracks: [track], force });
          if (request !== pageTrackAnalysisRequest || signature !== pageTrackAnalysisSignature) return;
          const result = response?.ok
            ? response.results?.[0]
            : { id: track.id, url: track.url, error: response?.error || "Track analysis failed." };
          pageTrackAnalysis.set(pageAnalysisTrackKey(track), result || {
            id: track.id,
            url: track.url,
            error: "Track analysis returned no result."
          });
          syncPageTrackAnalysisUi();
        }
      };
      const concurrency = Math.min(PAGE_TRACK_ANALYSIS_CONCURRENCY, tracks.length);
      await Promise.all(Array.from({ length: concurrency }, worker));
      if (request !== pageTrackAnalysisRequest || signature !== pageTrackAnalysisSignature) return;
      pageTrackAnalysisStatus = "ready";
      const completed = [...pageTrackAnalysis.values()].filter((result) => !result.error).length;
      if (manual) showToast(`Analyzed ${completed} of ${tracks.length} track${tracks.length === 1 ? "" : "s"}`);
    } catch (error) {
      if (request !== pageTrackAnalysisRequest) return;
      pageTrackAnalysisStatus = "error";
      if (manual) showToast(error.message || "Track analysis failed.");
    }
    syncPageAnalyzeButtons();
    syncPageTrackAnalysisUi();
  }

  function maybeAnalyzePageTracks() {
    const tracks = buildSeamlessQueue();
    if (!tracks.length) return;
    const signature = pageAnalysisSignature(tracks);
    if (signature !== pageTrackAnalysisSignature) {
      pageTrackAnalysisSignature = signature;
      pageTrackAnalysis = new Map();
      pageTrackAnalysisStatus = "idle";
    }
    syncPageTrackAnalysisUi();
    if (state.autoAnalyzeTracks !== false && pageTrackAnalysisStatus === "idle") {
      void analyzePageTracks();
    }
  }

  function currentInlinePlaylistTrack() {
    const queue = buildSeamlessQueue();
    const title = elementText(document.querySelector(".inline_player"), [".title", ".track-title"]);
    const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase();
    return queue.find((track) => String(track.title || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle)
      || queue[0]
      || null;
  }

  function injectPageDjToolsLink() {
    ensurePageStyles();
    syncPageActionLabelMode();
    const player = document.querySelector(".inline_player");
    if (!player) return;
    let tools = player.querySelector(":scope > .bandcamp-hub-page-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "bandcamp-hub-page-tools";
      player.append(tools);
    }
    let playlistButton = tools.querySelector(".bandcamp-hub-page-playlist.is-player-control");
    if (!playlistButton) {
      playlistButton = createPagePlaylistButton();
      playlistButton.classList.add("is-player-control");
      tools.append(playlistButton);
    }
    updatePagePlaylistButton(playlistButton, currentInlinePlaylistTrack());
    let cartButton = tools.querySelector(".bandcamp-hub-page-cart");
    if (!cartButton) {
      cartButton = createPageCartButton();
      playlistButton.after(cartButton);
    }
    updatePageCartButton(cartButton, currentInlinePlaylistTrack());
    let button = tools.querySelector(".bandcamp-hub-page-dj");
    if (!button) {
      button = document.createElement("button");
      button.className = "bandcamp-hub-page-dj";
      button.type = "button";
      button.style.setProperty("--hub-dj-icon", `url('${asset("icon-dj.svg")}')`);
      button.setAttribute("aria-label", "Show DJ tools on this page");
      tools.append(button);
    }
    setPageActionLabel(button, "DJ tools");
    if (cartButton.nextElementSibling !== button) cartButton.after(button);
    let analyzeButton = tools.querySelector(".bandcamp-hub-page-analyze");
    if (state.autoAnalyzeTracks === false) {
      if (!analyzeButton) {
        analyzeButton = document.createElement("button");
        analyzeButton.className = "bandcamp-hub-page-analyze";
        analyzeButton.type = "button";
        analyzeButton.style.setProperty("--hub-analyze-icon", `url('${asset("icon-reset.svg")}')`);
        analyzeButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void analyzePageTracks({ manual: true, force: true });
        });
      }
      setPageActionLabel(analyzeButton, "Analyze");
      if (button.nextElementSibling !== analyzeButton) button.after(analyzeButton);
      applyPageActionTheme(analyzeButton);
    } else {
      analyzeButton?.remove();
    }
    const addAllButton = tools.querySelector(".bandcamp-hub-page-playlist.is-album-add-all");
    if (addAllButton) (analyzeButton || button).after(addAllButton);
    syncPageAnalyzeButtons();
    const transportRow = tools.querySelector(":scope > .bandkit-page-transport-row");
    if (transportRow && tools.lastElementChild !== transportRow) tools.append(transportRow);
    let inlineHost = player.querySelector(":scope > .bandcamp-hub-page-dj-host");
    if (!inlineHost) {
      inlineHost = document.createElement("div");
      inlineHost.className = "bandcamp-hub-page-dj-host";
      tools.after(inlineHost);
    }
    const pageDjNeedsMount = pageDjHost !== inlineHost || !inlineHost.shadowRoot;
    if (pageDjNeedsMount) {
      pageDjHost = inlineHost;
      pageDjShadow = inlineHost.shadowRoot || inlineHost.attachShadow({ mode: "open" });
      pageDjShadow.replaceChildren();
      const inlineStyle = document.createElement("style");
      inlineStyle.textContent = `${style.textContent}\n:host{display:block}.hub-page-dj-surface{background:var(--hub-card);border:1px solid var(--hub-line);border-radius:6px;padding:12px;width:100%}.hub-page-dj-surface .hub-dj-card{background:transparent;border:0;box-shadow:none;margin:0;overflow:visible;padding:0}`;
      pageDjSurface = document.createElement("div");
      pageDjSurface.className = "hub-page-dj-surface";
      pageDjShadow.append(inlineStyle, pageDjSurface);
      syncPageDjTheme();
    }
    if (pageDjNeedsMount || (pageDjOpen && !pageDjSurface.firstElementChild)) renderPageDjTools();
    else pageDjHost.hidden = !pageDjOpen;
    syncPageDjToolsUi();
    maybeAnalyzePageTracks();
  }

  function feedTrackFromAction(action) {
    const story = action.closest(".story-innards, .story, .story-container, .new-release, .collection-item-container");
    if (!story) return null;
    const metadataNode = story.matches("[data-item-json]") ? story : story.querySelector("[data-item-json]");
    const itemData = parseJsonAttribute(metadataNode, "data-item-json") || {};
    const releaseLink = story.querySelector("a.item-link[href], a[href*='.bandcamp.com/album/'], a[href*='.bandcamp.com/track/']");
    let pageUrl = "";
    try {
      const rawPageUrl = itemData.item_url || releaseLink?.href || "";
      pageUrl = safeBandcampUrl(new URL(String(rawPageUrl).startsWith("//") ? `https:${rawPageUrl}` : rawPageUrl, location.href).href);
    } catch {
      pageUrl = "";
    }
    const title = itemData.featured_track_title
      || elementText(story, [".fav-track-title", ".featured-track .title", ".track-title", ".collection-item-title"]);
    if (!pageUrl || !title) return null;
    const trackId = String(metadataNode?.dataset.trackid
      || story.querySelector("[data-trackid]")?.dataset.trackid
      || itemData.featured_track_id
      || title);
    const liveFeedTrack = getFeedPlayerState()?.track;
    return {
      id: trackId,
      title,
      artist: itemData.band_name
        || elementText(story, [".collection-item-artist", ".artist-name", ".band-name"]).replace(/^by\s+/i, "")
        || "Bandcamp",
      album: itemData.item_title || elementText(story, [".collection-item-title", ".release-title"]),
      art: itemData.item_art_url || story.querySelector("img")?.currentSrc || story.querySelector("img")?.src || "",
      pageUrl,
      artistUrl: safeBandcampUrl(itemData.band_url) || artistUrlFromPageUrl(pageUrl),
      duration: Number(itemData.featured_track_duration) || 0,
      url: String(liveFeedTrack?.id) === trackId ? liveFeedTrack.url : ""
    };
  }

  function discoverTrackFromCard(card) {
    if (!card) return null;
    const pageLink = card.querySelector(".content a.stretch-link[href], a.stretch-link[href], a[href*='.bandcamp.com/album/'], a[href*='.bandcamp.com/track/']");
    const pageUrl = safeBandcampReleaseUrl(pageLink?.href);
    const title = elementText(card, [".content .title", ".header .title", ".title"]);
    if (!pageUrl || !title) return null;
    const artist = elementText(card, [".attribution-meta", ".artist", ".subtitle"]).replace(/^by\s+/i, "") || "Bandcamp";
    const track = {
      id: `${pageUrl}|${title}`,
      title,
      artist,
      album: title,
      art: card.querySelector(".image-container img, img")?.currentSrc || card.querySelector(".image-container img, img")?.src || "",
      pageUrl,
      artistUrl: artistUrlFromPageUrl(pageUrl),
      duration: 0,
      url: ""
    };
    const liveTrack = getDiscoverPlayerState()?.track;
    try {
      const cardRelease = new URL(pageUrl);
      const liveRelease = new URL(liveTrack?.pageUrl || "", location.href);
      if (cardRelease.origin === liveRelease.origin && cardRelease.pathname === liveRelease.pathname) {
        return { ...track, ...liveTrack, pageUrl, album: liveTrack.album || title };
      }
    } catch {}
    return track;
  }

  function recommendationTrackFromCard(card) {
    if (!card?.matches?.("#recommendations_container .recommended-album")) return null;
    const pageLink = card.querySelector("a.album-link[href], a.go-to-album[href], a[href*='/album/'], a[href*='/track/']");
    const pageUrl = resolvedTrackPageUrl({ pageUrl: pageLink?.href });
    const album = String(card.dataset.albumtitle || elementText(card, [".release-title", ".title"])).replace(/\s+/g, " ").trim();
    const title = String(card.dataset.tracktitle || album).replace(/\s+/g, " ").trim();
    if (!pageUrl || !title) return null;
    const streamData = parseJsonAttribute(card, "data-audiourl") || {};
    const streamUrl = typeof streamData === "string" ? streamData : streamData["mp3-128"] || "";
    const artist = String(card.dataset.artist || elementText(card, [".by-artist", ".artist"])).replace(/^by\s+/i, "").trim() || "Bandcamp";
    return {
      id: String(card.dataset.trackid || `${pageUrl}|${title}`),
      title,
      artist,
      album,
      art: card.querySelector(".album-art")?.currentSrc || card.querySelector(".album-art, img")?.src || "",
      pageUrl,
      artistUrl: artistUrlFromPageUrl(pageUrl),
      duration: Math.max(0, Number(card.dataset.duration) || 0),
      url: isReusableStreamUrl(streamUrl) ? streamUrl : ""
    };
  }

  function recommendationPlayControl(card) {
    return card?.querySelector?.(".album-art-container > .play-button, .album-art-container > .play-pause-button, .album-art-container > .playbutton, [aria-label^='Play' i], [aria-label^='Pause' i]") || null;
  }

  function syncRecommendationPlaybackUi() {
    for (const card of document.querySelectorAll("#recommendations_container .recommended-album")) {
      const track = recommendationTrackFromCard(card);
      const current = Boolean(track && seamless.enabled && matchingQueueTrack([seamless.track], track));
      const playing = current && Boolean(seamless.isPlaying);
      card.classList.toggle("bandkit-recommendation-current", current);
      card.classList.toggle("bandkit-recommendation-playing", playing);
      const control = recommendationPlayControl(card);
      if (!control || !track) continue;
      control.setAttribute("role", "button");
      if (!control.hasAttribute("tabindex")) control.tabIndex = 0;
      control.setAttribute("aria-label", current ? (playing ? `Pause ${track.title}` : `Resume ${track.title}`) : `Play ${track.title}`);
      control.setAttribute("aria-pressed", String(playing));
      setPageActionLabel(control, playing ? "Pause" : "Play");
    }
  }

  function injectRecommendationActions() {
    for (const card of document.querySelectorAll("#recommendations_container .recommended-album")) {
      const track = recommendationTrackFromCard(card);
      const artContainer = card.querySelector(".album-art-container");
      if (!track || !artContainer) continue;
      const playControl = recommendationPlayControl(card);
      if (playControl && playControl.dataset.bandkitKeyboardBound !== "true") {
        playControl.dataset.bandkitKeyboardBound = "true";
        playControl.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          playControl.click();
        });
      }
      let button = card.querySelector(".bandcamp-hub-page-playlist.is-recommendation-add-to");
      if (!button) {
        button = createPagePlaylistButton();
        button.classList.add("is-discover-add-to", "is-recommendation-add-to");
        artContainer.append(button);
      } else if (button.parentElement !== artContainer) {
        artContainer.append(button);
      }
      updatePagePlaylistButton(button, track);
      const label = `Add ${track.title} to Now Playing or a playlist`;
      button.setAttribute("aria-label", label);
      button.title = label;
      if (playControl) {
        const controlWidth = playControl.offsetWidth || 36;
        const controlHeight = playControl.offsetHeight || 36;
        button.style.left = `${playControl.offsetLeft + controlWidth + 6}px`;
        button.style.top = `${playControl.offsetTop + Math.max(0, (controlHeight - 28) / 2)}px`;
        button.style.removeProperty("bottom");
      } else {
        button.style.left = "8px";
        button.style.top = "auto";
        button.style.bottom = "8px";
      }
    }
    syncRecommendationPlaybackUi();
  }

  function runNativeRecommendationControl(control) {
    if (!control) return;
    suppressRecommendationControl = true;
    control.click();
    window.setTimeout(() => {
      suppressRecommendationControl = false;
      window.setTimeout(scanLivePlayer, 0);
    }, 0);
  }

  async function playRecommendationCard(card, control) {
    const track = recommendationTrackFromCard(card);
    if (!track) return false;
    const request = ++recommendationHandoffRequest;
    showToast(`Preparing ${track.title}…`);
    try {
      const prepared = await prepareExternalNowPlaying(track);
      if (prepared.cancelled || prepared.capacity || request !== recommendationHandoffRequest) return false;
      if (prepared.index < 0) throw new Error(prepared.error || "This recommendation is not currently streamable.");
      silenceNativePagePlayback();
      const response = await runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE,
        queue: prepared.queue,
        index: prepared.index,
        currentTime: 0,
        autoplay: true,
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        filterValue: state.dj.filterValue,
        gainDb: state.dj.gainDb,
        eqLowDb: state.dj.eqLowDb,
        eqMidDb: state.dj.eqMidDb,
        eqHighDb: state.dj.eqHighDb
      });
      if (!response?.ok) throw new Error(response?.error || "Bandkit could not start this recommendation.");
      if (request !== recommendationHandoffRequest || prepared.request !== playlistPlayRequest) return false;
      applySeamlessState(response.state);
      return true;
    } catch {
      if (request !== recommendationHandoffRequest) return false;
      showToast("Using Bandcamp's player for this recommendation.");
      if (seamless.enabled) await seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
      runNativeRecommendationControl(control);
      return false;
    }
  }

  function collectionTrackFromCard(card) {
    if (!card) return null;
    const metadataNode = card.matches("[data-item-json]") ? card : card.querySelector("[data-item-json]");
    const itemData = parseJsonAttribute(metadataNode, "data-item-json") || {};
    const itemLink = card.querySelector(".collection-item-gallery-container a.item-link[href]")
      || card.querySelector("a.item-link[href*='.bandcamp.com/album/'], a.item-link[href*='.bandcamp.com/track/']");
    const pageUrl = resolvedTrackPageUrl({ pageUrl: itemData.item_url || itemLink?.href });
    const releaseTitle = card.dataset.title
      || itemData.item_title
      || elementText(card, [".collection-item-gallery-container .collection-item-title", ".collection-item-title"]);
    const title = itemData.featured_track_title
      || card.dataset.tracktitle
      || elementText(card, [".fav-track-title", ".featured-track .title", ".track-title"])
      || releaseTitle;
    if (!pageUrl || !title) return null;
    const artist = String(itemData.band_name || elementText(card, [".collection-item-gallery-container .collection-item-artist", ".collection-item-artist"]))
      .replace(/^by\s+/i, "") || "Bandcamp";
    const itemType = String(card.dataset.tralbumtype || card.dataset.itemtype || "").toLowerCase();
    return {
      id: String(itemData.featured_track_id || metadataNode?.dataset.trackid || card.dataset.trackid || title),
      title,
      artist,
      album: itemData.item_title || (itemType === "a" || itemType === "album" ? releaseTitle : ""),
      art: itemData.item_art_url || card.querySelector(".collection-item-art")?.currentSrc || card.querySelector(".collection-item-art")?.src || "",
      pageUrl,
      artistUrl: safeBandcampReleaseUrl(itemData.band_url) || safeBandcampUrl(itemData.band_url) || artistUrlFromPageUrl(pageUrl),
      duration: Number(itemData.featured_track_duration) || 0,
      url: ""
    };
  }

  function runNativeCollectionControl(control) {
    if (!control) return;
    releaseExplicitPlaybackClear();
    collectionNativeFallbackUntil = Date.now() + 5000;
    suppressCollectionControl = true;
    control.click();
    window.setTimeout(() => {
      suppressCollectionControl = false;
    }, 0);
  }

  async function playCollectionCard(card, control) {
    const track = collectionTrackFromCard(card);
    if (!track) return false;
    const request = ++collectionHandoffRequest;
    showToast(`Preparing ${track.title}…`);
    try {
      const prepared = await prepareExternalNowPlaying(track);
      if (prepared.cancelled || prepared.capacity) return false;
      if (request !== collectionHandoffRequest) return false;
      if (prepared.index < 0) throw new Error(prepared.error || "This collection item is not streamable.");
      silenceNativePagePlayback();
      const response = await runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE,
        queue: prepared.queue,
        index: prepared.index,
        currentTime: 0,
        autoplay: true,
        rate: state.dj.rate,
        preservePitch: state.dj.preservePitch,
        filterValue: state.dj.filterValue,
        gainDb: state.dj.gainDb,
        eqLowDb: state.dj.eqLowDb,
        eqMidDb: state.dj.eqMidDb,
        eqHighDb: state.dj.eqHighDb
      });
      if (!response?.ok) throw new Error(response?.error || "Bandkit could not start this collection item.");
      if (request !== collectionHandoffRequest) return false;
      if (prepared.request !== playlistPlayRequest) return false;
      applySeamlessState(response.state);
      return true;
    } catch {
      if (request !== collectionHandoffRequest) return false;
      showToast("Using Bandcamp's player for this item.");
      if (seamless.enabled) await seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
      runNativeCollectionControl(control);
      return false;
    }
  }

  function injectCollectionItemActions() {
    const collectionGrid = document.querySelector('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"]');
    document.documentElement.dataset.bandkitCollectionPage = String(Boolean(collectionGrid));
    if (!collectionGrid) return;
    for (const card of collectionGrid.querySelectorAll(".collection-item-container")) {
      const track = collectionTrackFromCard(card);
      const downloadSource = card.querySelector('.bottom-owner-controls .redownload-item a[href*="/download"]');
      const titleDetails = card.querySelector(".collection-item-gallery-container .collection-title-details");
      if (!track || !downloadSource || !titleDetails) continue;

      let actionRow = titleDetails.querySelector(":scope > .bandkit-collection-action-row");
      if (!actionRow) {
        actionRow = document.createElement("div");
        actionRow.className = "bandkit-feed-action-row bandkit-collection-action-row";
        titleDetails.append(actionRow);
      }

      let playlistButton = card.querySelector(".bandcamp-hub-page-playlist");
      if (!playlistButton) playlistButton = createPagePlaylistButton();
      playlistButton.classList.add("is-feed-compact-action", "is-collection-action");
      playlistButton.classList.remove("is-feed-add-to", "is-feed-sidebar-action");
      updatePagePlaylistButton(playlistButton, track);
      playlistButton.title = `Add ${track.title} to Now Playing or a playlist`;
      if (playlistButton.parentElement !== actionRow) actionRow.append(playlistButton);

      let downloadButton = actionRow.querySelector(".bandkit-collection-download-action");
      if (!downloadButton) {
        downloadButton = document.createElement("a");
        downloadButton.className = "bandkit-feed-purchase-action bandkit-collection-download-action";
        downloadButton.style.setProperty("--bandkit-feed-action-icon", `url('${asset("icon-downloads.svg")}')`);
        actionRow.append(downloadButton);
      }
      downloadButton.href = downloadSource.href;
      setPageActionLabel(downloadButton, "Download");
      downloadButton.setAttribute("aria-label", `Download ${track.title}`);
      downloadButton.title = `Download ${track.title}`;
    }
  }

  function injectPlaylistButtons({ incremental = false } = {}) {
    pageActionsDirty = false;
    ensurePageStyles();
    syncPageActionLabelMode();
    injectCollectionItemActions();
    injectRecommendationActions();
    const playerPlaylistButton = document.querySelector(".inline_player .bandcamp-hub-page-playlist.is-player-control");
    if (playerPlaylistButton) updatePagePlaylistButton(playerPlaylistButton, currentInlinePlaylistTrack());
    const discover = getDiscoverPlayerState();
    const feed = getFeedPlayerState();
    const available = [
      ...buildSeamlessQueue(),
      ...(getModernPlayerState()?.queue || []),
      discover?.track,
      feed?.track
    ].filter(Boolean);
    const onFeedPage = document.documentElement.dataset.bandkitFeedPage === "true";
    const candidates = [
      ...document.querySelectorAll(".track_row_view"),
      ...document.querySelectorAll("section.floating-player .track-meta[streamurl]"),
      ...document.querySelectorAll(onFeedPage ? ".searchresult" : ".searchresult, .collection-item-container[data-trackid]")
    ];

    if (onFeedPage) {
      const feedControls = document.querySelectorAll([
        `.story-innards a${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`,
        `.story-innards button${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`,
        `#sidebar .collection-item-container a${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`,
        `#sidebar .collection-item-container button${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`
      ].join(","));
      for (const purchaseAction of feedControls) {
        purchaseAction.dataset.bandkitFeedActionScanned = "true";
        if (!/^(?:pre[- ]?order|buy now)$/i.test(pageActionControlText(purchaseAction))) continue;
        const track = feedTrackFromAction(purchaseAction);
        if (!track) continue;
        const story = purchaseAction.closest(".story-innards, .story, .story-container, .new-release, .collection-item-container");
        const existingButtons = [...(story?.querySelectorAll(".bandcamp-hub-page-playlist") || [])];
        let button = existingButtons.find((candidate) => candidate.classList.contains("is-feed-add-to")) || existingButtons[0] || null;
        if (!button) button = createPagePlaylistButton();
        button.classList.add("is-feed-add-to");
        updatePagePlaylistButton(button, track);
        for (const duplicate of existingButtons) {
          if (duplicate !== button) duplicate.remove();
        }

        const sidebarCard = purchaseAction.closest(".collection-grid .collection-item-container");
        button.classList.add("is-feed-compact-action");
        button.classList.toggle("is-feed-sidebar-action", Boolean(sidebarCard));
        setPageActionLabel(button, "Add");
        button.title = `Add ${track.title} to Now Playing or a playlist`;
        purchaseAction.classList.add("bandkit-feed-purchase-action");
        const purchaseLabel = /^pre[- ]?order$/i.test(pageActionControlText(purchaseAction)) ? "Pre-order" : "Buy now";
        setPageActionLabel(purchaseAction, purchaseLabel);
        purchaseAction.title = `${purchaseLabel} ${track.album || track.title}`;
        purchaseAction.setAttribute("aria-label", purchaseAction.title);
        purchaseAction.style.setProperty("--bandkit-feed-action-icon", `url('${asset(purchaseLabel === "Pre-order" ? "icon-preorder.svg" : "icon-cart.svg")}')`);
        const actionList = purchaseAction.closest("ul");
        actionList?.classList.add("bandkit-feed-action-row");
        if (sidebarCard) actionList?.classList.add("bandkit-feed-sidebar-actions");
        const hearMoreAction = [...(actionList?.querySelectorAll("a, button") || [])].find((control) => /^hear more$/i.test(pageActionControlText(control)));
        if (hearMoreAction) {
          hearMoreAction.classList.add("bandkit-feed-hear-more-action");
          setPageActionLabel(hearMoreAction, "Hear more");
          hearMoreAction.title = `Hear more from ${track.album || track.artist || track.title}`;
          hearMoreAction.setAttribute("aria-label", hearMoreAction.title);
          hearMoreAction.style.setProperty("--bandkit-feed-action-icon", `url('${asset("icon-hear-more.svg")}')`);
        }
        const wishlistItem = actionList?.querySelector("li[id^='collect-item_']")
          || [...(actionList?.querySelectorAll("li") || [])].find((item) => /^(?:in )?wishlist$/i.test(pageActionControlText(item)));
        wishlistItem?.classList.add("bandkit-feed-wishlist-action");
        wishlistItem?.style.setProperty("--bandkit-feed-wishlist-icon", `url('${asset("icon-wishlist.svg")}')`);
        const wishlistControl = wishlistItem?.querySelector(".wishlist-msg")
          || [...(wishlistItem?.querySelectorAll("a, button") || [])].find((control) => /^wishlist$/i.test(pageActionControlText(control)));
        const wishlistedControl = wishlistItem?.querySelector(".wishlisted-msg > span:first-child")
          || [...(wishlistItem?.querySelectorAll("a, button") || [])].find((control) => /^in wishlist$/i.test(pageActionControlText(control)));
        if (wishlistControl) {
          wishlistControl.classList.add("bandkit-feed-wishlist-control");
          setPageActionLabel(wishlistControl, "Wishlist");
          wishlistControl.title = `Add ${track.album || track.title} to your wishlist`;
          wishlistControl.setAttribute("aria-label", wishlistControl.title);
        }
        if (wishlistedControl) {
          wishlistedControl.classList.add("bandkit-feed-wishlist-control");
          setPageActionLabel(wishlistedControl, "Wishlisted");
          wishlistedControl.title = `${track.album || track.title} is in your wishlist`;
          wishlistedControl.setAttribute("aria-label", wishlistedControl.title);
        }
        if (purchaseAction.previousElementSibling !== button) purchaseAction.before(button);
      }
    }

    if (document.querySelector("#DiscoverApp, .results-grid")) {
      const allDiscoverPlayControls = [...document.querySelectorAll([
        ".results-grid-item .image-container > .play-pause-button",
        ".results-grid-item .image-container > .play-button",
        ".focused-result .play-pause-button",
        ".focused-result .play-button",
        ".focused-result .playbutton",
        ".discover-detail .play-pause-button",
        ".discover-detail .play-button",
        ".discover-detail .playbutton",
        ".focused-result [aria-label^='Play' i]",
        ".focused-result [aria-label^='Pause' i]",
        ".discover-detail [aria-label^='Play' i]",
        ".discover-detail [aria-label^='Pause' i]"
      ].join(", "))];
      const pendingDiscoverPlayControls = incremental
        ? allDiscoverPlayControls.filter((control) => !control.closest(".results-grid-item") || control.dataset.bandkitDiscoverActionScanned !== "true")
        : allDiscoverPlayControls;
      const discoverBatchSize = incremental ? 12 : pendingDiscoverPlayControls.length;
      const visibleDiscoverPlayControls = pendingDiscoverPlayControls.slice(0, discoverBatchSize);
      const hasDeferredDiscoverControls = pendingDiscoverPlayControls.length > visibleDiscoverPlayControls.length;
      const discoverButtonLayouts = [];
      for (const playControl of visibleDiscoverPlayControls) {
        if (playControl.closest(".bandcamp-hub-page-playlist")) continue;
        const nativeDiscoverPlayer = playControl.closest(".discover-player");
        if (nativeDiscoverPlayer && getComputedStyle(nativeDiscoverPlayer).display === "none") continue;
        const resultCard = playControl.closest(".results-grid-item");
        const cardTrack = resultCard ? discoverTrackFromCard(resultCard) : discover?.track;
        if (!cardTrack) continue;
        const parent = resultCard
          ? playControl.parentElement
          : playControl.closest(".focused-result, .discover-detail") || playControl.parentElement;
        if (!parent) continue;
        if (resultCard) playControl.dataset.bandkitDiscoverActionScanned = "true";
        setPageActionLabel(playControl, /^pause/i.test(playControl.getAttribute("aria-label") || "") ? "Pause" : "Play");
        const detail = playControl.closest(".results-grid-item, .focused-result, .discover-detail") || parent;
        let button = detail.querySelector(".bandcamp-hub-page-playlist.is-discover-add-to");
        if (!button) {
          button = createPagePlaylistButton();
          button.classList.add("is-discover-add-to");
          parent.append(button);
        } else if (button.parentElement !== parent) {
          parent.append(button);
        }
        updatePagePlaylistButton(button, cardTrack);
        button.setAttribute("aria-label", `Add ${cardTrack.title} to Now Playing or a playlist`);
        button.title = button.getAttribute("aria-label");
        discoverButtonLayouts.push({ button, playControl });
      }
      // Measure every native control before writing any positions. Interleaving
      // offset reads with per-card style writes forced a full Discover layout
      // dozens of times during each scan, which became increasingly expensive
      // after the virtualised grid had been scrolled.
      const measuredDiscoverButtonLayouts = discoverButtonLayouts.map(({ button, playControl }) => ({
        button,
        left: playControl.offsetLeft + (playControl.offsetWidth || 64) + 8,
        top: playControl.offsetTop
      }));
      for (const { button, left, top } of measuredDiscoverButtonLayouts) {
        button.style.left = `${left}px`;
        button.style.top = `${top}px`;
      }
      if (hasDeferredDiscoverControls) {
        pageActionsDirty = true;
        scheduleLivePlayerMaintenance(80);
      }
    }

    if (discover?.player) candidates.push(discover.player);
    if (feed?.player) candidates.push(feed.player);

    for (const node of [...new Set(candidates)]) {
      const itemData = parseJsonAttribute(node, "data-item-json") || {};
      const title = itemData.featured_track_title || elementText(node, [".track-title", ".title-text", ".player-info .title", ".fav-track-title", ".collection-item-title", ".title"]);
      const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase();
      const nodeStream = node.getAttribute?.("streamurl") || "";
      const fallback = itemFromNode(node);
      const fallbackPageUrl = safeBandcampUrl(itemData.item_url) || fallback?.pageUrl || "";
      let fallbackIsTrack = false;
      try { fallbackIsTrack = new URL(fallbackPageUrl).pathname.includes("/track/"); } catch {}
      const feedTrack = itemData.featured_track_title ? {
        id: String(node.dataset.trackid || itemData.featured_track_id || title),
        title,
        artist: itemData.band_name || fallback?.artist || "Bandcamp",
        album: itemData.item_title || "",
        art: itemData.item_art_url || fallback?.art || "",
        pageUrl: fallbackPageUrl,
        artistUrl: safeBandcampUrl(itemData.band_url) || artistUrlFromPageUrl(fallbackPageUrl),
        duration: Number(itemData.featured_track_duration) || 0,
        url: ""
      } : null;
      const track = available.find((item) => nodeStream && item.url === nodeStream)
        || available.find((item) => String(item.title || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle)
        || feedTrack
        || (fallbackIsTrack ? { ...fallback, id: String(node.dataset.trackid || node.dataset.trackId || title), duration: 0, url: "" } : null);
      if (!track || !resolvedTrackPageUrl(track)) continue;
      if (node.matches(".discover-player") && node.closest(".focused-result, .discover-detail")?.querySelector(".bandcamp-hub-page-playlist.is-discover-add-to")) continue;
      const isClassicTrackRow = node.matches(".track_row_view");
      let buyTrack = isClassicTrackRow
        ? [...node.querySelectorAll("a, button")].find((control) => /^buy track$/i.test(pageActionControlText(control)))
        : null;
      if (isClassicTrackRow) {
        const actionCell = node.querySelector(".download-col, .track-row-actions");
        if (!actionCell) continue;
        let button = node.querySelector(".bandcamp-hub-page-playlist.is-track-action");
        if (!button) {
          button = createPagePlaylistButton("a");
          button.className = `${buyTrack?.className || ""} bandcamp-hub-page-playlist is-track-action`.trim();
          if (buyTrack) buyTrack.before(button);
          else actionCell.append(button);
        }
        if (!buyTrack) {
          buyTrack = document.createElement("button");
          buyTrack.type = "button";
          buyTrack.className = "bandcamp-hub-page-buy bandkit-generated-track-buy";
          buyTrack.textContent = "buy track";
          buyTrack.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void openTrackAction(track, "cart");
          });
          button.after(buyTrack);
        }
        button.classList.remove("bandcamp-hub-page-buy");
        button.style.removeProperty("--hub-buy-icon");
        buyTrack.classList.add("bandcamp-hub-page-buy");
        setPageActionLabel(buyTrack, "Buy");
        buyTrack.style.setProperty("--hub-buy-icon", `url('${asset("icon-cart.svg")}')`);
        applyPageActionTheme(button);
        applyPageActionTheme(buyTrack);
        buyTrack.setAttribute("aria-label", `Buy ${track.title}`);
        buyTrack.title = `Buy ${track.title}`;
        updatePagePlaylistButton(button, track);
        continue;
      }
      if (node.matches(".collection-item-container") && document.documentElement.dataset.bandkitFeedPage === "true") continue;
      if (node.closest('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"]')) continue;
      const titleNode = node.querySelector(".track-title, .title-text, .player-info .title, .fav-track-title, .collection-item-title, .title");
      const target = titleNode?.closest("a")?.parentElement || titleNode?.parentElement || node;
      let button = target.querySelector(":scope > .bandcamp-hub-page-playlist");
      if (!button) {
        button = createPagePlaylistButton();
        target.append(button);
      }
      button.classList.toggle("is-modern-player-track-action", node.matches("section.floating-player .track-meta[streamurl]"));
      updatePagePlaylistButton(button, track);
    }
    syncPageTypography();
  }

  function elementText(root, selectors) {
    for (const selector of selectors) {
      const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
      if (value) return value;
    }
    return "";
  }

  function isGenericCartArtist(value) {
    const artist = String(value || "").trim();
    return !artist || artist.toLowerCase() === "bandcamp";
  }

  function queueCartArtistResolution(items) {
    const unresolved = [...new Map((items || [])
      .filter((item) => isGenericCartArtist(item.artist) && safeBandcampUrl(item.url) && !cartArtistPending.has(item.url) && !cartArtistAttempted.has(item.url))
      .map((item) => [item.url, { url: item.url }])).values()];
    if (!unresolved.length) return;
    for (const item of unresolved) {
      cartArtistPending.add(item.url);
      cartArtistAttempted.add(item.url);
    }
    void runtimeMessage({ type: MESSAGES.RESOLVE_CART_METADATA, items: unresolved }).then((response) => {
      let metadataChanged = false;
      for (const item of response?.items || []) {
        const url = safeBandcampUrl(item?.url);
        const artist = String(item?.artist || "").trim();
        if (!url || isGenericCartArtist(artist)) continue;
        cartArtistCache.set(url, artist);
        metadataChanged = true;
      }
      for (const item of unresolved) cartArtistPending.delete(item.url);
      if (!metadataChanged) return;
      state.savedCarts = state.savedCarts.map((snapshot) => ({
        ...snapshot,
        items: (snapshot.items || []).map((item) => {
          const artist = cartArtistCache.get(safeBandcampUrl(item.url));
          return artist && isGenericCartArtist(item.artist) ? { ...item, artist } : item;
        })
      }));
      scanLiveCart();
      saveState();
      if (state.activeTab === "cart") render();
    }).catch(() => {
      for (const item of unresolved) cartArtistPending.delete(item.url);
    });
  }

  function scanLiveCart() {
    const hasBridgedCart = Array.isArray(bridgedCart);
    const releaseCandidates = (item) => Array.isArray(item?.releases) ? item.releases : [];
    const firstReleaseValue = (item, fields) => {
      for (const release of releaseCandidates(item)) {
        for (const field of fields) {
          const value = release?.[field];
          if (value !== undefined && value !== null && value !== "") return value;
        }
      }
      return "";
    };
    const bridgeArt = (item) => {
      const directUrl = item.item_art_url || item.art_url || firstReleaseValue(item, ["item_art_url", "art_url"]);
      if (/^https?:/i.test(directUrl || "")) return directUrl;
      const artId = Number(item.art_id || item.album_art_id || item.item_art_id || firstReleaseValue(item, ["art_id", "album_art_id", "item_art_id"]));
      if (artId) return `https://f4.bcbits.com/img/a${artId}_7.jpg`;
      const imageId = Number(item.image_id || firstReleaseValue(item, ["image_id"]));
      if (imageId) return `https://f4.bcbits.com/img/${String(imageId).padStart(10, "0")}_37.jpg`;
      return "";
    };
    const parsedFromBridge = Array.isArray(bridgedCart) ? bridgedCart.map((item) => {
      const url = safeBandcampUrl(item.url || firstReleaseValue(item, ["url"])) || location.href;
      const payloadArtist = item.artist_name || item.band_name || item.band_title || item.selling_band_name
        || item.artist || item.artist_title
        || firstReleaseValue(item, ["artist_name", "band_name", "band_title", "selling_band_name", "artist", "artist_title"]);
      const artist = isGenericCartArtist(payloadArtist) ? cartArtistCache.get(url) || "Bandcamp" : payloadArtist;
      return {
        id: `bandcamp-${item.item_type}-${item.item_id}-${item.option_id ?? ""}`,
        title: item.item_title2 || item.item_title || "Bandcamp item",
        artist,
        kind: item.option_name || ({ a: "Digital album", t: "Digital track", b: "Digital discography", p: "Merch" }[item.item_type] || "Saved cart item"),
        price: Math.max(0, Number(item.unit_price) || 0) * Math.max(1, Number(item.quantity) || 1),
        currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD",
        art: bridgeArt(item),
        url,
        restore: portableCartRestore({
          ...item,
          associated_license_id: item.associated_license_id ?? item.license_id ?? null
        })
      };
    }) : [];
    const candidates = [...document.querySelectorAll("#sidecart #item_list > *, [data-test='cart-item'], .cart-item")]
      .filter((node) => node.children.length > 0 && getComputedStyle(node).display !== "none");
    if (!hasBridgedCart && !candidates.length) return;

    const parsedFromDom = candidates.map((row, index) => {
      const title = elementText(row, [".item-title", ".product-title", ".title", "h3", "h4", "a[href]"]);
      if (!title) return null;
      const nativeArtist = elementText(row, [".artist", ".band-name", ".item-artist", ".secondaryText"]);
      const priceText = elementText(row, [".item-price", ".price", ".numeric", "[data-price]"]);
      const numericPrice = Number((priceText.match(/[\d,.]+/) || ["0"])[0].replace(/,/g, ""));
      const currency = /£|\bGBP\b/i.test(priceText) ? "GBP" : /€|\bEUR\b/i.test(priceText) ? "EUR" : /¥|\bJPY\b/i.test(priceText) ? "JPY" : "USD";
      const link = row.querySelector("a[href]")?.href || location.href;
      const imageNode = row.querySelector(".thumb img, .item-art img, .cart-item-art img, img.album-art, img.package-art");
      const backgroundNode = row.querySelector(".thumb, .item-art, .cart-item-art");
      const backgroundImage = backgroundNode ? getComputedStyle(backgroundNode).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1] : "";
      const image = imageNode?.currentSrc || imageNode?.src || backgroundImage || "";
      return {
        id: row.getAttribute("data-item-id") || row.id || `${link}|${title}|${index}`,
        title,
        artist: isGenericCartArtist(nativeArtist) ? cartArtistCache.get(safeBandcampUrl(link)) || "Bandcamp" : nativeArtist,
        kind: elementText(row, [".item-type", ".format", ".description"]) || "Saved cart item",
        price: Number.isFinite(numericPrice) ? numericPrice : 0,
        currency,
        art: image,
        url: link
      };
    }).filter(Boolean);

    const parsed = hasBridgedCart ? parsedFromBridge : parsedFromDom;

    const uniqueItems = [...new Map(parsed.map((item) => [
      `${item.url}|${item.title}|${item.artist}`,
      item
    ])).values()];
    queueCartArtistResolution(uniqueItems);

    const signature = (items) => JSON.stringify(items.map(({ title, artist, price, currency, url, art, restore }) => ({
      title, artist, price, currency, url, art, restoreKey: restore ? `${restore.item_type}:${restore.item_id}:${restore.option_id ?? ""}` : ""
    })));
    const summarySignature = JSON.stringify(bridgedCartSummary || null);
    if (signature(uniqueItems) === signature(state.cart) && summarySignature === JSON.stringify(state.cartSummary || null)) return;
    state.cart = uniqueItems;
    state.cartSummary = bridgedCartSummary ? {
      subtotal: Number.isFinite(Number(bridgedCartSummary.subtotal)) ? Number(bridgedCartSummary.subtotal) : null,
      currency: /^[A-Z]{3}$/.test(bridgedCartSummary.currency || "") ? bridgedCartSummary.currency : null
    } : null;
    state.cartSavedAt = Date.now();
    state.savedCarts = cartAutosave.upsertAutoSavedCart(state.savedCarts, state.cart, {
      savedAt: new Date(state.cartSavedAt).toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      summary: state.cartSummary
    }).savedCarts;
    saveState();
    if (state.activeTab === "cart") render();
  }

  const pageActionSourceSelector = [
    ".track_row_view",
    "section.floating-player",
    ".searchresult",
    ".results-grid-item",
    ".focused-result",
    ".discover-detail",
    ".discover-player",
    ".collection-item-container",
    "#recommendations_container"
  ].join(",");

  function mutationAddsPageActionSource(record) {
    if (!record.addedNodes.length) return false;
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (target?.closest(".bandcamp-hub-page-playlist, .bandcamp-hub-page-playlist-menu, .bandcamp-hub-page-tools")) return false;
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) {
        if (target?.closest(pageActionSourceSelector)) return true;
        continue;
      }
      if (node.matches(".bandcamp-hub-page-playlist, .bandcamp-hub-page-playlist-menu, .bandcamp-hub-page-tools")) continue;
      if (node.matches(pageActionSourceSelector) || node.querySelector(pageActionSourceSelector)) return true;
      if (target?.closest(pageActionSourceSelector)) return true;
    }
    return false;
  }

  function observePageActionSources() {
    if (pageActionsObserver || typeof MutationObserver !== "function") return;
    pageActionsObserver = new MutationObserver((records) => {
      if (!records.some(mutationAddsPageActionSource)) return;
      pageActionsDirty = true;
      scheduleLivePlayerMaintenance(120);
    });
    pageActionsObserver.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleLivePlayerMaintenance(delay = 7000) {
    window.clearTimeout(scanTimer);
    if (scanIdleCallback && "cancelIdleCallback" in window) window.cancelIdleCallback(scanIdleCallback);
    scanIdleCallback = 0;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      if (document.hidden) {
        scheduleLivePlayerMaintenance();
        return;
      }
      if (Date.now() - lastPageScrollAt < 450) {
        scheduleLivePlayerMaintenance(700);
        return;
      }
      const run = () => {
        scanIdleCallback = 0;
        if (document.hidden) {
          scheduleLivePlayerMaintenance();
          return;
        }
        if (Date.now() - lastPageScrollAt < 450) {
          scheduleLivePlayerMaintenance(700);
          return;
        }
        scanLivePlayer();
        if (!scanTimer && !scanIdleCallback) scheduleLivePlayerMaintenance();
      };
      if ("requestIdleCallback" in window) {
        scanIdleCallback = window.requestIdleCallback(run, { timeout: 1800 });
      } else {
        scanTimer = window.setTimeout(run, 32);
      }
    }, Math.max(0, delay));
  }

  function scanLivePlayer() {
    scanLiveCart();
    ensurePagePlayerWaveforms();
    injectPageDjToolsLink();
    if (pageActionsDirty) injectPlaylistButtons({ incremental: true });
    const data = getBandcampPageData();
    const audio = getAudio();
    for (const candidate of document.querySelectorAll("audio")) {
      if (!seamless.enabled) applyDjToAudio(candidate);
      if (observedAudio.has(candidate)) continue;
      observedAudio.add(candidate);
      candidate.addEventListener("play", async () => {
        if (nowPlayingExplicitlyCleared) {
          candidate.pause();
          return;
        }
        if (document.documentElement.dataset.bandkitCollectionPage === "true" && Date.now() < collectionNativeFallbackUntil) {
          scanLivePlayer();
          return;
        }
        const requestedFeedTrackId = pendingFeedTrackId;
        const feedState = getFeedPlayerState(requestedFeedTrackId);
        if (feedState && feedSwitchPendingDisable) {
          if (requestedFeedTrackId) scheduleFeedHandoff(requestedFeedTrackId);
          return;
        }
        const sameSeamlessFeedTrack = Boolean(feedState?.track
          && seamless.enabled
          && matchingQueueTrack([seamless.track], feedState.track));
        if (sameSeamlessFeedTrack) {
          if (!candidate.paused) candidate.pause();
          return;
        }
        if (feedState?.track) {
          const feedTrackId = String(requestedFeedTrackId || feedState.track.id || "");
          muteFeedAudioForHandoff(feedTrackId);
          scheduleFeedHandoff(feedTrackId);
          return;
        }
        const tookOver = await handoffPageAudio(candidate);
        if (!tookOver) {
          if (requestedFeedTrackId) scheduleFeedHandoff(requestedFeedTrackId);
          else scanLivePlayer();
        }
      });
      candidate.addEventListener("pause", scanLivePlayer);
      candidate.addEventListener("ended", scanLivePlayer);
      candidate.addEventListener("timeupdate", () => {
        if (!seamless.enabled && candidate.duration) {
          live.progress = candidate.currentTime / candidate.duration;
          renderPlayer();
        }
      });
    }

    const modern = getModernPlayerState();
    const discover = getDiscoverPlayerState();
    const feed = getFeedPlayerState(pendingFeedTrackId);
    const sameModernTrack = Boolean(modern?.track && seamless.enabled && matchingQueueTrack([seamless.track], modern.track));
    if (modern?.isPlaying && !sameModernTrack) {
      scheduleModernHandoff(modern.key, modern.index);
    } else if (modern?.isPlaying && sameModernTrack) {
      stopModernPagePlayer();
    }

    if (discover?.isPlaying) {
      const sameDiscoverTrack = Boolean(seamless.enabled && matchingQueueTrack([seamless.track], discover.track));
      if ((playlistPlaybackStarting || playlistIsActive()) && !discoverSwitchPendingDisable) {
        pageMediaCommand("pause");
      } else if (sameDiscoverTrack) {
        pageMediaCommand("pause");
      } else if (isReusableStreamUrl(discover.track?.url)) {
        void handoffDiscoverPlayer();
        return;
      } else if (seamless.enabled) {
        void seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
        window.setTimeout(scanLivePlayer, 120);
        return;
      }
    }

    if (feed?.isPlaying) {
      const sameFeedTrack = Boolean(seamless.enabled && matchingQueueTrack([seamless.track], feed.track));
      if (sameFeedTrack) {
        const feedAudio = getAudio();
        if (feedAudio && !feedAudio.paused) feedAudio.pause();
      } else if (isReusableStreamUrl(feed.track?.url)) {
        const feedTrackId = String(pendingFeedTrackId || feed.track.id || "");
        muteFeedAudioForHandoff(feedTrackId);
        scheduleFeedHandoff(feedTrackId);
        return;
      } else if (seamless.enabled) {
        void seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
        window.setTimeout(scanLivePlayer, 120);
        return;
      }
    }

    if (seamless.enabled) {
      syncPagePlayerUi();
      renderPlayer();
      return;
    }

    if (nowPlayingExplicitlyCleared) {
      resetLoadedPlayback();
      renderPlayer();
      if (state.activeTab === "nowPlaying" && !(shadow.activeElement && content.contains(shadow.activeElement))) {
        content.replaceChildren();
        renderCurrentPlaylist();
      }
      return;
    }

    if (!data && !audio && !modern && !discover && !feed && !getGenericPageItem()) return;
    const inlineTitle = document.querySelector(".inline_player .title")?.textContent?.trim();
    const activeRow = document.querySelector(".track_row_view .play_status.playing, .track_row_view.playing, .track_row_view.current");
    const rowTitle = activeRow?.querySelector(".track-title")?.textContent?.trim();
    const tracks = modern?.queue || (data?.tralbum?.trackinfo || []).map((track) => ({
      title: track.title,
      artist: track.artist || data.tralbum.artist || data.embed?.artist || "Bandcamp",
      id: String(track.track_id || track.id || track.title),
      pageUrl: individualTrackPageUrl(track) || resolvedTrackPageUrl(track) || location.href,
      artistUrl: artistUrlFromPageUrl(location.href)
    }));
    const genericItem = getGenericPageItem();
    const currentTitle = modern?.track?.title || discover?.track?.title || feed?.track?.title || inlineTitle || rowTitle || genericItem?.title || live.title;
    const artist = discover?.track?.artist || feed?.track?.artist || data?.tralbum?.artist || data?.embed?.artist || genericItem?.artist || live.artist;
    const artUrl = discover?.track?.art || feed?.track?.art || genericItem?.art || document.querySelector('meta[property="og:image"]')?.content || document.querySelector("#tralbumArt img")?.src || live.art;
    const currentIndex = modern ? modern.index : Math.max(0, tracks.findIndex((track) => track.title === currentTitle));
    const isPlaying = Boolean(modern?.isPlaying || discover?.isPlaying || feed?.isPlaying || (audio && !audio.paused && !audio.ended));
    const currentTime = modern?.currentTime ?? discover?.currentTime ?? feed?.currentTime ?? (Number(audio?.currentTime) || 0);
    live = {
      ...live,
      available: Boolean(data || audio || modern || discover || feed || genericItem),
      isPlaying,
      hasPlaybackStarted: Boolean(live.hasPlaybackStarted || isPlaying || Number(currentTime) > 0),
      title: currentTitle,
      artist,
      art: artUrl,
      pageUrl: modern?.track?.pageUrl || discover?.track?.pageUrl || feed?.track?.pageUrl || tracks[currentIndex]?.pageUrl || genericItem?.pageUrl || location.href,
      artistUrl: modern?.track?.artistUrl || discover?.track?.artistUrl || feed?.track?.artistUrl || genericItem?.artistUrl || artistUrlFromPageUrl(location.href),
      currentTime,
      duration: modern?.duration ?? discover?.duration ?? feed?.duration ?? (Number(audio?.duration) || 0),
      progress: modern?.duration ? modern.currentTime / modern.duration : discover ? discover.progress : feed ? feed.progress : audio?.duration ? audio.currentTime / audio.duration : live.progress,
      tracks: tracks.slice(currentIndex + 1)
    };

    if (live.isPlaying) recordListeningActivity();
    renderPlayer();
    if (state.activeTab === "nowPlaying" && !(shadow.activeElement && content.contains(shadow.activeElement))) {
      content.replaceChildren();
      renderCurrentPlaylist();
    }
  }

  function recordListeningActivity() {
    const activityUrl = seamless.track?.pageUrl || live.pageUrl || location.href;
    const key = `${activityUrl}|${live.title}`;
    if (key === lastRecordedTrack) return;
    lastRecordedTrack = key;
    state.activity.unshift({
      id: `local-${Date.now()}`,
      action: "listened",
      title: live.title,
      artist: live.artist,
      time: "Just now · recorded locally",
      createdAt: new Date().toISOString(),
      art: live.art,
      url: portableBandcampUrl(activityUrl, true),
      artistUrl: portableBandcampUrl(seamless.track?.artistUrl || live.artistUrl || artistUrlFromPageUrl(activityUrl))
    });
    state.activity = state.activity.slice(0, 30);
    saveState();
    if (state.activeTab === "activity") {
      content.replaceChildren();
      renderActivity();
    }
  }

  launcher.addEventListener("pointerdown", (event) => {
    if (launcher.classList.contains("is-header")) return;
    if (event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    launcherDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false
    };
    launcher.classList.add("is-dragging");
    try { launcher.setPointerCapture(event.pointerId); } catch {}
    const move = (moveEvent) => {
      if (!launcherDrag || moveEvent.pointerId !== launcherDrag.pointerId) return;
      const deltaX = moveEvent.clientX - launcherDrag.startX;
      const deltaY = moveEvent.clientY - launcherDrag.startY;
      if (!launcherDrag.moved && Math.hypot(deltaX, deltaY) < 3) return;
      launcherDrag.moved = true;
      moveEvent.preventDefault();
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, launcherDrag.left + deltaX));
      const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, launcherDrag.top + deltaY));
      launcher.style.left = `${left}px`;
      launcher.style.right = "auto";
      launcher.style.top = `${top}px`;
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", finish, true);
    };
    const finish = (finishEvent) => {
      if (!launcherDrag || (finishEvent?.pointerId !== undefined && finishEvent.pointerId !== launcherDrag.pointerId)) return;
      const moved = launcherDrag.moved;
      const pointerId = launcherDrag.pointerId;
      launcherDrag = null;
      cleanup();
      launcher.classList.remove("is-dragging");
      try { launcher.releasePointerCapture(pointerId); } catch {}
      if (!moved) return;
      const finalRect = launcher.getBoundingClientRect();
      state.launcherPosition = { left: Math.round(finalRect.left), top: Math.round(finalRect.top) };
      suppressLauncherClick = finishEvent?.type === "pointerup";
      saveState();
      saveLayoutState();
    };
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    window.addEventListener("blur", finish, true);
  });
  document.addEventListener("click", handleNativeHeaderCart, true);
  launcher.addEventListener("click", (event) => {
    if (suppressLauncherClick) {
      suppressLauncherClick = false;
      event.preventDefault();
      return;
    }
    setOpen(!state.open);
  });
  headerCloseButton.addEventListener("click", () => setOpen(false));
  headerResetButton.addEventListener("click", () => {
    if (state.layoutMode === "docked") setOpen(false);
    else resetPanelLayout();
  });
  layoutToggleButton.addEventListener("click", toggleLayoutMode);
  panelHeader.addEventListener("pointerdown", (event) => {
    if (panel.classList.contains("is-contextual") || state.layoutMode === "docked" || event.button !== 0 || event.target.closest("button, a, input, select")) return;
    const rect = panel.getBoundingClientRect();
    dragging = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    panel.style.left = `${rect.left}px`;
    panel.style.right = "auto";
    panel.style.top = `${rect.top}px`;
    panel.style.bottom = "auto";
    panel.style.width = `${rect.width}px`;
    panel.style.height = `${rect.height}px`;
    panelHeader.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  panelHeader.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const left = Math.min(Math.max(8, dragging.left + event.clientX - dragging.startX), window.innerWidth - dragging.width - 8);
    const top = Math.min(Math.max(8, dragging.top + event.clientY - dragging.startY), window.innerHeight - dragging.height - 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    schedulePlayerSectionGeometry();
  });

  const finishDrag = (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    dragging = null;
    capturePanelLayout();
  };
  panelHeader.addEventListener("pointerup", finishDrag);
  panelHeader.addEventListener("pointercancel", finishDrag);

  function setResizeCursor(cursor, activeHandle = null) {
    resizeCursorStyle?.remove();
    resizeCursorStyle = null;
    panel.classList.toggle("is-resizing", Boolean(cursor));
    for (const handle of panel.querySelectorAll(".hub-resize-handle")) handle.classList.toggle("is-active", handle === activeHandle);
    if (!cursor) return;
    resizeCursorStyle = document.createElement("style");
    resizeCursorStyle.textContent = `html, html * { cursor: ${cursor} !important; user-select: none !important; }`;
    document.head.append(resizeCursorStyle);
  }

  for (const handle of panel.querySelectorAll(".hub-resize-handle")) {
    let resizing = null;
    handle.addEventListener("pointerdown", (event) => {
      const pinnedContextualResize = panel.classList.contains("is-contextual") && handle.dataset.edge === "top";
      if (panel.classList.contains("is-contextual") && !pinnedContextualResize) return;
      const dockedEdge = state.dockSide === "left" ? "right" : "left";
      if (event.button !== 0 || (state.layoutMode === "docked" && handle.dataset.edge !== dockedEdge)) return;
      const rect = panel.getBoundingClientRect();
      resizing = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        pinnedContextual: pinnedContextualResize
      };
      if (state.layoutMode !== "docked" && !pinnedContextualResize) {
        panel.style.left = `${rect.left}px`;
        panel.style.right = "auto";
        panel.style.top = `${rect.top}px`;
        panel.style.bottom = "auto";
        panel.style.height = `${rect.height}px`;
      }
      if (!pinnedContextualResize) panel.style.width = `${rect.width}px`;
      setResizeCursor(["top", "bottom"].includes(handle.dataset.edge) ? "ns-resize" : "ew-resize", handle);
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!resizing || event.pointerId !== resizing.pointerId) return;
      const minWidth = 320;
      const minHeight = 520;
      if (resizing.pinnedContextual) {
        const requestedHeight = resizing.height - (event.clientY - resizing.startY);
        const availableHeight = Math.max(220, resizing.bottom - 16);
        const height = Math.max(220, Math.min(availableHeight, requestedHeight));
        state.sectionPanelHeight = Math.round(height);
        panel.style.setProperty("--hub-section-panel-height", `${height}px`);
        schedulePlayerSectionGeometry();
        return;
      }
      if (state.layoutMode === "docked") {
        const deltaX = event.clientX - resizing.startX;
        const requestedWidth = state.dockSide === "left" ? resizing.width + deltaX : resizing.width - deltaX;
        const dockedWidth = Math.max(minWidth, Math.min(window.innerWidth, requestedWidth));
        panel.style.width = `${dockedWidth}px`;
        state.dockedWidth = Math.round(dockedWidth);
        schedulePlayerSectionGeometry();
        return;
      }
      if (handle.dataset.edge === "left") {
        const left = Math.max(8, Math.min(resizing.right - minWidth, resizing.left + event.clientX - resizing.startX));
        panel.style.left = `${left}px`;
        panel.style.width = `${resizing.right - left}px`;
      } else if (handle.dataset.edge === "right") {
        const width = Math.max(minWidth, Math.min(window.innerWidth - resizing.left - 8, resizing.width + event.clientX - resizing.startX));
        panel.style.width = `${width}px`;
      } else if (handle.dataset.edge === "top") {
        const top = Math.max(8, Math.min(resizing.bottom - minHeight, resizing.top + event.clientY - resizing.startY));
        panel.style.top = `${top}px`;
        panel.style.height = `${resizing.bottom - top}px`;
      } else if (handle.dataset.edge === "bottom") {
        const height = Math.max(minHeight, Math.min(window.innerHeight - resizing.top - 8, resizing.height + event.clientY - resizing.startY));
        panel.style.height = `${height}px`;
      }
      schedulePlayerSectionGeometry();
    });
    const finishResize = (event) => {
      if (!resizing || event.pointerId !== resizing.pointerId) return;
      resizing = null;
      setResizeCursor("");
      if (state.layoutMode === "docked") {
        saveState();
        saveLayoutState();
      }
      else if (panel.classList.contains("is-contextual")) saveState();
      else capturePanelLayout();
    };
    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
    handle.addEventListener("lostpointercapture", (event) => {
      if (!resizing || event.pointerId !== resizing.pointerId) return;
      resizing = null;
      setResizeCursor("");
      if (state.layoutMode === "docked") {
        saveState();
        saveLayoutState();
      }
      else if (panel.classList.contains("is-contextual")) saveState();
      else capturePanelLayout();
    });
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const onFeedPage = document.body.classList.contains("feed") || /\/feed\/?$/.test(location.pathname);
    const feedControl = onFeedPage ? event.target.closest(".track_play_auxiliary") : null;
    if (!feedControl) return;
    if (feedControl.closest('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"]')) return;
    const clickedTrackId = String(feedControl.dataset.trackid || feedControl.closest("[data-trackid]")?.dataset.trackid || "");
    if (!clickedTrackId) return;
    suppressedFeedTrackId = "";
    releaseExplicitPlaybackClear();
    const controlsCurrentSeamlessTrack = Boolean(seamless.enabled && clickedTrackId === String(seamless.track?.id || ""));
    if (controlsCurrentSeamlessTrack) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      return;
    }
    muteFeedAudioForHandoff(clickedTrackId);
    pendingFeedTrackId = clickedTrackId;
  }, true);

  document.addEventListener("click", (event) => {
    if (suppressModernControl || suppressRecommendationControl || suppressCollectionControl || !(event.target instanceof Element)) return;
    if (event.target.closest(".track_play_auxiliary,.play-pause-button,.inline_player .playbutton,.inline_player [aria-label*='Play'],.track_row_view .play_status,.track_row_view .play_cell a,#recommendations_container .recommended-album .play-button")) {
      suppressedFeedTrackId = "";
      releaseExplicitPlaybackClear();
      if (playlistPlaybackStarting) {
        playlistPlayRequest += 1;
        playlistPlaybackStartingRequest = 0;
        playlistPlaybackStarting = false;
        pendingPlaylistItemId = "";
        syncCurrentPlaylistPlaybackUi();
      }
    }
    const recommendationControl = event.target.closest("#recommendations_container .recommended-album .play-button, #recommendations_container .recommended-album .play-pause-button, #recommendations_container .recommended-album .playbutton, #recommendations_container .recommended-album [aria-label^='Play' i], #recommendations_container .recommended-album [aria-label^='Pause' i]");
    if (recommendationControl && !recommendationControl.closest(".bandcamp-hub-page-playlist")) {
      const card = recommendationControl.closest(".recommended-album");
      const requestedTrack = recommendationTrackFromCard(card);
      if (!requestedTrack) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const controlsCurrentTrack = Boolean(seamless.enabled && matchingQueueTrack([requestedTrack], seamless.track || {}));
      if (controlsCurrentTrack) void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      else void playRecommendationCard(card, recommendationControl);
      return;
    }
    const collectionControl = event.target.closest('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .collection-item-container .track_play_auxiliary');
    if (collectionControl) {
      const card = collectionControl.closest(".collection-item-container");
      const requestedTrack = collectionTrackFromCard(card);
      if (!requestedTrack) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const controlsCurrentTrack = seamless.enabled && Boolean(matchingQueueTrack([requestedTrack], seamless.track || {}));
      if (controlsCurrentTrack) {
        void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      } else {
        void playCollectionCard(card, collectionControl);
      }
      return;
    }
    const onFeedPage = document.body.classList.contains("feed") || /\/feed\/?$/.test(location.pathname);
    const feedControl = onFeedPage ? event.target.closest(".track_play_auxiliary") : null;
    if (feedControl) {
      const clickedTrackId = String(feedControl.dataset.trackid || feedControl.closest("[data-trackid]")?.dataset.trackid || "");
      const controlsCurrentSeamlessTrack = Boolean(
        seamless.enabled
        && clickedTrackId
        && clickedTrackId === String(seamless.track?.id || "")
      );
      if (controlsCurrentSeamlessTrack) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        return;
      }
      if (clickedTrackId) pendingFeedTrackId = clickedTrackId;
      if (feedHandoffBusy && clickedTrackId && clickedTrackId !== feedHandoffTrackId) {
        playlistPlayRequest += 1;
      }
      if (clickedTrackId) scheduleFeedHandoff(clickedTrackId);
      window.setTimeout(scanLivePlayer, 160);
      return;
    }
    const discoverControl = event.target.closest(".results-grid-item .play-pause-button, .discover-player .play-pause-button");
    if (discoverControl) {
      const discover = getDiscoverPlayerState();
      const requestedDiscoverKey = discover?.track ? playlistTrackKey(discover.track) : "";
      if (discoverHandoffBusy && requestedDiscoverKey && requestedDiscoverKey !== discoverHandoffTrackKey) {
        playlistPlayRequest += 1;
        discoverHandoffPending = true;
      }
      const controlsCurrentSeamlessTrack = Boolean(
        discoverControl.closest(".discover-player")
        && seamless.enabled
        && matchingQueueTrack([seamless.track], discover?.track)
      );
      if (controlsCurrentSeamlessTrack) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        return;
      }
      if (seamless.enabled) {
        discoverSwitchPendingDisable = true;
        void seamlessCommand(MESSAGES.SEAMLESS_DISABLE).finally(() => {
          discoverSwitchPendingDisable = false;
          window.setTimeout(scanLivePlayer, 0);
        });
      } else {
        window.setTimeout(scanLivePlayer, 160);
      }
      return;
    }
    const previous = event.target.closest("section.floating-player .prev-track");
    const next = event.target.closest("section.floating-player .next-track");
    if (seamless.enabled && (previous || next)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void seamlessCommand(previous ? MESSAGES.SEAMLESS_PREVIOUS : MESSAGES.SEAMLESS_NEXT);
      return;
    }
    const control = event.target.closest(".play-pause-button[tracklistkey]");
    if (!control) return;
    const requestedKey = control.getAttribute("tracklistkey") || "";
    const requestedIndex = control.hasAttribute("trackindex") ? Number(control.getAttribute("trackindex")) : null;
    const modern = getModernPlayerState();
    if (modern && seamless.enabled && requestedKey === modern.key) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (requestedIndex !== null && modern.queue[requestedIndex]?.url !== seamless.track?.url) void handoffModernPlayer(requestedIndex);
      else void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      return;
    }
    if (seamless.enabled && seamless.isPlaying) void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
    scheduleModernHandoff(requestedKey, requestedIndex);
  }, true);

  document.addEventListener("change", (event) => {
    if (!seamless.enabled || !(event.target instanceof HTMLInputElement) || !event.target.matches("section.floating-player input[type='range']")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: Number(event.target.value) || 0 });
  }, true);

  document.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches("section.floating-player input[type='range']")) return;
    const control = event.target.closest(".bandkit-page-scrub-control");
    const maximum = Number(event.target.max) || 1;
    const progress = Math.max(0, Math.min(1, (Number(event.target.value) || 0) / maximum));
    control?.style.setProperty("--bandkit-page-scrub-progress", `${(progress * 100).toFixed(2)}%`);
  }, true);

  document.addEventListener("click", (event) => {
    if (!seamless.enabled || !(event.target instanceof Element)) return;
    if (event.target.closest(".bandcamp-hub-page-tools, .bandcamp-hub-page-playlist-menu")) return;
    const previous = event.target.closest(".inline_player .prevbutton, .inline_player [aria-label='Previous track']");
    const next = event.target.closest(".inline_player .nextbutton, .inline_player [aria-label='Next track']");
    const progress = event.target.closest(".inline_player .progbar, .inline_player .progbar_empty");
    if (previous || next || progress) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (previous) void seamlessCommand(MESSAGES.SEAMLESS_PREVIOUS);
      if (next) void seamlessCommand(MESSAGES.SEAMLESS_NEXT);
      if (progress && seamless.duration) {
        const rect = progress.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        void seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: fraction * seamless.duration });
      }
      return;
    }
    const control = event.target.closest(".inline_player .playbutton, .inline_player [aria-label*='Play'], .inline_player [aria-label*='Pause'], .track_row_view .play_status, .track_row_view .play_cell a");
    if (!control) return;
    const requestedTrack = classicPageTrackForControl(control);
    if (!requestedTrack) {
      void seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const controlsCurrentTrack = Boolean(matchingQueueTrack([requestedTrack], seamless.track || {}));
    if (!controlsCurrentTrack) void handoffPageAudio(null, requestedTrack.title);
    else void seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
  }, true);

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const source = event.target.closest("[data-trackid], [data-track-id], [data-audiourl], .track_row_view, .searchresult, .result-info, .discover-item, .results-grid-item");
    const item = itemFromNode(source);
    if (item) lastPageItem = item;
    window.setTimeout(scanLivePlayer, 250);
  }, true);
  playButton.addEventListener("click", async () => {
    releaseExplicitPlaybackClear();
    if (seamless.enabled) {
      await seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      return;
    }
    if (getModernPlayerState()) {
      await handoffModernPlayer();
      return;
    }
    const discover = getDiscoverPlayerState();
    if (discover?.control) {
      discover.control.click();
      window.setTimeout(scanLivePlayer, 160);
      return;
    }
    const feed = getFeedPlayerState();
    if (feed?.control) {
      feed.control.click();
      window.setTimeout(scanLivePlayer, 160);
      return;
    }
    const audio = getAudio();
    if (audio) {
      try {
        if (audio.paused) await audio.play();
        else audio.pause();
      } catch {
        showToast("Use Bandcamp's page player once, then Bandkit can control it.");
      }
      scanLivePlayer();
      return;
    }
    const pageControl = document.querySelector('.inline_player a[aria-label="Play/pause"], .play_cell a[role="button"], button[aria-label*="Play"], [role="button"][aria-label*="Play"]');
    if (pageControl) pageControl.click();
    else showToast("No Bandcamp player was found on this page.");
    window.setTimeout(scanLivePlayer, 250);
  });

  djPlayerButton.addEventListener("click", () => toggleDjTools());
  nowPlayingButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSectionPanel("nowPlaying");
  });
  playerMoreButton.addEventListener("click", () => {
    if (playerMoreButton.disabled) return;
    playerMoreMenu.hidden = !playerMoreMenu.hidden;
    playerMoreButton.setAttribute("aria-expanded", String(!playerMoreMenu.hidden));
  });
  player.querySelector(".hub-player-more-wrap").addEventListener("focusout", () => window.setTimeout(() => {
    if (!player.querySelector(".hub-player-more-wrap").contains(shadow.activeElement)) {
      playerMoreMenu.hidden = true;
      playerMoreButton.setAttribute("aria-expanded", "false");
    }
  }, 0));

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".bandcamp-hub-page-dj") : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    togglePageDjTools();
  }, true);

  player.querySelector(".hub-previous-button").addEventListener("click", async () => {
    if (seamless.enabled) {
      await navigatePlayerQueue(-1);
      return;
    }
    const audio = getAudio();
    if (audio) audio.currentTime = 0;
  });

  player.querySelector(".hub-next-button").addEventListener("click", async () => {
    if (seamless.enabled) {
      await navigatePlayerQueue(1);
      return;
    }
    const next = document.querySelector('.inline_player a[aria-label="Next track"], [aria-label*="Next"], .nextbutton')?.closest("a, button, [role='button']") || document.querySelector(".nextbutton");
    if (next) next.click();
    else showToast("There is no next-track control on this page.");
    window.setTimeout(scanLivePlayer, 250);
  });

  function beginScrub(newInteraction = false) {
    if (newInteraction || !scrubbing) scrubRevision += 1;
    scrubbing = true;
    window.clearTimeout(scrubReleaseTimer);
  }

  function scrubTarget() {
    const duration = seamless.enabled ? Number(seamless.duration) || 0 : Number(getAudio()?.duration) || Number(live.duration) || 0;
    return {
      duration,
      currentTime: (Number(scrubSlider.value) / 1000) * duration
    };
  }

  async function seekToScrubTarget() {
    window.clearTimeout(pendingSeekTimer);
    const target = scrubTarget();
    if (!target.duration) return;
    if (seamless.enabled) {
      await seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: target.currentTime });
      return;
    }
    const audio = getAudio();
    if (audio?.duration) {
      audio.currentTime = target.currentTime;
      return;
    }
    const discover = getDiscoverPlayerState();
    if (discover && bridgedMedia?.src) {
      pageMediaCommand("seek", { currentTime: target.currentTime });
      return;
    }
    if (discover?.timeline) {
      const min = Number(discover.timeline.min) || 0;
      const max = Number(discover.timeline.max) || 1;
      discover.timeline.value = String(min + (max - min) * (target.currentTime / target.duration));
      discover.timeline.dispatchEvent(new Event("input", { bubbles: true }));
      discover.timeline.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async function finishScrub() {
    const revision = scrubRevision;
    window.clearTimeout(scrubReleaseTimer);
    await seekToScrubTarget();
    if (revision !== scrubRevision) return;
    scrubbing = false;
    renderPlayer();
  }

  scrubSlider.addEventListener("pointerdown", () => beginScrub(true));
  scrubSlider.addEventListener("input", () => {
    beginScrub();
    const target = scrubTarget();
    currentTimeLabel.textContent = formatDuration(target.currentTime);
    scrubSlider.setAttribute("aria-valuetext", `${formatDuration(target.currentTime)} of ${formatDuration(target.duration)}`);
    syncScrubVisual();
    window.clearTimeout(pendingSeekTimer);
    pendingSeekTimer = window.setTimeout(() => {
      void seekToScrubTarget();
    }, 60);
  });
  scrubSlider.addEventListener("change", () => {
    void finishScrub();
  });
  scrubSlider.addEventListener("pointerup", () => {
    window.clearTimeout(scrubReleaseTimer);
    scrubReleaseTimer = window.setTimeout(() => {
      if (scrubbing) void finishScrub();
    }, 120);
  });
  scrubSlider.addEventListener("pointercancel", () => {
    window.clearTimeout(pendingSeekTimer);
    window.clearTimeout(scrubReleaseTimer);
    scrubbing = false;
    renderPlayer();
  });
  scrubSlider.addEventListener("blur", () => {
    if (scrubbing) void finishScrub();
  });

  const runtimeMessageHandler = (message, _sender, sendResponse) => {
    if (message?.type === MESSAGES.PING) {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version, ready: hubReady, open: state.open, error: startupError });
      return false;
    }
    if (message?.type === MESSAGES.TOGGLE) setOpen(!state.open);
    if (message?.type === MESSAGES.OPEN) setOpen(true);
    if (message?.type === MESSAGES.SEAMLESS_STATE) applySeamlessState(message.state);
    if (message?.type === MESSAGES.PLAYBACK_CLEARED) clearLocalPlaybackState({ persist: false });
    if (message?.type === MESSAGES.WISHLIST_UPDATED) {
      markWishlistTrack(message.key, message.success !== false);
    }
    if (message?.type === MESSAGES.RESTORE_CART) {
      restoreSavedCart(message.items)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message || "Cart restoration failed." }));
      return true;
    }
    sendResponse({ ok: true });
    return false;
  };
  chrome.runtime.onMessage.addListener(runtimeMessageHandler);
  app.registerCleanup(() => chrome.runtime.onMessage.removeListener(runtimeMessageHandler));
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    const incomingLayout = changes[STORAGE_KEYS.LAYOUT]?.newValue;
    if (incomingLayout && (Number(incomingLayout.revision) || 0) > layoutRevision) {
      applyPersistedLayout(incomingLayout);
      if (hubReady) {
        applyLayoutMode();
        render();
      }
    }
    const incoming = changes[STORAGE_KEYS.STATE]?.newValue;
    if (!incoming) return;
    const savedCarts = cartAutosave.normalizeSavedCarts(incoming.savedCarts);
    const playlist = normalizePlaylist(incoming.playlist);
    const playlistMode = incoming.playlistMode === "manual" ? "manual" : "browse";
    const savedPlaylists = normalizeSavedPlaylists(incoming.savedPlaylists);
    const autoAnalyzeTracks = incoming.autoAnalyzeTracks !== false;
    const showTrackKeys = incoming.showTrackKeys !== false;
    const pageActionLabels = Boolean(incoming.pageActionLabels);
    const recordPlaylistMetadata = incoming.recordPlaylistMetadata !== false;
    const scrubberStyle = incoming.scrubberStyle === "traditional" ? "traditional" : "waveform";
    const musicBarSize = incoming.musicBarSize === "compact" ? "compact" : "standard";
    const musicBarWidth = MUSIC_BAR_WIDTHS.includes(incoming.musicBarWidth) ? incoming.musicBarWidth : "default";
    const musicBarCustomWidth = Math.round(Math.max(480, Math.min(2000, Number(incoming.musicBarCustomWidth) || 900)));
    const appearance = {
      ...state.appearance,
      ...(incoming.appearance || {}),
      savedThemes: Array.isArray(incoming.appearance?.savedThemes)
        ? incoming.appearance.savedThemes.filter((theme) => theme?.id && theme?.label && theme?.accent && theme?.surface).slice(0, 12)
        : state.appearance.savedThemes
    };
    const appearanceChanged = JSON.stringify(appearance) !== JSON.stringify(state.appearance);
    if (JSON.stringify(savedCarts) === JSON.stringify(state.savedCarts)
      && JSON.stringify(playlist) === JSON.stringify(state.playlist)
      && playlistMode === state.playlistMode
      && JSON.stringify(savedPlaylists) === JSON.stringify(state.savedPlaylists)
      && autoAnalyzeTracks === (state.autoAnalyzeTracks !== false)
      && showTrackKeys === (state.showTrackKeys !== false)
      && pageActionLabels === Boolean(state.pageActionLabels)
      && recordPlaylistMetadata === (state.recordPlaylistMetadata !== false)
      && scrubberStyle === state.scrubberStyle
      && musicBarSize === state.musicBarSize
      && musicBarWidth === state.musicBarWidth
      && musicBarCustomWidth === state.musicBarCustomWidth
      && !appearanceChanged) return;
    state.savedCarts = savedCarts;
    state.playlist = playlist;
    state.playlistMode = playlistMode;
    state.savedPlaylists = savedPlaylists;
    state.autoAnalyzeTracks = autoAnalyzeTracks;
    state.showTrackKeys = showTrackKeys;
    state.pageActionLabels = pageActionLabels;
    state.recordPlaylistMetadata = recordPlaylistMetadata;
    state.scrubberStyle = scrubberStyle;
    state.musicBarSize = musicBarSize;
    state.musicBarWidth = musicBarWidth;
    state.musicBarCustomWidth = musicBarCustomWidth;
    state.appearance = appearance;
    if (!state.savedCarts.some((snapshot) => snapshot.id === state.selectedSavedCartId)) {
      state.selectedSavedCartId = null;
    }
    if (["cart", "playlist", "settings", "nowPlaying"].includes(state.activeTab)) render();
    else renderPlayer();
    if (appearanceChanged) applyAppearance();
    syncTrackKeyVisibilityMode();
    syncPageActionLabelMode();
    syncScrubberStyles();
    syncMusicBarSize();
    syncMusicBarWidth();
    ensurePagePlayerWaveforms();
    injectPageDjToolsLink();
    injectPlaylistButtons();
  });

  async function init() {
    document.documentElement.dataset.bandkitFeedPage = String(document.body.classList.contains("feed") || /\/feed\/?$/.test(location.pathname));
    const earlyModernPageBootstrap = document.documentElement.dataset.bandkitModernBootstrap === "true"
      ? globalThis.BandKitModernPagesBootstrap
      : null;
    const savedPromise = storageGet([STORAGE_KEYS.STATE, STORAGE_KEYS.LAYOUT]);
    const styleUrl = new URL(chrome.runtime.getURL("hub.css"));
    styleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
    const modernStyleUrl = new URL(chrome.runtime.getURL("modern-release.css"));
    modernStyleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
    const hubCssPromise = fetch(styleUrl.href).then((response) => response.text());
    const modernCssPromise = earlyModernPageBootstrap
      ? Promise.resolve("")
      : fetch(modernStyleUrl.href).then((response) => response.text());
    const saved = await savedPromise;
    const savedState = saved[STORAGE_KEYS.STATE];
    if (earlyModernPageBootstrap) {
      state.appearance = {
        ...state.appearance,
        ...(savedState?.appearance || {})
      };
      try {
        applyModernReleaseLayout();
      } finally {
        earlyModernPageBootstrap.finish?.();
      }
    }
    const [hubCss, modernCss] = await Promise.all([hubCssPromise, modernCssPromise]);
    style.textContent = hubCss;
    if (modernCss) {
      modernReleaseStyle.textContent = modernCss;
      document.head.append(modernReleaseStyle);
    }
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
      const cartShortcut = headerShortcuts.querySelector('[data-tab="cart"]');
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
        .filter((control) => !root.contains(control));
      const hideHeaderCart = Boolean(state.appearance.hideHeaderCart);
      for (const nativeCart of nativeCarts) {
        nativeCart.setAttribute("data-bandkit-native-cart", "");
        nativeCart.toggleAttribute("hidden", hideHeaderCart);
        const nativeCartWrapper = nativeCart.closest("li");
        nativeCartWrapper?.setAttribute("data-bandkit-native-cart-wrapper", "");
        nativeCartWrapper?.toggleAttribute("hidden", hideHeaderCart);
        if (nativeCart.dataset.bandkitCartBound) continue;
        nativeCart.dataset.bandkitCartBound = "true";
        nativeCart.addEventListener("click", (event) => {
          if (!state.appearance.hideHeaderCart) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          openBandKitCart();
        });
      }
      applyShadowHeaderCartVisibility(hideHeaderCart);
    }
    let extensionStackingAncestor = null;
    let extensionStackingOriginal = null;
    function syncExtensionStackingAncestor() {
      const shadowHost = root.getRootNode() instanceof ShadowRoot ? root.getRootNode().host : null;
      const nextAncestor = root.closest("header, #menubar-wrapper")
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
        root.style.cssText = "align-items:center;display:flex;height:100%;list-style:none;margin:0;padding:0";
        root.className = "bandkit-menu-item";
        root.setAttribute("role", "none");
        if (feedItem.nextElementSibling !== root) feedItem.after(root);
        syncExtensionStackingAncestor();
        launcher.classList.remove("is-floating");
        launcher.classList.add("is-header", "is-modern-header");
        const nativeIcon = feedControl.querySelector("svg");
        const nativeIconStyle = nativeIcon ? getComputedStyle(nativeIcon) : null;
        const nativeColor = nativeIconStyle?.fill && nativeIconStyle.fill !== "none"
          ? nativeIconStyle.fill
          : nativeIconStyle?.stroke || getComputedStyle(feedControl).color;
        launcher.style.color = nativeColor;
        syncNativeHeaderCart(modernNav);
        return true;
      }
      if (legacyNav) {
        root.style.cssText = "align-items:center;display:flex;height:100%;list-style:none;margin:0;padding:0";
        root.className = "";
        root.removeAttribute("role");
        if (root.parentElement !== legacyNav) legacyNav.prepend(root);
        syncExtensionStackingAncestor();
        launcher.style.removeProperty("color");
        launcher.classList.remove("is-floating", "is-modern-header");
        launcher.classList.add("is-header");
        syncNativeHeaderCart(legacyNav);
        return true;
      }
      if (allowFloating) {
        document.body.append(root);
        syncExtensionStackingAncestor();
        launcher.style.removeProperty("color");
        launcher.classList.remove("is-header", "is-modern-header");
        launcher.classList.add("is-floating");
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
          mountLauncherInHeader({ allowFloating: !root.isConnected });
          applyShadowHeaderTheme();
          syncPlayerPageSpace();
        });
    }
    mountLauncherInHeader({ allowFloating: true });
    applyShadowHeaderTheme();
    syncPlayerPageSpace();
    requestAnimationFrame(syncPlayerPageSpace);
    if ("ResizeObserver" in window) {
      playerResizeObserver = new ResizeObserver(syncPlayerPageSpace);
      playerResizeObserver.observe(player);
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
    syncPageTypography();

    if (savedState) {
      state = app.replaceState({
        ...state,
        ...savedState,
        cart: savedState.cart || state.cart,
        savedCarts: cartAutosave.normalizeSavedCarts(savedState.savedCarts || state.savedCarts),
        playlist: normalizePlaylist(savedState.playlist || state.playlist),
        savedPlaylists: normalizeSavedPlaylists(savedState.savedPlaylists || state.savedPlaylists),
        activity: (savedState.activity || []).filter((item) => item?.url),
        appearance: {
          ...state.appearance,
          ...(savedState.appearance || {}),
          savedThemes: Array.isArray(savedState.appearance?.savedThemes)
            ? savedState.appearance.savedThemes.filter((theme) => theme?.id && theme?.label && theme?.accent && theme?.surface).slice(0, 12)
            : []
        },
        dj: {
          ...state.dj,
          ...(savedState.dj || {})
        }
      });
    }
    state.playlistMode = state.playlistMode === "manual" ? "manual" : "browse";
    state.scrubberStyle = state.scrubberStyle === "traditional" ? "traditional" : "waveform";
    state.musicBarSize = state.musicBarSize === "compact" ? "compact" : "standard";
    state.musicBarWidth = MUSIC_BAR_WIDTHS.includes(state.musicBarWidth) ? state.musicBarWidth : "default";
    state.musicBarCustomWidth = Math.round(Math.max(480, Math.min(2000, Number(state.musicBarCustomWidth) || 900)));
    state.appearance.applyToPage = Boolean(state.appearance.applyToPage);
    state.appearance.pageAware = !state.appearance.applyToPage;
    const hideShoppingCart = Boolean(state.appearance.hidePageCart || state.appearance.hideHeaderCart);
    state.appearance.hidePageCart = hideShoppingCart;
    state.appearance.hideHeaderCart = hideShoppingCart;
    if (String(state.dataFolderName || "").toLowerCase() === DEFAULT_DATA_FOLDER.toLowerCase()) {
      state.dataFolderName = `Documents/${DEFAULT_DATA_FOLDER}`;
      saveState();
    }
    const discoveredFeedUrl = discoverBandcampFeedUrl();
    if (discoveredFeedUrl && discoveredFeedUrl !== state.feedUrl) {
      state.feedUrl = discoveredFeedUrl;
      saveState();
    }
    if (openFeedFromBandcampHome()) return;
    applyPersistedLayout(saved[STORAGE_KEYS.LAYOUT]);
    const savedAtDate = state.cartSavedAt ? new Date(state.cartSavedAt) : new Date();
    const initialAutoSave = cartAutosave.upsertAutoSavedCart(state.savedCarts, state.cart, {
      savedAt: Number.isNaN(savedAtDate.getTime()) ? new Date().toISOString() : savedAtDate.toISOString(),
      sourcePage: portableBandcampUrl(location.href),
      summary: state.cartSummary
    });
    state.savedCarts = initialAutoSave.savedCarts;
    if (initialAutoSave.changed) saveState();
    if (state.activeTab === "playing") state.activeTab = "nowPlaying";
    if (state.activeTab === "playlist" && state.playlistView === "current") state.activeTab = "nowPlaying";
    if (![...tabs.map((tab) => tab.id), "nowPlaying"].includes(state.activeTab)) state.activeTab = "playlist";
    if (!["floating", "docked"].includes(state.layoutMode)) state.layoutMode = "floating";
    if (!["left", "right"].includes(state.dockSide)) state.dockSide = "right";
    if (!Number.isFinite(Number(state.dockedWidth)) || Number(state.dockedWidth) < 320) state.dockedWidth = 420;
    state.wishlistTrackKeys = Array.isArray(state.wishlistTrackKeys)
      ? state.wishlistTrackKeys.filter((key) => typeof key === "string" && key).slice(-500)
      : [];
    pageDjOpen = Boolean(state.dj.pageOpen);
    if (!state.launcherPosition || !Number.isFinite(Number(state.launcherPosition.left)) || !Number.isFinite(Number(state.launcherPosition.top))) {
      state.launcherPosition = null;
    }
    await syncSeamlessState();
    applyAppearance();
    syncTrackKeyVisibilityMode();
    syncPageActionLabelMode();
    applyLayoutMode();
    observePageActionSources();
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        capturePanelLayout();
        schedulePlayerSectionGeometry();
      }).observe(panel);
    }
    scanLivePlayer();
    render();
    void refreshIncompletePlaylistMetadata();
    runPendingTrackAction();
    if (!scanTimer && !scanIdleCallback) scheduleLivePlayerMaintenance();
    seamlessSyncTimer = window.setInterval(() => void syncSeamlessState(), 3000);
    window.addEventListener("scroll", () => {
      lastPageScrollAt = Date.now();
    }, { passive: true });
    window.addEventListener("pageshow", () => void syncSeamlessState());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        void syncSeamlessState();
        scheduleLivePlayerMaintenance(120);
      }
    });
    window.setTimeout(applyAppearance, 800);
    window.addEventListener("resize", () => {
      applyLauncherPosition();
      applySavedLayout();
      syncPlayerPageSpace();
      schedulePlayerSectionGeometry();
    });
    app.registerCleanup(() => {
      window.clearTimeout(scanTimer);
      window.clearTimeout(playerEventScanTimer);
      if (scanIdleCallback && "cancelIdleCallback" in window) window.cancelIdleCallback(scanIdleCallback);
      window.clearInterval(seamlessSyncTimer);
      window.clearTimeout(layoutSaveTimer);
      window.clearTimeout(feedHandoffTimer);
      window.cancelAnimationFrame(playerSectionGeometryFrame);
      playerResizeObserver?.disconnect();
      pageActionsObserver?.disconnect();
      headerObserver.disconnect();
      shadowHeaderObserver?.disconnect();
      const finalPanelRect = panel.getBoundingClientRect();
      if (finalPanelRect.width && finalPanelRect.height) {
        if (state.layoutMode === "docked") {
          state.dockedWidth = Math.round(finalPanelRect.width);
        } else {
          state.layout = {
            left: Math.round(finalPanelRect.left),
            top: Math.round(finalPanelRect.top),
            width: Math.round(finalPanelRect.width),
            height: Math.round(finalPanelRect.height)
          };
        }
      }
      saveLayoutState();
      setResizeCursor("");
    });
    window.addEventListener("pagehide", () => app.cleanup(), { once: true });
    hubReady = true;
    reportDiagnostic("ready");
  }

  init().catch((error) => {
    startupError = String(error?.stack || error?.message || error);
    console.error("Bandkit failed to start.", error);
    reportDiagnostic("error", startupError);
    try {
      app.cleanup();
    } catch {}
    root.remove();
  });
})();
