import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { discoverGenrePalette } from "../discover-colours.js";
import { resolvePlayerPresentation } from "../player-presentation.js";
import { syncCustomPlayerButtons } from "../custom-player-buttons.js";
import { syncPaperSurface } from "../paper-surface.js";
import { asset, createButtonIcon, formatDuration, resolveImage, safeBandcampReleaseUrl, safeBandcampUrl } from "../core.js";
import { MAX_PLAYLIST_ITEMS } from "../state.js";
import { MESSAGES } from "../../shared/contracts.js";
import { playerAlbumLabel } from "./player-metadata.js";
import { drawSpectrumAnalyzer } from "../spectrum-renderer.js";
import { flowingColour } from "../visualizer-colour-field.js";
import { createVisualizerFrameQueue } from "../visualizer-frame.js";
import { createVisualizerSignalGuard } from "../visualizer-signal.js";
import { registerPlayerHandoffs } from "./player-handoffs.js";
import { syncPlayerSurface } from "./player-surface.js";
import { syncVisualizerSurface } from "./visualizer-surface.js";
import { syncDockChevron } from "./dock-chevron.js";
import { readableColor } from "../color.js";
import { syncFullscreenVisualizerGlass } from "./fullscreen-visualizer.js";
const VISUALIZER_BLOOM_INTERVAL_MS = 96;
function renderPlayerAnalysis(r, hasCurrentTrack) {
  r.$djPlayerButton.hidden = runtimeState.djToolsEnabled === false || !hasCurrentTrack;
  const detectedBpm = Number(runtimeSeamless.detectedBpm);
  const bpmUncertain = runtimeSeamless.bpmUncertain === true || runtimeSeamless.bpmStatus === "error";
  const keyUncertain = runtimeSeamless.detectedKey?.uncertain === true
    || (["ready", "error"].includes(runtimeSeamless.bpmStatus) && !runtimeSeamless.detectedKey);
  const bpmLabel = Number.isFinite(detectedBpm) && detectedBpm > 0
    ? `${Math.round(detectedBpm * 10) / 10}${bpmUncertain ? "?" : ""} BPM`
    : bpmUncertain ? "BPM?" : "";
  const keyCamelot = runtimeState.showCamelotNotation === true ? String(runtimeSeamless.detectedKey?.camelot ? `${runtimeSeamless.detectedKey.camelot}${keyUncertain ? "?" : ""}` : (keyUncertain ? "?" : "")).trim() : "";
  const keyName = runtimeState.showTrackKeys !== false ? String(runtimeSeamless.detectedKey?.shortName ? `${runtimeSeamless.detectedKey.shortName}${keyUncertain ? "?" : ""}` : (keyUncertain ? "Key?" : "")).trim() : "";
  const showPlayerAnalysis = runtimeState.djToolsEnabled !== false
    && runtimeState.showMusicBarAnalysis !== false
    && hasCurrentTrack
    && Boolean(bpmLabel || keyCamelot || keyName);
  r.$updateDeepAnalysisButton?.(r.$playerDeepAnalysis, runtimeSeamless.track);
  const signature = `${showPlayerAnalysis}|${bpmLabel}|${keyCamelot}|${keyName}`;
  if (signature === r.$playerAnalysisRenderSignature) return;
  r.$playerAnalysisRenderSignature = signature;
  r.$playerAnalysis.hidden = !showPlayerAnalysis;
  r.$playerBpmBadge.hidden = !bpmLabel;
  r.$playerBpmBadge.textContent = bpmLabel;
  r.$playerBpmBadge.title = bpmUncertain
    ? `${detectedBpm > 0 ? "Best-effort BPM estimate" : "BPM could not be detected confidently"}${runtimeSeamless.bpmError ? `: ${runtimeSeamless.bpmError}` : ""}`
    : bpmLabel ? `Detected tempo: ${bpmLabel}` : "";
  r.$playerKeyBadge.hidden = !(keyCamelot || keyName);
  r.$playerKeyCamelot.textContent = keyCamelot;
  r.$playerKeyName.textContent = keyName;
  const alternative = r.$keyAlternativeDescription?.(runtimeSeamless.detectedKey) || "";
  r.$playerKeyBadge.title = keyUncertain
    ? `${runtimeSeamless.detectedKey ? "Best-effort musical key estimate" : "Musical key could not be detected confidently for this track"}${alternative ? `. ${alternative}` : ""}`
    : keyName
    ? `Detected key: ${runtimeSeamless.detectedKey?.name || keyName}${keyCamelot ? ` · Camelot ${keyCamelot}` : ""}`
    : keyCamelot ? `Detected Camelot notation: ${keyCamelot}` : "";
}

function restartPlayerEntry(element) {
  if (!element) return;
  element.classList.remove("is-track-entering");
  void element.offsetWidth;
  element.classList.add("is-track-entering");
}

function crossfadePlayerArtwork(r, playerArtUrl) {
  const previousUrl = r.$playerArt.currentSrc || r.$playerArt.src || "";
  r.$playerArtLink.querySelectorAll(".hub-player-art-outgoing").forEach((image) => image.remove());
  if (previousUrl && previousUrl !== playerArtUrl && !r.$playerArtLink.hidden) {
    const outgoing = r.$playerArt.cloneNode(false);
    outgoing.classList.remove("is-track-entering");
    outgoing.classList.add("hub-player-art-outgoing");
    outgoing.removeAttribute("aria-label");
    r.$playerArtLink.append(outgoing);
    window.setTimeout(() => outgoing.remove(), 320);
  }
  r.$playerArt.src = playerArtUrl;
  restartPlayerEntry(r.$playerArt);
}

function setPlayerArtwork(r, playerArtUrl) {
  const request = (r.$playerArtRequest || 0) + 1;
  r.$playerArtRequest = request;
  if (!playerArtUrl) {
    r.$player.classList.add("has-no-art");
    r.$playerArtLink.hidden = true;
    r.$playerArt.removeAttribute("src");
    return;
  }
  const currentUrl = r.$playerArt.currentSrc || r.$playerArt.src || "";
  if (currentUrl === playerArtUrl && !r.$playerArtLink.hidden) return;
  const probe = document.createElement("img");
  probe.addEventListener("load", () => {
    if (r.$playerArtRequest !== request) return;
    crossfadePlayerArtwork(r, playerArtUrl);
    r.$playerArtLink.hidden = false;
    r.$player.classList.remove("has-no-art");
  }, { once: true });
  probe.addEventListener("error", () => {
    if (r.$playerArtRequest !== request) return;
    r.$playerArtLink.hidden = true;
    r.$player.classList.add("has-no-art");
  }, { once: true });
  probe.src = playerArtUrl;
}

function renderPlayerTrack(r, displayTrack, hasCurrentTrack) {
  const playerWasEmpty = r.$player.classList.contains("is-empty");
  r.$player.classList.toggle("is-empty", !hasCurrentTrack);
  r.$panel.dataset.playerEmpty = String(!hasCurrentTrack);
  r.$playerTrack.classList.toggle("is-empty", !hasCurrentTrack);
  if (playerWasEmpty === hasCurrentTrack) {
    r.$syncMusicBarPanelButtons?.();
    r.$playerSectionGeometrySignature = "";
    r.$schedulePlayerSectionGeometry?.();
    window.setTimeout(() => {
      r.$playerSectionGeometrySignature = "";
      r.$schedulePlayerSectionGeometry?.();
    }, 380);
  }
  const matchingSeamlessTrack = hasCurrentTrack && runtimeSeamless.track
    ? r.$matchingQueueTrack([runtimeSeamless.track], displayTrack)
    : null;
  const matchingPageTrack = hasCurrentTrack ? r.$matchingQueueTrack(r.$buildSeamlessQueue(), displayTrack) : null;
  const albumCandidates = hasCurrentTrack ? [matchingPageTrack, displayTrack, matchingSeamlessTrack].filter(Boolean) : [];
  const albumSource = albumCandidates.find((candidate) => playerAlbumLabel(candidate, candidate.releaseUrl || candidate.pageUrl));
  const albumUrl = albumSource?.releaseUrl || albumSource?.pageUrl || displayTrack.pageUrl;
  const album = albumSource ? playerAlbumLabel(albumSource, albumUrl) : "";
  const artist = hasCurrentTrack ? String(displayTrack.artist || "").trim() : "";
  const trackIdentity = hasCurrentTrack
    ? String(displayTrack.id || displayTrack.playlistItemId || displayTrack.pageUrl || `${displayTrack.title}\u0000${artist}`)
    : "";
  const trackChanged = hasCurrentTrack && trackIdentity !== r.$playerTrackIdentity;
  const signature = hasCurrentTrack
    ? `${displayTrack.title}\u0000${artist}\u0000${album}\u0000${displayTrack.art}\u0000${displayTrack.pageUrl}\u0000${displayTrack.artistUrl}\u0000${albumUrl}`
    : "empty";
  if (signature === r.$playerTrackRenderSignature) {
    r.$playerTrackIdentity = trackIdentity;
    return;
  }
  r.$playerTrackRenderSignature = signature;
  r.$playerTrackIdentity = trackIdentity;
  const playerArtUrl = hasCurrentTrack ? resolveImage(displayTrack.art) : "";
  setPlayerArtwork(r, playerArtUrl);
  r.$playerArt.alt = "";
  r.$playerTitle.textContent = hasCurrentTrack ? displayTrack.title : "";
  r.$playerArtist.textContent = artist;
  r.$playerAlbum.textContent = album;
  r.$playerAlbum.hidden = !album;
  r.$playerAlbum.previousElementSibling.hidden = !(artist && album);
  r.$updatePageLink(r.$playerArtLink, hasCurrentTrack ? displayTrack.pageUrl : "");
  if (hasCurrentTrack) r.$playerArtLink.setAttribute("aria-label", `Open ${displayTrack.title}`);
  else r.$playerArtLink.removeAttribute("aria-label");
  r.$updatePageLink(r.$playerTitle, hasCurrentTrack ? displayTrack.pageUrl : "");
  r.$updatePageLink(r.$playerArtist, hasCurrentTrack ? displayTrack.artistUrl || displayTrack.pageUrl : "");
  r.$updatePageLink(r.$playerAlbum, hasCurrentTrack && album ? albumUrl : "");
  if (trackChanged) restartPlayerEntry(r.$playerTrack.querySelector(".hub-track-copy"));
}

function pendingPlayerState(r) {
  const pendingFeedLoading = Boolean(r.$pendingFeedTrackId);
  const pendingFeedState = pendingFeedLoading ? r.$getFeedPlayerState(r.$pendingFeedTrackId) : null;
  const pendingClassicLoading = Boolean(r.$classicPageHandoffTrackKey && r.$classicPageHandoffTrack);
  const pendingClassicTrack = pendingClassicLoading ? r.$classicPageHandoffTrack : null;
  const seamlessTrackId = String(runtimeSeamless.track?.id || "");
  const pendingFeedSeek = Boolean(
    (r.$pendingFeedSeekTime !== null || r.$pendingFeedSeekFraction !== null)
    && r.$pendingFeedSeekTrackId
    && (r.$pendingFeedSeekTrackId === r.$pendingFeedTrackId || r.$pendingFeedSeekTrackId === seamlessTrackId)
  );
  const pendingClassicSeek = Boolean(
    pendingClassicLoading
    && r.$classicPagePendingSeekFraction !== null
    && r.$classicPagePendingSeekRequest === r.$classicPageHandoffRequest
    && r.$classicPagePendingSeekTrackKey === r.$classicPageHandoffTrackKey
  );
  return { pendingClassicLoading, pendingClassicSeek, pendingClassicTrack, pendingFeedLoading, pendingFeedSeek, pendingFeedState };
}

function syncDjDrawerAnchor(r, playerRect = r.$player.getBoundingClientRect()) {
  const buttonRect = r.$djPlayerButton.getBoundingClientRect();
  if (!playerRect.width || !buttonRect.width) return;
  const center = buttonRect.left + buttonRect.width / 2;
  const zune = ["zune", "rounded"].includes(runtimeState.musicBarStyle);
  const visualizerVisible = zune
    && runtimeState.musicBarVisualizer !== "off"
    && !r.$player.classList.contains("is-empty");
  let visibleTop = playerRect.top;
  if (visualizerVisible) {
    const contentRect = r.$player.querySelector(".hub-player-content")?.getBoundingClientRect();
    const visualizerRect = r.$playerVisualizer?.getBoundingClientRect();
    if (contentRect?.height) visibleTop = Math.min(visibleTop, contentRect.top);
    if (visualizerRect?.height) visibleTop = Math.min(visibleTop, visualizerRect.top);
  }
  const clearance = Math.max(0, playerRect.top - visibleTop);
  const bottom = Math.max(10, window.innerHeight - visibleTop + 10);
  r.$djDrawer.style.setProperty("--hub-dj-anchor-x", `${Math.round(center)}px`);
  r.$djDrawer.style.setProperty("--hub-dj-bottom", `${Math.round(bottom)}px`);
  r.$djDrawer.style.setProperty("--hub-dj-visualizer-clearance", `${Math.ceil(clearance)}px`);
}

function parseRenderedColor(value) {
  const hex = String(value || "").trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
    return { r: Number.parseInt(digits.slice(0, 2), 16), g: Number.parseInt(digits.slice(2, 4), 16), b: Number.parseInt(digits.slice(4, 6), 16), a: 1 };
  }
  const match = String(value || "").match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/i);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4]) / (String(value).includes("%") ? 100 : 1)));
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
}

function blendRenderedColor(foreground, background) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (!alpha) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha
  };
}

function renderedParentElement(element) {
  if (element?.parentElement) return element.parentElement;
  const root = element?.getRootNode?.();
  return root instanceof ShadowRoot ? root.host : null;
}

function renderedShadowTargetAt(element, x, y) {
  let target = element;
  while (target?.shadowRoot) {
    const matches = [...target.shadowRoot.querySelectorAll("*")].filter((candidate) => {
      const rect = candidate.getBoundingClientRect();
      if (rect.left > x || rect.right < x || rect.top > y || rect.bottom < y) return false;
      const style = getComputedStyle(candidate);
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0;
    });
    const innerTarget = matches.at(-1);
    if (!innerTarget) break;
    target = innerTarget;
  }
  return target;
}

function renderedPageSurfaceAt(r, x, y) {
  // Genre backgrounds are gradients, which the flat-colour sampler skips.
  // All dynamic player variants share this surface source.
  const genre = discoverGenrePalette();
  if (genre) return genre.background;
  const layers = document.elementsFromPoint(Math.max(0, Math.min(window.innerWidth - 1, x)), Math.max(0, Math.min(window.innerHeight - 1, y)));
  const extensionLayers = new Set([r.$root, r.$host]);
  for (let node = r.$root; node;) {
    const root = node.getRootNode?.();
    if (!(root instanceof ShadowRoot)) break;
    extensionLayers.add(root.host);
    node = root.host;
  }
  const layer = layers.find((element) => !extensionLayers.has(element) && !r.$root.contains(element));
  const target = layer ? renderedShadowTargetAt(layer, x, y) : null;
  if (!target) return null;
  const minimumSurfaceWidth = Math.min(760, window.innerWidth * 0.55);
  let surfaceRoot = target;
  while (renderedParentElement(surfaceRoot)) {
    const rect = surfaceRoot.getBoundingClientRect();
    const mediaLayer = ["IMG", "PICTURE", "VIDEO", "CANVAS", "SVG"].includes(surfaceRoot.tagName)
      || getComputedStyle(surfaceRoot).backgroundImage !== "none";
    if (!mediaLayer && rect.width >= minimumSurfaceWidth && rect.height >= 48) break;
    surfaceRoot = renderedParentElement(surfaceRoot);
  }
  const colors = [];
  for (let element = surfaceRoot; element; element = renderedParentElement(element)) {
    const color = parseRenderedColor(getComputedStyle(element).backgroundColor);
    if (color?.a) colors.push(color);
  }
  let result = { r: 255, g: 255, b: 255, a: 1 };
  for (let index = colors.length - 1; index >= 0; index -= 1) result = blendRenderedColor(colors[index], result);
  return result;
}

function renderedColorCss(color) {
  return `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)})`;
}

function colorLuminance(color) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(color.r) * 0.2126 + channel(color.g) * 0.7152 + channel(color.b) * 0.0722;
}

function colorContrast(first, second) {
  const lighter = Math.max(colorLuminance(first), colorLuminance(second));
  const darker = Math.min(colorLuminance(first), colorLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function usesUnthemedBandcampProgressAccent(prefix) {
  if (prefix !== "main" || document.documentElement.dataset.bandkitPageTheme === "true") return false;
  if (document.querySelector("#HomepageApp, #DiscoverApp, .discover-app")) return true;
  if (location.hostname === "daily.bandcamp.com") return true;
  return location.hostname === "bandcamp.com" && /^\/radio(?:\/|$)/.test(location.pathname);
}

function applyZuneSurfacePalette(r, prefix, surface) {
  const lightSurface = colorLuminance(surface) > 0.42;
  const ink = lightSurface ? { r: 24, g: 30, b: 36 } : { r: 248, g: 249, b: 250 };
  const muted = lightSurface ? { r: 70, g: 80, b: 89 } : { r: 211, g: 215, b: 219 };
  const themedAccent = parseRenderedColor(getComputedStyle(r.$player).getPropertyValue("--hub-panel-accent"));
  // Bandcamp's unthemed editorial players sit over stable, mostly neutral
  // backdrops. Sampling their link colour can collapse the played and
  // remaining waveform into the same grey, so retain Bandcamp blue as the
  // progress cue on Home, Discover, Daily, and Radio. Selected page themes
  // keep their own accent, and explicit timeline overrides still win.
  const unthemedBandcampProgress = usesUnthemedBandcampProgressAccent(prefix);
  const bandcampAccent = { r: 29, g: 160, b: 195 };
  const accent = unthemedBandcampProgress
    ? readableColor(bandcampAccent, [surface], 4.5).color
    : themedAccent && colorContrast(themedAccent, surface) >= 3 ? themedAccent : ink;
  r.$player.style.setProperty(`--hub-zune-${prefix}-ink-live`, renderedColorCss(ink));
  r.$player.style.setProperty(`--hub-zune-${prefix}-muted-live`, renderedColorCss(muted));
  r.$player.style.setProperty(`--hub-zune-${prefix}-accent-live`, renderedColorCss(accent));
  r.$player.style.setProperty(`--hub-zune-${prefix}-accent-soft-live`, `rgb(${Math.round(accent.r)} ${Math.round(accent.g)} ${Math.round(accent.b)} / 14%)`);
  const lineAlpha = unthemedBandcampProgress ? 0.26 : 0.42;
  r.$player.style.setProperty(`--hub-zune-${prefix}-line-live`, `rgb(${Math.round(ink.r)} ${Math.round(ink.g)} ${Math.round(ink.b)} / ${Math.round(lineAlpha * 100)}%)`);
}

function applyDynamicPanelPalette(r, surface) {
  const shade = colorLuminance(surface) > 0.42
    ? { r: 0, g: 0, b: 0, a: 0.055 }
    : { r: 255, g: 255, b: 255, a: 0.08 };
  const panelSurface = blendRenderedColor(shade, { ...surface, a: 1 });
  const lightSurface = colorLuminance(panelSurface) > 0.42;
  const ink = lightSurface ? { r: 24, g: 30, b: 36 } : { r: 248, g: 249, b: 250 };
  const muted = lightSurface ? { r: 70, g: 80, b: 89 } : { r: 211, g: 215, b: 219 };
  const themedAccent = parseRenderedColor(getComputedStyle(r.$player).getPropertyValue("--hub-panel-accent"));
  const accent = themedAccent ? readableColor(themedAccent, [panelSurface], 4.5).color : ink;
  const onAccent = colorLuminance(accent) > 0.42
    ? { r: 24, g: 30, b: 36 }
    : { r: 248, g: 249, b: 250 };
  const line = `rgb(${Math.round(ink.r)} ${Math.round(ink.g)} ${Math.round(ink.b)} / 42%)`;
  const accentSoft = `rgb(${Math.round(accent.r)} ${Math.round(accent.g)} ${Math.round(accent.b)} / 14%)`;
  const error = lightSurface ? { r: 185, g: 28, b: 28 } : { r: 254, g: 202, b: 202 };
  for (const [property, value] of Object.entries({
    "--hub-panel": renderedColorCss(panelSurface),
    "--hub-header": renderedColorCss(panelSurface),
    "--hub-wash": renderedColorCss(panelSurface),
    "--hub-ink": renderedColorCss(ink),
    "--hub-muted": renderedColorCss(muted),
    "--hub-faint": renderedColorCss(muted),
    "--hub-line": line,
    "--hub-accent": renderedColorCss(accent),
    "--hub-accent-soft": accentSoft,
    "--hub-on-accent": renderedColorCss(onAccent),
    "--hub-hover": accentSoft,
    "--hub-error": renderedColorCss(error),
    "--hub-panel-ink": renderedColorCss(ink),
    "--hub-panel-muted": renderedColorCss(muted),
    "--hub-panel-faint": renderedColorCss(muted),
    "--hub-panel-line": line,
    "--hub-panel-accent": renderedColorCss(accent),
    "--hub-panel-accent-soft": accentSoft,
    "--hub-panel-on-accent": renderedColorCss(onAccent),
    "--hub-control-bg": renderedColorCss(accent),
    "--hub-control-fg": renderedColorCss(onAccent),
    "--hub-control-border": renderedColorCss(accent),
    "--hub-control-focus": renderedColorCss(accent),
    "--hub-scrub-accent": renderedColorCss(accent),
    "--hub-scrub-remaining": line,
    "--hub-scrub-surface": renderedColorCss(panelSurface),
    "--hub-scrub-halo": line,
    "--hub-tab-foreground": renderedColorCss(ink)
  })) r.$panel.style.setProperty(property, value);
}

function syncZunePageSurfaces(r, playerRect) {
  // The fullscreen background keeps the surface sampled at entry. Sampling
  // again at fullscreen coordinates would recolour text against another area.
  if (r.$visualizerFullscreen) return;
  const dynamicColor = runtimeState.musicBarDynamicColor !== false;
  const playerDynamicColor = dynamicColor && runtimeState.musicBarPlayerDynamicColor !== false;
  const panelDynamicColor = dynamicColor && runtimeState.musicBarPanelDynamicColor !== false;
  if (!playerDynamicColor) {
    for (const property of [
      "--hub-zune-surface-live", "--hub-zune-menu-surface-live",
      "--hub-zune-main-ink-live", "--hub-zune-main-muted-live", "--hub-zune-main-accent-live",
      "--hub-zune-main-accent-soft-live", "--hub-zune-main-line-live",
      "--hub-zune-menu-ink-live", "--hub-zune-menu-muted-live", "--hub-zune-menu-accent-live",
      "--hub-zune-menu-accent-soft-live", "--hub-zune-menu-line-live"
    ]) r.$player.style.removeProperty(property);
  }
  if (!panelDynamicColor) {
    for (const property of [
      "--hub-panel", "--hub-header", "--hub-wash", "--hub-ink", "--hub-muted", "--hub-faint",
      "--hub-line", "--hub-accent", "--hub-accent-soft", "--hub-on-accent", "--hub-hover", "--hub-error",
      "--hub-panel-ink", "--hub-panel-muted", "--hub-panel-faint", "--hub-panel-line", "--hub-panel-accent",
      "--hub-panel-accent-soft", "--hub-panel-on-accent", "--hub-control-bg", "--hub-control-fg",
      "--hub-control-border", "--hub-control-focus", "--hub-scrub-accent", "--hub-scrub-remaining",
      "--hub-scrub-surface", "--hub-scrub-halo", "--hub-tab-foreground"
    ]) r.$panel.style.removeProperty(property);
  }
  if (!playerDynamicColor && !panelDynamicColor) return;
  const contentRect = r.$player.querySelector(".hub-player-content")?.getBoundingClientRect();
  if (!contentRect?.width) return;
  const sampleY = playerRect.top + playerRect.height * 0.72;
  const mainSurface = renderedPageSurfaceAt(r, contentRect.left + contentRect.width / 2, sampleY);
  if (mainSurface) {
    if (playerDynamicColor) {
      r.$player.style.setProperty("--hub-zune-surface-live", renderedColorCss(mainSurface));
      r.$player.style.setProperty("--hub-zune-menu-surface-live", renderedColorCss(mainSurface));
      applyZuneSurfacePalette(r, "main", mainSurface);
      applyZuneSurfacePalette(r, "menu", mainSurface);
    }
    if (panelDynamicColor) applyDynamicPanelPalette(r, mainSurface);
  }
}

function normalizedCornerStyle() {
  const style = ["square", "custom"].includes(runtimeState.appearance.cornerStyle)
    ? runtimeState.appearance.cornerStyle : "rounded";
  const radius = Math.round(Math.max(0, Math.min(32, Number(runtimeState.appearance.customCornerRadius) || 0)));
  return { radius, style };
}

function syncCornerStyle(r) {
  const { radius, style } = normalizedCornerStyle();
  runtimeState.appearance.cornerStyle = style; runtimeState.appearance.customCornerRadius = radius;
  r.$host.dataset.cornerStyle = style; r.$host.style.setProperty("--hub-custom-corner-radius", `${radius}px`);
  document.documentElement.dataset.bandkitCornerStyle = style;
  if (style === "rounded") document.documentElement.style.removeProperty("--bandkit-page-corner-radius");
  else document.documentElement.style.setProperty("--bandkit-page-corner-radius", style === "square" ? "0px" : `${radius}px`);
  if (r.$pageDjHost) { r.$pageDjHost.dataset.cornerStyle = style; r.$pageDjHost.style.setProperty("--hub-custom-corner-radius", `${radius}px`); }
  r.$syncPageCornerShadowRoots?.();
}

function normalizedVisualizerSignal(signal = {}) {
  const value = (key) => Math.max(0, Math.min(1, Number(signal[key]) || 0));
  const level = value("level"), bass = value("bass"), mid = value("mid"), high = value("high");
  const spectrum = Array.isArray(signal.spectrum)
    ? signal.spectrum.slice(0, 320).map((entry) => Math.max(0, Math.min(1, (Number(entry) || 0) / 255)))
    : [];
  return { level, bass, mid, high, spectrum };
}

function applyMusicBarVisualizerSignal(r, signal = {}) {
  if (!r.$playerVisualizer || document.hidden || r.$player.dataset.visualizer === "off" || r.$player.classList.contains("is-empty")) return;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const values = reducedMotion
    ? { level: 0.16, bass: 0.16, mid: 0.16, high: 0.16, spectrum: new Array(64).fill(0.08) }
    : normalizedVisualizerSignal(signal);
  const reactive = !reducedMotion && signal.playing !== false && signal.reactive !== false && values.spectrum.length > 0;
  const leftEnergy = values.level * 0.8 + values.bass * 0.2;
  const centreEnergy = values.level * 0.72 + values.mid * 0.28;
  const rightEnergy = values.level * 0.8 + values.high * 0.2;
  const visualizerIntensity = Math.max(1, Math.min(4, Number(runtimeState.musicBarVisualizerOpacity) / 100 || 1));
  if (values.spectrum.length || reducedMotion) drawSpectrumAnalyzer(r, values.spectrum, reactive, visualizerIntensity);
  const now = performance.now();
  if (!reactive || now - Number(r.$visualizerBloomUpdatedAt || 0) >= VISUALIZER_BLOOM_INTERVAL_MS) {
    r.$visualizerBloomUpdatedAt = now;
    // Keep the soft backing in the same moving palette as the canvas. Reuse
    // its cached colours and the existing bloom cadence; no extra style reads.
    if (r.$spectrumColourCache) {
      for (const [field, position] of [["c", 0.15], ["e", 0.34], ["a", 0.5], ["b", 0.66], ["d", 0.85]]) {
        r.$playerVisualizer.style.setProperty(`--hub-visualizer-field-${field}`,
          flowingColour(r.$spectrumColourCache.colours, position, r.$spectrumColourPhase || 0, r.$player.dataset.visualizer === "weave" ? 0.85 : 2));
      }
    }
    for (const name of ["level", "bass", "mid", "high"]) {
      r.$playerVisualizer.style.setProperty(`--hub-visualizer-${name}`, values[name].toFixed(3));
    }
    for (const [name, value] of Object.entries({
      "bass-height": `${76 + leftEnergy * 64}%`, "bass-width": `${18 + leftEnergy * 17}%`,
      "bloom-opacity": Math.min(1, (r.$player.dataset.visualizer === "firefly"
        ? 0.2 + values.level * 0.65 + values.bass * 0.15
        : 0.12 + values.level * 0.26) * visualizerIntensity).toFixed(3), blur: `${3 + values.high * 2.1}px`,
      "high-height": `${76 + rightEnergy * 64}%`, "high-width": `${18 + rightEnergy * 17}%`,
      "mix-a": `${15 + values.mid * 8 - values.high * 3}%`, "mix-b": `${34 + values.bass * 7 - values.high * 5}%`,
      "mix-c": `${50 + (values.high - values.bass) * 7}%`, "mix-d": `${66 + values.high * 5 - values.bass * 7}%`,
      "mix-e": `${85 + values.mid * 3 - values.bass * 8}%`,
      "mid-height": `${104 + centreEnergy * 104}%`, "mid-width": `${26 + centreEnergy * 20}%`,
      saturation: (1.06 + values.mid * 0.44).toFixed(3), scale: (0.38 + values.level * 0.68).toFixed(3)
    })) r.$playerVisualizer.style.setProperty(`--hub-visualizer-${name}`, value);
  }
  r.$playerVisualizer.dataset.audioReactive = String(reactive);
  r.$playerVisualizer.dataset.spectrumSource = values.spectrum.length ? "fft" : "none";
  // Idle heartbeats must not keep the missing-audio watchdog alive.
  if (signal.playing !== false) r.$visualizerSignalAt = Date.now();
  syncVisualizerSurface(r, r.$visualizerBloomUpdatedAt === now, true);
}

function syncVisualizerFallback(r, playbackLoading) {
  if (!runtimeLive.isPlaying || playbackLoading) { r.$applyMusicBarVisualizerSignal({ reactive: false }); return; }
  const lastSignalOrResume = Math.max(Number(r.$visualizerSignalAt || 0), Number(r.$visualizerResumeAt || 0));
  if (Date.now() - lastSignalOrResume <= 700 || !runtimeSeamless.waveform?.length) return;
  const index = Math.min(runtimeSeamless.waveform.length - 1,
    Math.floor((Number(runtimeSeamless.progress) || 0) * runtimeSeamless.waveform.length));
  const level = Math.max(0, Math.min(1, Number(runtimeSeamless.waveform[index]) || 0));
  r.$applyMusicBarVisualizerSignal({ level, bass: level, mid: level * 0.82, high: level * 0.58, reactive: true });
}

function registerPlayerPresentation(r) {
r.$applyMusicBarVisualizerSignal = (signal) => applyMusicBarVisualizerSignal(r, signal);
r.$visualizerFrameQueue = createVisualizerFrameQueue({
  render: r.$applyMusicBarVisualizerSignal,
  visible: () => !document.hidden && (r.$visualizerFullscreen || runtimeState.musicBarVisualizer !== "off") && !r.$player.classList.contains("is-empty")
});
const signalGuard = createVisualizerSignalGuard({
  isPlaying: () => runtimeLive.isPlaying || Boolean(r.$bridgedMedia && !r.$bridgedMedia.paused && !r.$bridgedMedia.ended),
  reconcile: () => r.$syncSeamlessState?.(),
  onState: (state) => { r.$playerVisualizer.dataset.audioFeed = state; }
});
r.$queueMusicBarVisualizerSignal = (signal) => {
  if (document.hidden || r.$player.classList.contains("is-empty")
    || (!r.$visualizerFullscreen && runtimeState.musicBarVisualizer === "off")) return;
  // Filter before coalescing: a late idle packet must not replace the newest
  // active FFT already waiting for the next display frame.
  if (signalGuard.accept(signal)) r.$visualizerFrameQueue.push(signal);
};
r.$syncFrostedGlass = function syncFrostedGlass() {
      syncPaperSurface(r, runtimeState.appearance);
      const enabled = runtimeState.appearance.frostedGlass === true;
      const transparency = Math.round(Math.max(0, Math.min(70, Number(runtimeState.appearance.glassTransparency) || 0)));
      const blur = Math.round(Math.max(0, Math.min(30, Number(runtimeState.appearance.glassBlur) || 0)));
      runtimeState.appearance.frostedGlass = enabled;
      runtimeState.appearance.glassTransparency = transparency;
      runtimeState.appearance.glassBlur = blur;
      const opacity = `${100 - transparency}%`;
      for (const surface of [r.$player, r.$panel, r.$djDrawer, r.$onboardingDialog].filter(Boolean)) {
        surface.classList.toggle("is-frosted-glass", enabled);
        surface.style.setProperty("--hub-glass-surface-opacity", opacity);
        surface.style.setProperty("--hub-glass-blur", `${blur}px`);
      }
      syncFullscreenVisualizerGlass(r);
    };
r.$syncCornerStyle = () => syncCornerStyle(r);
r.$syncPlayerSectionGeometry = function syncPlayerSectionGeometry() {
      r.$playerSectionGeometryFrame = 0;
      const playerRect = r.$player.getBoundingClientRect(); if (!playerRect.width) return;
      syncZunePageSurfaces(r, playerRect);
      syncPlayerSurface(r);
      syncDjDrawerAnchor(r, playerRect);
      const zune = ["zune", "rounded"].includes(runtimeState.musicBarStyle);
      const empty = r.$player.classList.contains("is-empty");
      const contextual = zune || empty;
      const rect = r.$panel.getBoundingClientRect();
      if (!contextual && !rect.width) return;
      const panelWidth = r.$panel.offsetWidth || rect.width || Number.parseFloat(getComputedStyle(r.$panel).width) || Math.min(420, window.innerWidth - 32);
      const panelCenter = rect.left + rect.width / 2;
      const contentRect = r.$player.querySelector(".hub-player-content")?.getBoundingClientRect() || null;
      const docked = runtimeState.musicBarStyle === "docked" && !empty;
      const zuneSectionsRight = zune && contentRect?.width ? Math.max(12, playerRect.right - contentRect.right) : null;
      if (zuneSectionsRight !== null) {
        r.$player.style.setProperty("--hub-zune-sections-right", `${Math.round(zuneSectionsRight)}px`);
      }
      const sectionRect = r.$playerSections.getBoundingClientRect();
      const sectionCenter = docked
        ? window.innerWidth - 16 - panelWidth / 2 - playerRect.left
        : contextual
          ? sectionRect.left + sectionRect.width / 2 - playerRect.left
          : panelCenter - playerRect.left;
      const sectionWidth = contextual ? sectionRect.width : 48;
      if (!empty) syncDockChevron(r, sectionCenter);
      const anchorCenter = playerRect.left + sectionCenter;
      const maxPanelLeft = Math.max(12, window.innerWidth - panelWidth - 12);
      const panelLeft = contextual ? Math.max(12, Math.min(maxPanelLeft, anchorCenter - panelWidth / 2)) : null;
      const artAnchoredControls = zune || runtimeState.musicBarStyle === "docked";
      const artRect = artAnchoredControls && !r.$playerArtLink.hidden ? r.$playerArtLink.getBoundingClientRect() : null;
      const zuneActionsX = artRect?.width
        ? artRect.left + artRect.width / 2 - playerRect.left
        : contentRect?.width ? contentRect.left + Math.min(48, contentRect.height / 2) - playerRect.left : null;
      const contentLeft = contentRect?.width ? contentRect.left - playerRect.left : null;
      const contentRight = contentRect?.width ? contentRect.right - playerRect.left : null;
      const signature = `${Math.round(sectionCenter)}|${Math.round(sectionWidth)}|${panelLeft === null ? "docked" : Math.round(panelLeft)}|${zuneActionsX === null ? "none" : Math.round(zuneActionsX)}|${zuneSectionsRight === null ? "none" : Math.round(zuneSectionsRight)}|${contentLeft === null ? "none" : Math.round(contentLeft)}|${contentRight === null ? "none" : Math.round(contentRight)}`;
      if (signature === r.$playerSectionGeometrySignature) return;
      r.$playerSectionGeometrySignature = signature;
      r.$player.style.setProperty("--hub-sections-center-x", `${Math.round(sectionCenter)}px`);
      r.$player.style.setProperty("--hub-sections-panel-width", `${Math.round(sectionWidth)}px`);
      if (zuneActionsX === null) r.$player.style.removeProperty("--hub-zune-actions-x");
      else r.$player.style.setProperty("--hub-zune-actions-x", `${Math.round(zuneActionsX)}px`);
      if (zuneSectionsRight === null) r.$player.style.removeProperty("--hub-zune-sections-right");
      else r.$player.style.setProperty("--hub-zune-sections-right", `${Math.round(zuneSectionsRight)}px`);
      if (contentLeft === null || contentRight === null) {
        r.$player.style.removeProperty("--hub-player-content-left");
        r.$player.style.removeProperty("--hub-player-content-right");
      } else {
        r.$player.style.setProperty("--hub-player-content-left", `${Math.round(contentLeft)}px`);
        r.$player.style.setProperty("--hub-player-content-right", `${Math.round(contentRight)}px`);
      }
      if (panelLeft === null) {
        if (!docked) r.$panel.style.removeProperty("--hub-context-panel-left");
      } else {
        r.$panel.style.setProperty("--hub-context-panel-left", `${Math.round(panelLeft)}px`);
      }
    };
r.$schedulePlayerSectionGeometry = function schedulePlayerSectionGeometry() {
      if (r.$playerSectionGeometryFrame) return;
      r.$playerSectionGeometryFrame = window.requestAnimationFrame(r.$syncPlayerSectionGeometry);
    };
window.addEventListener("scroll", r.$schedulePlayerSectionGeometry, { passive: true });
window.addEventListener("resize", r.$schedulePlayerSectionGeometry, { passive: true });
}

function registerPlayerShell1(r) {
r.$renderPlayer = function renderPlayer() {
      r.$syncMusicBarStyle(); r.$syncMusicBarPanelButtons(); r.$syncMusicBarSize();
      r.$syncMusicBarVisualizer(); r.$syncMusicBarWidth(); r.$syncFrostedGlass();
      r.$syncCornerStyle(); r.$syncScrubberStyles();
      r.$schedulePlayerSectionGeometry();
      const pending = pendingPlayerState(r); const { pendingClassicLoading, pendingClassicSeek, pendingClassicTrack, pendingFeedLoading, pendingFeedSeek, pendingFeedState } = pending;
      const nativeDiscover = r.$getDiscoverPlayerState?.();
      const audibleDiscover = nativeDiscover?.control?.getAttribute("aria-label") === "Pause" && !r.$discoverTrackPlaybackActive ? nativeDiscover : null;
      const pendingDiscoverTrack = audibleDiscover?.track || r.$discoverPendingTrack;
      const displayIsPlaying = Boolean(audibleDiscover || runtimeLive.isPlaying);
      const candidateTrack = pendingDiscoverTrack || pendingFeedState?.track || pendingClassicTrack || runtimeLive;
      const presentation = resolvePlayerPresentation(r.$selectedPlayerTrack, candidateTrack,
        runtimeLive.hasPlaybackStarted || pendingDiscoverTrack || pendingFeedLoading || pendingClassicLoading,
        r.$nowPlayingExplicitlyCleared);
      r.$selectedPlayerTrack = presentation.track;
      const displayTrack = presentation.track || candidateTrack;
      const hasCurrentTrack = Boolean(presentation.track);
      if (!hasCurrentTrack && runtimeState.dj.open) {
        runtimeState.dj.open = false;
        runtimeSaveState();
        r.$renderDjTools();
      }
      const playbackLoading = !audibleDiscover && Boolean(pendingDiscoverTrack || presentation.retained || r.$discoverHandoffBusy || r.$discoverSwitchPendingDisable || (runtimeSeamless.enabled && runtimeSeamless.status === "loading") || pendingFeedLoading || pendingClassicLoading); r.$player.classList.toggle("is-playing", hasCurrentTrack && displayIsPlaying && !playbackLoading);
      syncVisualizerFallback(r, playbackLoading);
      r.$playButton.disabled = !hasCurrentTrack || playbackLoading;
      r.$playButton.setAttribute("aria-disabled", String(!hasCurrentTrack || playbackLoading));
      r.$playButton.setAttribute("aria-label", !hasCurrentTrack
        ? "No track selected"
        : playbackLoading ? `Loading ${displayTrack.title || "track"}` : "Play or pause");
      r.$playButton.classList.toggle("is-loading", playbackLoading);
      renderPlayerTrack(r, displayTrack, hasCurrentTrack);
      const playbackRenderState = displayIsPlaying ? "playing" : "paused";
      if (playbackRenderState !== r.$playerPlaybackRenderState) {
        r.$playerPlaybackRenderState = playbackRenderState;
        r.$playButton.replaceChildren(createButtonIcon(displayIsPlaying ? "icon-pause.svg" : "icon-play.svg"));
      }
      const audio = runtimeSeamless.enabled ? null : r.$getAudio();
      syncCustomPlayerButtons(r, runtimeState, displayIsPlaying);
      const duration = pendingDiscoverTrack ? Number(pendingDiscoverTrack.duration) || 0 : pendingFeedLoading
        ? Number(pendingFeedState?.duration) || 0
        : pendingClassicLoading ? Number(pendingClassicTrack?.duration) || 0
        : runtimeSeamless.enabled ? Number(runtimeSeamless.duration) || 0 : Number(audio?.duration) || Number(runtimeLive.duration) || (presentation.retained ? Number(displayTrack.duration) || 0 : 0);
      const currentTime = pendingDiscoverTrack ? 0 : pendingFeedLoading
        ? pendingFeedSeek ? r.$pendingFeedSeekTime !== null ? Number(r.$pendingFeedSeekTime) || 0 : (Number(r.$pendingFeedSeekFraction) || 0) * duration : Number(pendingFeedState?.currentTime) || 0
        : pendingClassicLoading ? pendingClassicSeek ? (Number(r.$classicPagePendingSeekFraction) || 0) * duration : 0
        : runtimeSeamless.enabled ? Number(runtimeSeamless.currentTime) || 0 : Number(audio?.currentTime) || Number(runtimeLive.currentTime) || 0;
      if (!r.$scrubbing && !r.$scrubPreviewActive) {
        const pendingSeekFraction = pendingFeedSeek && r.$pendingFeedSeekFraction !== null ? r.$pendingFeedSeekFraction : pendingClassicSeek ? r.$classicPagePendingSeekFraction : null;
        r.$scrubSlider.value = String(pendingSeekFraction !== null
          ? Math.round(pendingSeekFraction * 1000)
          : duration ? Math.round(Math.max(0, Math.min(1, currentTime / duration)) * 1000) : 0);
        r.$currentTimeLabel.textContent = formatDuration(currentTime); r.$durationLabel.textContent = `−${formatDuration(Math.max(0, duration - currentTime))}`;
      }
      r.$syncScrubVisual();
      r.$refreshScrubWaveform();
      r.$scrubSlider.setAttribute("aria-valuetext", `${formatDuration((Number(r.$scrubSlider.value) / 1000) * duration)} of ${formatDuration(duration)}`);
      r.$scrubControl.classList.toggle("is-empty", !duration);
      r.$scrubControl.classList.toggle("is-pending-seek", pendingFeedSeek || pendingClassicSeek);
      r.$scrubControl.setAttribute("aria-busy", String(playbackLoading));
      r.$scrubDuration = duration;
      const queuedTracks = runtimeState.playlist.length
        ? runtimeState.playlist.length
        : runtimeSeamless.enabled && Array.isArray(runtimeSeamless.queue) && runtimeSeamless.queue.length
        ? runtimeSeamless.queue.length
        : runtimeLive.hasPlaybackStarted
        ? 1 + (Array.isArray(runtimeLive.tracks) ? runtimeLive.tracks.length : 0)
        : 0;
      const showingSavedPlaylists = runtimeState.playlistView === "saved";
      const sectionCount = queuedTracks;
      const sectionIcon = showingSavedPlaylists ? "icon-playlist.svg" : "icon-now-playing.svg";
      r.$nowPlayingButton.dataset.view = showingSavedPlaylists ? "saved" : "current";
      r.$nowPlayingButton.querySelector(".hub-now-playing-icon")?.style.setProperty("--hub-icon", `url('${asset(sectionIcon)}')`);
      r.$nowPlayingButton.querySelector(".hub-now-playing-label").textContent = "Play";
      r.$nowPlayingCount.textContent = String(sectionCount);
      r.$nowPlayingCount.hidden = showingSavedPlaylists || sectionCount === 0;
      r.$nowPlayingButton.setAttribute("aria-label", showingSavedPlaylists
        ? "Playlists"
        : sectionCount ? `Now Playing, ${sectionCount} song${sectionCount === 1 ? "" : "s"}` : "Now Playing");
      r.$nowPlayingButton.title = r.$nowPlayingButton.getAttribute("aria-label");
      const sectionPanelActive = runtimeState.open && runtimeState.activeTab === "playlist";
      r.$nowPlayingButton.classList.toggle("is-active", sectionPanelActive);
      r.$nowPlayingButton.setAttribute("aria-expanded", String(sectionPanelActive)); r.$syncPageCartButtonUi();
      renderPlayerAnalysis(r, hasCurrentTrack);
      syncDjDrawerAnchor(r);
      r.$renderPlayerMoreActions();
    };
r.$setOpen = function setOpen(open) {
      runtimeState.open = open;
      runtimeSaveState(); r.$saveLayoutState();
      r.$render();
      if (open) r.$schedulePlaylistMetadataRefresh(0);
    };
r.$openBandKitCart = function openBandKitCart() {
      r.$closePagePlaylistMenu();
      runtimeState.musicBarRecentPanel = "cart";
      runtimeState.open = true;
      runtimeState.activeTab = "cart";
      runtimeState.cartView = "current";
      runtimeState.selectedSavedCartId = null;
      runtimeSaveState(); r.$saveLayoutState();
      r.$render();
    };
r.$handleNativeHeaderCart = function handleNativeHeaderCart(event) {
      if (!runtimeState.appearance.hideHeaderCart) return;
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
      r.$openBandKitCart();
    };
r.$syncPageDjToolsUi = function syncPageDjToolsUi() {
      for (const button of document.querySelectorAll(".bandcamp-hub-page-dj")) {
        button.classList.toggle("is-active", r.$pageDjOpen);
        button.hidden = runtimeState.djToolsEnabled === false || r.$pageDjOpen;
        button.setAttribute("aria-expanded", String(r.$pageDjOpen));
        button.setAttribute("aria-pressed", String(r.$pageDjOpen));
        button.title = "Show BPM and tempo controls on this page";
        button.setAttribute("aria-label", button.title);
      }
    };
r.$renderPageDjTools = function renderPageDjTools() {
      if (!r.$pageDjHost?.isConnected || !r.$pageDjSurface) return;
      r.$pageDjHost.hidden = runtimeState.djToolsEnabled === false || !r.$pageDjOpen;
      r.$pageDjSurface.replaceChildren();
      if (runtimeState.djToolsEnabled !== false && r.$pageDjOpen) r.$pageDjSurface.append(r.$createPageDjToolsCard());
      r.$syncPageDjToolsUi();
    };
r.$toggleDjTools = function toggleDjTools() { if (runtimeState.djToolsEnabled === false) return;
      runtimeState.dj.open = !runtimeState.dj.open;
      runtimeSaveState(); r.$saveLayoutState();
      r.$renderDjTools();
    };
r.$togglePageDjTools = function togglePageDjTools() { if (runtimeState.djToolsEnabled === false) return;
      r.$pageDjOpen = !r.$pageDjOpen;
      runtimeState.dj.pageOpen = r.$pageDjOpen;
      runtimeSaveState();
      r.$saveLayoutState();
      r.$renderPageDjTools();
    };
r.$parseJsonAttribute = function parseJsonAttribute(element, attribute) {
      try {
        return JSON.parse(element?.getAttribute(attribute) || "null");
      } catch {
        return null;
      }
    };
r.$getBandcampPageData = function getBandcampPageData() {
      const script = document.querySelector("script[data-tralbum]");
      if (!script) return null;
      const tralbum = r.$parseJsonAttribute(script, "data-tralbum");
      const embed = r.$parseJsonAttribute(script, "data-embed");
      if (!tralbum) return null;
      return { tralbum, embed };
    };
r.$getAudio = function getAudio() {
      const all = [...document.querySelectorAll("audio")];
      return all.find((audio) => !audio.paused && !audio.ended) || all[0] || null;
    };
r.$setDjTempo = function setDjTempo(percent) {
      const clamped = Math.max(-runtimeState.dj.range, Math.min(runtimeState.dj.range, Number(percent) || 0));
      runtimeState.dj.rate = Math.round((1 + clamped / 100) * 1000) / 1000;
      if (Math.abs(runtimeState.dj.rate - 1) > 0.001) runtimeState.dj.autoTempo = false;
      r.$applyDjToAudio();
    };
}

function registerPlayerShell2(r) {
r.$applyDjToAudio = function applyDjToAudio(target = r.$getAudio()) {
      if (runtimeSeamless.enabled) {
        void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_DJ, {
          rate: runtimeState.dj.rate,
          preservePitch: runtimeState.dj.preservePitch,
          filterValue: runtimeState.dj.filterValue,
          gainDb: runtimeState.dj.gainDb,
          eqLowDb: runtimeState.dj.eqLowDb,
          eqMidDb: runtimeState.dj.eqMidDb,
          eqHighDb: runtimeState.dj.eqHighDb
        });
        return true;
      }
      if (!target && r.$getDiscoverPlayerState()) {
        r.$pageMediaCommand("setDj", {
          rate: runtimeState.dj.rate,
          preservePitch: runtimeState.dj.preservePitch,
          gainDb: runtimeState.dj.gainDb
        });
        return true;
      }
      if (!target) return false;
      if (Math.abs(target.playbackRate - runtimeState.dj.rate) > 0.001) target.playbackRate = runtimeState.dj.rate;
      target.defaultPlaybackRate = runtimeState.dj.rate;
      if ("preservesPitch" in target) target.preservesPitch = runtimeState.dj.preservePitch;
      if ("webkitPreservesPitch" in target) target.webkitPreservesPitch = runtimeState.dj.preservePitch;
      target.volume = runtimeState.dj.gainDb <= -30 ? 0 : Math.min(1, Math.pow(10, runtimeState.dj.gainDb / 20));
      return true;
    };
r.$itemFromNode = function itemFromNode(node) {
      if (!node) return null;
      const title = node.dataset.title || node.dataset.albumtitle || r.$elementText(node, [".track-title", ".release-title", ".title", ".heading", "h3", "h4"]);
      if (!title) return null;
      const pageUrl = node.querySelector("a[href*='bandcamp.com'], a[href^='/']")?.href || location.href;
      return {
        title,
        artist: (node.dataset.artist || r.$elementText(node, [".artist", ".by-artist", ".band-name", ".subtitle", ".subhead"])).replace(/^by\s+/i, "") || "Bandcamp",
        art: node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || runtimeLive.art,
        pageUrl,
        artistUrl: r.$artistUrlFromPageUrl(pageUrl)
      };
    };
r.$modernPlayerSourceContext = function modernPlayerSourceContext(player, key) {
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
    };
r.$modernReleasePageUrl = function modernReleasePageUrl(value) {
      const safeUrl = safeBandcampReleaseUrl(value);
      if (!safeUrl) return "";
      try {
        return /^\/(?:album|track)\/[^/]+/.test(new URL(safeUrl).pathname) ? safeUrl : "";
      } catch {
        return "";
      }
    };
r.$modernTrackPageUrl = function modernTrackPageUrl(node, sourceContext) {
      const scopes = [node, node.closest("li"), sourceContext].filter(Boolean);
      for (const scope of scopes) {
        const metadataNode = scope.matches?.("[data-item-json]") ? scope : scope.querySelector?.("[data-item-json]");
        const itemData = r.$parseJsonAttribute(metadataNode, "data-item-json") || {};
        const attributeUrl = itemData.item_url
          || node.getAttribute("data-track-url")
          || node.getAttribute("trackurl")
          || node.getAttribute("data-item-url")
          || node.getAttribute("itemurl");
        const resolvedAttributeUrl = r.$modernReleasePageUrl(attributeUrl);
        if (resolvedAttributeUrl) return resolvedAttributeUrl;
        for (const link of scope.querySelectorAll?.("a[href]") || []) {
          const resolvedLink = r.$modernReleasePageUrl(link.href);
          if (resolvedLink) return resolvedLink;
        }
      }
      return r.$modernReleasePageUrl(location.href);
    };
r.$modernTrackArtistUrl = function modernTrackArtistUrl(node, pageUrl) {
      for (const scope of [node, node.closest("li")].filter(Boolean)) {
        for (const link of scope.querySelectorAll?.("a[href]") || []) {
          const identifiesArtist = link.querySelector?.(".artist-name")
            || /^by\s+/i.test(String(link.textContent || "").trim());
          if (!identifiesArtist) continue;
          const artistUrl = safeBandcampUrl(link.href);
          if (!artistUrl || r.$modernReleasePageUrl(artistUrl)) continue;
          return artistUrl;
        }
      }
      return r.$artistUrlFromPageUrl(pageUrl);
    };
r.$getModernPlaylistSeed = function getModernPlaylistSeed(key = "") {
      const page = document.querySelector("#PlaylistPage[data-blob]");
      const payload = r.$parseJsonAttribute(page, "data-blob");
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
    };
r.$modernPlaylistTrack = function modernPlaylistTrack(item, playlistTitle, sourceIndex) {
      if (!item || !r.$isReusableStreamUrl(item.streamUrl)) return null;
      const artId = Number(item.artId || item.album?.artId);
      const pageUrl = r.$modernReleasePageUrl(item.url || item.album?.url) || safeBandcampUrl(item.url || item.album?.url);
      const artistUrl = safeBandcampUrl(item.bandUrl) || r.$artistUrlFromPageUrl(pageUrl);
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
    };
r.$loadModernPlaylistQueue = async function loadModernPlaylistQueue(modern) {
      const seed = modern?.playlistSeed;
      if (!seed) return {
        queue: modern?.queue || [],
        sourceToQueue: new Map((modern?.queue || []).map((_, index) => [index, index]))
      };
      const cacheKey = `${seed.itemId}|${seed.tracks[0]?.streamUrl || ""}`;
      if (!r.$modernPlaylistQueueCache.has(cacheKey)) {
        r.$modernPlaylistQueueCache.set(cacheKey, (async () => {
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
      const sourceTracks = await r.$modernPlaylistQueueCache.get(cacheKey);
      const queue = [];
      const sourceToQueue = new Map();
      sourceTracks.forEach((item, sourceIndex) => {
        const track = r.$modernPlaylistTrack(item, seed.title, sourceIndex);
        if (!track) return;
        sourceToQueue.set(sourceIndex, queue.length);
        queue.push(track);
      });
      return { queue, sourceToQueue };
    };
}

export const registerPlayerShell = [registerPlayerPresentation, registerPlayerShell1, registerPlayerShell2, ...registerPlayerHandoffs];
