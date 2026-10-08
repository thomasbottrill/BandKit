import { createMusicBarPanelButton, createSectionTab, createPanelShortcut, createMusicBarShortcut } from "../components/section-navigation.js";
import { runtimeLive, runtimeSaveState, runtimeState, updateRuntimeLive, updateRuntimeSaveState, updateRuntimeSeamless, updateRuntimeState } from "./context.js";
import { asset, createElement, enableRangeReset, removeStyleProperty, resolvedTrackPageUrl, safeBandcampReleaseUrl, safeBandcampUrl, setDatasetValue, setStyleProperty } from "../core.js";
import { MUSIC_BAR_SCRUBBER_WIDTHS, MUSIC_BAR_STYLES, MUSIC_BAR_WIDTHS, PLAYER_BLEND_MODES, SCRUBBER_HANDLE_SHAPES, VISUALIZER_BLEND_MODES, defaultState, normalizeVisualizerType, normalizeHandleSize } from "../state.js";
import { scrubberHandleMask, setHandleImageStyles } from "../custom-scrub-handle.js";
import { applyTimelinePath, normalizeTimelineStyle } from "../timeline-styles.js";
import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { createAppContext } from "../app-context.js";
import { CONCURRENT_SETTING_KEYS, mergeConcurrentState } from "../../shared/state-merge.js";
import { setupCompactPanelFocusRelease, setupCompactPanelNotices } from "./interaction-guards.js";
import { setupSettingsTooltips } from "./settings-tooltips.js";
import { beginNowPlayingSessionRevision, nowPlayingSessionSignature, persistNowPlayingSession } from "./now-playing-session.js";
import { resetSettingsDisclosures } from "../settings-drawer.js";
import { setupRuntimeDomShell } from "./runtime-dom-shell.js";
function applyMusicBarWidth(r, width, customWidth) {
  const previousWidth = r.$player.dataset.contentWidth;
  const previousCustomWidth = r.$player.style.getPropertyValue("--hub-player-custom-width");
  r.$player.dataset.contentWidth = width;
  if (width === "custom") r.$player.style.setProperty("--hub-player-custom-width", `${customWidth}px`);
  else r.$player.style.removeProperty("--hub-player-custom-width");
  const nextCustomWidth = r.$player.style.getPropertyValue("--hub-player-custom-width");
  if (previousWidth === width && previousCustomWidth === nextCustomWidth) return;
  r.$playerSectionGeometrySignature = "";
  window.requestAnimationFrame(() => {
    r.$syncPlayerPageSpace();
    r.$schedulePlayerSectionGeometry();
  });
}
function setOptionalColour(style, property, value) {
  return /^#[\da-f]{6}$/i.test(String(value || ""))
    ? setStyleProperty(style, property, value)
    : removeStyleProperty(style, property);
}
function registerRuntimeShellPlayer(r) {
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
r.$pageCartCommand = function pageCartCommand(action, details = {}) {
      document.dispatchEvent(new CustomEvent("bandkit:cart-command", { detail: { action, ...details } }));
    };
r.$pageCartIsAvailable = function pageCartIsAvailable() {
      // Bandcamp loads its cart bundle after the page settles, so ask the page
      // world again rather than trusting a flag captured before it was ready.
      // The answer comes back on the same tick.
      r.$pageCartCommand("getAvailability");
      return r.$pageCartAvailable === true;
    };
r.$syncPlayerPageSpace = function syncPlayerPageSpace() {
      if (r.$visualizerFullscreen) return;
      const pageFooter = document.querySelector("#page-footer, #pgFt, page-footer, .full-page-app-wrapper > footer");
      const pageFlowParent = document.querySelector("#DiscoverApp main.app")
        || pageFooter?.parentElement
        || document.querySelector("#propOpenWrapper, .full-page-app-wrapper")
        || document.body;
      if (r.$playerSpacer.parentElement !== pageFlowParent) {
        r.$playerSpacer.parentElement?.style.removeProperty("scroll-padding-bottom");
        pageFlowParent.append(r.$playerSpacer);
      }
      const playerRect = r.$player.getBoundingClientRect();
      const playerHeight = Math.ceil(playerRect.height);
      if (!playerHeight) return;
      const playerBottomGap = Math.max(0, Math.ceil(window.innerHeight - playerRect.bottom));
      const reservedHeight = `${playerHeight + playerBottomGap}px`;
      const discoverReservedHeight = `${playerHeight + playerBottomGap + 16}px`;
      setStyleProperty(r.$playerSpacer.style, "height", reservedHeight, "important");
      setStyleProperty(r.$playerSpacer.style, "flex-basis", reservedHeight, "important");
      const discoverDetail = document.querySelector("#DiscoverApp .focused-result");
      if (discoverDetail) {
        if (r.$discoverPlayerSpacer.parentElement !== discoverDetail) discoverDetail.append(r.$discoverPlayerSpacer);
        setStyleProperty(r.$discoverPlayerSpacer.style, "height", discoverReservedHeight, "important");
        setStyleProperty(r.$discoverPlayerSpacer.style, "flex-basis", discoverReservedHeight, "important");
        setStyleProperty(discoverDetail.style, "scroll-padding-bottom", discoverReservedHeight);
      } else {
        r.$discoverPlayerSpacer.remove();
      }
      setStyleProperty(document.documentElement.style, "--bandkit-player-reserved-height", reservedHeight);
      setStyleProperty(document.documentElement.style, "scroll-padding-bottom", reservedHeight);
      setStyleProperty(pageFlowParent.style, "scroll-padding-bottom", reservedHeight);
    };
r.$buildScrubWaveform = function buildScrubWaveform(signature, width) {
      const { pixelWidth } = applyTimelinePath(r.$scrubWaveform, signature, width, runtimeState.scrubberStyle, runtimeState.customTimeline, runtimeState.retainTimelineColors);
      r.$scrubWaveformStyle = runtimeState.scrubberStyle === "custom"
        ? `custom\u0000${runtimeState.customTimeline?.name || ""}\u0000${runtimeState.retainTimelineColors}`
        : normalizeTimelineStyle(runtimeState.scrubberStyle);
      r.$scrubWaveformSignature = signature;
      r.$scrubWaveformWidth = pixelWidth;
    };
r.$refreshScrubWaveform = function refreshScrubWaveform(force = false, observedWidth = 0) {
      const pendingTrackId = String(r.$pendingFeedTrackId || "");
      const pendingTrack = pendingTrackId ? r.$getFeedPlayerState(pendingTrackId)?.track : null;
      const signature = pendingTrackId
        ? `${pendingTrackId}\u0000${pendingTrack?.title || ""}\u0000${pendingTrack?.artist || ""}`
        : `${runtimeLive.title || ""}\u0000${runtimeLive.artist || ""}\u0000${runtimeLive.pageUrl || ""}`;
      // An imported timeline is redrawn from its own image, so the selected
      // style alone cannot say whether it is still current. Track the artwork
      // and its colour mode too: measuring the control below forces a page
      // layout, which is the one thing worth avoiding on an unchanged bar.
      const styleKey = runtimeState.scrubberStyle === "custom"
        ? `custom\u0000${runtimeState.customTimeline?.name || ""}\u0000${runtimeState.retainTimelineColors}`
        : normalizeTimelineStyle(runtimeState.scrubberStyle);
      const sameStyle = r.$scrubWaveformStyle === styleKey;
      if (!force && sameStyle && signature === r.$scrubWaveformSignature) return;
      const width = Math.max(80, Math.round(observedWidth || r.$scrubControl.getBoundingClientRect().width));
      if (sameStyle && signature === r.$scrubWaveformSignature && Math.abs(width - r.$scrubWaveformWidth) < 4) return;
      r.$buildScrubWaveform(signature, width);
    };
r.$syncScrubVisual = function syncScrubVisual(value = Number(r.$scrubSlider.value) || 0) {
      const progress = Math.max(0, Math.min(1, value / 1000));
      r.$scrubControl.style.setProperty("--hub-scrub-progress", `${(progress * 100).toFixed(2)}%`); if (!r.$scrubPreviewActive) r.$scrubControl.style.setProperty("--hub-scrub-preview-progress", `${(progress * 100).toFixed(2)}%`);
    };
r.$usesTraditionalScrubber = function usesTraditionalScrubber() {
      return runtimeState.scrubberStyle === "traditional";
    };
r.$syncScrubberStyles = function syncScrubberStyles() {
      const traditional = r.$usesTraditionalScrubber();
      const handleShape = SCRUBBER_HANDLE_SHAPES.includes(runtimeState.scrubberHandleShape)
        ? runtimeState.scrubberHandleShape : "pill";
      const width = MUSIC_BAR_SCRUBBER_WIDTHS.includes(runtimeState.musicBarScrubberWidth)
        ? runtimeState.musicBarScrubberWidth : "full";
      runtimeState.scrubberHandleShape = handleShape;
      runtimeState.musicBarScrubberWidth = width;
      const roundedHandle = runtimeState.appearance.cornerStyle !== "square"
        && !(runtimeState.appearance.cornerStyle === "custom" && Number(runtimeState.appearance.customCornerRadius) <= 0);
      const handleMask = scrubberHandleMask(handleShape, roundedHandle, runtimeState.customScrubberHandle);
      const handleSize = `${22 * normalizeHandleSize(runtimeState.scrubberHandleSize) / 100}px`;
      setOptionalColour(r.$host.style, "--hub-timeline-color", runtimeState.musicBarTimelineColor);
      setOptionalColour(r.$host.style, "--hub-handle-color", runtimeState.musicBarHandleColor);
      setOptionalColour(document.documentElement.style, "--bandkit-timeline-color", runtimeState.musicBarTimelineColor);
      setOptionalColour(document.documentElement.style, "--bandkit-handle-color", runtimeState.musicBarHandleColor);
      setStyleProperty(r.$host.style, "--hub-scrub-handle-size", handleSize);
      setStyleProperty(document.documentElement.style, "--bandkit-scrub-handle-size", handleSize);
      setDatasetValue(r.$player, "scrubHandleShape", handleShape);
      setDatasetValue(r.$host, "scrubHandleShape", handleShape);
      setStyleProperty(r.$host.style, "--hub-scrub-handle-mask", handleMask);
      setHandleImageStyles(r.$host.style, "--hub-scrub-handle", handleShape, runtimeState.customScrubberHandle, runtimeState.retainSvgHandleColors, runtimeState.retainPngHandleColors);
      setDatasetValue(document.documentElement, "bandkitScrubHandle", handleShape);
      setStyleProperty(document.documentElement.style, "--bandkit-scrub-handle-mask", handleMask);
      setHandleImageStyles(document.documentElement.style, "--bandkit-scrub-handle", handleShape, runtimeState.customScrubberHandle, runtimeState.retainSvgHandleColors, runtimeState.retainPngHandleColors);
      if (r.$pageDjHost) {
        setDatasetValue(r.$pageDjHost, "scrubHandleShape", handleShape);
        setStyleProperty(r.$pageDjHost.style, "--hub-scrub-handle-mask", handleMask);
        setStyleProperty(r.$pageDjHost.style, "--hub-scrub-handle-size", handleSize);
        setHandleImageStyles(r.$pageDjHost.style, "--hub-scrub-handle", handleShape, runtimeState.customScrubberHandle, runtimeState.retainSvgHandleColors, runtimeState.retainPngHandleColors);
      }
      setDatasetValue(r.$player, "scrubberWidth", width);
      r.$scrubControl.classList.toggle("is-traditional", traditional);
      // Rebuilding the timeline measures the control, and a measurement after
      // any style write pays for a full page recalculation. Only the settings
      // that shape the timeline can invalidate it, so compare them first and
      // leave the ordinary playback path free of forced layout entirely.
      const timelineSignature = [runtimeState.scrubberStyle, traditional, handleShape,
        runtimeState.customTimeline?.name || "", runtimeState.retainTimelineColors].join("\u0000");
      if (r.$scrubWaveform && timelineSignature !== r.$scrubTimelineSignature) {
        r.$scrubTimelineSignature = timelineSignature;
        r.$refreshScrubWaveform(true);
      }
      for (const control of document.querySelectorAll(".bandkit-page-scrub-control")) {
        control.classList.toggle("is-traditional", traditional);
      }
    };
r.$syncMusicBarSize = function syncMusicBarSize() {
      const compact = runtimeState.musicBarSize === "compact";
      const bottomOffset = Math.round(Math.max(0, Math.min(160, Number(runtimeState.musicBarBottomOffset) || 0)));
      runtimeState.musicBarBottomOffset = bottomOffset;
      const visualizerAddsDockedClearance = runtimeState.musicBarStyle === "docked"
        && runtimeState.musicBarVisualizer !== "off";
      const height = compact ? 72 : 96;
      const clearance = visualizerAddsDockedClearance ? "24px" : "0px";
      const nextHeight = `${height}px`;
      const changed = r.$player.classList.contains("is-compact") !== compact
        || r.$host.style.getPropertyValue("--hub-player-height") !== nextHeight
        || r.$host.style.getPropertyValue("--hub-dock-visualizer-clearance") !== clearance
        || r.$host.style.getPropertyValue("--hub-player-offset") !== `${bottomOffset}px`;
      r.$player.classList.toggle("is-compact", compact);
      setStyleProperty(r.$host.style, "--hub-player-height", nextHeight);
      setStyleProperty(r.$host.style, "--hub-dock-visualizer-clearance", clearance);
      setStyleProperty(r.$host.style, "--hub-player-offset", `${bottomOffset}px`);
      setStyleProperty(r.$host.style, "--hub-player-bottom-gap", `${bottomOffset}px`);
      if (changed) window.requestAnimationFrame(r.$syncPlayerPageSpace);
    };
r.$syncMusicBarVisualizer = function syncMusicBarVisualizer() {
      const type = normalizeVisualizerType(runtimeState.musicBarVisualizerType, runtimeState.musicBarVisualizer);
      const mode = runtimeState.musicBarVisualizer === "off" ? "off" : type; const opacity = Math.round(Math.max(10, Math.min(400, Number(runtimeState.musicBarVisualizerOpacity) || 100)));
      const normalizeDimension = (value, min, max) => value === "auto" || value == null || value === ""
        ? "auto" : Math.round(Math.max(min, Math.min(max, Number(value) || min)));
      const width = normalizeDimension(runtimeState.musicBarVisualizerWidth, 240, 3200);
      const height = normalizeDimension(runtimeState.musicBarVisualizerHeight, 24, 240);
      const blendMode = VISUALIZER_BLEND_MODES.includes(runtimeState.musicBarVisualizerBlendMode)
        ? runtimeState.musicBarVisualizerBlendMode : "normal";
      runtimeState.musicBarVisualizer = mode; runtimeState.musicBarVisualizerType = type; runtimeState.musicBarVisualizerOpacity = opacity;
      runtimeState.musicBarVisualizerWidth = width; runtimeState.musicBarVisualizerHeight = height; runtimeState.musicBarVisualizerBlendMode = blendMode;
      const displayMode = mode === "off" && !r.$visualizerFullscreen ? "off" : normalizeVisualizerType(r.$visualizerPreviewType, type);
      setDatasetValue(r.$player, "visualizer", displayMode); setDatasetValue(r.$panel, "visualizer", displayMode);
      setStyleProperty(r.$player.style, "--hub-visualizer-opacity", String(Math.min(1, opacity / 100)));
      setStyleProperty(r.$player.style, "--hub-visualizer-idle-opacity", String(Math.min(0.24, (opacity / 100) * 0.34)));
      if (width === "auto") removeStyleProperty(r.$playerVisualizer?.style, "width");
      else setStyleProperty(r.$playerVisualizer?.style, "width", `${width}px`);
      if (height === "auto") removeStyleProperty(r.$playerVisualizer?.style, "height");
      else setStyleProperty(r.$playerVisualizer?.style, "height", `${height}px`);
      for (const property of ["--hub-visualizer-blend-mode", "--hub-spectrum-blend-mode"]) {
        setStyleProperty(r.$player.style, property, blendMode);
      }
      r.$syncMusicBarSize();
    };
}

function registerRuntimeShellActions(r) {
r.$syncMusicBarStyle = function syncMusicBarStyle() {
      const style = runtimeState.musicBarStyle === "floating" ? "rounded"
        : MUSIC_BAR_STYLES.includes(runtimeState.musicBarStyle) ? runtimeState.musicBarStyle : "zune";
      const renderedStyle = style === "rounded" ? "zune" : style;
      const renderedVariant = style === "rounded" ? "rounded" : "default";
      const blendMode = PLAYER_BLEND_MODES.includes(runtimeState.musicBarBlendMode)
        ? runtimeState.musicBarBlendMode : "normal";
      const changed = r.$player.dataset.playerStyle !== renderedStyle || r.$player.dataset.playerVariant !== renderedVariant;
      runtimeState.musicBarStyle = style;
      runtimeState.musicBarBlendMode = blendMode;
      r.$player.dataset.playerStyle = renderedStyle;
      r.$player.dataset.playerVariant = renderedVariant;
      const dynamicColor = runtimeState.musicBarDynamicColor !== false;
      r.$player.dataset.dynamicColor = dynamicColor && runtimeState.musicBarPlayerDynamicColor !== false ? "true" : "false";
      r.$player.dataset.blendMode = blendMode;
      r.$player.style.setProperty("--hub-player-blend-mode", blendMode);
      setOptionalColour(r.$player.style, "--hub-playback-color", runtimeState.musicBarControlsColor);
      const playerColour = dynamicColor ? null : runtimeState.musicBarPlayerColor;
      setOptionalColour(r.$player.style, "--hub-zune-surface", playerColour);
      setOptionalColour(r.$player.style, "--hub-docked-surface", playerColour);
      r.$panel.dataset.playerStyle = renderedStyle;
      r.$panel.dataset.playerVariant = renderedVariant;
      r.$panel.dataset.dynamicColor = dynamicColor && runtimeState.musicBarPanelDynamicColor !== false ? "true" : "false";
      r.$host.style.setProperty("--hub-player-bottom-gap", "0px");
      r.$syncMusicBarSize();
      if (changed) {
        r.$playerSectionGeometrySignature = "";
        window.requestAnimationFrame(() => {
          r.$syncPlayerPageSpace();
          r.$schedulePlayerSectionGeometry();
        });
      }
    };
r.$syncMusicBarWidth = function syncMusicBarWidth() {
      const width = MUSIC_BAR_WIDTHS.includes(runtimeState.musicBarWidth) ? runtimeState.musicBarWidth : "default";
      const customWidth = Math.round(Math.max(480, Math.min(2000, Number(runtimeState.musicBarCustomWidth) || 900)));
      runtimeState.musicBarWidth = width;
      runtimeState.musicBarCustomWidth = customWidth;
      applyMusicBarWidth(r, width, customWidth);
    };
r.$toggleSectionPanel = function toggleSectionPanel(tabId) {
      r.$clearCompactPanelNotice?.();
      const currentPanelVisible = runtimeState.activeTab === tabId && !r.$panel.classList.contains("is-hidden");
      runtimeState.musicBarRecentPanel = tabId;
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
r.$activateNativeTrackAction = function activateNativeTrackAction(action, wishlistActive = true) { const control = r.$nativeTrackActionControl(action);
      if (!control) return false;
      if (action === "wishlist") {
        const status = `${control.getAttribute("aria-label") || ""} ${control.textContent || ""}`.toLowerCase();
        const alreadyWishlisted = control.getAttribute("aria-pressed") === "true"
          || control.classList.contains("wishlisted")
          || /in wishlist|wishlisted|remove from wishlist/.test(status);
        if (alreadyWishlisted === wishlistActive) return true;
      }
      control.click();
      return true;
    };
}
function registerRuntimeShellCommerce(r) {
r.$syncMusicBarPanelButtons = function syncMusicBarPanelButtons() {
      const mode = "compact";
      const changed = r.$player.dataset.panelButtons !== mode;
      runtimeState.musicBarPanelButtons = mode;
      r.$player.dataset.panelButtons = mode;
      r.$player.dataset.panelOpen = runtimeState.open === true ? "true" : "false";
      r.$player.dataset.analysisVisibility = runtimeState.keepMusicBarAnalysisVisible === true ? "always" : "hover";
      r.$panel.dataset.panelButtons = mode;
      if (changed) {
        r.$playerSectionGeometrySignature = "";
        window.requestAnimationFrame(r.$schedulePlayerSectionGeometry);
      }
    };
r.$nativeCheckoutControl = function nativeCheckoutControl() {
      const match = document.querySelector([
        "#sidecartCheckout",
        "[data-test='sidecartCheckout']",
        "[data-test='mb-cart'] [data-test*='checkout' i]",
        "#sidecart a.buttonLink"
      ].join(", "));
      if (!match) return null;
      return match.matches("button, a, [role='button']") ? match
        : match.querySelector("button, a, [role='button']") || match.closest("button, a, [role='button']");
    };
r.$activateNativeCheckout = function activateNativeCheckout() {
      const control = r.$nativeCheckoutControl(); if (!control) return false; control.click(); return true;
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
      const wishlistActive = new URLSearchParams(location.search).get("bandkit_wishlist_active") !== "0";
      const reportWishlistResult = (success) => {
        if (action !== "wishlist") return;
        void r.$runtimeMessage({ type: MESSAGES.WISHLIST_RESULT, key: wishlistKey, active: wishlistActive, success });
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
          activated = r.$activateNativeTrackAction(action, wishlistActive);
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
r.$openBandcampCheckout = async function openBandcampCheckout() {
      const unavailableItems = runtimeState.cart.filter((item) => item.unavailable === true);
      if (unavailableItems.length) {
        runtimeState.open = true; runtimeState.activeTab = "cart"; runtimeState.cartView = "current";
        r.$render();
        r.$showToast(`${unavailableItems.length} unavailable cart item${unavailableItems.length === 1 ? " needs" : "s need"} to be removed before checkout.`);
        return;
      }
      const belowMinimum = await r.$cartItemsBelowMinimum();
      if (belowMinimum.length) {
        r.$cartBelowMinimumIds = new Set(belowMinimum.map((entry) => entry.id));
        runtimeState.open = true; runtimeState.activeTab = "cart"; runtimeState.cartView = "current";
        r.$render();
        r.$showToast(belowMinimum.length === 1
          ? `“${belowMinimum[0].title || "One cart item"}” is priced below Bandcamp's minimum. Remove it and add it again with a valid amount.`
          : `${belowMinimum.length} cart items are priced below Bandcamp's minimum. Remove them and add them again with valid amounts.`);
        return;
      }
      r.$cartBelowMinimumIds = null;
      if (r.$activateNativeCheckout()) { r.$showToast("Opening Bandcamp checkout…"); return; }
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
r.$openTrackAction = async function openTrackAction(track, action, { active = true } = {}) {
      const directUrl = r.$individualTrackPageUrl(track);
      if (!directUrl) r.$showToast(`Finding “${track.title}” on Bandcamp…`);
      const pageUrl = directUrl || await r.$resolveTrackActionPage(track);
      if (!pageUrl) {
        r.$showToast("This track does not expose an individual Bandcamp page.");
        return;
      }
      const target = new URL(pageUrl);
      const samePage = target.origin === location.origin && target.pathname === location.pathname;
      if (samePage && r.$activateNativeTrackAction(action, active)) {
        if (action === "wishlist") r.$markWishlistTrack(track, active);
        r.$showToast(action === "wishlist" ? active ? "Added to your Bandcamp wishlist" : "Removed from your Bandcamp wishlist" : "Opened Bandcamp's purchase action");
        return;
      }
      target.hash = action === "wishlist" ? "bandkit-wishlist" : "bandkit-cart";
      if (action === "wishlist") {
        const key = r.$wishlistTrackKey(track);
        target.searchParams.set("bandkit_wishlist_key", key);
        target.searchParams.set("bandkit_wishlist_active", active ? "1" : "0");
      }
      const response = await r.$runtimeMessage({ type: MESSAGES.OPEN_BACKGROUND_TAB, url: target.href });
      if (!response?.ok) {
        r.$showToast(response?.error || `Bandcamp could not open the ${action} action.`);
        return;
      }
      if (action === "wishlist") r.$markWishlistTrack(track, active);
      r.$showToast(action === "wishlist"
        ? active ? `Adding “${track.title}” to your Bandcamp wishlist.` : `Removing “${track.title}” from your Bandcamp wishlist.`
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
      const wasActive = keys.has(key);
      if (active) keys.add(key);
      else keys.delete(key);
      runtimeState.wishlistTrackKeys = [...keys].slice(-500);
      if (active && !wasActive && typeof trackOrKey !== "string") {
        r.$recordActivity({
          action: "wishlisted",
          title: trackOrKey.title,
          artist: trackOrKey.artist,
          art: trackOrKey.art,
          url: resolvedTrackPageUrl(trackOrKey),
          artistUrl: trackOrKey.artistUrl || r.$artistUrlFromPageUrl(resolvedTrackPageUrl(trackOrKey))
        }, { persist: false, render: false });
      }
      runtimeSaveState();
      if (runtimeState.activeTab === "playlist") r.$render();
    };
}

function registerRuntimeShellLinks(r) {
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
      if (r.$storageDisabled) return Promise.resolve(false);
      try {
        const write = chrome.storage.local.set(values);
        if (write && typeof write.catch === "function") {
          return write.then(() => true).catch((error) => {
            if (notify) r.$reportStorageWriteError(error);
            return false;
          });
        }
        return Promise.resolve(true);
      } catch (error) {
        if (notify) r.$reportStorageWriteError(error);
        return Promise.resolve(false);
      }
    };
r.$nowPlayingSessionSignature = () => nowPlayingSessionSignature(runtimeState);
r.$beginNowPlayingSessionRevision = () => beginNowPlayingSessionRevision(r, runtimeState);
r.$persistNowPlayingSession = () => persistNowPlayingSession(r, runtimeState);
r.$sharedStateSnapshot = function sharedStateSnapshot(value = runtimeState) {
      const snapshot = {
        activity: structuredClone(value?.activity || []),
        cart: structuredClone(value?.cart || []), cartSavedAt: value?.cartSavedAt || null, cartSummary: structuredClone(value?.cartSummary || null),
        savedPlaylists: structuredClone(value?.savedPlaylists || []),
        savedCarts: structuredClone(value?.savedCarts || []),
        backupIntroSeen: value?.backupIntroSeen === true,
        backupReminderDays: Number(value?.backupReminderDays),
        backupReminderSnoozedAt: value?.backupReminderSnoozedAt || null,
        lastBackupAt: value?.lastBackupAt || null,
        appearance: structuredClone(value?.appearance || {}),
        dj: structuredClone(value?.dj || {}),
        settingsDrawers: structuredClone(value?.settingsDrawers || {})
      };
      for (const key of CONCURRENT_SETTING_KEYS) snapshot[key] = structuredClone(value?.[key]);
      return snapshot;
    };
r.$setSharedStateBaseline = function setSharedStateBaseline(value = runtimeState) {
      r.$sharedStateBaseline = r.$sharedStateSnapshot(value);
    };
r.$saveState = updateRuntimeSaveState(function saveState() {
      const snapshot = structuredClone(runtimeState);
      r.$restoreVisualThemeForSave?.(snapshot);
      const baseline = structuredClone(r.$sharedStateBaseline);
      r.$stateSaveChain = r.$stateSaveChain.catch(() => {}).then(async () => {
        const stored = await r.$storageGet(STORAGE_KEYS.STATE);
        const latest = stored?.[STORAGE_KEYS.STATE] || {};
        const payload = mergeConcurrentState(baseline, snapshot, latest);
        if (!await r.$persistLocal({ [STORAGE_KEYS.STATE]: payload })) return;
        r.$setSharedStateBaseline(payload);
      });
      r.$persistNowPlayingSession();
      r.$scheduleCollectionPlaylistSync?.();
    });
}
export const registerRuntimeShell = [registerRuntimeShellPlayer, registerRuntimeShellActions, registerRuntimeShellCommerce, registerRuntimeShellLinks, registerRuntimeShell3];
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
      detectedBpm: null, automaticBpm: null,
      automaticBpmUncertain: false, bpmSource: "auto", bpmStatus: "idle",
      bpmUncertain: false,
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
r.$sharedStateBaseline = r.$sharedStateSnapshot?.(defaultState) || {
  savedPlaylists: [],
  savedCarts: [],
  backupIntroSeen: false,
  backupReminderDays: 7,
  backupReminderSnoozedAt: null,
  lastBackupAt: null
};
r.$stateSaveChain = Promise.resolve();
r.$nowPlayingPersistChain = Promise.resolve();
r.$backupSavedConfirmationUntil = 0;
r.$scanTimer = undefined;
r.$scanIdleCallback = undefined;
r.$playerEventScanTimer = undefined;
r.$lastPageScrollAt = 0;
r.$seamlessSyncTimer = undefined;
r.$seamlessSyncPromise = null;
r.$playbackSessionStartedAt = 0;
r.$playbackStateRevision = 0;
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
r.$feedHandoffRequest = 0;
r.$feedHandoffTrackId = "";
r.$feedHandoffStartedAt = 0;
r.$pageCartAvailable = false;
r.$pageCartPresent = false;
r.$feedPurchases = new Map();
r.$feedPurchaseRequests = new Map();
r.$pagePriceRequest = null;
r.$cartShrinkSignature = "";
r.$cartShrinkScans = 0;
r.$feedReleaseTracks = new Map();
r.$feedReleaseRequests = new Map();
r.$feedStreams = new Map();
r.$collectionStreams = new Map();
r.$collectionStreamRequests = new Map();
r.$feedStreamPrefetches = new Set();
r.$feedStreamsRefreshedAt = 0;
r.$mutedFeedAudio = null;
r.$mutedFeedAudioWasMuted = false;
r.$mutedFeedTrackId = "";
r.$playlistPlaybackStarting = false;
r.$playlistPlaybackStartingRequest = 0;
r.$playlistPlayRequest = 0;
r.$nowPlayingRevision = 0; r.$lastNowPlayingSignature = "";
r.$nowPlayingTransitionTrackKey = "";
r.$nowPlayingTransitionExpiresAt = 0;
r.$classicPageHandoffRequest = 0;
r.$classicPageHandoffTrackKey = ""; r.$classicPageHandoffTrack = null;
r.$classicPagePendingSeekFraction = null; r.$classicPagePendingSeekRequest = 0; r.$classicPagePendingSeekRevision = 0; r.$classicPagePendingSeekTrackKey = "";
r.$savedPlaylistPlayRequest = 0;
r.$savedPlaylistReplacementRequest = 0;
r.$savedPlaylistReplacementGuardUntil = 0;
r.$pendingPlaylistItemId = "";
r.$feedSwitchPendingDisable = false;
r.$pendingFeedTrackId = "";
r.$pendingFeedSeekTime = null;
r.$pendingFeedSeekFraction = null;
r.$pendingFeedSeekTrackId = "";
r.$pendingFeedSeekRevision = 0;
r.$suppressedFeedTrackId = "";
r.$feedNativeFallbackTrackId = "";
r.$feedNativeFallbackUntil = 0;
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
r.$playerSpectrumResizeObserver = null;
r.$playerTrackRenderSignature = "";
r.$playerTrackIdentity = "";
r.$playerPlaybackRenderState = "";
r.$playerAnalysisRenderSignature = "";
r.$bpmTapTimes = [];
r.$resizeCursorStyle = null;
r.$observedAudio = new WeakSet();
r.$bridgedMedia = null;
r.$bridgedCart = null;
r.$bridgedCartSummary = null;
r.$activityDateFilter = "";
r.$cartArtistCache = new Map();
r.$cartArtistPending = new Set();
r.$cartArtistAttempted = new Set();
r.$cartActivityKeys = null;
r.$cartActivityReadyAt = Date.now() + 10000;
r.$pageDjOpen = false;
r.$pageDjHost = null;
r.$pageDjShadow = null;
r.$pageDjStyle = null;
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

function setupRuntimeShell3(r) {
r.$restoreIconPreload = document.createElement("img");
r.$restoreIconPreload.src = asset("icon-restore.svg");
r.$compactPanelButton = createMusicBarPanelButton();
r.$playerSections.prepend(r.$compactPanelButton);
setupCompactPanelFocusRelease(r, () => runtimeState.open);
setupCompactPanelNotices(r, () => r.$player.dataset.panelButtons === "compact");
setupSettingsTooltips(r);
r.$panelShortcuts = document.createElement("nav");
r.$panelShortcuts.className = "hub-panel-shortcuts";
r.$panelShortcuts.setAttribute("aria-label", "Panel destinations");
r.$panel.append(r.$panelShortcuts);
r.$scrubControl = r.$player.querySelector(".hub-scrub-control");
r.$scrubSlider = r.$player.querySelector(".hub-scrub-slider");
enableRangeReset(r.$scrubSlider, 0);
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
      r.$playerSpectrumResizeObserver = new ResizeObserver((entries) => {
        const bounds = entries[0]?.contentRect;
        if (bounds?.width > 0 && bounds?.height > 0) {
          r.$spectrumCanvasSize = { width: bounds.width, height: bounds.height };
        }
      });
      r.$playerSpectrumResizeObserver.observe(r.$playerSpectrum);
    }
const returnSettingsToRoot = (tabId, control) => {
      if (tabId !== "settings" || !control.classList.contains("is-active")) return;
      resetSettingsDisclosures();
      runtimeState.settingsView = "index";
      runtimeState.settingsSubView = "index";
    };
for (const tab of r.$tabs) {
      const button = createSectionTab(tab);
      button.addEventListener("click", () => {
        r.$clearCompactPanelNotice?.();
        returnSettingsToRoot(tab.id, button);
        runtimeState.musicBarRecentPanel = tab.id;
        runtimeState.activeTab = tab.id;
      runtimeSaveState(); r.$saveLayoutState(); r.$render();
      });
      r.$tabBar.append(button);

      const panelShortcut = createPanelShortcut(tab);
      panelShortcut.addEventListener("click", () => {
        r.$clearCompactPanelNotice?.();
        returnSettingsToRoot(tab.id, panelShortcut);
        runtimeState.musicBarRecentPanel = tab.id;
        runtimeState.activeTab = tab.id;
        runtimeState.open = true;
        runtimeSaveState(); r.$saveLayoutState();
        r.$render();
      });
      r.$panelShortcuts.append(panelShortcut);
      if (tab.id === "playlist") continue;

      const shortcut = createMusicBarShortcut(tab);
      shortcut.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        r.$toggleSectionPanel(tab.id);
      });
      r.$headerShortcuts.append(shortcut);
    }
    r.$compactPanelButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const tabId = ["playlist", "cart", "activity", "settings"].includes(runtimeState.musicBarRecentPanel)
        ? runtimeState.musicBarRecentPanel : "playlist";
      r.$toggleSectionPanel(tabId);
    });
}

export const setupRuntimeShell = [setupRuntimeShell1, ...setupRuntimeDomShell, setupRuntimeShell3];
