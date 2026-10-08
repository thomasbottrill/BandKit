import { createMusicBar } from "../components/music-bar.js";
import { createPanelShell } from "../components/panel-shell.js";
import { runtimeSeamless } from "./context.js";
import { asset } from "../core.js";
import { normalizeBridgedCart } from "../cart-model.js";

function setupRuntimeMediaBridge(r) {
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
document.addEventListener("bandkit:feed-track-state", (event) => {
      const tracks = Array.isArray(event.detail?.tracks) ? event.detail.tracks : [];
      for (const track of tracks) {
        const trackId = String(track?.trackId || "");
        if (!trackId || !r.$isReusableStreamUrl(track?.url)) continue;
        const known = r.$feedStreams.get(trackId);
        r.$feedStreams.set(trackId, {
          url: String(track.url),
          resolvedUrl: known?.url === String(track.url) ? known.resolvedUrl || "" : "",
          duration: Number(track.duration) || 0
        });
      }
    });
document.addEventListener("bandkit:cart-availability", (event) => {
      r.$pageCartAvailable = event.detail?.available === true;
      r.$pageCartPresent = event.detail?.present === true;
    });
document.addEventListener("bandkit:cart-state", (event) => {
      const bridged = normalizeBridgedCart(event.detail);
      if (!bridged) return;
      r.$bridgedCart = bridged.items;
      r.$bridgedCartSummary = bridged.summary;
      r.$scanLiveCart();
    });
r.$pageMediaCommand("getState");
r.$pageCartCommand("getAvailability");
}

function setupRuntimeElements(r) {
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
r.$panel = createPanelShell();
const musicBar = createMusicBar();
r.$player = musicBar.player;
r.$player.dataset.themeReady = "false";
r.$djDrawer = musicBar.djDrawer;
r.$headerShortcuts = musicBar.headerShortcuts;
r.$playerSections = musicBar.playerSections;
r.$shadow.append(r.$launcher, r.$panel, r.$player, r.$djDrawer);
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
r.$playerVisualizer = r.$player.querySelector(".hub-player-visualizer");
r.$playerSpectrum = r.$player.querySelector(".hub-player-spectrum");
r.$playerArtLink = r.$player.querySelector(".hub-player-art-link");
r.$playerTrack = r.$player.querySelector(".hub-player-track");
r.$playerTitle = r.$player.querySelector(".hub-player-title");
r.$playerArtist = r.$player.querySelector(".hub-player-artist"); r.$playerAlbum = r.$player.querySelector(".hub-player-album");
r.$playButton = r.$player.querySelector(".hub-play-button");
r.$playerMoreButton = r.$player.querySelector(".hub-player-more-button");
r.$playerMoreMenu = r.$player.querySelector(".hub-player-more-menu");
r.$nowPlayingButton = r.$player.querySelector(".hub-now-playing-button");
r.$nowPlayingCount = r.$player.querySelector(".hub-now-playing-count");
r.$playerAnalysis = r.$player.querySelector(".hub-player-analysis");
r.$playerBpmBadge = r.$player.querySelector(".hub-player-bpm-badge");
r.$playerKeyBadge = r.$player.querySelector(".hub-player-key-badge");
r.$playerKeyCamelot = r.$player.querySelector(".hub-player-key-camelot");
r.$playerKeyName = r.$player.querySelector(".hub-player-key-name");
r.$djPlayerButton = r.$player.querySelector(".hub-dj-player-button");
r.$headerCloseButton = r.$panel.querySelector(".hub-close");
r.$headerResetButton = r.$panel.querySelector(".hub-reset");
r.$layoutToggleButton = r.$panel.querySelector(".hub-layout-toggle");
}

export const setupRuntimeDomShell = [setupRuntimeMediaBridge, setupRuntimeElements];
