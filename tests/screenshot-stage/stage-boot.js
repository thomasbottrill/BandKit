// Screenshot stage boot. Runs the real built content script on an otherwise
// empty page, backed by a local playback engine that mirrors the offscreen
// document's audio graph, so the player, visualiser, DJ drawer and panel are
// all the genuine UI driven by a genuine Bandcamp stream.
//
// This is a capture harness for store imagery and manual review. It is not a
// test, and it is not part of the shipped extension.

import {
  buildWaveform,
  createTrackAudioDecoder,
  estimateBpmDetailsCooperatively,
  estimateKeyCooperatively,
  startVisualizerSignal
} from "/stage/analysis.js";

// Same decoder the offscreen document uses, so the stage samples the stream in
// the same segments and reports the same waveform, tempo and key.
const decodeTrackAnalysisAudio = createTrackAudioDecoder({
  analysisFetchControllers: new Set(),
  playbackPriorityControllers: new Set()
});

const params = new URLSearchParams(location.search);
const DEFAULT_TRACK = "https://amuwa.bandcamp.com/track/angle-of-incidence";
const MESSAGE_VISUALIZER = "BANDCAMP_HUB_VISUALIZER_STATE";
const MESSAGE_SEAMLESS = "BANDCAMP_HUB_SEAMLESS_STATE";

const status = document.getElementById("stage-status");
const setStatus = (text) => { if (status) status.textContent = text; };

function proxied(url) {
  return url ? `/stage/media?u=${encodeURIComponent(url)}` : "";
}

// Bandkit playlist items carry the stream on `url` and the release page on
// `pageUrl`. Artwork and audio both go through the local proxy so the page
// stays same-origin and the AudioContext is never tainted.
function toPlaylistItem(entry, index) {
  return {
    id: String(entry.id || index),
    playlistItemId: `stage-${index}-${entry.id || index}`,
    title: entry.title,
    artist: entry.artist,
    album: entry.album || "",
    duration: Number(entry.duration) || 0,
    art: proxied(entry.art),
    pageUrl: entry.pageUrl,
    artistUrl: entry.artistUrl,
    url: proxied(entry.stream)
  };
}

async function loadSession(trackUrl) {
  const response = await fetch(`/stage/session?track=${encodeURIComponent(trackUrl)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || "The release could not be staged.");
  const primary = toPlaylistItem(payload.track, 0);
  const library = (payload.library || []).map((entry, index) => toPlaylistItem(entry, index + 1));
  return { primary, library, queue: [primary, ...library] };
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

// Populates every panel screen with the real release and the artist's real
// discography, so the queue, playlists, cart and activity captures are not
// carrying invented titles.
function buildStoredState({ primary, library, queue }) {
  const priced = [primary, ...library].slice(0, 3).map((item, index) => ({
    id: `stage-cart-${index}`,
    title: item.album || item.title,
    artist: item.artist,
    kind: index === 0 ? "Digital track" : "Digital album",
    price: [1.5, 7, 9][index] ?? 7,
    currency: "GBP",
    art: item.art,
    url: item.pageUrl
  }));
  return {
    bandcampHubState: {
      open: params.has("panel"),
      activeTab: params.get("panel") || "playlist",
      playlistView: params.get("playlistView") || "current",
      playlistMode: "manual",
      playlist: queue,
      savedPlaylists: library.length
        ? [{
            id: "stage-saved-playlist",
            name: `${primary.artist} selects`,
            savedAt: isoMinutesAgo(2880),
            modifiedAt: isoMinutesAgo(90),
            sourcePage: primary.artistUrl,
            items: [primary, ...library].slice(0, 4)
          }]
        : [],
      cartView: params.get("cartView") || "current",
      cart: priced,
      cartSummary: { subtotal: priced.reduce((total, item) => total + item.price, 0), currency: "GBP" },
      savedCarts: [{
        id: "stage-saved-cart",
        name: "Bandcamp Friday shortlist",
        savedAt: isoMinutesAgo(4320),
        summary: { subtotal: priced.reduce((total, item) => total + item.price, 0), currency: "GBP" },
        items: priced
      }],
      activity: queue.slice(0, 6).map((item, index) => ({
        id: `stage-activity-${index}`,
        action: index % 3 === 2 ? "cart" : "played",
        title: item.title,
        artist: item.artist,
        time: `${index + 1} hour${index ? "s" : ""} ago · recorded locally`,
        createdAt: isoMinutesAgo((index + 1) * 63),
        art: item.art,
        url: item.pageUrl,
        artistUrl: item.artistUrl,
        destination: ""
      })),
      dj: { open: params.has("dj"), pageOpen: false },
      // Page theming is off by default in the product, which leaves the stage
      // with no page colour at all. Turn it on and drop Match Bandcamp, since
      // there is no Bandcamp page here to sample: "Page background" then paints
      // the page through the extension's own rules, while "Page content" feeds
      // the linked Bandkit content and panel colours that dress the UI.
      appearance: {
        pageAware: false,
        applyToPage: true,
        preset: "custom",
        customPanelLinked: true,
        customContentLinked: true
      },
      // Dynamic colour samples whatever is behind the bar and re-tints the
      // player and panel to it, so on this stage the page colour swallowed both
      // surfaces. Turn it off: "Content surface" then drives the UI and "Page
      // background" is left owning only the page.
      musicBarDynamicColor: false,
      musicBarPlayerDynamicColor: false,
      musicBarPanelDynamicColor: false,
      // The backup reminder is a real feature but pure noise in a capture.
      backupReminderDays: 0,
      backupIntroSeen: true,
      lastBackupAt: isoMinutesAgo(60),
      onboardingComplete: true
    }
  };
}

function gainFromDb(db) {
  return Math.pow(10, db / 20);
}

// Mirrors src/offscreen/index.js: same node order, same filter and EQ mapping,
// so the DJ controls move real audio exactly as they do in the extension.
function createEngine() {
  const audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";

  let context = null;
  let filterNode = null;
  let lowEqNode = null;
  let midEqNode = null;
  let highEqNode = null;
  let analyserNode = null;
  let gainNode = null;

  const state = {
    enabled: false,
    status: "idle",
    queue: [],
    index: -1,
    rate: 1,
    preservePitch: true,
    scratchActive: false,
    loopBeats: 0,
    loopStart: 0,
    loopEnd: 0,
    filterValue: 0,
    gainDb: 0,
    eqLowDb: 0,
    eqMidDb: 0,
    eqHighDb: 0,
    detectedBpm: null,
    automaticBpm: null,
    automaticBpmUncertain: false,
    bpmSource: "auto",
    bpmStatus: "idle",
    bpmError: "",
    bpmUncertain: false,
    detectedKey: null,
    waveform: []
  };
  let revision = 0;
  const sessionStartedAt = Date.now();

  const currentTrack = () => state.queue[state.index] || null;

  function buildGraph() {
    if (gainNode) return;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    context = new AudioContextClass();
    const source = context.createMediaElementSource(audio);
    filterNode = context.createBiquadFilter();
    lowEqNode = context.createBiquadFilter();
    midEqNode = context.createBiquadFilter();
    highEqNode = context.createBiquadFilter();
    gainNode = context.createGain();
    analyserNode = context.createAnalyser();
    Object.assign(analyserNode, { fftSize: 4096, minDecibels: -105, maxDecibels: -6, smoothingTimeConstant: 0.08 });
    source.connect(filterNode);
    filterNode.connect(lowEqNode);
    lowEqNode.connect(midEqNode);
    midEqNode.connect(highEqNode);
    highEqNode.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(context.destination);
    startVisualizerSignal({
      analyser: analyserNode,
      audio,
      isPlaying: () => state.enabled && !audio.paused && !audio.ended && state.status !== "loading"
    });
    applyEffects();
  }

  function applyEffects() {
    if (!context) return;
    const now = context.currentTime || 0;
    if (Math.abs(state.filterValue) < 0.01) {
      filterNode.type = "allpass";
      filterNode.frequency.setTargetAtTime(1000, now, 0.015);
    } else if (state.filterValue < 0) {
      filterNode.type = "lowpass";
      filterNode.frequency.setTargetAtTime(20000 * Math.pow(120 / 20000, Math.abs(state.filterValue)), now, 0.015);
    } else {
      filterNode.type = "highpass";
      filterNode.frequency.setTargetAtTime(20 * Math.pow(8000 / 20, state.filterValue), now, 0.015);
    }
    filterNode.Q.setTargetAtTime(0.72, now, 0.015);
    lowEqNode.type = "lowshelf";
    lowEqNode.frequency.setTargetAtTime(250, now, 0.015);
    lowEqNode.gain.setTargetAtTime(state.eqLowDb, now, 0.015);
    midEqNode.type = "peaking";
    midEqNode.frequency.setTargetAtTime(1000, now, 0.015);
    midEqNode.Q.setTargetAtTime(0.9, now, 0.015);
    midEqNode.gain.setTargetAtTime(state.eqMidDb, now, 0.015);
    highEqNode.type = "highshelf";
    highEqNode.frequency.setTargetAtTime(4000, now, 0.015);
    highEqNode.gain.setTargetAtTime(state.eqHighDb, now, 0.015);
    gainNode.gain.setTargetAtTime(gainFromDb(state.gainDb), now, 0.015);
    audio.volume = 1;
  }

  function snapshot() {
    const track = currentTrack();
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(track?.duration) || 0;
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    return {
      sessionStartedAt,
      revision: ++revision,
      enabled: state.enabled,
      status: state.status,
      error: "",
      isPlaying: state.enabled && state.status !== "loading" && !audio.paused && !audio.ended,
      currentTime,
      duration,
      progress: duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0,
      rate: state.rate,
      preservePitch: state.preservePitch,
      scratchActive: state.scratchActive,
      loopBeats: state.loopBeats,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      filterValue: state.filterValue,
      gainDb: state.gainDb,
      eqLowDb: state.eqLowDb,
      eqMidDb: state.eqMidDb,
      eqHighDb: state.eqHighDb,
      detectedBpm: state.detectedBpm,
      automaticBpm: state.automaticBpm,
      automaticBpmUncertain: state.automaticBpmUncertain,
      bpmSource: state.bpmSource,
      bpmStatus: state.bpmStatus,
      bpmError: state.bpmError,
      bpmUncertain: state.bpmUncertain,
      detectedKey: state.detectedKey,
      waveform: state.waveform,
      index: state.index,
      track,
      queue: state.queue
    };
  }

  function broadcast() {
    globalThis.stageDispatch?.({ type: MESSAGE_SEAMLESS, state: snapshot() });
  }

  // Real waveform, tempo and key for the staged track, using the extension's
  // own analysis code rather than placeholder numbers.
  let analysisToken = 0;
  async function analyzeCurrent() {
    const track = currentTrack();
    if (!track?.url || !context) return;
    const token = ++analysisToken;
    state.bpmStatus = "analyzing";
    state.waveform = [];
    state.detectedKey = null;
    broadcast();
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      const yieldControl = () => new Promise((resolve) => setTimeout(resolve, 0));
      const decoded = await decodeTrackAnalysisAudio(AudioContextClass, track.url, {
        duration: track.duration,
        segmentCount: 3,
        yieldControl
      });
      const buffers = Array.isArray(decoded) ? decoded : [decoded];
      if (token !== analysisToken) return;
      state.waveform = buildWaveform(buffers[0]);
      broadcast();
      const tempo = await estimateBpmDetailsCooperatively(buffers, yieldControl).catch(() => null);
      if (token !== analysisToken) return;
      state.automaticBpm = Number(tempo?.bpm) || null;
      state.detectedBpm = state.automaticBpm;
      state.automaticBpmUncertain = Boolean(tempo?.bpmUncertain);
      state.bpmUncertain = state.automaticBpmUncertain;
      state.bpmStatus = state.detectedBpm ? "ready" : "error";
      state.bpmError = state.bpmUncertain ? "This is a best-effort tempo estimate." : "";
      broadcast();
      const key = await estimateKeyCooperatively(buffers, yieldControl).catch(() => null);
      if (token !== analysisToken) return;
      state.detectedKey = key || null;
      broadcast();
    } catch {
      if (token !== analysisToken) return;
      state.bpmStatus = "error";
      state.bpmError = "The stream could not be analysed on the stage.";
      broadcast();
    }
  }

  async function playIndex(index) {
    const next = state.queue[Math.max(0, Math.min(state.queue.length - 1, index))];
    if (!next) return snapshot();
    buildGraph();
    if (context?.state === "suspended") await context.resume().catch(() => {});
    state.index = state.queue.indexOf(next);
    state.enabled = true;
    state.status = "loading";
    audio.src = next.url;
    broadcast();
    try {
      await audio.play();
      state.status = "playing";
    } catch {
      state.status = "paused";
    }
    broadcast();
    void analyzeCurrent();
    return snapshot();
  }

  audio.addEventListener("timeupdate", broadcast);
  audio.addEventListener("durationchange", broadcast);
  audio.addEventListener("play", () => { state.status = "playing"; broadcast(); });
  audio.addEventListener("pause", () => { if (state.status !== "loading") state.status = "paused"; broadcast(); });
  audio.addEventListener("ended", () => { void playIndex(state.index + 1); });

  return {
    snapshot,
    setQueue(queue) { state.queue = Array.isArray(queue) && queue.length ? queue : state.queue; },
    // Browsers will not autoplay without a gesture, so the stage loads the
    // track and reports it as paused. The bar renders complete — artwork,
    // title, duration, waveform, BPM and key — and pressing play starts audio.
    prime() {
      if (!state.queue.length) return;
      buildGraph();
      state.index = 0;
      state.enabled = true;
      state.status = "paused";
      audio.src = state.queue[0].url;
      audio.load();
      broadcast();
      void analyzeCurrent();
    },
    async command(type, message) {
      const suffix = String(type).replace("BANDCAMP_HUB_SEAMLESS_", "").replace("BANDCAMP_HUB_", "");
      switch (suffix) {
        case "ENABLE":
          this.setQueue(message.queue);
          return playIndex(Number(message.index) || 0);
        case "PLAY_INDEX":
          return playIndex(Number(message.index) || 0);
        case "UPDATE_QUEUE":
          this.setQueue(message.queue);
          broadcast();
          return snapshot();
        case "PLAY_PAUSE":
          buildGraph();
          if (context?.state === "suspended") await context.resume().catch(() => {});
          if (state.index < 0) return playIndex(0);
          if (audio.paused) await audio.play().catch(() => {});
          else audio.pause();
          broadcast();
          return snapshot();
        case "NEXT":
          return playIndex(state.index + 1);
        case "PREVIOUS":
          return audio.currentTime > 4 ? (audio.currentTime = 0, broadcast(), snapshot()) : playIndex(state.index - 1);
        case "SEEK":
          if (Number.isFinite(message.time)) audio.currentTime = Math.max(0, message.time);
          broadcast();
          return snapshot();
        case "SET_RATE":
          state.rate = Number(message.rate) || 1;
          state.preservePitch = message.preservePitch !== false;
          audio.playbackRate = state.rate;
          audio.preservesPitch = state.preservePitch;
          broadcast();
          return snapshot();
        case "SET_DJ":
          for (const key of ["filterValue", "gainDb", "eqLowDb", "eqMidDb", "eqHighDb"]) {
            if (Number.isFinite(message[key])) state[key] = message[key];
          }
          applyEffects();
          broadcast();
          return snapshot();
        case "SET_LOOP":
          state.loopBeats = Number(message.beats) || 0;
          broadcast();
          return snapshot();
        case "SET_BPM":
          state.detectedBpm = Number(message.bpm) || state.detectedBpm;
          state.bpmSource = "manual";
          broadcast();
          return snapshot();
        case "RESET_BPM":
          state.detectedBpm = state.automaticBpm;
          state.bpmSource = "auto";
          broadcast();
          return snapshot();
        case "ANALYZE_BPM":
          void analyzeCurrent();
          return snapshot();
        case "DISABLE":
        case "CLEAR_PLAYBACK":
          audio.pause();
          state.enabled = false;
          state.status = "idle";
          state.index = -1;
          broadcast();
          return snapshot();
        default:
          return snapshot();
      }
    }
  };
}

function installChrome(engine, stored) {
  const listeners = new Set();
  globalThis.stageDispatch = (message) => {
    for (const listener of listeners) listener(message, {}, () => {});
  };
  globalThis.stageChrome = {
    runtime: {
      lastError: null,
      id: "bandkit-screenshot-stage",
      getURL: (path) => new URL(`/dist/unpacked/${path}`, location.href).href,
      getManifest: () => ({ version: "stage" }),
      sendMessage(message, callback) {
        const type = String(message?.type || "");
        // The offscreen visualiser module reports through the same channel it
        // uses in the extension; relay it to the content script as the
        // background service worker would.
        if (type === "BANDCAMP_HUB_OFFSCREEN_VISUALIZER") {
          globalThis.stageDispatch({ type: MESSAGE_VISUALIZER, signal: message.signal });
          return Promise.resolve({ ok: true });
        }
        if (type === "BANDCAMP_HUB_GET_SEAMLESS_STATE") {
          callback?.({ ok: true, state: engine.snapshot() });
          return Promise.resolve({ ok: true });
        }
        if (type.startsWith("BANDCAMP_HUB_SEAMLESS_") || type === "BANDCAMP_HUB_CLEAR_PLAYBACK") {
          engine.command(type, message).then((state) => callback?.({ ok: true, state }));
          return Promise.resolve({ ok: true });
        }
        if (type === "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS" || type === "BANDCAMP_HUB_RESOLVE_CART_ITEMS") {
          callback?.({ ok: true, items: message.items || [] });
          return Promise.resolve({ ok: true });
        }
        if (type === "BANDCAMP_HUB_RESOLVE_CART_METADATA") {
          callback?.({ ok: true, items: message.items || [] });
          return Promise.resolve({ ok: true });
        }
        callback?.({ ok: true });
        return Promise.resolve({ ok: true });
      },
      onMessage: { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener) }
    },
    storage: {
      local: {
        get(_key, callback) { callback?.(stored); return Promise.resolve(stored); },
        set(values) { Object.assign(stored, values); return Promise.resolve(); },
        remove() { return Promise.resolve(); }
      },
      session: {
        get(_key, callback) { callback?.({}); return Promise.resolve({}); },
        set() { return Promise.resolve(); }
      },
      onChanged: { addListener() {} }
    }
  };
  // The offscreen visualiser module is imported directly and talks to the
  // global `chrome`, which the content script never sees.
  globalThis.chrome = globalThis.stageChrome;
}

// The manifest loads cart-autosave.js ahead of content.js and content.js reads
// the global it registers, so the stage has to preserve that order.
async function loadContentScript() {
  for (const file of ["cart-autosave.js", "content.js"]) {
    const response = await fetch(`/dist/unpacked/${file}`);
    const source = await response.text();
    (0, eval)(source.replaceAll("chrome.", "stageChrome."));
  }
}

// The shipped player is pinned to the bottom of the viewport. On the stage it
// belongs in the middle of an empty canvas, which needs a rule inside the
// shadow root because page CSS cannot reach it.
const PANEL_GAP = 12;
const DRAWER_GAP = 10;
const EDGE_MARGIN = 24;

// The shipped player is pinned to the bottom of the viewport and the panel and
// DJ drawer are anchored to that edge. On the stage the bar floats at an
// arbitrary height, so the whole group is positioned from one measurement:
// the drawer rides above the bar, and the panel above whichever is topmost.
function createStageLayout(shadow) {
  const style = document.createElement("style");
  style.textContent = `
    .hub-player {
      border-top-color: transparent;
      bottom: auto;
      box-shadow: 0 40px 120px -40px rgba(0, 0, 0, 0.55);
      transform: none;
    }
    .hub-panel {
      top: auto;
      min-height: 0;
      max-height: none;
    }
    /* The Zune player style pins the visualiser to the viewport bottom rather
       than to the bar, which is the same place while the bar is docked there.
       Re-anchor it to the bar so it travels with it, keeping the 3px overhang
       the shipped rule gives it. */
    .hub-player[data-player-style="zune"] .hub-player-visualizer {
      bottom: var(--stage-visualizer-bottom, -3px);
    }
    .hub-launcher { display: none !important; }
  `;
  shadow.append(style);

  const player = shadow.querySelector(".hub-player");
  const drawer = shadow.querySelector(".hub-dj-drawer");
  const panel = shadow.querySelector(".hub-panel");
  let fraction = 0.5;

  const layout = () => {
    if (!player) return;
    const viewport = window.innerHeight;
    const playerHeight = player.getBoundingClientRect().height || 96;
    const drawerOpen = Boolean(drawer?.classList.contains("is-open"));
    const drawerHeight = drawerOpen ? drawer.getBoundingClientRect().height : 0;
    const groupHeight = playerHeight + (drawerOpen ? drawerHeight + DRAWER_GAP : 0);
    const groupTop = fraction * viewport - groupHeight / 2;
    const playerTop = Math.round(groupTop + groupHeight - playerHeight);

    player.style.top = `${playerTop}px`;
    // The drawer's own offset variable keeps it glued to the bar's top edge.
    drawer?.style.setProperty("--hub-dj-bottom", `${viewport - playerTop + DRAWER_GAP}px`);
    // Measured from the viewport bottom, matching the rule this replaces.
    player.style.setProperty("--stage-visualizer-bottom", `${viewport - (playerTop + playerHeight) - 3}px`);

    // The visualiser and its glow are painted by a detached fixed surface that
    // copies the player's geometry, but it only resyncs on size and pointer
    // events — never on a plain `top` change. Nudge it with one of the events
    // it already listens for so it travels with the bar.
    player.dispatchEvent(new Event("transitionrun"));

    if (!panel) return;
    const anchorTop = drawerOpen ? playerTop - DRAWER_GAP - drawerHeight : playerTop;
    const available = anchorTop - EDGE_MARGIN - PANEL_GAP;
    panel.style.bottom = `${viewport - anchorTop + PANEL_GAP}px`;
    panel.style.height = `${Math.max(220, Math.min(available, 760))}px`;
  };

  const schedule = () => requestAnimationFrame(layout);
  if (drawer) new ResizeObserver(schedule).observe(drawer);
  if (player) new ResizeObserver(schedule).observe(player);
  if (panel) new ResizeObserver(schedule).observe(panel);
  // Opening the panel or the drawer only toggles a class, so watch for it.
  for (const node of [drawer, panel, player].filter(Boolean)) {
    new MutationObserver(schedule).observe(node, { attributes: true, attributeFilter: ["class", "hidden", "style"] });
  }
  window.addEventListener("resize", schedule);
  layout();

  return {
    setFraction(next) {
      fraction = Math.max(0.08, Math.min(0.92, Number(next) || 0.5));
      layout();
    },
    refresh: schedule
  };
}

// The music bar deliberately stays minimal until it is hovered or focused, so
// at rest a capture loses the transport, tools and analysis. Rather than
// writing new styles, re-emit the player's own reveal rules keyed to a class,
// which pins the bar in exactly the state a pointer would produce.
const REVEAL_FRAGMENT = ":has(:is(.hub-player-content, .hub-player-actions):is(:hover, :focus-within))";

// A CSSStyleRule also exposes an (empty) cssRules list for nesting, so a style
// rule has to be matched on its own selector before any recursion.
function collectRevealRules(rules, condition, out) {
  for (const rule of rules) {
    if (rule.selectorText?.includes(REVEAL_FRAGMENT)) {
      const selector = rule.selectorText.replaceAll(REVEAL_FRAGMENT, ".stage-reveal");
      const body = rule.style.cssText;
      out.push(condition ? `@media ${condition} { ${selector} { ${body} } }` : `${selector} { ${body} }`);
    }
    if (rule.cssRules?.length) collectRevealRules(rule.cssRules, rule.conditionText || condition, out);
  }
}

function forceRevealedState(shadow, player) {
  const out = [];
  const sheets = [...shadow.styleSheets, ...(shadow.adoptedStyleSheets || [])];
  for (const sheet of sheets) {
    try {
      collectRevealRules(sheet.cssRules, "", out);
    } catch {
      // A stylesheet the page cannot read is simply skipped.
    }
  }
  if (!out.length) return;
  const style = document.createElement("style");
  style.textContent = out.join("\n");
  shadow.append(style);
  player.classList.add("stage-reveal");
}

// Keeps the page behind the player tied to whatever theme is selected, so the
// backdrop changes the moment a different palette is picked in Settings.
// The page itself is painted by the extension from --bandkit-page-background.
// This only keeps the stage's own controls legible against it, so it reads the
// resolved page colour rather than any panel or content surface value.
function syncStageTheme(player) {
  const apply = () => {
    const page = getComputedStyle(document.documentElement);
    const computed = getComputedStyle(player);
    const read = (name, fallback) => computed.getPropertyValue(name).trim() || fallback;
    const root = document.documentElement.style;
    root.setProperty("--stage-surface", page.getPropertyValue("--bandkit-page-background").trim() || "#101014");
    root.setProperty("--stage-accent", read("--hub-panel-accent", read("--hub-accent", "#1da0c3")));
    root.setProperty("--stage-ink", page.getPropertyValue("--bandkit-page-background-text").trim() || read("--hub-panel-ink", "#f5f5f7"));
  };
  apply();
  new MutationObserver(apply).observe(player, { attributes: true, attributeFilter: ["style", "class", "data-visualizer"] });
  setInterval(apply, 300);
}

function wireControls(onPosition) {
  const controls = document.getElementById("stage-controls");
  const toggle = document.getElementById("stage-controls-toggle");
  const panel = document.getElementById("stage-controls-panel");
  const input = document.getElementById("stage-url");
  const hide = document.getElementById("stage-hide");
  const position = document.getElementById("stage-position");
  const positionValue = document.getElementById("stage-position-value");
  const centre = document.getElementById("stage-centre");

  input.value = params.get("track") || DEFAULT_TRACK;

  const applyPosition = (percent) => {
    position.value = String(percent);
    positionValue.textContent = `${percent}%`;
    onPosition?.(percent / 100);
  };
  position.addEventListener("input", () => applyPosition(Number(position.value)));
  centre.addEventListener("click", () => applyPosition(50));
  // Arrow keys nudge the bar without opening the slider.
  document.addEventListener("keydown", (event) => {
    if (event.target === input || event.target === position) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    applyPosition(Math.max(8, Math.min(92, Number(position.value) + (event.key === "ArrowUp" ? -1 : 1))));
  });
  applyPosition(Number(params.get("y")) || 50);

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  hide.addEventListener("click", () => controls.classList.add("is-hidden"));

  panel.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    const next = new URL(location.href);
    next.searchParams.set("track", value);
    location.href = next.href;
  });

  // H keeps the controls out of the capture without losing them.
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "h" || event.target === input) return;
    controls.classList.toggle("is-hidden");
  });
}

function waitForShadowRoot(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const poll = () => {
      const shadow = document.querySelector("#bandcamp-hub-extension-root [data-bandcamp-hub]")?.shadowRoot;
      if (shadow?.querySelector(".hub-player")) resolve(shadow);
      else if (Date.now() > deadline) resolve(null);
      else setTimeout(poll, 60);
    };
    poll();
  });
}

async function boot() {
  let layout = null;
  wireControls((fraction) => layout?.setFraction(fraction));
  const trackUrl = params.get("track") || DEFAULT_TRACK;
  setStatus("Resolving release…");
  let session;
  try {
    session = await loadSession(trackUrl);
  } catch (error) {
    setStatus(String(error?.message || error));
    document.getElementById("stage-controls-panel").hidden = false;
    return;
  }

  const engine = createEngine();
  engine.setQueue(session.queue);
  const stored = buildStoredState(session);
  installChrome(engine, stored);
  await loadContentScript();

  // The content script mounts its shadow host asynchronously once the runtime
  // has settled, so wait for it rather than reading the DOM immediately.
  const shadow = await waitForShadowRoot();
  if (shadow) {
    layout = createStageLayout(shadow);
    layout.setFraction((Number(params.get("y")) || 50) / 100);
    const player = shadow.querySelector(".hub-player");
    if (player) {
      syncStageTheme(player);
      if (params.get("reveal") !== "0") forceRevealedState(shadow, player);
      // Opening the drawer through its own button keeps the stage honest about
      // how the control surface is actually reached.
      if (params.has("dj")) shadow.querySelector(".hub-dj-player-button")?.click();
    }
  }

  engine.prime();
  layout?.refresh();
  setStatus(`Staged “${session.primary.title}” — press play on the bar to start audio.`);
}

void boot();
