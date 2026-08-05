(() => {
  if (window.top !== window || document.getElementById("bandcamp-hub-extension-root")) {
    return;
  }

  const asset = (name) => chrome.runtime.getURL(`assets/${name}`);
  const cartAutosave = globalThis.BandKitCartAutosave;
  const BUILT_IN_THEMES = [
    { id: "studio", label: "Studio", accent: "#1da0c3", surface: "#ffffff", background: "#eef2f4", pageSurface: "#ffffff", text: "#111827" },
    { id: "midnight", label: "Midnight", accent: "#8b7cff", surface: "#18181f", background: "#0d0d12", pageSurface: "#18181f", text: "#f8fafc" },
    { id: "warm", label: "Warm", accent: "#db6f3d", surface: "#fff7ed", background: "#f4eadf", pageSurface: "#fffaf4", text: "#29201a" },
    { id: "forest", label: "Forest", accent: "#45a36f", surface: "#17231d", background: "#0c1510", pageSurface: "#17231d", text: "#f2fbf5" },
    { id: "mono", label: "Mono", accent: "#6b7280", surface: "#f3f4f6", background: "#e5e7eb", pageSurface: "#f9fafb", text: "#111827" },
    { id: "plum", label: "Plum", accent: "#c061cb", surface: "#241827", background: "#160f18", pageSurface: "#241827", text: "#fff7ff" },
    { id: "ocean", label: "Ocean", accent: "#38bdf8", surface: "#0f2433", background: "#071721", pageSurface: "#0f2433", text: "#f0f9ff" }
  ];
  const defaultState = {
    open: false,
    activeTab: "playlist",
    layout: null,
    layoutMode: "floating",
    dockSide: "right",
    dockedWidth: 420,
    launcherPosition: null,
    appearance: {
      pageAware: true,
      applyToPage: false,
      modernReleasePages: false,
      hidePageCart: true,
      hideHeaderCart: true,
      preset: "studio",
      customAccent: "#1da0c3",
      customSurface: "#ffffff",
      customPageBackground: "#eef2f4",
      customPageSurface: "#ffffff",
      customText: "#111827",
      savedThemes: []
    },
    dj: {
      open: false,
      rate: 1,
      range: 10,
      preservePitch: true,
      autoTempo: true,
      filterValue: 0,
      gainDb: 0,
      eqLowDb: 0,
      eqMidDb: 0,
      eqHighDb: 0,
      jogAdjust: 0.5,
      vinylSpeedAdjust: 0.35,
      loopSize: 4,
      loopPage: 1,
      knobMode: "both",
      pageOpen: false
    },
    cartSavedAt: null,
    cart: [],
    cartSummary: null,
    savedCarts: [],
    cartView: "current",
    selectedSavedCartId: null,
    playlist: [],
    savedPlaylists: [],
    playlistView: "current",
    selectedSavedPlaylistId: null,
    sectionPanelHeight: null,
    wishlistTrackKeys: [],
    activity: []
  };

  let state = structuredClone(defaultState);
  let layoutRevision = 0;
  let clearedPageQueueSignature = "";
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
  let scanTimer;
  let seamlessSyncTimer;
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
  let discoverHandoffBusy = false;
  let feedHandoffBusy = false;
  let suppressModernControl = false;
  let scrubbing = false;
  let pendingSeekTimer = 0;
  let scrubReleaseTimer = 0;
  let playerActionSignature = "";
  let scrubRevision = 0;
  let bpmTapTimes = [];
  let resizeCursorStyle = null;
  const observedAudio = new WeakSet();
  let bridgedMedia = null;
  let bridgedCart = null;
  let bridgedCartSummary = null;
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

  function pageMediaCommand(action, details = {}) {
    document.dispatchEvent(new CustomEvent("bandkit:media-command", { detail: { action, ...details } }));
  }

  document.addEventListener("bandkit:media-state", (event) => {
    const next = event.detail;
    if (!next || typeof next !== "object") return;
    bridgedMedia = {
      src: typeof next.src === "string" ? next.src : "",
      paused: Boolean(next.paused),
      ended: Boolean(next.ended),
      currentTime: Number(next.currentTime) || 0,
      duration: Number(next.duration) || 0,
      playbackRate: Number(next.playbackRate) || 1,
      volume: Number(next.volume) || 1
    };
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
  launcher.title = "Toggle BandKit (Alt+Shift+B)";
  launcher.setAttribute("aria-label", "Toggle BandKit");
  const launcherIcon = document.createElement("span");
  launcherIcon.className = "hub-launcher-mark";
  launcherIcon.style.setProperty("--hub-icon", `url("${asset("icon-playing.svg")}")`);
  launcher.append(launcherIcon);

  const panel = document.createElement("section");
  panel.className = "hub-panel is-contextual";
  panel.setAttribute("aria-label", "BandKit");
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
        <button class="hub-icon-button hub-layout-toggle" type="button" aria-label="Dock BandKit to the right" title="Dock BandKit to the right">
          <img src="${asset("icon-dock.svg")}" alt="">
        </button>
        <button class="hub-icon-button hub-close" type="button" aria-label="Close BandKit">
          <img src="${asset("icon-close.svg")}" alt="">
        </button>
      </div>
    </header>
    <nav class="hub-tabs" aria-label="BandKit sections"></nav>
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
          <input class="hub-scrub-slider" type="range" min="0" max="1000" step="1" value="0" aria-label="Playback position">
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
  headerShortcuts.setAttribute("aria-label", "BandKit shortcuts");
  const playerSections = document.createElement("div");
  playerSections.className = "hub-player-sections";
  playerSections.setAttribute("aria-label", "BandKit player and sections");
  playerSections.append(player.querySelector(".hub-now-playing-button"), headerShortcuts);
  player.append(playerSections);
  shadow.append(launcher, panel, player);

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
  const headerResetButton = panel.querySelector(".hub-reset");
  const layoutToggleButton = panel.querySelector(".hub-layout-toggle");
  const djDrawer = player.querySelector(".hub-dj-drawer");
  const scrubSlider = player.querySelector(".hub-scrub-slider");
  const currentTimeLabel = player.querySelector(".hub-current-time");
  const durationLabel = player.querySelector(".hub-duration");
  const toast = player.querySelector(".hub-toast");

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.className = "hub-tab";
    button.type = "button";
    button.dataset.tab = tab.id;
    button.title = tab.label;
    button.setAttribute("aria-label", tab.label);
    button.innerHTML = `<span class="hub-tab-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span><span class="hub-tab-dot"></span>`;
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
    shortcut.innerHTML = `<span class="hub-header-shortcut-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span>${tab.id === "cart" ? '<span class="hub-now-playing-count hub-cart-shortcut-count">0</span>' : '<span class="hub-header-shortcut-dot"></span>'}`;
    shortcut.addEventListener("click", () => {
      const closeCurrent = state.open && state.activeTab === tab.id;
      state.activeTab = tab.id;
      state.open = !closeCurrent;
      saveState();
      saveLayoutState();
      render();
    });
    headerShortcuts.append(shortcut);
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function resolveImage(source) {
    return /^https?:/.test(source || "") ? source : "";
  }

  function createArt(source, small = false) {
    const image = createElement("img", `hub-art${small ? " is-small" : ""}`);
    const imageUrl = resolveImage(source);
    if (imageUrl) image.src = imageUrl;
    else image.classList.add("is-empty");
    image.alt = "";
    return image;
  }

  function createSectionHeading(label, metaText = "") {
    const heading = createElement("h2", "hub-section-heading");
    heading.append(document.createTextNode(label));
    if (metaText) heading.append(createElement("span", "hub-section-heading-meta", metaText));
    return heading;
  }

  function formatPrice(value) {
    return `$${Number(value).toFixed(2)}`;
  }

  function formatCartPrice(value, currency = "USD") {
    const amount = Number(value) || 0;
    const code = /^[A-Z]{3}$/.test(currency || "") ? currency : "USD";
    try {
      const formatted = new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).format(amount);
      return `${formatted} ${code}`;
    } catch {
      return `${code} ${amount.toFixed(2)}`;
    }
  }

  function formatDuration(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function parseClock(value) {
    return String(value || "").trim().split(":").reduce((total, part) => total * 60 + (Number(part) || 0), 0);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function safeBandcampUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com")) ? url.href : "";
    } catch {
      return "";
    }
  }

  function resolvedTrackPageUrl(track) {
    try {
      const value = track?.title_link || track?.pageUrl || location.href;
      const url = new URL(value, location.href);
      return url.protocol === "https:" && (url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com")) ? url.href : "";
    } catch {
      return "";
    }
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
      void runtimeMessage({ type: "BANDCAMP_HUB_WISHLIST_RESULT", key: wishlistKey, success });
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
      type: "BANDCAMP_HUB_RESOLVE_CART_ITEMS",
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
      const response = await runtimeMessage({ type: "BANDCAMP_HUB_OPEN_BACKGROUND_TAB", url: target.href });
      if (!response?.ok) {
        showToast(response?.error || "Bandcamp could not open the wishlist action.");
        return;
      }
      markWishlistTrack(track, true);
      showToast(`Adding “${track.title}” to your Bandcamp wishlist…`);
      return;
    }
    window.open(target.href, "_blank", "noopener");
    showToast("Opened the track's Bandcamp purchase action");
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
    const pageUrl = safeBandcampUrl(value);
    if (!pageUrl) return "";
    try {
      const url = new URL(pageUrl);
      return url.hostname === "bandcamp.com" ? pageUrl : `${url.origin}/`;
    } catch {
      return pageUrl;
    }
  }

  function createPageLink(text, url, className = "") {
    const link = createElement("a", className, text);
    const safeUrl = safeBandcampUrl(url);
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
    const safeUrl = safeBandcampUrl(value);
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
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function storageGet(key) {
    return new Promise((resolve) => chrome.storage.local.get(key, resolve));
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

  function saveState() {
    chrome.storage.local.set({ bandcampHubState: state });
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
    chrome.storage.local.set({ bandcampHubLayout: savedLayoutState() });
  }

  function syncPageTypography() {
    const pageFont = getComputedStyle(document.body).fontFamily?.trim();
    const fontFamily = pageFont && pageFont !== "initial"
      ? pageFont
      : '"Helvetica Neue", Helvetica, Arial, sans-serif';
    host.style.setProperty("--hub-font-family", fontFamily);
    for (const control of document.querySelectorAll(".bandcamp-hub-page-playlist, .bandcamp-hub-page-playlist-menu")) {
      control.style.setProperty("--hub-font-family", fontFamily);
    }
  }

  function playlistTrackKey(track) {
    const pageUrl = safeBandcampUrl(track?.pageUrl);
    return `${pageUrl}|${String(track?.id || "")}|${String(track?.title || "").replace(/\s+/g, " ").trim().toLowerCase()}`;
  }

  function normalizePlaylistItem(track, index = 0) {
    if (!track || typeof track !== "object" || !String(track.title || "").trim()) return null;
    const pageUrl = safeBandcampUrl(track.pageUrl);
    if (!pageUrl) return null;
    const fallbackId = `${track.id || pageUrl}|${track.title}|${index}`;
    return {
      playlistItemId: String(track.playlistItemId || `playlist-${fallbackId}`).slice(0, 500),
      id: String(track.id || track.title).slice(0, 500),
      title: String(track.title || "Untitled").slice(0, 500),
      artist: String(track.artist || "Bandcamp").slice(0, 500),
      album: String(track.album || "").slice(0, 500),
      art: /^https?:/.test(track.art || "") ? String(track.art).slice(0, 4000) : "",
      pageUrl,
      artistUrl: safeBandcampUrl(track.artistUrl),
      duration: Math.max(0, Number(track.duration) || 0),
      url: isReusableStreamUrl(track.url) ? track.url : "",
      addedAt: String(track.addedAt || ""),
      restoreError: String(track.restoreError || "").slice(0, 500)
    };
  }

  function normalizePlaylist(items) {
    const normalized = [];
    const itemIds = new Set();
    for (const [index, source] of (Array.isArray(items) ? items : []).slice(0, 500).entries()) {
      const item = normalizePlaylistItem(source, index);
      if (!item) continue;
      if (itemIds.has(item.playlistItemId)) item.playlistItemId = `playlist-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      itemIds.add(item.playlistItemId);
      normalized.push(item);
    }
    return normalized;
  }

  function normalizeSavedPlaylists(savedPlaylists) {
    return (Array.isArray(savedPlaylists) ? savedPlaylists : []).map((snapshot, index) => ({
      id: String(snapshot?.id || `saved-playlist-${index}`).slice(0, 500),
      name: String(snapshot?.name || "Saved playlist").trim().slice(0, 120),
      savedAt: snapshot?.savedAt || new Date().toISOString(),
      sourcePage: safeBandcampUrl(snapshot?.sourcePage),
      items: normalizePlaylist(snapshot?.items)
    })).filter((snapshot) => snapshot.items.length).slice(0, 30);
  }

  function playlistIsActive() {
    return Boolean(seamless.enabled && seamless.track?.playlistItemId && seamless.queue?.some((track) => track.playlistItemId === seamless.track.playlistItemId));
  }

  async function syncActivePlaylistQueue() {
    if (!playlistIsActive()) return;
    const playable = state.playlist.filter((track) => isReusableStreamUrl(track.url));
    await seamlessCommand("BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE", { queue: playable });
  }

  function addTracksToPlaylist(tracks, { quiet = false } = {}) {
    clearedPageQueueSignature = "";
    const incoming = normalizePlaylist(tracks);
    const existingKeys = new Set(state.playlist.map(playlistTrackKey));
    let added = 0;
    let refreshed = 0;
    for (const source of incoming) {
      const key = playlistTrackKey(source);
      const existingIndex = state.playlist.findIndex((item) => playlistTrackKey(item) === key);
      if (existingIndex >= 0) {
        if (source.url && state.playlist[existingIndex].url !== source.url) {
          state.playlist[existingIndex] = { ...state.playlist[existingIndex], ...source, playlistItemId: state.playlist[existingIndex].playlistItemId };
          refreshed += 1;
        }
        continue;
      }
      source.playlistItemId = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      source.addedAt ||= new Date().toISOString();
      state.playlist.push(source);
      existingKeys.add(key);
      added += 1;
    }
    if (added || refreshed) {
      state.playlist = normalizePlaylist(state.playlist);
      saveState();
      void syncActivePlaylistQueue();
      if (state.activeTab === "nowPlaying") render();
      injectPlaylistButtons();
    }
    if (!quiet) showToast(added ? `Added ${added} track${added === 1 ? "" : "s"} to Now Playing` : "Already in Now Playing");
    return added;
  }

  function addTrackToPlaylist(track) {
    return addTracksToPlaylist([track]);
  }

  function createSavedPlaylistWithTracks(tracks, suggestedName = "New playlist") {
    const items = normalizePlaylist(tracks);
    if (!items.length) return null;
    const name = window.prompt("Name this playlist", suggestedName)?.trim();
    if (!name) return null;
    const snapshot = {
      id: `saved-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.slice(0, 120),
      savedAt: new Date().toISOString(),
      sourcePage: location.href,
      items
    };
    state.savedPlaylists.unshift(snapshot);
    state.savedPlaylists = normalizeSavedPlaylists(state.savedPlaylists);
    saveState();
    if (state.activeTab === "playlist" && state.playlistView === "saved") render();
    showToast(`Added to “${snapshot.name}”`);
    return snapshot;
  }

  function addTrackToSavedPlaylist(track, snapshotId) {
    const snapshot = state.savedPlaylists.find((entry) => entry.id === snapshotId);
    const item = normalizePlaylistItem(track);
    if (!snapshot || !item) return false;
    if (snapshot.items.some((entry) => playlistTrackKey(entry) === playlistTrackKey(item))) {
      showToast(`Already in “${snapshot.name}”`);
      return false;
    }
    item.playlistItemId = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    item.addedAt = new Date().toISOString();
    snapshot.items.push(item);
    snapshot.items = normalizePlaylist(snapshot.items);
    saveState();
    if (state.activeTab === "playlist" && state.playlistView === "saved") render();
    showToast(`Added to “${snapshot.name}”`);
    return true;
  }

  async function hydratePlaylist(items) {
    const response = await runtimeMessage({ type: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS", items });
    if (!response?.ok) return { items: normalizePlaylist(items), failed: items.length, error: response?.error || "Could not refresh the playlist." };
    const hydrated = normalizePlaylist(response.items);
    return {
      items: hydrated,
      failed: hydrated.filter((item) => !isReusableStreamUrl(item.url)).length,
      error: ""
    };
  }

  async function playPlaylistAt(requestedIndex = 0) {
    if (!state.playlist.length) {
      showToast("Add a streamable Bandcamp track to the playlist first.");
      return false;
    }
    const target = state.playlist[Math.max(0, Math.min(state.playlist.length - 1, Number(requestedIndex) || 0))];
    const activeIndex = seamless.queue?.findIndex((track) => track.playlistItemId === target.playlistItemId) ?? -1;
    if (playlistIsActive() && activeIndex >= 0) {
      await seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_INDEX", { index: activeIndex, autoplay: true });
      return true;
    }
    showToast("Refreshing the playlist from Bandcamp…");
    const hydrated = await hydratePlaylist(state.playlist);
    state.playlist = hydrated.items;
    saveState();
    const queue = state.playlist.filter((track) => isReusableStreamUrl(track.url));
    if (!queue.length) {
      render();
      showToast(hydrated.error || "None of these tracks are currently streamable.");
      return false;
    }
    const index = Math.max(0, queue.findIndex((track) => track.playlistItemId === target.playlistItemId));
    const response = await runtimeMessage({
      type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
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
      showToast(response?.error || "The playlist could not start.");
      return false;
    }
    stopModernPagePlayer();
    pageMediaCommand("pause");
    const pageAudio = getAudio();
    if (pageAudio && !pageAudio.paused) pageAudio.pause();
    applySeamlessState(response.state);
    state.open = true;
    state.activeTab = "nowPlaying";
    state.playlistView = "current";
    saveState();
    render();
    showToast(`Playing ${queue.length} playlist track${queue.length === 1 ? "" : "s"}${hydrated.failed ? ` · ${hydrated.failed} unavailable` : ""}`);
    return true;
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
      sourcePage: location.href,
      items: structuredClone(playlistItems)
    });
    state.savedPlaylists = normalizeSavedPlaylists(state.savedPlaylists);
    saveState();
    render();
    showToast(`Saved “${name}” locally`);
  }

  function restoreSavedPlaylist(snapshot, mode = "replace") {
    const incoming = normalizePlaylist(snapshot?.items);
    if (!incoming.length) return;
    if (mode === "replace") {
      state.playlist = incoming;
    } else {
      addTracksToPlaylist(incoming, { quiet: true });
    }
    state.playlistView = "current";
    saveState();
    render();
    void syncActivePlaylistQueue();
    showToast(mode === "replace" ? `Loaded “${snapshot.name}” into Now Playing` : `Added “${snapshot.name}” to Now Playing`);
  }

  function exportPlaylist(items = state.playlist) {
    const playlistItems = normalizePlaylist(items);
    const exportedAt = new Date();
    const rows = playlistItems.map((item) => `<li><strong>${escapeHtml(item.title)}</strong> by ${escapeHtml(item.artist)}${item.album ? ` — ${escapeHtml(item.album)}` : ""}${item.duration ? ` (${escapeHtml(formatDuration(item.duration))})` : ""}<br><a href="${escapeHtml(item.pageUrl)}">${escapeHtml(item.pageUrl)}</a></li>`).join("");
    const documentText = `<!doctype html><html lang="en"><meta charset="utf-8"><title>BandKit playlist</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:800px;margin:48px auto;padding:0 24px;color:#17202a}li{margin:0 0 18px}a{color:#1687a7;overflow-wrap:anywhere}</style><h1>BandKit playlist</h1><p>Exported ${escapeHtml(exportedAt.toLocaleString())}. ${playlistItems.length} tracks.</p><ol>${rows}</ol></html>`;
    const blobUrl = URL.createObjectURL(new Blob([documentText], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `bandkit-playlist-${exportedAt.toISOString().slice(0, 10)}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast(`Downloaded ${playlistItems.length} playlist track${playlistItems.length === 1 ? "" : "s"}`);
  }

  function reportDiagnostic(status, error = "") {
    try {
      chrome.storage.local.set({
        bandcampHubDiagnostic: {
          status,
          error: String(error || ""),
          url: location.href,
          at: new Date().toISOString(),
          version: chrome.runtime.getManifest().version
        }
      });
    } catch {
      // A tab that predates an extension reload can briefly have an invalidated context.
    }
  }

  function parseColor(value) {
    const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
    if (!match) return null;
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
  }

  function hexColor(value, fallback) {
    const match = String(value || "").match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    return match ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16), a: 1 } : fallback;
  }

  function colorString(color, alpha = color.a ?? 1) {
    return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
  }

  function mixColor(first, second, amount) {
    return {
      r: first.r + (second.r - first.r) * amount,
      g: first.g + (second.g - first.g) * amount,
      b: first.b + (second.b - first.b) * amount,
      a: 1
    };
  }

  function luminance(color) {
    const channels = [color.r, color.g, color.b].map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrast(first, second) {
    const light = Math.max(luminance(first), luminance(second));
    const dark = Math.min(luminance(first), luminance(second));
    return (light + 0.05) / (dark + 0.05);
  }

  function readableColor(foreground, backgrounds, minimum) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const passes = (candidate) => backgrounds.every((background) => contrast(candidate, background) >= minimum);
    if (passes(foreground)) return { color: foreground, adjusted: false };
    const target = Math.min(...backgrounds.map((background) => contrast(white, background)))
      >= Math.min(...backgrounds.map((background) => contrast(black, background))) ? white : black;
    for (let amount = 0.08; amount <= 1.001; amount += 0.08) {
      const candidate = mixColor(foreground, target, Math.min(1, amount));
      if (passes(candidate)) return { color: candidate, adjusted: true };
    }
    return { color: target, adjusted: true };
  }

  function selectedAppearanceTheme() {
    const selectedTheme = [...BUILT_IN_THEMES, ...(state.appearance.savedThemes || [])].find((theme) => theme.id === state.appearance.preset);
    if (state.appearance.preset === "custom") {
      return {
        id: "custom",
        label: "Custom",
        accent: state.appearance.customAccent,
        surface: state.appearance.customSurface,
        background: state.appearance.customPageBackground,
        pageSurface: state.appearance.customPageSurface,
        text: state.appearance.customText
      };
    }
    return selectedTheme || BUILT_IN_THEMES[0];
  }

  function accessibleAppearanceTheme(theme = selectedAppearanceTheme()) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 17, g: 24, b: 39, a: 1 };
    const panel = hexColor(theme.surface, white);
    const background = hexColor(theme.background, luminance(panel) < 0.34 ? mixColor(panel, black, 0.38) : mixColor(panel, white, 0.28));
    const pageSurface = hexColor(theme.pageSurface, panel);
    const preferredText = hexColor(theme.text, luminance(pageSurface) < 0.34 ? white : black);
    const panelTextResult = readableColor(preferredText, [panel], 4.5);
    const textResult = readableColor(preferredText, [pageSurface], 4.5);
    const backgroundTextResult = readableColor(preferredText, [background], 4.5);
    const preferredAccent = hexColor(theme.accent, { r: 29, g: 160, b: 195, a: 1 });
    const panelAccentResult = readableColor(preferredAccent, [panel], 3);
    const accentResult = readableColor(preferredAccent, [pageSurface], 3);
    const text = textResult.color;
    const accent = accentResult.color;
    const panelAccent = panelAccentResult.color;
    const muted = mixColor(text, pageSurface, luminance(pageSurface) < 0.34 ? 0.35 : 0.42);
    const border = mixColor(pageSurface, text, luminance(pageSurface) < 0.34 ? 0.24 : 0.16);
    const onAccent = contrast(accent, white) >= contrast(accent, black) ? white : black;
    const panelOnAccent = contrast(panelAccent, white) >= contrast(panelAccent, black) ? white : black;
    return {
      panel, background, pageSurface, text, panelText: panelTextResult.color, backgroundText: backgroundTextResult.color,
      accent, panelAccent, muted, border, onAccent, panelOnAccent,
      adjusted: panelTextResult.adjusted || textResult.adjusted || backgroundTextResult.adjusted || panelAccentResult.adjusted || accentResult.adjusted,
      textContrast: Math.min(contrast(panelTextResult.color, panel), contrast(text, pageSurface), contrast(backgroundTextResult.color, background)),
      accentContrast: Math.min(contrast(panelAccent, panel), contrast(accent, pageSurface))
    };
  }

  function ensureBandcampThemeStyle() {
    if (document.querySelector("#bandkit-bandcamp-theme")) return;
    const pageThemeStyle = document.createElement("style");
    pageThemeStyle.id = "bandkit-bandcamp-theme";
    pageThemeStyle.textContent = `
      html[data-bandkit-page-theme="true"] { background: var(--bandkit-page-background) !important; color-scheme: var(--bandkit-page-scheme); }
      html[data-bandkit-page-theme="true"] body { background: var(--bandkit-page-background) !important; background-image: none !important; color: var(--bandkit-page-background-text) !important; }
      html[data-bandkit-page-theme="true"] :is(main, #pgBd, #pgBdWrapper, #main, .page-bg, .collection-main, .collection-grid, .feed-main, .discover-results, .discover-detail, .discover-player, section.floating-player) { background-color: var(--bandkit-page-surface) !important; background-image: none !important; color: var(--bandkit-page-text) !important; }
      html[data-bandkit-page-theme="true"] :is(h1, h2, h3, h4, h5, h6, p, li, td, th, label, strong, .primaryText, .track-title, .title, .title-text, .item-title, .albumTitle, .trackTitle, #name-section .title) { color: var(--bandkit-page-text) !important; }
      html[data-bandkit-page-theme="true"] :is(.secondaryText, .track-number, .time, .artist, .artist-name, .subhead, .itemsubtext, .genre, .location, .tralbumData, .credits) { color: var(--bandkit-page-muted) !important; }
      html[data-bandkit-page-theme="true"] :is(a, a.primaryText, .buy-link, .download-link, #track_table a, button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-buy):not(.bandcamp-hub-page-playlist-menu button)) { color: var(--bandkit-page-accent) !important; }
      html[data-bandkit-page-theme="true"] :is(input, select, textarea, .track_row_view, .collection-item-container, .item, .popupmenu, .menu) { border-color: var(--bandkit-page-border) !important; }
      html[data-bandkit-page-theme="true"] :is(input, select, textarea, .popupmenu, .menu) { background-color: var(--bandkit-page-surface) !important; color: var(--bandkit-page-text) !important; }
      html[data-bandkit-page-theme="true"] button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-buy):not(.bandcamp-hub-page-playlist-menu button) { background-color: var(--bandkit-page-surface) !important; border-color: var(--bandkit-page-border) !important; }
      html[data-bandkit-page-theme="true"] :is(button.selected, button.is-selected, button.active, button[aria-pressed="true"]):not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-dj) { background-color: var(--bandkit-page-accent) !important; color: var(--bandkit-page-on-accent) !important; }
      html[data-bandkit-page-theme="true"] :is(hr, .track_row_view, .collection-item-container, section.floating-player) { border-color: var(--bandkit-page-border) !important; }
      html[data-bandkit-page-theme="true"] ::selection { background: var(--bandkit-page-accent); color: var(--bandkit-page-on-accent); }
    `;
    document.head.append(pageThemeStyle);
  }

  function applyBandcampPageTheme() {
    ensureBandcampThemeStyle();
    const enabled = Boolean(state.appearance.applyToPage && !state.appearance.pageAware);
    document.documentElement.dataset.bandkitPageTheme = String(enabled);
    if (!enabled) {
      for (const name of ["--bandkit-page-background", "--bandkit-page-surface", "--bandkit-page-text", "--bandkit-page-background-text", "--bandkit-page-muted", "--bandkit-page-accent", "--bandkit-page-border", "--bandkit-page-on-accent", "--bandkit-page-scheme"]) {
        document.documentElement.style.removeProperty(name);
      }
      return;
    }
    const theme = accessibleAppearanceTheme();
    const dark = luminance(theme.background) < 0.34;
    const variables = {
      "--bandkit-page-background": colorString(theme.background),
      "--bandkit-page-surface": colorString(theme.pageSurface),
      "--bandkit-page-text": colorString(theme.text),
      "--bandkit-page-background-text": colorString(theme.backgroundText),
      "--bandkit-page-muted": colorString(theme.muted),
      "--bandkit-page-accent": colorString(theme.accent),
      "--bandkit-page-border": colorString(theme.border),
      "--bandkit-page-on-accent": colorString(theme.onAccent),
      "--bandkit-page-scheme": dark ? "dark" : "light"
    };
    for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
  }

  function isClassicReleasePage() {
    return Boolean(
      document.body?.classList.contains("tralbum-page")
      && document.querySelector("#trackInfo")
      && document.querySelector("#tralbumArt")
      && document.querySelector(".trackView")
    );
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

  function prepareModernReleaseLayout() {
    if (modernReleaseLayoutPrepared || !isClassicReleasePage()) return;
    const release = document.querySelector(".trackView");
    const trackInfoInner = document.querySelector("#trackInfoInner");
    const commands = trackInfoInner?.querySelector(":scope > .tralbumCommands");
    const rightColumn = document.querySelector("#rightColumn");
    const trackTable = document.querySelector("#track_table");
    if (!release || !trackInfoInner || !rightColumn) return;

    const purchasePanel = createModernReleaseShell("section", "bandkit-modern-purchase-panel", "Buy & collect");
    const purchaseList = createModernReleaseShell("ul", "bandkit-modern-purchase-list");
    purchasePanel.append(purchaseList);
    rightColumn.prepend(purchasePanel);
    for (const item of commands?.querySelectorAll(":scope > .buyItem") || []) {
      moveModernReleaseNode(item, purchaseList);
    }

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
    const surface = firstComputedColor(["#pgBd", "body"], "backgroundColor") || background;
    const text = firstComputedColor([".primaryText", "#name-section .trackTitle", "#pgBd", "body"], "color") || fallbackText;
    const secondary = firstComputedColor([".secondaryText", ".track-number", ".time"], "color") || text;
    const link = firstComputedColor(["#trackInfo a:not(.notSkinnable)", "#name-section a", "#rightColumn a", "a"], "color") || text;
    const navbar = firstComputedColor(["#band-navbar"], "backgroundColor") || surface;
    const navbarText = firstComputedColor(["#band-navbar a.active", "#band-navbar a"], "color") || text;
    const dark = luminance(surface) < 0.34;
    return {
      background,
      surface,
      text,
      secondary,
      link,
      navbar,
      navbarText,
      line: { ...text, a: dark ? 0.24 : 0.18 },
      accentSoft: { ...link, a: dark ? 0.16 : 0.1 },
      scheme: dark ? "dark" : "light"
    };
  }

  function setModernReleasePalette(palette) {
    const variables = {
      "--bandkit-release-bg": colorString(palette.background),
      "--bandkit-release-surface": colorString(palette.surface),
      "--bandkit-release-surface-raised": colorString(palette.surface),
      "--bandkit-release-ink": colorString(palette.text),
      "--bandkit-release-muted": colorString(palette.secondary),
      "--bandkit-release-line": colorString(palette.line),
      "--bandkit-release-accent": colorString(palette.link),
      "--bandkit-release-accent-soft": colorString(palette.accentSoft),
      "--bandkit-release-on-accent": colorString(palette.surface),
      "--bandkit-release-navbar": colorString(palette.navbar),
      "--bandkit-release-navbar-text": colorString(palette.navbarText),
      "--bandkit-release-scheme": palette.scheme
    };
    for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
  }

  function clearModernReleasePalette() {
    modernReleasePalette = null;
    for (const name of [
      "--bandkit-release-bg", "--bandkit-release-surface", "--bandkit-release-surface-raised",
      "--bandkit-release-ink", "--bandkit-release-muted", "--bandkit-release-line",
      "--bandkit-release-accent", "--bandkit-release-accent-soft", "--bandkit-release-on-accent",
      "--bandkit-release-navbar", "--bandkit-release-navbar-text", "--bandkit-release-scheme"
    ]) document.documentElement.style.removeProperty(name);
  }

  function applyModernReleaseLayout() {
    const enabled = Boolean(state.appearance.modernReleasePages && isClassicReleasePage());
    if (enabled) {
      if (!modernReleaseLayoutPrepared) modernReleasePalette = captureModernReleasePalette();
      prepareModernReleaseLayout();
      if (modernReleasePalette) setModernReleasePalette(modernReleasePalette);
      document.documentElement.dataset.bandkitModernRelease = "true";
      return;
    }
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
    for (const [name, value] of Object.entries(variables)) {
      host.style.setProperty(name, value);
      pageDjHost?.style.setProperty(name, value);
      for (const button of document.querySelectorAll(".bandcamp-hub-page-dj, .bandcamp-hub-page-playlist, .bandcamp-hub-page-cart, .bandcamp-hub-page-buy")) button.style.setProperty(name, value);
    }
  }

  function syncPageDjTheme() {
    if (!pageDjHost) return;
    const styles = getComputedStyle(host);
    for (const name of [
      "--hub-accent", "--hub-accent-soft", "--hub-ink", "--hub-muted", "--hub-faint",
      "--hub-line", "--hub-panel", "--hub-card", "--hub-card-footer", "--hub-header",
      "--hub-hover", "--hub-on-accent", "--hub-wash"
    ]) {
      const value = styles.getPropertyValue(name);
      pageDjHost.style.setProperty(name, value);
      for (const button of document.querySelectorAll(".bandcamp-hub-page-dj, .bandcamp-hub-page-playlist, .bandcamp-hub-page-cart, .bandcamp-hub-page-buy")) button.style.setProperty(name, value);
    }
  }

  function updateThemeFromPage() {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 17, g: 24, b: 39, a: 1 };
    const pageBackground = firstComputedColor(["#pgBd", "#pgBdWrapper", ".page-bg", "body"], "backgroundColor") || white;
    const pageText = firstComputedColor([".primaryText", "#name-section .title", ".track-title", "#pgBd", "body"], "color") || black;
    const pageSecondary = firstComputedColor([".secondaryText", ".track-number", ".time", "body"], "color");
    let pageAccent = firstComputedColor(["a.primaryText", ".download-link", ".buy-link", "#track_table a", "a"], "color") || { r: 29, g: 160, b: 195, a: 1 };
    const darkPage = luminance(pageBackground) < 0.34;
    const panelColor = darkPage ? mixColor(pageBackground, black, 0.32) : mixColor(pageBackground, white, 0.82);
    const cardColor = darkPage ? mixColor(panelColor, white, 0.06) : mixColor(panelColor, white, 0.48);
    let inkColor = pageText;
    if (contrast(inkColor, cardColor) < 4.5) inkColor = darkPage ? white : black;
    if (contrast(pageAccent, cardColor) < 2.5) pageAccent = mixColor(pageAccent, darkPage ? white : black, 0.38);
    let mutedColor = pageSecondary || mixColor(inkColor, cardColor, 0.42);
    if (contrast(mutedColor, cardColor) < 3) mutedColor = mixColor(inkColor, cardColor, 0.38);
    const faintColor = mixColor(inkColor, cardColor, 0.58);
    const lineColor = mixColor(panelColor, inkColor, darkPage ? 0.2 : 0.1);
    const headerColor = mixColor(panelColor, pageBackground, darkPage ? 0.18 : 0.08);
    const washColor = mixColor(panelColor, pageBackground, darkPage ? 0.32 : 0.18);
    const hoverColor = mixColor(cardColor, inkColor, darkPage ? 0.13 : 0.07);
    const onAccent = contrast(pageAccent, white) >= contrast(pageAccent, black) ? white : black;
    const tabForeground = contrast(headerColor, white) >= contrast(headerColor, black) ? white : black;

    const variables = {
      "--hub-accent": colorString(pageAccent),
      "--hub-accent-soft": colorString(pageAccent, darkPage ? 0.22 : 0.12),
      "--hub-ink": colorString(inkColor),
      "--hub-muted": colorString(mutedColor),
      "--hub-faint": colorString(faintColor),
      "--hub-line": colorString(lineColor),
      "--hub-panel": colorString(panelColor),
      "--hub-card": colorString(cardColor),
      "--hub-card-footer": colorString(mixColor(cardColor, pageBackground, 0.12)),
      "--hub-header": colorString(headerColor),
      "--hub-tab-foreground": colorString(tabForeground),
      "--hub-tab-active-bg": colorString(tabForeground, darkPage ? 0.16 : 0.08),
      "--hub-hover": colorString(hoverColor),
      "--hub-on-accent": colorString(onAccent),
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
    const card = dark ? mixColor(surface, { r: 255, g: 255, b: 255, a: 1 }, 0.07) : mixColor(surface, { r: 255, g: 255, b: 255, a: 1 }, 0.4);
    const muted = mixColor(ink, card, 0.43);
    const header = mixColor(surface, card, 0.2);
    const tabForeground = contrast(header, { r: 255, g: 255, b: 255, a: 1 }) >= contrast(header, { r: 17, g: 24, b: 39, a: 1 })
      ? { r: 255, g: 255, b: 255, a: 1 }
      : { r: 17, g: 24, b: 39, a: 1 };
    setThemeVariables({
      "--hub-accent": colorString(accent),
      "--hub-accent-soft": colorString(accent, dark ? 0.24 : 0.13),
      "--hub-ink": colorString(ink),
      "--hub-muted": colorString(muted),
      "--hub-faint": colorString(mixColor(ink, card, 0.62)),
      "--hub-line": colorString(mixColor(card, ink, dark ? 0.2 : 0.11)),
      "--hub-panel": colorString(surface),
      "--hub-card": colorString(card),
      "--hub-card-footer": colorString(mixColor(card, surface, 0.12)),
      "--hub-header": colorString(header),
      "--hub-tab-foreground": colorString(tabForeground),
      "--hub-tab-active-bg": colorString(tabForeground, dark ? 0.16 : 0.08),
      "--hub-hover": colorString(mixColor(card, ink, dark ? 0.13 : 0.07)),
      "--hub-on-accent": colorString(accessible.panelOnAccent),
      "--hub-wash": colorString(mixColor(surface, card, 0.25), 0.96)
    });
  }

  function applyAppearance() {
    if (state.appearance.pageAware) updateThemeFromPage();
    else applySelectedTheme();
    applyBandcampPageTheme();
    applyModernReleaseLayout();
    applyNativeCartVisibility();
  }

  function applyNativeCartVisibility() {
    ensurePageStyles();
    const hidePageCart = state.appearance.hidePageCart !== false;
    const hideHeaderCart = state.appearance.hideHeaderCart !== false;
    document.documentElement.dataset.bandkitHidePageCart = String(hidePageCart);
    document.documentElement.dataset.bandkitHideHeaderCart = String(hideHeaderCart);
    for (const nativeCart of document.querySelectorAll("[data-bandkit-native-cart]")) {
      nativeCart.toggleAttribute("hidden", hideHeaderCart);
    }
    for (const wrapper of document.querySelectorAll("[data-bandkit-native-cart-wrapper]")) {
      wrapper.toggleAttribute("hidden", hideHeaderCart);
    }
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
    panelHeader.setAttribute("aria-label", docked ? `BandKit docked to the ${dockSide}` : "Drag to move BandKit");
    layoutToggleButton.classList.toggle("is-docked", docked);
    layoutToggleButton.querySelector("img").src = asset(docked ? "icon-floating.svg" : "icon-dock.svg");
    layoutToggleButton.setAttribute("aria-label", docked ? "Return BandKit to floating mode" : `Dock BandKit to the ${dockSide}`);
    layoutToggleButton.title = docked ? "Return BandKit to floating mode" : `Dock BandKit to the ${dockSide}`;
    syncDockedControls();
    applyLauncherPosition();
    applySavedLayout();
  }

  function toggleLayoutMode() {
    state.layoutMode = state.layoutMode === "docked" ? "floating" : "docked";
    applyLayoutMode();
    saveState();
    saveLayoutState();
    if (state.activeTab === "settings") render();
    showToast(state.layoutMode === "docked" ? `BandKit docked to the ${state.dockSide}` : "BandKit returned to floating mode");
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
    showToast("BandKit panel and launcher positions reset");
  }

  function syncDockedControls() {
    const docked = state.layoutMode === "docked";
    const dockSide = state.dockSide === "left" ? "left" : "right";
    launcher.classList.toggle("is-panel-open", state.open);
    headerResetButton.classList.toggle("is-dock-close", docked);
    const resetSymbol = headerResetButton.querySelector(".hub-reset-symbol");
    resetSymbol.style.setProperty("--hub-reset-icon", `url('${asset(docked ? "icon-chevron.svg" : "icon-reset.svg")}')`);
    resetSymbol.style.setProperty("--hub-reset-rotation", docked ? (dockSide === "left" ? "90deg" : "-90deg") : "0deg");
    const label = docked ? `Close BandKit to the ${dockSide}` : "Reset size and position";
    headerResetButton.setAttribute("aria-label", label);
    headerResetButton.title = label;
  }

  function exportCart() {
    const exportedAt = new Date();
    const payload = {
      format: "bandkit-cart",
      version: 1,
      exportedAt: exportedAt.toISOString(),
      sourcePage: location.href,
      summary: state.cartSummary,
      items: structuredClone(state.cart)
    };
    const serializedPayload = JSON.stringify(payload).replaceAll("<", "\\u003c");
    const rows = state.cart.map((item) => {
      const itemUrl = safeBandcampUrl(item.url);
      return `
      <li>
        <strong>${escapeHtml(item.title)}</strong>${item.artist ? ` by ${escapeHtml(item.artist)}` : ""}
        ${item.price ? ` — ${escapeHtml(formatCartPrice(item.price, item.currency))}` : ""}<br>
        ${itemUrl ? `<a href="${escapeHtml(itemUrl)}">${escapeHtml(itemUrl)}</a>` : "No saved Bandcamp link"}
      </li>`;
    }).join("");
    const documentText = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Bandcamp cart backup</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:800px;margin:48px auto;padding:0 24px;color:#17202a}li{margin:0 0 18px}a{color:#1687a7;overflow-wrap:anywhere}</style><h1>Bandcamp cart backup</h1><p>Saved by BandKit on ${escapeHtml(exportedAt.toLocaleString())}. This file can be imported back into BandKit.</p><ol>${rows || "<li>The cart was empty when this file was created.</li>"}</ol><script id="bandkit-cart-data" type="application/json">${serializedPayload}</script></html>`;
    const blobUrl = URL.createObjectURL(new Blob([documentText], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `bandcamp-cart-${exportedAt.toISOString().slice(0, 10)}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast(`Downloaded an importable backup with ${state.cart.length} item${state.cart.length === 1 ? "" : "s"}`);
  }

  function sanitizeImportedRestore(restore) {
    if (!restore || typeof restore !== "object") return null;
    const fields = [
      "item_type", "item_id", "item_title", "item_title2", "band_id", "artist_name",
      "unit_price", "currency", "quantity", "option_id", "option_name", "discount_id",
      "discount_type", "url", "art_id", "image_id", "purchase_note", "album_art_id",
      "item_art_id", "item_art_url", "art_url", "band_name", "album_title", "notify_me",
      "notify_me_label", "license_id", "associated_license_id", "is_paypalable"
    ];
    const sanitized = {};
    for (const field of fields) {
      const value = restore[field];
      if (["string", "number", "boolean"].includes(typeof value) || value === null) sanitized[field] = value;
    }
    if (Array.isArray(restore.releases)) {
      sanitized.releases = restore.releases.slice(0, 25).map((release) => Object.fromEntries(
        Object.entries(release || {}).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value === null)
      ));
    }
    return ["a", "t", "b", "p"].includes(sanitized.item_type) && Number.isFinite(Number(sanitized.item_id)) ? sanitized : null;
  }

  function parseCartBackup(text) {
    const source = String(text || "").trim();
    if (!source) throw new Error("The selected file is empty.");
    let payload;
    if (source.startsWith("{")) {
      payload = JSON.parse(source);
    } else {
      const documentNode = new DOMParser().parseFromString(source, "text/html");
      const embedded = documentNode.querySelector("#bandkit-cart-data")?.textContent;
      if (!embedded) throw new Error("This HTML file does not contain a BandKit cart backup.");
      payload = JSON.parse(embedded);
    }
    if (payload?.format !== "bandkit-cart" || Number(payload.version) !== 1 || !Array.isArray(payload.items)) {
      throw new Error("This is not a supported BandKit cart backup.");
    }
    const items = payload.items.slice(0, 100).map((item, index) => {
      const url = safeBandcampUrl(item?.url || item?.restore?.url);
      if (!item || typeof item !== "object" || !url || !String(item.title || "").trim()) return null;
      return {
        id: String(item.id || `imported-${index}`).slice(0, 500),
        title: String(item.title).trim().slice(0, 500),
        artist: String(item.artist || "Bandcamp").trim().slice(0, 500),
        kind: String(item.kind || "Imported cart item").trim().slice(0, 500),
        price: Math.max(0, Number(item.price) || 0),
        currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD",
        art: /^https?:/i.test(item.art || "") ? String(item.art).slice(0, 4000) : "",
        url,
        restore: sanitizeImportedRestore(item.restore)
      };
    }).filter(Boolean);
    if (!items.length) throw new Error("The backup does not contain any restorable Bandcamp items.");
    const exportedAt = new Date(payload.exportedAt);
    return {
      items,
      savedAt: Number.isNaN(exportedAt.getTime()) ? new Date().toISOString() : exportedAt.toISOString(),
      sourcePage: safeBandcampUrl(payload.sourcePage),
      summary: payload.summary && typeof payload.summary === "object" ? {
        subtotal: Number.isFinite(Number(payload.summary.subtotal)) ? Number(payload.summary.subtotal) : null,
        currency: /^[A-Z]{3}$/.test(payload.summary.currency || "") ? payload.summary.currency : null
      } : null
    };
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
    const documentText = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bandcamp activity log</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:48px auto;padding:0 24px;color:#17202a;background:#fff}h1{margin-bottom:4px}ol{padding-left:24px}li{margin:0 0 22px;padding-left:6px}.entry{font-size:17px}.action{display:inline-block;border-radius:4px;background:#dbeafe;color:#1e3a8a;font-size:12px;font-weight:700;padding:2px 6px;text-transform:capitalize}time,.url{display:block;color:#64748b;font-size:13px;margin-top:4px}.url a{font-size:12px}a{color:#1687a7;overflow-wrap:anywhere}</style></head><body><h1>Bandcamp activity log</h1><p>Exported by BandKit on ${escapeHtml(exportedAt.toLocaleString())}. ${state.activity.length} entr${state.activity.length === 1 ? "y" : "ies"}.</p><ol>${rows || "<li>No activity had been recorded when this file was created.</li>"}</ol></body></html>`;
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
      sourcePage: location.href,
      summary: state.cartSummary
    });
    state.savedCarts = result.savedCarts;
    saveState();
    render();
    showToast(`Saved “${name}” locally`);
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
    const resolved = await runtimeMessage({ type: "BANDCAMP_HUB_RESOLVE_CART_ITEMS", items: sourceItems });
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
    showToast(`Adding the ${label} to your Bandcamp cart…`);
    try {
      const result = await addResolvedItemsToCart([{
        title: track.title,
        album: track.album,
        artist: track.artist,
        url: pageUrl,
        requestedItemType
      }]);
      const failed = result.failed?.length || 0;
      if (result.error) showToast(result.error);
      else if (failed) showToast(`Bandcamp does not offer this ${label} as a separate digital purchase.`);
      else if (result.alreadyPresent) showToast(`This ${label} is already in your Bandcamp cart.`);
      else showToast(`Added the ${label} to your Bandcamp cart.`);
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
        const alreadyAdded = snapshot.items.some((item) => playlistTrackKey(item) === playlistTrackKey(track));
        menu.append(createPlaylistMenuOption(`${alreadyAdded ? "✓" : "＋"} ${snapshot.name}`, () => {
          close();
          addTrackToSavedPlaylist(track, snapshot.id);
        }, { disabled: alreadyAdded }));
      }
      if (!state.savedPlaylists.length) menu.append(createElement("div", "hub-playlist-menu-empty", "No playlists yet"));
    } else {
      const inPlaying = state.playlist.some((item) => playlistTrackKey(item) === playlistTrackKey(track));
      menu.append(
        createPlaylistMenuOption(inPlaying ? "✓ In Now Playing" : "＋ Add to Now Playing", () => {
          close();
          addTrackToPlaylist(track);
        }, { disabled: inPlaying }),
        createPlaylistMenuOption("＋ Add to Playlist…", () => {
          populatePlaylistDestinationMenu(menu, trigger, track, "playlists");
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
    const trigger = createElement("button", `hub-queue-action hub-playlist-action${labeled ? " is-labeled" : ""}`, labeled ? "＋ Add" : "＋");
    trigger.type = "button";
    trigger.disabled = !trackPageUrl;
    trigger.title = `Add ${track.title} to Now Playing or a playlist`;
    trigger.setAttribute("aria-label", trigger.title);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
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
    const cartIcon = createElement("span", "hub-queue-cart-icon");
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
    const wishlist = createElement("button", `hub-queue-action hub-wishlist-action${labeled ? " is-labeled" : ""}${wishlisted ? " is-active" : ""}`, labeled ? `${wishlisted ? "♥ Wishlisted" : "♡ Wishlist"}` : wishlisted ? "♥" : "♡");
    wishlist.type = "button";
    wishlist.disabled = !trackPageUrl;
    wishlist.title = wishlisted ? `${track.title} is in your Bandcamp wishlist` : trackPageUrl ? `Add ${track.title} to your Bandcamp wishlist` : "No individual Bandcamp track page is available";
    wishlist.setAttribute("aria-label", wishlisted ? `${track.title} is wishlisted` : `Add ${track.title} to wishlist`);
    wishlist.setAttribute("aria-pressed", String(wishlisted));
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
    const inPlaylist = state.playlist.some((item) => playlistTrackKey(item) === playlistTrackKey(track));
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
    panelTitle.textContent = labels[state.activeTab] || "BandKit";
    panel.setAttribute("aria-label", `${panelTitle.textContent} panel`);
    panelHeader.setAttribute("aria-label", `${panelTitle.textContent} panel header`);
    for (const button of headerShortcuts.querySelectorAll(".hub-header-shortcut")) {
      const active = state.open && button.dataset.tab === state.activeTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("has-dot", button.dataset.tab === "cart" && state.cart.length > 0);
      if (button.dataset.tab === "playlist") button.classList.toggle("has-dot", state.playlist.length > 0);
    }
    const cartShortcutCount = headerShortcuts.querySelector(".hub-cart-shortcut-count");
    if (cartShortcutCount) cartShortcutCount.textContent = String(state.cart.length);
    for (const button of tabBar.querySelectorAll(".hub-tab")) {
      const active = button.dataset.tab === state.activeTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
      button.classList.toggle("has-dot", button.dataset.tab === "cart" && state.cart.length > 0);
      if (button.dataset.tab === "playlist") button.classList.toggle("has-dot", state.playlist.length > 0);
    }

    content.replaceChildren();
    if (state.activeTab === "playlist") renderPlaylist();
    if (state.activeTab === "cart") renderCart();
    if (state.activeTab === "activity") renderActivity();
    if (state.activeTab === "settings") renderSettings();
    if (state.activeTab === "nowPlaying") renderCurrentPlaylist();
    renderDjTools();
    renderPlayer();
  }

  function renderPlaying() {
    content.append(createSectionHeading("Up Next"));

    if (!live.hasPlaybackStarted || !live.title) {
      content.append(createElement("div", "hub-empty", "Play something on this page to connect the live queue"));
      return;
    }

    const current = createElement("article", "hub-card hub-now-card");
    const playingMarker = createElement("span", "hub-playing-marker");
    playingMarker.append(createElement("span", "hub-playing-icon"));
    current.append(playingMarker);
    const currentArtLink = createPageLink("", live.pageUrl, "hub-art-link");
    currentArtLink.setAttribute("aria-label", `Open ${live.title}`);
    currentArtLink.append(createArt(live.art, true));
    current.append(currentArtLink);
    const copy = createElement("div", "hub-track-copy");
    copy.append(createPageLink(live.title, live.pageUrl, "hub-track-title hub-inline-link"));
    copy.append(createPageLink(live.artist, live.artistUrl || live.pageUrl, "hub-track-artist hub-inline-link"));
    const currentEnd = createElement("div", "hub-now-actions");
    currentEnd.append(createElement("span", "hub-playing-label", live.isPlaying ? "Playing" : "Ready"), createTrackActionControls(currentLiveTrack()));
    current.append(copy, currentEnd);
    content.append(current);

    const queue = live.tracks.slice(0, 4);
    if (!queue.length) {
      content.append(createElement("div", "hub-empty", live.available ? "Nothing else in this page queue" : "Play something on this page to connect the live queue"));
      return;
    }

    const list = createElement("div", "hub-queue-list");
    queue.forEach((track, index) => {
      const item = createElement("div", "hub-card hub-queue-item");
      item.append(createElement("div", "hub-queue-number", String(index + 1)));
      const artLink = createPageLink("", track.pageUrl, "hub-art-link hub-queue-art-link");
      artLink.setAttribute("aria-label", `Open ${track.title}`);
      if (track.art) {
        artLink.append(createArt(track.art, true));
      } else {
        const placeholder = createElement("span", "hub-queue-art-placeholder");
        placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
        artLink.append(placeholder);
      }
      item.append(artLink);
      const itemCopy = createElement("div", "hub-track-copy");
      itemCopy.append(createPageLink(track.title, track.pageUrl, "hub-track-title hub-inline-link"));
      itemCopy.append(createPageLink(track.artist, track.artistUrl || track.pageUrl, "hub-track-artist hub-inline-link"));
      const actions = createTrackActionControls(track);
      item.append(itemCopy, actions);
      list.append(item);
    });
    content.append(list);
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

  function createDjToolsCard() {
    const card = createElement("section", "hub-card hub-dj-card");
    card.setAttribute("aria-label", "DJ playback tools");

    const bpm = Number(seamless.detectedBpm) || null;
    const tempoPercent = (state.dj.rate - 1) * 100;

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
      void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SEEK", { currentTime: duration * progress });
    });
    card.append(waveformButton);
    drawDjWaveform(waveformCanvas);

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
        const targetRate = Math.max(0.5, Math.min(2, displayedValue / detectedBase));
        state.dj.rate = targetRate;
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SET_RATE", {
          rate: targetRate,
          preservePitch: state.dj.preservePitch
        });
      } else {
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SET_BPM", { bpm: displayedValue });
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
    resetBpm.title = "Reset to automatically detected BPM";
    resetBpm.setAttribute("aria-label", "Reset to automatically detected BPM");
    resetBpm.addEventListener("click", () => {
      bpmTapTimes = [];
      void seamlessCommand("BANDCAMP_HUB_SEAMLESS_RESET_BPM");
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
        const targetRate = Math.max(0.5, Math.min(2, tappedBpm / detectedBase));
        state.dj.rate = targetRate;
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SET_RATE", { rate: targetRate, preservePitch: state.dj.preservePitch });
      } else {
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SET_BPM", { bpm: tappedBpm });
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
      if (state.dj.autoTempo) void seamlessCommand("BANDCAMP_HUB_SEAMLESS_ANALYZE_BPM");
      else void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SET_RATE", { rate: 1, preservePitch: state.dj.preservePitch });
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
          void runtimeMessage({ type: "BANDCAMP_HUB_SEAMLESS_SCRATCH", active: false, multiplier: 1 });
        } else if (!scratchFrame) {
          const flush = (now) => {
            if (now - lastScratchSentAt < 32) {
              scratchFrame = window.requestAnimationFrame(flush);
              return;
            }
            scratchFrame = 0;
            lastScratchSentAt = now;
            void runtimeMessage({ type: "BANDCAMP_HUB_SEAMLESS_SCRATCH", active: true, multiplier: pendingScratch });
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
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SET_LOOP", { beats: nextLoopBeats, bpm }).then((result) => {
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

  function applySeamlessState(nextState) {
    if (!nextState || typeof nextState !== "object") return;
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
    } else if (wasEnabled) {
      window.setTimeout(scanLivePlayer, 0);
    }

    syncPagePlayerUi();
    const activeDjControl = shadow.activeElement;
    const activePageDjControl = pageDjShadow?.activeElement;
    const editingDjControl = bpmEditing
      || (activeDjControl && djDrawer.contains(activeDjControl) && activeDjControl.matches("input"))
      || (activePageDjControl && pageDjSurface?.contains(activePageDjControl) && activePageDjControl.matches("input"));
    const gestureSelector = ".hub-dj-knob-dial.is-dragging, .hub-dj-platter.is-scratching, .hub-dj-platter.is-coasting, .hub-dj-platter.is-vinyl-releasing";
    const activeDjGesture = djDrawer.querySelector(gestureSelector) || pageDjSurface?.querySelector(gestureSelector);
    if ((state.dj.open || pageDjOpen) && !editingDjControl && !activeDjGesture) renderDjTools();
    renderPlayer();
    if (state.activeTab === "nowPlaying" && !(shadow.activeElement && content.contains(shadow.activeElement))) {
      content.replaceChildren();
      renderCurrentPlaylist();
    }
  }

  async function syncSeamlessState() {
    const response = await runtimeMessage({ type: "BANDCAMP_HUB_GET_SEAMLESS_STATE" });
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
    const requestedPageUrl = safeBandcampUrl(requested.pageUrl);
    const requestedTitle = normalizedTrackTitle(requested.title);
    if (requestedPageUrl) {
      const pageMatch = tracks.find((track) => safeBandcampUrl(track.pageUrl) === requestedPageUrl
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
    const queue = buildSeamlessQueue();
    if (!queue.length) return false;
    const currentTitle = requestedTitle || document.querySelector(".inline_player .title")?.textContent?.trim() || live.title;
    const currentIndex = Math.max(0, queue.findIndex((track) => track.title === currentTitle));
    const response = await runtimeMessage({
      type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
      queue,
      index: currentIndex,
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
    const card = createElement("article", "hub-card");
    const main = createElement("div", "hub-product-main");
    const artLink = createPageLink("", item.url, "hub-art-link");
    artLink.setAttribute("aria-label", `Open ${item.title}`);
    artLink.append(createArt(cartItemArt(item)));
    main.append(artLink);
    const details = createElement("div", "hub-product-details");
    const row = createElement("div", "hub-row-title");
    row.append(createPageLink(item.title, item.url, "hub-cart-title hub-inline-link"), createElement("span", "hub-price", formatCartPrice(item.price, item.currency)));
    details.append(row, createPageLink(item.artist, artistUrlFromPageUrl(item.url) || item.url, "hub-track-artist hub-inline-link"));
    const metaRow = createElement("div", "hub-row-title");
    metaRow.style.marginTop = "8px";
    metaRow.append(createElement("span", "hub-meta", item.kind));
    if (removable) {
      const remove = createElement("button", "hub-text-button is-danger", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        remove.textContent = "Removing…";
        const result = await removeLiveCartItem(item);
        if (!result.removed) {
          remove.disabled = false;
          remove.textContent = "Remove";
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

  function createRestoreButton(snapshot, primary = false) {
    const button = createElement("button", primary ? "hub-primary-button" : "hub-text-button is-accent", "Restore");
    button.type = "button";
    button.disabled = !snapshot.items?.length;
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Restoring…";
      const result = await restoreSavedCart(snapshot.items || []);
      if (!result?.ok) {
        button.disabled = false;
        button.textContent = "Retry restore";
      }
    });
    return button;
  }

  function renderCurrentCart() {
    const backup = createElement("div", "hub-cart-backup");
    const savedText = state.cartSavedAt ? `Auto-saved ${new Date(state.cartSavedAt).toLocaleString()}` : "Not captured yet";
    backup.append(createElement("div", "hub-cart-backup-time", savedText));
    const backupActions = createElement("div", "hub-toolbar");
    const saveButton = createElement("button", "hub-text-button is-accent", "Save");
    saveButton.type = "button";
    saveButton.disabled = !state.cart.length;
    saveButton.addEventListener("click", saveCartSnapshot);
    const saveIcon = createElement("span", "hub-button-icon");
    saveIcon.style.setProperty("--hub-icon", `url('${asset("icon-save.svg")}')`);
    saveButton.prepend(saveIcon);
    const exportButton = createElement("button", "hub-text-button is-accent", "Download");
    exportButton.type = "button";
    exportButton.addEventListener("click", exportCart);
    const downloadIcon = createElement("span", "hub-button-icon");
    downloadIcon.style.setProperty("--hub-icon", `url('${asset("icon-download-all.svg")}')`);
    exportButton.prepend(downloadIcon);
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".html,.htm,.json,text/html,application/json";
    importInput.hidden = true;
    const importButton = createElement("button", "hub-text-button is-accent", "Import");
    importButton.type = "button";
    const importIcon = createElement("span", "hub-button-icon");
    importIcon.style.setProperty("--hub-icon", `url('${asset("icon-import.svg")}')`);
    importButton.prepend(importIcon);
    importButton.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => {
      const file = importInput.files?.[0];
      importInput.value = "";
      void importAndRestoreCart(file, importButton);
    });
    backupActions.append(saveButton, exportButton, importButton, importInput);
    backup.append(backupActions);
    content.append(backup);

    const stack = createElement("div", "hub-stack");
    for (const item of state.cart) {
      stack.append(renderCartItemCard(item, { removable: true }));
    }
    content.append(stack);
    if (!state.cart.length) content.append(createElement("div", "hub-empty", "Your cart is empty. BandKit will save items here when it finds them on a Bandcamp page."));

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

  function renderSavedCartList() {
    if (!state.savedCarts.length) {
      content.append(createElement("div", "hub-empty", "Your current cart will be auto-saved here as soon as BandKit captures it."));
      return;
    }
    const stack = createElement("div", "hub-stack hub-saved-cart-stack");
    for (const snapshot of state.savedCarts) {
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const card = createElement("article", "hub-card hub-saved-cart-card");
      const body = createElement("div", "hub-saved-cart-body");
      const titleRow = createElement("div", "hub-row-title");
      titleRow.append(createElement("strong", "", snapshot.name || "Saved cart"), createElement("span", "hub-saved-cart-total", cartTotalLabel(items, snapshot.summary)));
      const savedAt = snapshot.savedAt ? new Date(snapshot.savedAt) : null;
      const validDate = savedAt && !Number.isNaN(savedAt.getTime());
      body.append(
        titleRow,
        createElement("div", "hub-saved-cart-date", `${snapshot.autoSaved ? "Auto-saved · " : ""}${validDate ? savedAt.toLocaleString() : "Saved locally"}`),
        createElement("div", "hub-saved-cart-summary", `${items.length} item${items.length === 1 ? "" : "s"}${items.length ? ` · ${items.slice(0, 3).map((item) => item.title).join(", ")}${items.length > 3 ? ` +${items.length - 3} more` : ""}` : ""}`)
      );
      const footer = createElement("div", "hub-card-footer hub-saved-cart-actions");
      const open = createElement("button", "hub-text-button is-accent", "Open");
      open.type = "button";
      open.addEventListener("click", () => {
        state.selectedSavedCartId = snapshot.id;
        saveState();
        render();
      });
      const secondaryActions = createElement("div", "hub-toolbar");
      const remove = createElement("button", "hub-text-button is-danger", "Delete");
      remove.type = "button";
      remove.addEventListener("click", () => deleteSavedCart(snapshot));
      secondaryActions.append(createRestoreButton(snapshot), remove);
      footer.append(open, secondaryActions);
      card.append(body, footer);
      stack.append(card);
    }
    content.append(stack);
  }

  function renderSavedCartDetail(snapshot) {
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const toolbar = createElement("div", "hub-saved-cart-detail-toolbar");
    const back = createElement("button", "hub-text-button is-accent", "← All saved carts");
    back.type = "button";
    back.addEventListener("click", () => {
      state.selectedSavedCartId = null;
      saveState();
      render();
    });
    const remove = createElement("button", "hub-text-button is-danger", "Delete cart");
    remove.type = "button";
    remove.addEventListener("click", () => deleteSavedCart(snapshot));
    toolbar.append(back, remove);
    content.append(toolbar);

    const heading = createElement("div", "hub-saved-cart-detail-heading");
    const copy = createElement("div", "hub-saved-cart-detail-copy");
    copy.append(
      createElement("h2", "", snapshot.name || "Saved cart"),
      createElement("span", "", `${items.length} item${items.length === 1 ? "" : "s"} · ${snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleString() : "Saved locally"}`)
    );
    const restore = createRestoreButton(snapshot, true);
    heading.append(copy, restore);
    content.append(heading);

    const stack = createElement("div", "hub-stack");
    for (const item of items) stack.append(renderCartItemCard(item));
    content.append(stack);
    if (!items.length) content.append(createElement("div", "hub-empty", "This saved cart has no items."));
  }

  function renderCart() {
    if (!['current', 'saved'].includes(state.cartView)) state.cartView = "current";
    const snapshot = state.savedCarts.find((entry) => entry.id === state.selectedSavedCartId);
    if (!snapshot) state.selectedSavedCartId = null;
    const total = state.cartView === "current" ? cartTotalLabel(state.cart, state.cartSummary) : state.savedCarts.length;
    renderCartViewTabs(state.cartView === "current" ? `Total: ${total}` : `${total} saved`);
    if (state.cartView === "current") renderCurrentCart();
    else if (snapshot) renderSavedCartDetail(snapshot);
    else renderSavedCartList();
  }

  function renderPlaylistViewTabs() {
    const fallbackItems = seamless.enabled && seamless.track
      ? [seamless.track, ...live.tracks.filter((track) => !matchingQueueTrack([seamless.track], track))]
      : live.tracks;
    const currentItems = state.playlist.length ? state.playlist : fallbackItems;
    const totalDuration = currentItems.reduce((total, item) => total + (Number(item.duration) || 0), 0);
    const header = createElement("div", "hub-cart-view-header");
    const viewTabs = createElement("div", "hub-cart-view-tabs");
    viewTabs.setAttribute("role", "tablist");
    for (const tab of [
      { id: "current", label: "Now Playing", count: currentItems.length },
      { id: "saved", label: "Playlists", count: state.savedPlaylists.length }
    ]) {
      const button = createElement("button", `hub-cart-view-tab${state.playlistView === tab.id ? " is-active" : ""}`);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(state.playlistView === tab.id));
      button.append(document.createTextNode(tab.label), createElement("span", "hub-cart-view-count", String(tab.count)));
      button.addEventListener("click", () => {
        state.playlistView = tab.id;
        state.selectedSavedPlaylistId = null;
        saveState();
        render();
      });
      viewTabs.append(button);
    }
    const meta = state.playlistView === "current"
      ? `${formatDuration(totalDuration)} total`
      : `${state.savedPlaylists.length} playlist${state.savedPlaylists.length === 1 ? "" : "s"}`;
    header.append(viewTabs, createElement("span", "hub-cart-view-meta", meta));
    content.append(header);
  }

  function movePlaylistItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= state.playlist.length || toIndex >= state.playlist.length) return;
    const [item] = state.playlist.splice(fromIndex, 1);
    state.playlist.splice(toIndex, 0, item);
    saveState();
    void syncActivePlaylistQueue();
    render();
  }

  function renderPlaylistTrack(item, index) {
    const card = createElement("article", `hub-card hub-playlist-track${seamless.track?.playlistItemId === item.playlistItemId ? " is-playing" : ""}`);
    card.draggable = true;
    card.tabIndex = 0;
    card.dataset.playlistItemId = item.playlistItemId;
    card.title = "Drag to reorder. Press Option/Alt + Up or Down to reorder with the keyboard.";
    card.setAttribute("aria-label", `${item.title}, position ${index + 1} of ${state.playlist.length}. Drag to reorder.`);
    card.addEventListener("dragstart", (event) => {
      if (event.target instanceof Element && event.target.closest("a, button")) {
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
      const sourceIndex = state.playlist.findIndex((entry) => entry.playlistItemId === sourceId);
      const destinationIndex = sourceIndex < index
        ? index - (dropAfter ? 0 : 1)
        : index + (dropAfter ? 1 : 0);
      movePlaylistItem(sourceIndex, Math.max(0, Math.min(state.playlist.length - 1, destinationIndex)));
    });
    card.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const destination = index + (event.key === "ArrowUp" ? -1 : 1);
      if (destination < 0 || destination >= state.playlist.length) return;
      movePlaylistItem(index, destination);
      requestAnimationFrame(() => content.querySelector(`[data-playlist-item-id="${CSS.escape(item.playlistItemId)}"]`)?.focus());
    });

    const isCurrentPlaylistTrack = seamless.track?.playlistItemId === item.playlistItemId;
    const number = createElement("span", "hub-playlist-number", isCurrentPlaylistTrack ? "" : String(index + 1));
    if (isCurrentPlaylistTrack) number.append(createElement("span", "hub-playing-icon"));
    const artLink = createPageLink("", item.pageUrl, "hub-art-link hub-queue-art-link");
    artLink.setAttribute("aria-label", `Open ${item.title}`);
    artLink.append(createArt(item.art, true));
    const copy = createElement("div", "hub-track-copy");
    copy.append(
      createPageLink(item.title, item.pageUrl, "hub-track-title hub-inline-link"),
      createPageLink(item.artist, item.artistUrl || item.pageUrl, "hub-track-artist hub-inline-link")
    );
    const details = [item.album, item.duration ? formatDuration(item.duration) : "", item.restoreError].filter(Boolean).join(" · ");
    if (details) copy.append(createElement("span", `hub-playlist-meta${item.restoreError ? " is-error" : ""}`, details));

    const actions = createElement("div", "hub-playlist-track-actions");
    const play = createElement("button", "hub-playlist-icon-button", "▶");
    play.type = "button";
    play.title = `Play ${item.title}`;
    play.setAttribute("aria-label", `Play ${item.title}`);
    play.addEventListener("click", () => void playPlaylistAt(index));
    const remove = createElement("button", "hub-playlist-icon-button is-danger", "×");
    remove.type = "button";
    remove.title = "Remove from playlist";
    remove.setAttribute("aria-label", `Remove ${item.title} from playlist`);
    remove.addEventListener("click", () => {
      state.playlist.splice(index, 1);
      saveState();
      void syncActivePlaylistQueue();
      render();
      injectPlaylistButtons();
    });
    actions.append(play, remove);
    card.append(number, artLink, copy, actions);
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
        const toggle = createElement("button", "hub-queue-action", seamless.isPlaying ? "Ⅱ" : "▶");
        toggle.type = "button";
        toggle.title = seamless.isPlaying ? `Pause ${track.title}` : `Resume ${track.title}`;
        toggle.setAttribute("aria-label", toggle.title);
        toggle.addEventListener("click", () => void seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE"));
        trackActions.prepend(toggle);
      }
      item.append(artLink, copy, trackActions);
      list.append(item);
    });
    content.append(list);
  }

  function renderCurrentPlaylist() {
    const pageTracks = buildSeamlessQueue();
    const toolbarItems = state.playlist.length ? state.playlist : pageTracks;
    const backup = createElement("div", "hub-cart-backup hub-playlist-toolbar");
    const statusCopy = playlistIsActive()
      ? "This queue is controlling playback"
      : state.playlist.length
        ? "Saved automatically in this Chrome profile"
        : live.tracks.length
          ? "Playing from the current page"
          : "Build your queue from Bandcamp";
    backup.append(createElement("div", "hub-cart-backup-time", statusCopy));
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
    const clear = createPlaylistToolbarButton("Clear Now Playing", "icon-clear.svg", async () => {
      if (!window.confirm("Clear Now Playing? Your saved playlists will not be affected.")) return;
      clearedPageQueueSignature = `${live.pageUrl}|${live.title}`;
      state.playlist = [];
      saveState();
      await syncActivePlaylistQueue();
      render();
      injectPlaylistButtons();
      showToast("Now Playing cleared");
    });
    clear.disabled = !state.playlist.length && !toolbarItems.length && !live.hasPlaybackStarted;
    actions.append(addPage, save, download, clear);
    backup.append(actions);
    content.append(backup);

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

  function createSavedPlaylistActionButton(label, icon, onClick) {
    const button = createElement("button", "hub-saved-playlist-icon-button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    const glyph = createElement("span", "hub-button-icon");
    glyph.style.setProperty("--hub-icon", `url('${asset(icon)}')`);
    button.append(glyph);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function createSavedPlaylistActions(snapshot) {
    const actions = createElement("div", "hub-saved-playlist-icon-actions");
    actions.append(
      createSavedPlaylistActionButton(`Play ${snapshot.name}`, "icon-play.svg", () => {
        restoreSavedPlaylist(snapshot, "replace");
        void playPlaylistAt(0);
      }),
      createSavedPlaylistActionButton(`Add ${snapshot.name} to Now Playing`, "icon-plus.svg", () => restoreSavedPlaylist(snapshot, "append")),
      createSavedPlaylistActionButton(`Rename ${snapshot.name}`, "icon-edit.svg", () => renameSavedPlaylist(snapshot)),
      createSavedPlaylistActionButton(`Delete ${snapshot.name}`, "icon-trash.svg", () => deleteSavedPlaylist(snapshot))
    );
    return actions;
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
    const duration = snapshot.items.reduce((total, item) => total + (Number(item.duration) || 0), 0);
    const toolbar = createElement("div", "hub-saved-cart-detail-toolbar");
    const back = createElement("button", "hub-text-button is-accent", "← Playlists");
    back.type = "button";
    back.addEventListener("click", () => {
      state.selectedSavedPlaylistId = null;
      saveState();
      render();
    });
    toolbar.append(back, createSavedPlaylistActions(snapshot));
    content.append(toolbar);

    const heading = createElement("div", "hub-saved-cart-detail-heading hub-saved-playlist-detail-heading");
    const copy = createElement("div", "hub-saved-cart-detail-copy");
    copy.append(
      createElement("h2", "", snapshot.name),
      createElement("span", "", `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"} · ${formatDuration(duration)}`)
    );
    const download = createSavedPlaylistActionButton(`Download ${snapshot.name}`, "icon-download-all.svg", () => exportPlaylist(snapshot.items));
    heading.append(copy, download);
    content.append(heading);

    const list = createElement("div", "hub-stack hub-saved-playlist-track-list");
    snapshot.items.forEach((item, index) => {
      const row = createElement("article", "hub-card hub-queue-item hub-saved-playlist-track");
      row.append(createElement("div", "hub-queue-number", String(index + 1)));
      const artLink = createPageLink("", item.pageUrl, "hub-art-link hub-queue-art-link");
      artLink.setAttribute("aria-label", `Open ${item.title}`);
      if (item.art) artLink.append(createArt(item.art, true));
      else {
        const placeholder = createElement("span", "hub-queue-art-placeholder");
        placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
        artLink.append(placeholder);
      }
      const trackCopy = createElement("div", "hub-track-copy");
      trackCopy.append(
        createPageLink(item.title, item.pageUrl, "hub-track-title hub-inline-link"),
        createPageLink(item.artist, item.artistUrl || item.pageUrl, "hub-track-artist hub-inline-link")
      );
      row.append(artLink, trackCopy, createTrackActionControls(item));
      list.append(row);
    });
    content.append(list);
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
        createElement("div", "hub-saved-cart-summary", `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"} · ${snapshot.items.slice(0, 3).map((item) => item.title).join(", ")}${snapshot.items.length > 3 ? ` +${snapshot.items.length - 3} more` : ""}`)
      );
      body.append(createPlaylistArtworkMosaic(snapshot.items), bodyCopy);
      const footer = createElement("div", "hub-card-footer hub-saved-cart-actions");
      footer.append(createSavedPlaylistActions(snapshot));
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
    else renderSavedPlaylists();
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
      createElement("span", "", "How the DJ knobs respond.")
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
    content.append(playback);

    const appearance = createElement("section", "hub-card hub-settings-card");
    appearance.append(createElement("h2", "hub-settings-heading", "Appearance"));
    const themeRow = createElement("div", "hub-settings-row");
    const themeCopy = createElement("div", "hub-settings-copy");
    themeCopy.append(createElement("strong", "", "Match Bandcamp"), createElement("span", "", "Use the artist page colours."));
    const pageAware = createElement("button", `hub-settings-toggle${state.appearance.pageAware ? " is-active" : ""}`);
    pageAware.type = "button";
    pageAware.setAttribute("role", "switch");
    pageAware.setAttribute("aria-label", "Match Bandcamp colours");
    pageAware.setAttribute("aria-checked", String(state.appearance.pageAware));
    pageAware.append(createElement("span", "hub-settings-toggle-thumb"));
    pageAware.addEventListener("click", () => {
      state.appearance.pageAware = !state.appearance.pageAware;
      if (state.appearance.pageAware) state.appearance.applyToPage = false;
      applyAppearance();
      saveState();
      render();
    });
    themeRow.classList.add("hub-settings-subrow");
    themeRow.append(themeCopy, pageAware);
    appearance.append(themeRow);

    const presetLabel = createElement("p", "hub-settings-field-label", "Themes");
    const presets = createElement("div", "hub-theme-presets");
    const availableThemes = [...BUILT_IN_THEMES, ...(state.appearance.savedThemes || []), {
      id: "custom",
      label: "Custom",
      accent: state.appearance.customAccent,
      surface: state.appearance.customSurface,
      background: state.appearance.customPageBackground,
      pageSurface: state.appearance.customPageSurface,
      text: state.appearance.customText
    }];
    for (const { id, label, accent, surface, background, pageSurface, text } of availableThemes) {
      const button = createElement("button", `hub-theme-preset${id === "custom" ? " is-custom" : ""}${!state.appearance.pageAware && state.appearance.preset === id ? " is-active" : ""}`);
      button.type = "button";
      button.setAttribute("aria-pressed", String(!state.appearance.pageAware && state.appearance.preset === id));
      button.style.setProperty("--theme-accent", accent);
      button.style.setProperty("--theme-panel", surface);
      button.style.setProperty("--theme-surface", pageSurface || surface);
      button.style.setProperty("--theme-background", background || surface);
      button.style.setProperty("--theme-text", text || (luminance(hexColor(pageSurface || surface, { r: 255, g: 255, b: 255, a: 1 })) < 0.34 ? "#f8fafc" : "#111827"));
      button.innerHTML = `<span class="hub-theme-preview" aria-hidden="true">${id === "custom" ? `<span class="hub-theme-custom-mark" style="--hub-icon:url('${asset("icon-edit.svg")}')"></span>` : ""}</span><span class="hub-theme-preset-label">${escapeHtml(label)}</span>`;
      button.addEventListener("click", () => {
        state.appearance.pageAware = false;
        state.appearance.preset = id;
        if (id !== "custom") {
          state.appearance.customAccent = accent;
          state.appearance.customSurface = surface;
          state.appearance.customPageBackground = background || surface;
          state.appearance.customPageSurface = pageSurface || surface;
          state.appearance.customText = text || (luminance(hexColor(surface, { r: 255, g: 255, b: 255, a: 1 })) < 0.34 ? "#f8fafc" : "#111827");
        }
        applyAppearance();
        saveState();
        render();
      });
      presets.append(button);
    }
    appearance.append(presetLabel, presets);

    if (!state.appearance.pageAware && state.appearance.preset === "custom") {
      const customPanel = createElement("div", "hub-custom-theme-panel");
      const customColours = createElement("div", "hub-custom-colours");
      for (const [key, label] of [
        ["customAccent", "Accent"],
        ["customSurface", "BandKit panel"],
        ["customPageBackground", "Page background"],
        ["customPageSurface", "Page content"],
        ["customText", "Text"]
      ]) {
        const field = createElement("label", "hub-colour-field");
        const input = createElement("input");
        input.type = "color";
        input.value = state.appearance[key];
        input.setAttribute("aria-label", `${label} colour`);
        input.addEventListener("input", () => {
          state.appearance[key] = input.value;
          applyAppearance();
          saveState();
        });
        input.addEventListener("change", render);
        field.append(createElement("span", "", label), input);
        customColours.append(field);
      }
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
          surface: state.appearance.customSurface,
          background: state.appearance.customPageBackground,
          pageSurface: state.appearance.customPageSurface,
          text: state.appearance.customText
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
    const pageThemeRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const pageThemeCopy = createElement("div", "hub-settings-copy");
    pageThemeCopy.append(
      createElement("strong", "", "Theme Bandcamp pages"),
      createElement("span", "", "Override Bandcamp with this theme.")
    );
    const pageThemeToggle = createElement("button", `hub-settings-toggle hub-page-theme-toggle${state.appearance.applyToPage ? " is-active" : ""}`);
    pageThemeToggle.type = "button";
    pageThemeToggle.setAttribute("role", "switch");
    pageThemeToggle.setAttribute("aria-label", "Theme Bandcamp pages");
    pageThemeToggle.setAttribute("aria-checked", String(state.appearance.applyToPage));
    pageThemeToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    pageThemeToggle.addEventListener("click", () => {
      state.appearance.applyToPage = !state.appearance.applyToPage;
      if (state.appearance.applyToPage) state.appearance.pageAware = false;
      applyAppearance();
      saveState();
      render();
      showToast(state.appearance.applyToPage ? "Bandcamp page theme enabled" : "Bandcamp page theme disabled");
    });
    pageThemeRow.append(pageThemeCopy, pageThemeToggle);
    appearance.append(pageThemeRow);

    const modernReleaseRow = createElement("div", "hub-settings-row hub-settings-subrow");
    const modernReleaseCopy = createElement("div", "hub-settings-copy");
    modernReleaseCopy.append(
      createElement("strong", "", "Modern album & track pages"),
      createElement("span", "", "A wider, cleaner release layout with every native control intact.")
    );
    const modernReleaseToggle = createElement("button", `hub-settings-toggle hub-modern-release-toggle${state.appearance.modernReleasePages ? " is-active" : ""}`);
    modernReleaseToggle.type = "button";
    modernReleaseToggle.setAttribute("role", "switch");
    modernReleaseToggle.setAttribute("aria-label", "Use modern album and track pages");
    modernReleaseToggle.setAttribute("aria-checked", String(state.appearance.modernReleasePages));
    modernReleaseToggle.append(createElement("span", "hub-settings-toggle-thumb"));
    modernReleaseToggle.addEventListener("click", () => {
      state.appearance.modernReleasePages = !state.appearance.modernReleasePages;
      applyModernReleaseLayout();
      saveState();
      render();
      showToast(state.appearance.modernReleasePages ? "Modern release pages enabled" : "Classic release pages restored");
    });
    modernReleaseRow.append(modernReleaseCopy, modernReleaseToggle);
    appearance.append(modernReleaseRow);

    for (const [key, label, description] of [
      ["hidePageCart", "Hide page shopping cart", "Use BandKit’s Cart panel instead of Bandcamp’s page cart."],
      ["hideHeaderCart", "Hide header shopping cart", "Remove Bandcamp’s cart from the album and track page header."]
    ]) {
      const row = createElement("div", "hub-settings-row hub-settings-subrow");
      const copy = createElement("div", "hub-settings-copy");
      copy.append(createElement("strong", "", label), createElement("span", "", description));
      const enabled = state.appearance[key] !== false;
      const toggle = createElement("button", `hub-settings-toggle${enabled ? " is-active" : ""}`);
      toggle.type = "button";
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("aria-checked", String(enabled));
      toggle.append(createElement("span", "hub-settings-toggle-thumb"));
      toggle.addEventListener("click", () => {
        state.appearance[key] = !(state.appearance[key] !== false);
        applyNativeCartVisibility();
        saveState();
        render();
      });
      row.append(copy, toggle);
      appearance.append(row);
    }

    if (!state.appearance.pageAware) {
      const accessibleTheme = accessibleAppearanceTheme();
      const accessibility = createElement("div", `hub-theme-accessibility${accessibleTheme.adjusted ? " is-adjusted" : ""}`);
      accessibility.append(
        createElement("strong", "", accessibleTheme.adjusted ? "Contrast adjusted automatically" : "Accessible contrast"),
        createElement("span", "", `Text ${accessibleTheme.textContrast.toFixed(1)}:1 · controls ${accessibleTheme.accentContrast.toFixed(1)}:1`)
      );
      appearance.append(accessibility);
    }
    const reset = createElement("button", "hub-settings-action hub-settings-quiet-action", "Reset panel and launcher positions");
    reset.type = "button";
    reset.addEventListener("click", resetPanelLayout);
    appearance.append(reset);
    content.append(appearance);

    const data = createElement("section", "hub-card hub-settings-card");
    data.append(createElement("h2", "hub-settings-heading", "Local data"));
    const dataGrid = createElement("div", "hub-settings-data");
    for (const [label, value] of [
      ["Playlist tracks", state.playlist.length],
      ["Saved playlists", state.savedPlaylists.length],
      ["Current cart", state.cart.length],
      ["Saved carts", state.savedCarts.length],
      ["Activity entries", state.activity.length]
    ]) {
      const item = createElement("div", "hub-settings-stat");
      item.append(createElement("strong", "", String(value)), createElement("span", "", label));
      dataGrid.append(item);
    }
    const manageCart = createElement("button", "hub-settings-action hub-settings-quiet-action", "View cart and saved carts");
    manageCart.type = "button";
    manageCart.addEventListener("click", () => {
      state.activeTab = "cart";
      saveState();
      render();
    });
    data.append(dataGrid, createElement("p", "hub-settings-note", "Saved in this Chrome profile."), manageCart);
    content.append(data);

    const about = createElement("section", "hub-card hub-settings-card");
    about.append(createElement("h2", "hub-settings-heading", "About"));
    const aboutRow = createElement("div", "hub-settings-row");
    const aboutCopy = createElement("div", "hub-settings-copy");
    aboutCopy.append(createElement("strong", "", "BandKit"), createElement("span", "", "Playback, playlists, cart and DJ tools."));
    aboutRow.append(aboutCopy, createElement("span", "hub-settings-version", `v${chrome.runtime.getManifest().version}`));
    about.append(aboutRow, createElement("p", "hub-settings-note", "Shortcut: Alt+Shift+B toggles the panel."));
    content.append(about);
  }

  function renderPlayer() {
    const sectionPanelRect = panel.getBoundingClientRect();
    player.style.setProperty("--hub-sections-center-x", `${Math.round(sectionPanelRect.left + sectionPanelRect.width / 2)}px`);
    player.style.setProperty("--hub-sections-panel-width", `${Math.round(sectionPanelRect.width)}px`);
    const hasCurrentTrack = Boolean(live.hasPlaybackStarted && live.title);
    playerTrack.classList.toggle("is-empty", !hasCurrentTrack);
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
    playButton.replaceChildren();
    if (live.isPlaying) {
      playButton.append(createElement("span", "hub-pause-glyph"));
    } else {
      playButton.append(createElement("span", "hub-play-glyph"));
    }
    const audio = seamless.enabled ? null : getAudio();
    const duration = seamless.enabled ? Number(seamless.duration) || 0 : Number(audio?.duration) || Number(live.duration) || 0;
    const currentTime = seamless.enabled ? Number(seamless.currentTime) || 0 : Number(audio?.currentTime) || Number(live.currentTime) || 0;
    if (!scrubbing) {
      scrubSlider.value = String(duration ? Math.round(Math.max(0, Math.min(1, currentTime / duration)) * 1000) : 0);
      currentTimeLabel.textContent = formatDuration(currentTime);
    }
    durationLabel.textContent = formatDuration(duration);
    const queuedTracks = seamless.enabled && Array.isArray(seamless.queue) && seamless.queue.length
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
    if (state.appearance.hideHeaderCart === false) return;
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
    if (pageDjOpen) pageDjSurface.append(createDjToolsCard());
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
      void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SET_DJ", {
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

  function getModernPlayerState() {
    const player = document.querySelector("section.floating-player.has-track");
    if (!player) return null;
    const candidates = [...player.querySelectorAll(".meta-wrapper-wide .track-meta[streamurl], .track-meta[streamurl]")];
    const unique = [...new Map(candidates.map((node) => [node.getAttribute("streamurl"), node])).values()];
    const queue = unique.map((node, index) => {
      const pageUrl = node.querySelector("a.meta[href]")?.href || node.closest("li")?.querySelector("a[href*='bandcamp.com']")?.href || location.href;
      const artist = elementText(node, [".artist-name"]).replace(/^by\s+/i, "") || "Bandcamp";
      return {
        id: node.id || `${node.getAttribute("streamurl")}|${index}`,
        title: elementText(node, [".title-text", ".track-title", ".title"]) || `Bandcamp track ${index + 1}`,
        artist,
        album: document.title,
        art: node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || "",
        pageUrl,
        artistUrl: artistUrlFromPageUrl(pageUrl),
        duration: Number(node.getAttribute("duration")) || 0,
        url: node.getAttribute("streamurl") || ""
      };
    }).filter((track) => /^https:\/\/[^/]*\.bcbits\.com\//.test(track.url));
    if (!queue.length) return null;
    const currentNode = unique.find((node) => node.closest(".currently-playing"));
    const currentUrl = currentNode?.getAttribute("streamurl") || "";
    const index = Math.max(0, queue.findIndex((track) => track.url === currentUrl));
    const timeline = player.querySelector("input[type='range']");
    const key = player.querySelector(".play-pause-button.outline[tracklistkey]")?.getAttribute("tracklistkey") || "";
    const isPlaying = Boolean(player.querySelector(".play-pause-button[aria-label='Pause']"));
    return {
      player,
      queue,
      index,
      track: queue[index],
      currentTime: Number(timeline?.value) || 0,
      duration: Number(timeline?.max) || queue[index]?.duration || 0,
      isPlaying,
      key
    };
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

  function getFeedPlayerState() {
    if (!document.body.classList.contains("feed") && !/\/feed\/?$/.test(location.pathname)) return null;
    const audio = getAudio();
    const audioTrackId = (() => {
      try {
        return new URL(audio?.currentSrc || audio?.src || "", location.href).searchParams.get("track_id") || "";
      } catch {
        return "";
      }
    })();
    const playingNode = document.querySelector(".collection-item-container.playing[data-trackid]");
    const trackId = playingNode?.dataset.trackid || audioTrackId;
    if (!trackId) return null;
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

  function stopModernPagePlayer() {
    const button = document.querySelector("section.floating-player .play-pause-button.outline[aria-label='Pause'], section.floating-player .player-controls .play-pause-button[aria-label='Pause']");
    if (!button) return;
    suppressModernControl = true;
    button.click();
    window.setTimeout(() => {
      suppressModernControl = false;
    }, 0);
  }

  async function handoffModernPlayer(requestedIndex = null) {
    if (modernHandoffBusy) return false;
    const modern = getModernPlayerState();
    if (!modern) return false;
    modernHandoffBusy = true;
    const index = requestedIndex === null ? modern.index : Math.max(0, Math.min(modern.queue.length - 1, Number(requestedIndex) || 0));
    try {
      const response = await runtimeMessage({
        type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
        queue: modern.queue,
        index,
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
      stopModernPagePlayer();
      applySeamlessState(response.state);
      return true;
    } finally {
      modernHandoffBusy = false;
    }
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
    try {
      const response = await runtimeMessage({
        type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
        queue: [discover.track],
        index: 0,
        currentTime: discover.currentTime,
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
      pageMediaCommand("pause");
      applySeamlessState(response.state);
      return true;
    } finally {
      discoverHandoffBusy = false;
    }
  }

  async function handoffFeedPlayer() {
    if (feedHandoffBusy) return false;
    const feed = getFeedPlayerState();
    if (!feed?.track || !isReusableStreamUrl(feed.track.url)) return false;
    feedHandoffBusy = true;
    try {
      const response = await runtimeMessage({
        type: "BANDCAMP_HUB_SEAMLESS_ENABLE",
        queue: [feed.track],
        index: 0,
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
      const audio = getAudio();
      if (audio && !audio.paused) audio.pause();
      applySeamlessState(response.state);
      return true;
    } finally {
      feedHandoffBusy = false;
    }
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

  function syncPagePlayerUi() {
    document.body.classList.toggle("bandcamp-hub-remote-playing", Boolean(seamless.enabled && seamless.isPlaying));
    if (!seamless.enabled) {
      clearBandKitPagePlaybackState();
      return;
    }
    ensurePageStyles();
    const pageData = getBandcampPageData();
    const inlineTitle = document.querySelector(".inline_player .title");
    const currentPageTrack = matchingQueueTrack(buildSeamlessQueue(), seamless.track || {});
    if (inlineTitle && currentPageTrack && seamless.track?.title) inlineTitle.textContent = seamless.track.title;
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
    if (modernTimeline) {
      modernTimeline.max = String(Math.max(0, Number(seamless.duration) || 0));
      modernTimeline.value = String(Math.max(0, Number(seamless.currentTime) || 0));
    }
  }

  function ensurePageStyles() {
    if (!document.querySelector("#bandcamp-hub-page-style")) {
      const pageStyle = document.createElement("style");
      pageStyle.id = "bandcamp-hub-page-style";
      pageStyle.textContent = `.bandcamp-hub-page-dj{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:flex;height:32px;justify-content:center;margin:8px 0 0;padding:0;width:32px}.bandcamp-hub-page-dj::before{background:currentColor;content:"";height:18px;mask:var(--hub-dj-icon) center/contain no-repeat;-webkit-mask:var(--hub-dj-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-dj:hover,.bandcamp-hub-page-dj:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-dj.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-dj-host{display:block;margin-top:8px;max-width:420px;width:100%}.bandcamp-hub-page-dj-host[hidden]{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline>svg{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline::after{background:linear-gradient(90deg,currentColor 0 34%,transparent 34% 66%,currentColor 66%);content:"";display:block;height:18px;width:14px}`;
      pageStyle.textContent += `.discover-player{display:none!important}`;
      pageStyle.textContent += `html[data-bandkit-hide-page-cart="true"] #sidecart{display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,.menubar-cart-icon,#cart-link,#cart-control){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a,button,[role="button"],li):has(use[href$="#menubar-cart-icon"],use[xlink\\:href$="#menubar-cart-icon"],svg.menubar-cart-icon){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) li:has(> :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,#cart-link,#cart-control)){display:none!important}`;
      pageStyle.textContent += `.bandcamp-hub-page-tools{align-items:center;display:flex;gap:8px;margin:8px 0 0}.bandcamp-hub-page-tools .bandcamp-hub-page-dj{margin:0}.bandcamp-hub-page-playlist{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;font-size:0;height:32px;justify-content:center;line-height:0;margin:8px 0 0;padding:0;text-decoration:none!important;vertical-align:middle;width:32px}.bandcamp-hub-page-playlist::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-plus-icon) center/contain no-repeat;-webkit-mask:var(--hub-plus-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-playlist:hover,.bandcamp-hub-page-playlist:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandcamp-hub-page-playlist.is-added{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-playlist.is-player-control{margin:0}.bandcamp-hub-page-playlist.is-track-action{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-line,rgba(127,127,127,.35))!important;color:var(--hub-accent,var(--link-color,#1da0c3))!important;height:24px;margin:0 8px 0 0!important;opacity:0;pointer-events:none;text-decoration:none!important;width:24px}.bandcamp-hub-page-playlist.is-track-action::before{height:14px;width:14px}.bandcamp-hub-page-playlist.is-track-action:hover,.bandcamp-hub-page-playlist.is-track-action:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;text-decoration:none!important}.bandcamp-hub-page-playlist.is-track-action.is-added{background:var(--hub-accent,var(--link-color,#1da0c3))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;color:var(--hub-on-accent,#fff)!important}.track_row_view:hover .bandcamp-hub-page-playlist.is-track-action,.track_row_view:focus-within .bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-playlist.is-track-action:focus-visible{opacity:1;pointer-events:auto}`;
      pageStyle.textContent += `.bandcamp-hub-page-cart{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;height:32px;justify-content:center;margin:0;padding:0;width:32px}.bandcamp-hub-page-cart::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-cart-icon) center/contain no-repeat;-webkit-mask:var(--hub-cart-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-cart:hover,.bandcamp-hub-page-cart:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-cart.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-cart:disabled{cursor:not-allowed;opacity:.45}`;
      pageStyle.textContent += `.bandcamp-hub-page-buy{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border:1px solid var(--hub-line,rgba(127,127,127,.35))!important;border-radius:999px!important;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3))!important;display:inline-flex!important;flex:0 0 24px;font-size:0!important;height:24px;justify-content:center;line-height:0!important;margin:0!important;overflow:hidden;padding:0!important;text-decoration:none!important;vertical-align:middle;width:24px!important}.bandcamp-hub-page-buy::before{background:currentColor;content:"";display:block;height:14px;mask:var(--hub-buy-icon) center/contain no-repeat;-webkit-mask:var(--hub-buy-icon) center/contain no-repeat;width:14px}.bandcamp-hub-page-buy:hover,.bandcamp-hub-page-buy:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0;text-decoration:none!important}`;
      pageStyle.textContent += `.bandcamp-hub-page-playlist-menu{background:var(--hub-card,#fff);border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.22);box-sizing:border-box;color:var(--hub-text,#111);font-family:var(--hub-font-family,"Helvetica Neue",Helvetica,Arial,sans-serif);min-width:180px;padding:4px;position:absolute;z-index:2147483647}.bandcamp-hub-page-playlist-menu button{background:transparent;border:0;border-radius:3px;color:inherit;cursor:pointer;display:block;font-family:inherit;font-size:11px;line-height:1.3;padding:8px;text-align:left;width:100%}.bandcamp-hub-page-playlist-menu button:hover:not(:disabled),.bandcamp-hub-page-playlist-menu button:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-playlist-menu button:disabled{color:var(--hub-faint,#9ca3af);cursor:default}.bandcamp-hub-page-playlist-menu .is-back{border-bottom:1px solid var(--hub-line,rgba(127,127,127,.35));margin-bottom:3px}.bandcamp-hub-page-playlist-menu-empty{color:var(--hub-faint,#9ca3af);font-family:inherit;font-size:10px;line-height:1.3;padding:8px}`;
      document.head.append(pageStyle);
    }
  }

  function updatePagePlaylistButton(button, track) {
    button._bandkitTrack = track || null;
    button.hidden = !track;
    if (!track) return;
    const added = state.playlist.some((item) => playlistTrackKey(item) === playlistTrackKey(track));
    button.textContent = "";
    button.classList.toggle("is-added", added);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", pagePlaylistMenuAnchor === button ? "true" : "false");
    button.setAttribute("aria-label", `Add ${track.title} to the queue or a playlist`);
    button.title = button.getAttribute("aria-label");
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

  function renderPagePlaylistMenu(track, view = "destinations") {
    if (!pagePlaylistMenu) return;
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
      pagePlaylistMenu.append(option("← Add destination", () => renderPagePlaylistMenu(track), false, "is-back"));
      pagePlaylistMenu.append(option("＋ New playlist", () => {
        closePagePlaylistMenu();
        createSavedPlaylistWithTracks([track], `${track.artist || "Bandcamp"} playlist`);
      }));
      for (const snapshot of state.savedPlaylists) {
        const alreadyAdded = snapshot.items.some((item) => playlistTrackKey(item) === playlistTrackKey(track));
        pagePlaylistMenu.append(option(`${alreadyAdded ? "✓" : "＋"} ${snapshot.name}`, () => {
          closePagePlaylistMenu();
          addTrackToSavedPlaylist(track, snapshot.id);
        }, alreadyAdded));
      }
      if (!state.savedPlaylists.length) {
        const empty = document.createElement("div");
        empty.className = "bandcamp-hub-page-playlist-menu-empty";
        empty.textContent = "No playlists yet";
        pagePlaylistMenu.append(empty);
      }
    } else {
      const inPlaying = state.playlist.some((item) => playlistTrackKey(item) === playlistTrackKey(track));
      pagePlaylistMenu.append(
        option(inPlaying ? "✓ In Now Playing" : "＋ Add to Now Playing", () => {
          closePagePlaylistMenu();
          addTrackToPlaylist(track);
        }, inPlaying),
        option("＋ Add to Playlist…", () => renderPagePlaylistMenu(track, "playlists"))
      );
    }
    positionPagePlaylistMenu();
  }

  function openPagePlaylistMenu(anchor, track) {
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
    anchor.setAttribute("aria-expanded", "true");
    renderPagePlaylistMenu(track);
    window.setTimeout(() => document.addEventListener("click", closePagePlaylistMenu, { once: true }), 0);
  }

  function openPageCartMenu(anchor, track) {
    if (pagePlaylistMenuAnchor === anchor) {
      closePagePlaylistMenu();
      return;
    }
    closePagePlaylistMenu();
    pagePlaylistMenuAnchor = anchor;
    pagePlaylistMenu = document.createElement("div");
    pagePlaylistMenu.className = "bandcamp-hub-page-playlist-menu bandcamp-hub-page-cart-menu";
    pagePlaylistMenu.setAttribute("role", "menu");
    for (const name of ["--hub-card", "--hub-line", "--hub-text", "--hub-faint", "--hub-accent", "--hub-accent-soft"]) {
      const value = panel.style.getPropertyValue(name);
      if (value) pagePlaylistMenu.style.setProperty(name, value);
    }
    const addTrack = document.createElement("button");
    addTrack.type = "button";
    addTrack.textContent = "Add track";
    addTrack.setAttribute("role", "menuitem");
    addTrack.addEventListener("click", async () => {
      closePagePlaylistMenu();
      await addQueuedItemToCart(track, "t", addTrack);
    });
    const addAlbum = document.createElement("button");
    addAlbum.type = "button";
    addAlbum.textContent = "Add album";
    addAlbum.setAttribute("role", "menuitem");
    addAlbum.addEventListener("click", async () => {
      closePagePlaylistMenu();
      await addQueuedItemToCart(track, "a", addAlbum);
    });
    pagePlaylistMenu.append(addTrack, addAlbum);
    document.body.append(pagePlaylistMenu);
    syncPageTypography();
    anchor.classList.add("is-active");
    anchor.setAttribute("aria-expanded", "true");
    positionPagePlaylistMenu();
    window.setTimeout(() => document.addEventListener("click", closePagePlaylistMenu, { once: true }), 0);
  }

  function createPagePlaylistButton(tagName = "button") {
    const button = document.createElement(tagName);
    button.className = "bandcamp-hub-page-playlist";
    button.style.setProperty("--hub-plus-icon", `url('${asset("icon-plus.svg")}')`);
    button.style.fontFamily = 'var(--hub-font-family, "Helvetica Neue", Helvetica, Arial, sans-serif)';
    if (tagName === "button") button.type = "button";
    else {
      button.href = "#";
      button.setAttribute("role", "button");
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button._bandkitTrack) openPagePlaylistMenu(button, button._bandkitTrack);
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

  function updatePageCartButton(button, track) {
    button._bandkitTrack = track || null;
    button.hidden = false;
    button.disabled = false;
    const label = "Open Bandcamp purchase options and BandKit cart";
    button.title = label;
    button.setAttribute("aria-label", label);
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
    if (cartButton.nextElementSibling !== button) cartButton.after(button);
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
  }

  function injectPlaylistButtons() {
    ensurePageStyles();
    const playerPlaylistButton = document.querySelector(".inline_player .bandcamp-hub-page-playlist.is-player-control");
    if (playerPlaylistButton) updatePagePlaylistButton(playerPlaylistButton, currentInlinePlaylistTrack());
    const available = [
      ...buildSeamlessQueue(),
      ...(getModernPlayerState()?.queue || []),
      getDiscoverPlayerState()?.track,
      getFeedPlayerState()?.track
    ].filter(Boolean);
    const candidates = [
      ...document.querySelectorAll(".track_row_view"),
      ...document.querySelectorAll("section.floating-player .track-meta[streamurl]"),
      ...document.querySelectorAll(".searchresult, .results-grid-item, .collection-item-container[data-trackid]")
    ];
    const discover = getDiscoverPlayerState();
    const feed = getFeedPlayerState();
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
      const isClassicTrackRow = node.matches(".track_row_view");
      const buyTrack = isClassicTrackRow
        ? [...node.querySelectorAll("a, button")].find((control) => /^buy track$/i.test(control.textContent?.replace(/\s+/g, " ").trim() || ""))
        : null;
      if (isClassicTrackRow) {
        if (!buyTrack) continue;
        let button = node.querySelector(".bandcamp-hub-page-playlist.is-track-action");
        if (!button) {
          button = createPagePlaylistButton("a");
          button.className = `${buyTrack.className || ""} bandcamp-hub-page-playlist is-track-action`.trim();
          buyTrack.before(button);
        }
        button.classList.remove("bandcamp-hub-page-buy");
        button.style.removeProperty("--hub-buy-icon");
        buyTrack.classList.add("bandcamp-hub-page-buy");
        buyTrack.style.setProperty("--hub-buy-icon", `url('${asset("icon-cart.svg")}')`);
        buyTrack.setAttribute("aria-label", `Buy ${track.title}`);
        buyTrack.title = `Buy ${track.title}`;
        updatePagePlaylistButton(button, track);
        continue;
      }
      const titleNode = node.querySelector(".track-title, .title-text, .player-info .title, .fav-track-title, .collection-item-title, .title");
      const target = titleNode?.closest("a")?.parentElement || titleNode?.parentElement || node;
      let button = target.querySelector(":scope > .bandcamp-hub-page-playlist");
      if (!button) {
        button = createPagePlaylistButton();
        target.append(button);
      }
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
    const parsedFromBridge = Array.isArray(bridgedCart) ? bridgedCart.map((item) => ({
      id: `bandcamp-${item.item_type}-${item.item_id}-${item.option_id ?? ""}`,
      title: item.item_title2 || item.item_title || "Bandcamp item",
      artist: item.artist_name || item.band_name || firstReleaseValue(item, ["artist_name", "band_name", "artist"]) || "Bandcamp",
      kind: item.option_name || ({ a: "Digital album", t: "Digital track", b: "Digital discography", p: "Merch" }[item.item_type] || "Saved cart item"),
      price: Math.max(0, Number(item.unit_price) || 0) * Math.max(1, Number(item.quantity) || 1),
      currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD",
      art: bridgeArt(item),
      url: item.url || firstReleaseValue(item, ["url"]) || location.href,
      restore: {
        ...item,
        associated_license_id: item.license_id ?? null
      }
    })) : [];
    const candidates = [...document.querySelectorAll("#sidecart #item_list > *, [data-test='cart-item'], .cart-item")]
      .filter((node) => node.children.length > 0 && getComputedStyle(node).display !== "none");
    if (!hasBridgedCart && !candidates.length) return;

    const parsedFromDom = candidates.map((row, index) => {
      const title = elementText(row, [".item-title", ".product-title", ".title", "h3", "h4", "a[href]"]);
      if (!title) return null;
      const artist = elementText(row, [".artist", ".band-name", ".item-artist", ".secondaryText"]);
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
        artist: artist || "Bandcamp",
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
      sourcePage: location.href,
      summary: state.cartSummary
    }).savedCarts;
    saveState();
    if (state.activeTab === "cart") render();
  }

  function scanLivePlayer() {
    scanLiveCart();
    injectPageDjToolsLink();
    injectPlaylistButtons();
    const data = getBandcampPageData();
    const audio = getAudio();
    for (const candidate of document.querySelectorAll("audio")) {
      if (!seamless.enabled) applyDjToAudio(candidate);
      if (observedAudio.has(candidate)) continue;
      observedAudio.add(candidate);
      candidate.addEventListener("play", async () => {
        const tookOver = getFeedPlayerState()
          ? await handoffFeedPlayer()
          : await handoffPageAudio(candidate);
        if (!tookOver) scanLivePlayer();
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
    const feed = getFeedPlayerState();
    if (modern?.isPlaying && modern.track?.url !== seamless.track?.url) {
      void handoffModernPlayer();
    } else if (modern?.isPlaying && seamless.enabled && modern.track?.url === seamless.track?.url) {
      stopModernPagePlayer();
    }

    if (discover?.isPlaying) {
      const sameDiscoverTrack = seamless.enabled
        && seamless.track?.title === discover.track?.title
        && seamless.track?.pageUrl === discover.track?.pageUrl;
      if (sameDiscoverTrack) {
        pageMediaCommand("pause");
      } else if (isReusableStreamUrl(discover.track?.url)) {
        void handoffDiscoverPlayer();
        return;
      } else if (seamless.enabled) {
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_DISABLE");
        window.setTimeout(scanLivePlayer, 120);
        return;
      }
    }

    if (feed?.isPlaying) {
      const sameFeedTrack = seamless.enabled
        && seamless.track?.id === feed.track?.id
        && seamless.track?.pageUrl === feed.track?.pageUrl;
      if (sameFeedTrack) {
        const feedAudio = getAudio();
        if (feedAudio && !feedAudio.paused) feedAudio.pause();
      } else if (isReusableStreamUrl(feed.track?.url)) {
        void handoffFeedPlayer();
        return;
      } else if (seamless.enabled) {
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_DISABLE");
        window.setTimeout(scanLivePlayer, 120);
        return;
      }
    }

    if (seamless.enabled) {
      syncPagePlayerUi();
      renderPlayer();
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
      url: activityUrl,
      artistUrl: seamless.track?.artistUrl || live.artistUrl || artistUrlFromPageUrl(activityUrl)
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
  panel.querySelector(".hub-close").addEventListener("click", () => setOpen(false));
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

  function clearResizeHover() {
    panel.classList.remove("is-hover-resize-x", "is-hover-resize-y");
  }

  panel.addEventListener("pointermove", (event) => {
    if (panel.classList.contains("is-contextual") || state.layoutMode === "docked" || dragging || panel.classList.contains("is-resizing")) {
      clearResizeHover();
      return;
    }
    const rect = panel.getBoundingClientRect();
    const distances = [
      { axis: "x", value: Math.abs(event.clientX - rect.left) },
      { axis: "x", value: Math.abs(rect.right - event.clientX) },
      { axis: "y", value: Math.abs(event.clientY - rect.top) },
      { axis: "y", value: Math.abs(rect.bottom - event.clientY) }
    ].sort((a, b) => a.value - b.value);
    const axis = distances[0].value <= 18 ? distances[0].axis : "";
    panel.classList.toggle("is-hover-resize-x", axis === "x");
    panel.classList.toggle("is-hover-resize-y", axis === "y");
  }, true);
  panel.addEventListener("pointerleave", clearResizeHover);

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
        return;
      }
      if (state.layoutMode === "docked") {
        const deltaX = event.clientX - resizing.startX;
        const requestedWidth = state.dockSide === "left" ? resizing.width + deltaX : resizing.width - deltaX;
        const dockedWidth = Math.max(minWidth, Math.min(window.innerWidth, requestedWidth));
        panel.style.width = `${dockedWidth}px`;
        state.dockedWidth = Math.round(dockedWidth);
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
    if (suppressModernControl || !(event.target instanceof Element)) return;
    const feedControl = event.target.closest("body.feed .track_play_auxiliary");
    if (feedControl) {
      const feed = getFeedPlayerState();
      const controlsCurrentSeamlessTrack = Boolean(
        seamless.enabled
        && feed?.track?.id === seamless.track?.id
        && feed?.track?.pageUrl === seamless.track?.pageUrl
      );
      if (controlsCurrentSeamlessTrack) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE");
        return;
      }
      if (seamless.enabled) void seamlessCommand("BANDCAMP_HUB_SEAMLESS_DISABLE");
      window.setTimeout(scanLivePlayer, 160);
      return;
    }
    const discoverControl = event.target.closest(".results-grid-item .play-pause-button, .discover-player .play-pause-button");
    if (discoverControl) {
      const discover = getDiscoverPlayerState();
      const controlsCurrentSeamlessTrack = Boolean(
        discoverControl.closest(".discover-player")
        && seamless.enabled
        && discover?.track?.title === seamless.track?.title
        && discover?.track?.pageUrl === seamless.track?.pageUrl
      );
      if (controlsCurrentSeamlessTrack) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE");
        return;
      }
      if (seamless.enabled) void seamlessCommand("BANDCAMP_HUB_SEAMLESS_DISABLE");
      window.setTimeout(scanLivePlayer, 160);
      return;
    }
    const previous = event.target.closest("section.floating-player .prev-track");
    const next = event.target.closest("section.floating-player .next-track");
    if (seamless.enabled && (previous || next)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void seamlessCommand(previous ? "BANDCAMP_HUB_SEAMLESS_PREVIOUS" : "BANDCAMP_HUB_SEAMLESS_NEXT");
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
      else void seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE");
      return;
    }
    if (seamless.enabled && seamless.isPlaying) void seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE");
    window.setTimeout(() => {
      void handoffModernPlayer(requestedIndex);
    }, 100);
  }, true);

  document.addEventListener("change", (event) => {
    if (!seamless.enabled || !(event.target instanceof HTMLInputElement) || !event.target.matches("section.floating-player input[type='range']")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SEEK", { currentTime: Number(event.target.value) || 0 });
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
      if (previous) void seamlessCommand("BANDCAMP_HUB_SEAMLESS_PREVIOUS");
      if (next) void seamlessCommand("BANDCAMP_HUB_SEAMLESS_NEXT");
      if (progress && seamless.duration) {
        const rect = progress.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        void seamlessCommand("BANDCAMP_HUB_SEAMLESS_SEEK", { currentTime: fraction * seamless.duration });
      }
      return;
    }
    const control = event.target.closest(".inline_player .playbutton, .inline_player [aria-label*='Play'], .inline_player [aria-label*='Pause'], .track_row_view .play_status, .track_row_view .play_cell a");
    if (!control) return;
    const requestedTrack = classicPageTrackForControl(control);
    if (!requestedTrack) {
      void seamlessCommand("BANDCAMP_HUB_SEAMLESS_DISABLE");
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const controlsCurrentTrack = Boolean(matchingQueueTrack([requestedTrack], seamless.track || {}));
    if (!controlsCurrentTrack) void handoffPageAudio(null, requestedTrack.title);
    else void seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE");
  }, true);

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const source = event.target.closest("[data-trackid], [data-track-id], [data-audiourl], .track_row_view, .searchresult, .result-info, .discover-item, .results-grid-item");
    const item = itemFromNode(source);
    if (item) lastPageItem = item;
    window.setTimeout(scanLivePlayer, 250);
  }, true);
  playButton.addEventListener("click", async () => {
    if (seamless.enabled) {
      await seamlessCommand("BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE");
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
        showToast("Use Bandcamp's page player once, then BandKit can control it.");
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
  nowPlayingButton.addEventListener("click", () => {
    const closeCurrent = state.open && state.activeTab === "nowPlaying";
    state.activeTab = "nowPlaying";
    state.open = !closeCurrent;
    saveState();
    saveLayoutState();
    render();
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
      await seamlessCommand("BANDCAMP_HUB_SEAMLESS_PREVIOUS");
      return;
    }
    const audio = getAudio();
    if (audio) audio.currentTime = 0;
  });

  player.querySelector(".hub-next-button").addEventListener("click", async () => {
    if (seamless.enabled) {
      await seamlessCommand("BANDCAMP_HUB_SEAMLESS_NEXT");
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
      await seamlessCommand("BANDCAMP_HUB_SEAMLESS_SEEK", { currentTime: target.currentTime });
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
    if (message?.type === "BANDCAMP_HUB_PING") {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version, ready: hubReady, error: startupError });
      return false;
    }
    if (message?.type === "BANDCAMP_HUB_TOGGLE") setOpen(!state.open);
    if (message?.type === "BANDCAMP_HUB_OPEN") setOpen(true);
    if (message?.type === "BANDCAMP_HUB_SEAMLESS_STATE") applySeamlessState(message.state);
    if (message?.type === "BANDCAMP_HUB_WISHLIST_UPDATED") {
      markWishlistTrack(message.key, message.success !== false);
    }
    if (message?.type === "BANDCAMP_HUB_RESTORE_CART") {
      restoreSavedCart(message.items)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message || "Cart restoration failed." }));
      return true;
    }
    sendResponse({ ok: true });
    return false;
  };
  chrome.runtime.onMessage.addListener(runtimeMessageHandler);
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    const incomingLayout = changes.bandcampHubLayout?.newValue;
    if (incomingLayout && (Number(incomingLayout.revision) || 0) > layoutRevision) {
      applyPersistedLayout(incomingLayout);
      if (hubReady) {
        applyLayoutMode();
        render();
      }
    }
    const incoming = changes.bandcampHubState?.newValue;
    if (!incoming) return;
    const savedCarts = cartAutosave.normalizeSavedCarts(incoming.savedCarts);
    const playlist = normalizePlaylist(incoming.playlist);
    const savedPlaylists = normalizeSavedPlaylists(incoming.savedPlaylists);
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
      && JSON.stringify(savedPlaylists) === JSON.stringify(state.savedPlaylists)
      && !appearanceChanged) return;
    state.savedCarts = savedCarts;
    state.playlist = playlist;
    state.savedPlaylists = savedPlaylists;
    state.appearance = appearance;
    if (!state.savedCarts.some((snapshot) => snapshot.id === state.selectedSavedCartId)) {
      state.selectedSavedCartId = null;
    }
    if (["cart", "playlist", "settings"].includes(state.activeTab)) render();
    if (appearanceChanged) applyAppearance();
    injectPlaylistButtons();
  });

  async function init() {
    const styleUrl = new URL(chrome.runtime.getURL("hub.css"));
    styleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
    const modernStyleUrl = new URL(chrome.runtime.getURL("modern-release.css"));
    modernStyleUrl.searchParams.set("v", chrome.runtime.getManifest().version);
    const [hubCss, modernCss] = await Promise.all([
      fetch(styleUrl.href).then((response) => response.text()),
      fetch(modernStyleUrl.href).then((response) => response.text())
    ]);
    style.textContent = hubCss;
    modernReleaseStyle.textContent = modernCss;
    document.head.append(modernReleaseStyle);
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
      const hideHeaderCart = state.appearance.hideHeaderCart !== false;
      for (const nativeCart of nativeCarts) {
        nativeCart.setAttribute("data-bandkit-native-cart", "");
        nativeCart.toggleAttribute("hidden", hideHeaderCart);
        const nativeCartWrapper = nativeCart.closest("li");
        nativeCartWrapper?.setAttribute("data-bandkit-native-cart-wrapper", "");
        nativeCartWrapper?.toggleAttribute("hidden", hideHeaderCart);
        if (nativeCart.dataset.bandkitCartBound) continue;
        nativeCart.dataset.bandkitCartBound = "true";
        nativeCart.addEventListener("click", (event) => {
          if (state.appearance.hideHeaderCart === false) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          openBandKitCart();
        });
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
        launcher.style.removeProperty("color");
        launcher.classList.remove("is-floating", "is-modern-header");
        launcher.classList.add("is-header");
        syncNativeHeaderCart(legacyNav);
        return true;
      }
      if (allowFloating) {
        document.body.append(root);
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
        mountLauncherInHeader({ allowFloating: !root.isConnected });
      });
    }
    mountLauncherInHeader({ allowFloating: true });
    for (const delay of [100, 500, 1500]) window.setTimeout(scheduleHeaderMount, delay);
    const headerObserver = new MutationObserver(scheduleHeaderMount);
    headerObserver.observe(document.body, { childList: true, subtree: true });
    syncPageTypography();

    const saved = await storageGet(["bandcampHubState", "bandcampHubLayout"]);
    if (saved.bandcampHubState) {
      state = {
        ...state,
        ...saved.bandcampHubState,
        cart: saved.bandcampHubState.cart || state.cart,
        savedCarts: cartAutosave.normalizeSavedCarts(saved.bandcampHubState.savedCarts || state.savedCarts),
        playlist: normalizePlaylist(saved.bandcampHubState.playlist || state.playlist),
        savedPlaylists: normalizeSavedPlaylists(saved.bandcampHubState.savedPlaylists || state.savedPlaylists),
        activity: (saved.bandcampHubState.activity || []).filter((item) => item?.url),
        appearance: {
          ...state.appearance,
          ...(saved.bandcampHubState.appearance || {}),
          savedThemes: Array.isArray(saved.bandcampHubState.appearance?.savedThemes)
            ? saved.bandcampHubState.appearance.savedThemes.filter((theme) => theme?.id && theme?.label && theme?.accent && theme?.surface).slice(0, 12)
            : []
        },
        dj: {
          ...state.dj,
          ...(saved.bandcampHubState.dj || {})
        }
      };
    }
    applyPersistedLayout(saved.bandcampHubLayout);
    const savedAtDate = state.cartSavedAt ? new Date(state.cartSavedAt) : new Date();
    const initialAutoSave = cartAutosave.upsertAutoSavedCart(state.savedCarts, state.cart, {
      savedAt: Number.isNaN(savedAtDate.getTime()) ? new Date().toISOString() : savedAtDate.toISOString(),
      sourcePage: location.href,
      summary: state.cartSummary
    });
    state.savedCarts = initialAutoSave.savedCarts;
    if (initialAutoSave.changed) saveState();
    if (state.activeTab === "playing") state.activeTab = "nowPlaying";
    if (state.activeTab === "playlist" && state.playlistView === "current") state.activeTab = "nowPlaying";
    if (![...tabs.map((tab) => tab.id), "nowPlaying"].includes(state.activeTab)) state.activeTab = "playlist";
    if (!["floating", "docked"].includes(state.layoutMode)) state.layoutMode = "floating";
    state.layoutMode = "floating";
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
    applyLayoutMode();
    if ("ResizeObserver" in window) {
      new ResizeObserver(capturePanelLayout).observe(panel);
    }
    scanLivePlayer();
    render();
    runPendingTrackAction();
    scanTimer = window.setInterval(scanLivePlayer, 1200);
    seamlessSyncTimer = window.setInterval(() => void syncSeamlessState(), 3000);
    window.addEventListener("pageshow", () => void syncSeamlessState());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void syncSeamlessState();
    });
    window.setTimeout(applyAppearance, 800);
    window.addEventListener("resize", () => {
      applyLauncherPosition();
      applySavedLayout();
    });
    window.addEventListener("pagehide", () => {
      window.clearInterval(scanTimer);
      window.clearInterval(seamlessSyncTimer);
      window.clearTimeout(layoutSaveTimer);
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
    }, { once: true });
    hubReady = true;
    reportDiagnostic("ready");
  }

  init().catch((error) => {
    startupError = String(error?.stack || error?.message || error);
    console.error("BandKit failed to start.", error);
    reportDiagnostic("error", startupError);
    try {
      chrome.runtime.onMessage.removeListener(runtimeMessageHandler);
    } catch {}
    root.remove();
  });
})();
