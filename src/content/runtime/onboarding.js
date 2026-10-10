import { createKitControls, ONBOARDING_MENU_KEYS, removeOnboardingMenus, syncOnboardingContrast } from "./onboarding-controls.js";
import { createSettingsRowCopy } from "../components/settings.js";
import { runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { asset, createButtonIcon, createElement } from "../core.js";
import { MUSIC_BAR_VISUALIZER_TYPES, ONBOARDING_COMPLETE } from "../state.js";
import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { applyTimelinePath } from "../timeline-styles.js";
import { syncCustomPlayerButtons } from "../custom-player-buttons.js";
import { createHelpReferenceShortcut } from "../help-reference-shortcut.js";

const STEPS = [
  { eyebrow: "Welcome to Bandkit", title: "Your Bandcamp listening toolkit", copy: "Bandkit adds a music bar and focused tools without taking you away from the music.", icon: "icon-bandkit.svg", target: "player", placement: "top", forceVisualizer: true },
  { eyebrow: "Now Playing", title: "Your current queue, ready when you are", copy: "Played music appears here. Reorder tracks, shuffle the queue, or save it as a playlist from the actions menu.", icon: "icon-now-playing.svg", panel: "playlist", demo: "now-playing", target: "panel", placement: "left" },
  { eyebrow: "Playlists", title: "Keep the music you want to return to", copy: "Saved playlists live beside Now Playing and can be played, shuffled, shared, or opened for editing.", icon: "icon-playlist.svg", panel: "playlist", demo: "playlists", target: "panel", placement: "left" },
  { eyebrow: "Add music", title: "Send music where you want it", copy: "Use the ＋ button to add music to another playlist, a cart, or your Bandcamp wishlist.", icon: "icon-plus.svg", inlineDemo: "track-add", panel: "playlist", demo: "add", target: "panel", placement: "left" },
  { eyebrow: "Cart", title: "Keep a recoverable copy of your cart", copy: "Bandkit mirrors the live Bandcamp cart and lets you save useful carts to return to later.", icon: "icon-cart.svg", panel: "cart", demo: "cart", target: "panel", placement: "left" },
  { eyebrow: "Activity", title: "Find your way back to what you did", copy: "Activity records listening, playlist, wishlist, cart and backup actions locally, organised by date.", icon: "icon-activity.svg", panel: "activity", demo: "activity", target: "panel", placement: "left" },
  { eyebrow: "Settings", title: "Make Bandkit work your way", copy: "Playback, appearance, browsing, privacy and help controls all live here.", icon: "icon-settings.svg", panel: "settings", settingsView: "index", target: "panel", placement: "left" },
  { eyebrow: "DJ tools", title: "Extra control when you want it", copy: "Turn on local BPM and key analysis, tempo controls, EQ, filtering and beat tools.", icon: "icon-dj.svg", target: "dj-drawer", placement: "left" },
  { eyebrow: "Make it yours", title: "Make it yours", copy: "Start with a complete theme or customise the details yourself. Changes update the real music bar immediately.", icon: "icon-settings.svg", target: "player", placement: "top", choice: "kit" },
  { eyebrow: "Backup", title: "Keep a portable copy of your Bandkit data", copy: "A backup includes playlists, carts, activity and settings, ready to restore in another copy of Bandkit.", icon: "icon-download-all.svg", panel: "settings", settingsView: "privacy", target: "panel", placement: "left", choice: "backup" },
  { eyebrow: "You’re all set", title: "Bandkit is ready when you are", copy: "Press play and explore. Your queue, playlists, carts, activity and listening controls are always close by.", icon: "icon-bandkit.svg", target: "player", placement: "top", emptyPlayer: true }
];

const DEMO_TRACKS = [
  { id: "bandkit-tour-night-drive", playlistItemId: "bandkit-tour-night-drive", title: "Night Drive", artist: "Bandkit Radio", album: "First Light", duration: 222, art: asset("icon-image.svg"), pageUrl: "https://bandcamp.com", artistUrl: "https://bandcamp.com", releaseUrl: "https://bandcamp.com" },
  { id: "bandkit-tour-soft-signal", playlistItemId: "bandkit-tour-soft-signal", title: "Soft Signal", artist: "Bandkit Radio", album: "First Light", duration: 248, art: asset("icon-image.svg"), pageUrl: "https://bandcamp.com", artistUrl: "https://bandcamp.com", releaseUrl: "https://bandcamp.com" },
  { id: "bandkit-tour-open-water", playlistItemId: "bandkit-tour-open-water", title: "Open Water", artist: "Bandkit Radio", album: "Blue Hours", duration: 316, art: asset("icon-image.svg"), pageUrl: "https://bandcamp.com", artistUrl: "https://bandcamp.com", releaseUrl: "https://bandcamp.com" }
];

const DEMO_PLAYLISTS = [
  { id: "bandkit-tour-late-night", name: "Late-night finds", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), items: DEMO_TRACKS },
  { id: "bandkit-tour-weekend", name: "Weekend warm-up", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), items: DEMO_TRACKS.slice(0, 2) }
];

const DEMO_CART = DEMO_TRACKS.slice(1).map((track, index) => ({
  id: `bandkit-tour-cart-${index}`,
  title: track.title,
  artist: track.artist,
  art: track.art,
  url: track.pageUrl,
  kind: index ? "Digital album" : "Digital track",
  price: index ? 9 : 6,
  currency: "USD"
}));

const DEMO_SAVED_CARTS = [
  { id: "bandkit-tour-saved-cart", name: "Friday finds", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), items: DEMO_CART, summary: { total: 15, currency: "USD" } },
  { id: "bandkit-tour-saved-cart-two", name: "Albums to revisit", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), items: DEMO_CART.slice(1), summary: { total: 9, currency: "USD" } }
];

function demoActivity() {
  const now = Date.now();
  return [
    { id: "bandkit-tour-listened", action: "listened", title: DEMO_TRACKS[0].title, artist: DEMO_TRACKS[0].artist, art: DEMO_TRACKS[0].art, url: DEMO_TRACKS[0].pageUrl, createdAt: new Date(now - 90_000).toISOString() },
    { id: "bandkit-tour-playlist", action: "added-to-playlist", title: DEMO_TRACKS[1].title, artist: DEMO_TRACKS[1].artist, art: DEMO_TRACKS[1].art, url: DEMO_TRACKS[1].pageUrl, destination: "Late-night finds", createdAt: new Date(now - 45_000).toISOString() },
    { id: "bandkit-tour-cart", action: "added-to-cart", title: DEMO_TRACKS[2].title, artist: DEMO_TRACKS[2].artist, art: DEMO_TRACKS[2].art, url: DEMO_TRACKS[2].pageUrl, createdAt: new Date(now - 10_000).toISOString() }
  ];
}

function withDemoState(overrides, render) {
  const previous = new Map(Object.keys(overrides).map((key) => [key, runtimeState[key]]));
  Object.assign(runtimeState, overrides);
  try { render(); }
  finally { for (const [key, value] of previous) runtimeState[key] = value; }
}

function decorateDemoArtwork(r) {
  const targets = r.$content.querySelectorAll([
    ".hub-playlist-media-art",
    ".hub-playlist-mosaic",
    ".hub-cart-item-card .hub-art-link",
    ".hub-activity-art"
  ].join(","));
  targets.forEach((target) => {
    target.classList.add("hub-onboarding-demo-art");
    target.style.setProperty("--hub-demo-art-icon", `url('${asset("icon-image.svg")}')`);
  });
}

function renderRealDemoPanel(r, demo) {
  r.$content.classList.remove("is-section-layout", "is-empty-now-playing");
  r.$content.replaceChildren();
  const common = { selectedSavedPlaylistId: null, selectedSavedCartId: null };
  let scrollingOrganized = false;
  if (["now-playing", "add"].includes(demo)) {
    withDemoState({ ...common, playlistView: "current", playlistMode: "manual", playlistShuffleEnabled: false, playlist: DEMO_TRACKS, savedPlaylists: DEMO_PLAYLISTS }, () => {
      r.$renderPlaylist();
      if (demo === "add") {
        r.$organizePanelContentScrolling?.();
        scrollingOrganized = true;
        const trigger = r.$content.querySelector(".hub-playlist-track-more");
        if (trigger) {
          trigger.classList.add("hub-onboarding-add-trigger");
          trigger.title = "Add Night Drive";
          trigger.setAttribute("aria-label", trigger.title);
          trigger.replaceChildren(createButtonIcon("icon-plus.svg"));
          trigger.click();
        }
      }
    });
  } else if (demo === "playlists") {
    withDemoState({ ...common, playlistView: "saved", playlist: [], savedPlaylists: DEMO_PLAYLISTS }, () => r.$renderPlaylist());
  } else if (demo === "cart") {
    withDemoState({ ...common, cartView: "saved", cart: DEMO_CART, savedCarts: DEMO_SAVED_CARTS }, () => r.$renderCart());
  } else if (demo === "activity") {
    const previousDateFilter = r.$activityDateFilter;
    r.$activityDateFilter = "";
    try { withDemoState({ ...common, activity: demoActivity() }, () => r.$renderActivity()); }
    finally { r.$activityDateFilter = previousDateFilter; }
  }
  r.$content.dataset.onboardingDemo = demo;
  decorateDemoArtwork(r);
  if (!scrollingOrganized) r.$organizePanelContentScrolling?.();
}

function clearTourDecorations(r, { preservePlayer = false } = {}) {
  r.$onboardingTarget?.removeAttribute("aria-describedby");
  delete r.$content.dataset.onboardingDemo;
  if (preservePlayer) return;
  r.$player.classList.remove("hub-onboarding-demo-player", "hub-onboarding-force-dj", "hub-onboarding-force-visualizer", "hub-onboarding-force-controls");
  r.$playerArtLink.classList.remove("hub-onboarding-demo-art", "is-variant-0", "is-variant-1", "is-variant-2");
  r.$playerArtLink.style.removeProperty("--hub-demo-art-icon");
  delete r.$player.dataset.onboardingVisualizer;
  r.$playerTrackRenderSignature = "";
  r.$playerAnalysisRenderSignature = "";
  r.$playerPlaybackRenderState = "";
  r.$playerActionSignature = "";
}

function applyStepNavigation(step) {
  runtimeState.open = Boolean(step.panel);
  if (step.panel) {
    runtimeState.activeTab = step.panel;
    runtimeState.musicBarRecentPanel = step.panel;
  }
  if (step.settingsView) {
    runtimeState.settingsView = step.settingsView;
    runtimeState.settingsSubView = "index";
  }
}

function setDemoPlayerContent(r, { forceDj = false, forceVisualizer = false, forceControls = false } = {}) {
  const initializeTimeline = !r.$player.classList.contains("hub-onboarding-demo-player");
  r.$panel.dataset.playerEmpty = "false";
  r.$player.classList.add("hub-onboarding-demo-player", "is-playing");
  r.$player.classList.toggle("hub-onboarding-force-dj", forceDj);
  r.$player.classList.toggle("hub-onboarding-force-visualizer", forceVisualizer);
  r.$player.classList.toggle("hub-onboarding-force-controls", forceControls);
  r.$player.classList.remove("is-empty", "is-hidden", "has-no-art");
  r.$playerArtLink.hidden = false;
  r.$playerArtLink.removeAttribute("aria-disabled");
  r.$playerArtLink.classList.add("hub-onboarding-demo-art", "is-variant-0");
  r.$playerArtLink.style.setProperty("--hub-demo-art-icon", `url('${asset("icon-image.svg")}')`);
  r.$playerArt.src = asset("icon-image.svg");
  r.$playerArt.classList.remove("is-empty");
  r.$playerArtLink.removeAttribute("href");
  r.$playerTrack.classList.remove("is-empty");
  for (const [element, text] of [[r.$playerTitle, "Bandkit Test Song"], [r.$playerArtist, "Bandkit"], [r.$playerAlbum, "Live Preview"]]) {
    element.textContent = text;
    element.hidden = false;
    element.removeAttribute("href");
    element.removeAttribute("aria-disabled");
  }
  r.$player.querySelector(".hub-player-secondary-separator")?.removeAttribute("hidden");
  r.$playButton.disabled = false;
  r.$playButton.replaceChildren(createButtonIcon("icon-pause.svg"));
  syncCustomPlayerButtons(r, runtimeState, true);
  r.$playButton.setAttribute("aria-label", "Pause Bandkit Test Song");
  r.$playerMoreButton.disabled = false;
  r.$playerAnalysis.hidden = runtimeState.djToolsEnabled === false && !forceDj;
  r.$playerBpmBadge.hidden = false;
  r.$playerBpmBadge.textContent = "124 BPM";
  r.$playerKeyBadge.hidden = false;
  r.$playerKeyName.textContent = "A min";
  r.$playerKeyCamelot.hidden = true;
  r.$djPlayerButton.hidden = runtimeState.djToolsEnabled === false && !forceDj;
  if (initializeTimeline) {
    const scrub = r.$player.querySelector(".hub-scrub-control");
    scrub?.classList.remove("is-empty");
    scrub?.style.setProperty("--hub-scrub-progress", "0%");
    scrub?.style.setProperty("--hub-scrub-preview-progress", "0%");
    const slider = r.$player.querySelector(".hub-scrub-slider");
    if (slider) { slider.value = "0"; slider.disabled = false; }
    const waveform = r.$player.querySelector(".hub-scrub-waveform");
    if (waveform) applyTimelinePath(waveform, "Bandkit Test Song\u0000Bandkit", 720, runtimeState.scrubberStyle, runtimeState.customTimeline, runtimeState.retainTimelineColors);
    r.$player.querySelector(".hub-current-time").textContent = "0:00";
    r.$player.querySelector(".hub-duration").textContent = "−10:00";
  }
  if (forceVisualizer && runtimeState.musicBarVisualizer === "off") r.$player.dataset.onboardingVisualizer = "forced";
  else delete r.$player.dataset.onboardingVisualizer;
  r.$syncMusicBarPanelButtons?.();
  r.$playerSectionGeometrySignature = "";
  r.$schedulePlayerSectionGeometry?.();
}

function setEmptyPlayerContent(r) {
  r.$player.classList.remove("hub-onboarding-demo-player", "hub-onboarding-force-dj", "hub-onboarding-force-visualizer", "hub-onboarding-force-controls", "is-playing", "has-no-art");
  r.$player.classList.add("is-empty");
  r.$panel.dataset.playerEmpty = "true";
  r.$playerArtLink.hidden = true;
  r.$playerTrack.classList.add("is-empty");
  for (const element of [r.$playerTitle, r.$playerArtist, r.$playerAlbum]) {
    element.textContent = "";
    element.hidden = true;
    element.removeAttribute("href");
  }
  r.$playButton.disabled = true;
  r.$playButton.replaceChildren(createButtonIcon("icon-play.svg"));
  syncCustomPlayerButtons(r, runtimeState, false);
  r.$playButton.setAttribute("aria-label", "No track selected");
  r.$playerMoreButton.disabled = true;
  r.$playerAnalysis.hidden = true;
  r.$djPlayerButton.hidden = true;
  r.$player.querySelector(".hub-scrub-control")?.classList.add("is-empty");
  delete r.$player.dataset.onboardingVisualizer;
  r.$syncMusicBarPanelButtons?.();
  r.$schedulePlayerSectionGeometry?.();
}

function createAddMusicExample(r) {
  const example = createElement("div", "hub-onboarding-add-example-wrap");
  const row = createElement("div", "hub-onboarding-add-example");
  row.setAttribute("aria-hidden", "true");
  const play = createElement("span", "hub-onboarding-add-example-icon");
  play.append(createButtonIcon("icon-play.svg"));
  const title = createElement("span", "hub-onboarding-add-example-title", "Night Drive");
  const duration = createElement("span", "hub-onboarding-add-example-duration", "3:42");
  const buy = createElement("span", "hub-onboarding-add-example-buy", "Buy");
  const add = createElement("span", "hub-onboarding-add-example-add");
  add.append(createButtonIcon("icon-plus.svg"));
  row.append(play, title, duration, buy, add);
  const menu = createElement("div", "hub-playlist-destination-menu hub-onboarding-add-menu");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Example Add music menu");
  const menuOption = (label, options = {}) => {
    const option = r.$createPlaylistMenuOption(label, () => {}, options);
    option.tabIndex = -1;
    return option;
  };
  menu.append(
    menuOption("＋ Add to Now Playing"),
    menuOption("＋ Add to playlist…"),
    menuOption("＋ Add to cart…"),
    menuOption("Add to Wishlist", { wishlist: true })
  );
  example.append(row, menu);
  return example;
}

function backupAction(r) {
  const action = createElement("button", "hub-onboarding-backup-action", "Backup");
  action.type = "button";
  action.addEventListener("click", async () => {
    const result = await r.$runBackupAction(action, r.$savePortableBackup);
    if (result) action.textContent = "Backed up";
  });
  return action;
}

function onboardingSettingsCard(r) {
  const card = createElement("section", "hub-card hub-settings-card hub-settings-group hub-onboarding-settings-card");
  card.append(createElement("h2", "hub-settings-heading", "Help & onboarding"));
  const copy = createSettingsRowCopy("Tour", "Revisit Bandkit’s guided setup and feature overview.");
  const savedStep = Math.max(0, Math.min(STEPS.length - 1, Number(runtimeState.onboardingStep) || 0));
  const canResume = savedStep > 0;
  const replay = createElement("button", "hub-settings-action hub-onboarding-replay", canResume ? "Continue Tour" : "Take Tour");
  replay.title = "Walk through the music bar and panels with temporary sample content.";
  replay.type = "button";
  replay.addEventListener("click", () => r.$startOnboarding({ replay: true, step: canResume ? savedStep : 0 }));
  const row = createElement("div", "hub-settings-row hub-settings-text-actions");
  const actions = createElement("div", "hub-settings-feedback-actions");
  actions.append(replay);
  row.append(copy, actions);
  card.append(row);
  if (canResume) {
    const restart = createElement("button", "hub-settings-action hub-onboarding-restart", "Take Tour");
    restart.type = "button";
    restart.title = "Restart Bandkit’s guided setup from the beginning.";
    restart.addEventListener("click", () => r.$startOnboarding({ replay: true, step: 0 }));
    actions.append(restart);
  }
  return card;
}

function targetForStep(r, step) {
  if (step.target === "player") return r.$player;
  if (step.target === "panel") return r.$panel;
  if (step.target === "dj-drawer") return r.$djDrawer;
  return r.$panel;
}

function coachmarkTargetRect(r, target) {
  const rects = [target.getBoundingClientRect()];
  if (target === r.$player) {
    // Float lifts its content and visible surface above the fixed player shell.
    // Anchor to the painted composition so the coachmark clears the artwork
    // and visualizer instead of overlapping them.
    for (const element of [r.$player.querySelector(".hub-player-content"), r.$playerArtLink, r.$player.querySelector(".hub-player-backdrop-glow"), r.$playerVisualizer]) {
      if (!element || element.hidden || getComputedStyle(element).display === "none") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
  }
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function positionCoachmark(r, target, preferred = "top") {
  if (!target?.isConnected || r.$onboardingLayer.hidden) return;
  const card = r.$onboardingDialog;
  const targetRect = coachmarkTargetRect(r, target);
  const cardRect = card.getBoundingClientRect();
  const gap = 14;
  const edge = 12;
  const spaces = { top: targetRect.top - gap, bottom: window.innerHeight - targetRect.bottom - gap, left: targetRect.left - gap, right: window.innerWidth - targetRect.right - gap };
  const fits = { top: spaces.top >= cardRect.height, bottom: spaces.bottom >= cardRect.height, left: spaces.left >= cardRect.width, right: spaces.right >= cardRect.width };
  const side = [preferred, "top", "left", "right", "bottom"].find((candidate) => fits[candidate]) || Object.entries(spaces).sort((a, b) => b[1] - a[1])[0][0];
  let left;
  let top;
  if (side === "top" || side === "bottom") {
    left = targetRect.left + targetRect.width / 2 - cardRect.width / 2;
    top = side === "top" ? targetRect.top - cardRect.height - gap : targetRect.bottom + gap;
  } else {
    left = side === "left" ? targetRect.left - cardRect.width - gap : targetRect.right + gap;
    top = target === r.$panel
      ? window.innerHeight * .32
      : targetRect.top + targetRect.height * .5 - cardRect.height / 2;
  }
  left = Math.max(edge, Math.min(window.innerWidth - cardRect.width - edge, left));
  top = Math.max(edge, Math.min(window.innerHeight - cardRect.height - edge, top));
  card.style.left = `${Math.round(left)}px`;
  card.style.bottom = "auto";
  card.style.top = `${Math.round(top)}px`;
  card.dataset.placement = side;
}

function scheduleCoachmarkPosition(r, target, preferred = "top") {
  window.cancelAnimationFrame(r.$onboardingPositionFrame || 0);
  const token = (r.$onboardingPositionToken || 0) + 1;
  r.$onboardingPositionToken = token;
  const startedAt = performance.now();
  const followLayout = (now) => {
    if (r.$onboardingPositionToken !== token || !r.$onboardingActive) return;
    positionCoachmark(r, target, preferred);
    // The contextual panel moves for 360ms when its player changes between
    // empty and populated layouts. Follow that transition instead of keeping
    // the coachmark at the first (now stale) rectangle we measured.
    if (now - startedAt < 420) r.$onboardingPositionFrame = window.requestAnimationFrame(followLayout);
  };
  r.$onboardingPositionFrame = window.requestAnimationFrame(followLayout);
}

function configureTourView(r, step) {
  clearTourDecorations(r, { preservePlayer: true });
  if (step.choice === "kit" && r.$onboardingKitInitialized !== true) {
    const type = MUSIC_BAR_VISUALIZER_TYPES.includes(runtimeState.musicBarVisualizerType)
      ? runtimeState.musicBarVisualizerType : "glow";
    runtimeState.musicBarVisualizerType = type;
    runtimeState.musicBarVisualizer = type;
    r.$onboardingKitInitialized = true;
  }
  if (step.demo) renderRealDemoPanel(r, step.demo);
  if (step.emptyPlayer) setEmptyPlayerContent(r);
  else setDemoPlayerContent(r, {
      forceDj: step.target === "dj-drawer" || step.forceDj === true,
      forceVisualizer: step.forceVisualizer === true,
      forceControls: step.forceControls === true
    });
  r.$renderDjTools?.();
  const target = targetForStep(r, step);
  target?.setAttribute("aria-describedby", "bandkit-onboarding-copy");
  r.$onboardingTarget = target;
}

function pausePlaybackForOnboarding(r) {
  r.$silenceNativePagePlayback?.();
  if (runtimeSeamless.enabled && runtimeSeamless.isPlaying) {
    void r.$seamlessCommand?.(MESSAGES.SEAMLESS_PLAY_PAUSE);
  }
}

function registerOnboardingRuntime(r) {
  r.$onboardingUsesDemoPanel = () => r.$onboardingActive === true
    && Boolean(STEPS[r.$onboardingSessionStep]?.demo);
  r.$syncOnboardingDemoPlayer = function syncOnboardingDemoPlayer() {
    if (!r.$onboardingActive) return;
    const step = STEPS[Math.max(0, Math.min(STEPS.length - 1, Number(r.$onboardingSessionStep) || 0))];
    if (step.emptyPlayer) setEmptyPlayerContent(r);
    else setDemoPlayerContent(r, {
        forceDj: step.target === "dj-drawer" || step.forceDj === true,
        forceVisualizer: step.forceVisualizer === true,
        forceControls: step.forceControls === true
      });
  };
  r.$renderOnboardingSettingsCard = () => onboardingSettingsCard(r);
  r.$setDjToolsEnabled = function setDjToolsEnabled(enabled, { announce = false } = {}) {
    runtimeState.djToolsEnabled = enabled !== false;
    if (runtimeState.djToolsEnabled) runtimeState.autoAnalyzeTracks = true;
    else { runtimeState.dj.open = false; runtimeState.dj.pageOpen = false; r.$pageDjOpen = false; }
    r.$syncPageTrackAnalysisUi?.();
    r.$injectPageDjToolsLink?.();
    runtimeSaveState();
    if (announce) r.$showToast(runtimeState.djToolsEnabled ? "DJ tools enabled" : "DJ tools disabled");
  };
  r.$startOnboarding = function startOnboarding({ replay = false, step = 0 } = {}) {
    if (!r.$onboardingActive) {
      r.$onboardingUiSnapshot = {
        open: runtimeState.open, activeTab: runtimeState.activeTab,
        musicBarRecentPanel: runtimeState.musicBarRecentPanel,
        settingsView: runtimeState.settingsView, settingsSubView: runtimeState.settingsSubView
      };
      pausePlaybackForOnboarding(r);
    }
    r.$onboardingActive = true;
    r.$onboardingKitInitialized = false;
    r.$onboardingKitMode = "theme";
    r.$onboardingReplay = replay;
    r.$onboardingSessionStep = Math.max(0, Math.min(STEPS.length - 1, Number(step) || 0));
    if (!replay) runtimeState.onboardingStep = r.$onboardingSessionStep;
    applyStepNavigation(STEPS[r.$onboardingSessionStep]);
    runtimeSaveState();
    r.$render();
  };
  r.$activateFirstRunOnboarding = function activateFirstRunOnboarding() {
    if (Number(runtimeState.onboardingCompletedVersion) > 0) return false;
    r.$onboardingUiSnapshot = {
      open: runtimeState.open, activeTab: runtimeState.activeTab,
      musicBarRecentPanel: runtimeState.musicBarRecentPanel,
      settingsView: runtimeState.settingsView, settingsSubView: runtimeState.settingsSubView
    };
    pausePlaybackForOnboarding(r);
    if ((Number(runtimeState.onboardingStep) || 0) === 0) {
      runtimeState.appearance.pageAware = true;
      runtimeState.appearance.applyToPage = false;
      runtimeState.appearance.visualThemeId = "dynamic";
      // The tour no longer asks about dynamic colour, so a first run always starts
      // with it on and leaves the finer controls to Settings.
      runtimeState.musicBarDynamicColor = true;
      runtimeState.musicBarPlayerDynamicColor = true;
      runtimeState.musicBarPanelDynamicColor = true;
    }
    r.$onboardingActive = true;
    r.$onboardingKitInitialized = false;
    r.$onboardingKitMode = "theme";
    r.$onboardingSessionStep = Math.max(0, Math.min(STEPS.length - 1, Number(runtimeState.onboardingStep) || 0));
    applyStepNavigation(STEPS[r.$onboardingSessionStep]);
    return true;
  };
  r.$finishOnboarding = function finishOnboarding() {
    runtimeState.onboardingCompletedVersion = ONBOARDING_COMPLETE;
    runtimeState.onboardingStep = 0;
    Object.assign(runtimeState, r.$onboardingUiSnapshot || {});
    r.$onboardingUiSnapshot = null;
    r.$onboardingActive = false;
    r.$onboardingReplay = false;
    r.$onboardingSessionStep = 0;
    removeOnboardingMenus(r);
    r.$onboardingKitInitialized = false;
    r.$onboardingKitMode = null;
    clearTourDecorations(r);
    void r.$persistLocal({ [STORAGE_KEYS.ONBOARDING_COMPLETE]: ONBOARDING_COMPLETE });
    runtimeSaveState();
    r.$render();
    r.$showToast("Bandkit is ready");
  };
  r.$renderOnboarding = function renderOnboarding() {
    removeOnboardingMenus(r);
    const active = r.$onboardingActive === true;
    r.$onboardingLayer.hidden = !active;
    r.$onboardingLayer.setAttribute("aria-hidden", String(!active));
    r.$panel.classList.toggle("is-onboarding-preview", active);
    if (!active) {
      clearTourDecorations(r);
      r.$onboardingDialog.replaceChildren();
      r.$player.toggleAttribute("inert", false);
      r.$panel.toggleAttribute("inert", !runtimeState.open);
      return;
    }
    syncOnboardingContrast(r);
    const stepIndex = Math.max(0, Math.min(STEPS.length - 1, Number(r.$onboardingSessionStep) || 0));
    r.$onboardingSessionStep = stepIndex;
    const step = STEPS[stepIndex];
    configureTourView(r, step);
    r.$player.setAttribute("inert", "");
    r.$panel.setAttribute("inert", "");
    const headingContent = [];
    if (stepIndex === STEPS.length - 1) {
      const logo = document.createElement("img");
      logo.className = "hub-onboarding-finish-logo";
      logo.src = asset("logo-type-3.svg");
      logo.alt = "Bandkit";
      headingContent.push(logo);
    }
    const title = createElement("h2", "hub-onboarding-title", step.title);
    title.id = "bandkit-onboarding-title";
    const copy = createElement("p", "hub-onboarding-copy", step.copy);
    copy.id = "bandkit-onboarding-copy";
    const body = createElement("div", "hub-onboarding-body");
    body.append(copy);
    if (step.inlineDemo === "track-add") body.append(createAddMusicExample(r));
    if (step.choice === "kit") body.append(createKitControls(r));
    const footer = createElement("footer", "hub-onboarding-footer");
    const back = createElement("button", "hub-onboarding-back", "Back");
    back.type = "button";
    back.disabled = stepIndex === 0;
    const skip = createElement("button", "hub-onboarding-skip", "Skip");
    skip.type = "button";
    skip.hidden = stepIndex === STEPS.length - 1;
    const next = createElement("button", "hub-onboarding-primary", stepIndex === STEPS.length - 1 ? "Finish" : "Next");
    next.type = "button";
    const goToStep = (nextStep) => {
      const nextDefinition = STEPS[nextStep];
      r.$onboardingSessionStep = nextStep;
      applyStepNavigation(nextDefinition);
      // Publish the destination player state before render() lays out the
      // contextual panel. This is especially important when moving Back from
      // the empty wrap-up player to the populated Backup preview.
      r.$panel.dataset.playerEmpty = String(nextDefinition?.emptyPlayer === true);
      if (!r.$onboardingReplay) { runtimeState.onboardingStep = nextStep; runtimeSaveState(); }
      r.$render();
    };
    back.addEventListener("click", () => goToStep(Math.max(0, stepIndex - 1)));
    skip.addEventListener("click", r.$finishOnboarding);
    next.addEventListener("click", () => stepIndex === STEPS.length - 1 ? r.$finishOnboarding() : goToStep(stepIndex + 1));
    const secondary = createElement("div", "hub-onboarding-secondary-navigation");
    secondary.append(back, skip);
    const primaryNavigation = createElement("div", "hub-onboarding-primary-navigation");
    if (step.choice === "backup") primaryNavigation.append(backupAction(r));
    primaryNavigation.append(next);
    footer.append(secondary, primaryNavigation);
    r.$onboardingDialog.classList.toggle("is-kit-step", step.choice === "kit");
    r.$onboardingDialog.classList.toggle("is-frosted-glass", runtimeState.appearance.frostedGlass === true);
    r.$onboardingDialog.replaceChildren(...headingContent, title, body, footer);
    scheduleCoachmarkPosition(r, r.$onboardingTarget, step.placement);
    window.requestAnimationFrame(() => next.focus({ preventScroll: true }));
  };
}

function setupOnboardingRuntime(r) {
  const referenceShortcut = createHelpReferenceShortcut({
    getHelpCard: () => runtimeState.open && runtimeState.activeTab === "settings"
      && runtimeState.settingsView === "onboarding" && !r.$onboardingActive
      ? r.$content.querySelector(".hub-onboarding-settings-card") : null,
    onOpen: () => {
      void r.$runtimeMessage({ type: MESSAGES.OPEN_COMPONENT_REFERENCE }).then(response => {
        if (!response?.ok) r.$showToast("Could not open the component reference.");
      }).catch(() => r.$showToast("Could not open the component reference."));
    }
  });
  document.addEventListener("keydown", referenceShortcut, true);
  r.$app.registerCleanup(() => document.removeEventListener("keydown", referenceShortcut, true));
  const renderPlayer = r.$renderPlayer;
  r.$renderPlayer = function renderPlayerWithOnboardingDemo() {
    if (!r.$onboardingActive) {
      renderPlayer();
      return;
    }
    r.$syncOnboardingDemoPlayer?.();
    r.$syncMusicBarStyle(); r.$syncMusicBarPanelButtons(); r.$syncMusicBarSize(); r.$syncMusicBarVisualizer();
    r.$syncMusicBarWidth(); r.$syncFrostedGlass(); r.$syncCornerStyle(); r.$syncScrubberStyles();
  };
  const renderDjTools = r.$renderDjTools;
  r.$renderDjTools = function renderDjToolsWithOnboardingDemo() {
    const step = STEPS[Math.max(0, Math.min(STEPS.length - 1, Number(r.$onboardingSessionStep) || 0))];
    if (r.$onboardingActive) {
      const forceOpen = step.target === "dj-drawer";
      withDemoState({
        djToolsEnabled: forceOpen ? true : runtimeState.djToolsEnabled,
        dj: { ...runtimeState.dj, open: forceOpen }
      }, renderDjTools);
      return;
    }
    renderDjTools();
  };
  r.$onboardingActive = false;
  r.$onboardingReplay = false;
  r.$onboardingSessionStep = 0;
  r.$onboardingUiSnapshot = null;
  r.$onboardingThemeMenu = null;
  r.$onboardingHandleMenu = null;
  r.$onboardingKitInitialized = false;
  for (const key of ONBOARDING_MENU_KEYS) r[key] = null;
  r.$onboardingPositionFrame = 0;
  r.$onboardingPositionToken = 0;
  r.$onboardingLayer = createElement("div", "hub-onboarding-layer");
  r.$onboardingLayer.hidden = true;
  r.$onboardingLayer.setAttribute("aria-hidden", "true");
  r.$onboardingDialog = createElement("section", "hub-onboarding-dialog");
  r.$onboardingDialog.setAttribute("role", "dialog");
  r.$onboardingDialog.setAttribute("aria-modal", "false");
  r.$onboardingDialog.setAttribute("aria-labelledby", "bandkit-onboarding-title");
  r.$onboardingLayer.append(r.$onboardingDialog);
  r.$shadow.append(r.$onboardingLayer);
  window.addEventListener("resize", () => {
    if (!r.$onboardingActive) return;
    scheduleCoachmarkPosition(r, r.$onboardingTarget, STEPS[r.$onboardingSessionStep]?.placement);
  });
  r.$onboardingLayer.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...r.$onboardingDialog.querySelectorAll("button:not(:disabled):not([hidden]), input:not(:disabled), select:not(:disabled)")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && r.$shadow.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && r.$shadow.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

export const registerOnboarding = [registerOnboardingRuntime];
export const setupOnboarding = [setupOnboardingRuntime];
