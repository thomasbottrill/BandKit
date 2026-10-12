import { interfaceScale, scaleRect } from "../scale.js";
import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState, updateRuntimeLive } from "./context.js";
import { portableBandcampUrl, resolvedTrackPageUrl } from "../core.js";
import { radioShowTracklistKey } from "../radio-player-model.js";
import { MESSAGES } from "../../shared/contracts.js";
import { bindDockChevron } from "./dock-chevron.js";

function registerLiveScanning1(r) {
r.$visibleNativePurchaseDialog = function visibleNativePurchaseDialog() {
      return [...document.querySelectorAll(".ui-dialog.nu-dialog")].some((dialog) => (
        dialog.getClientRects().length > 0
        && dialog.getAttribute("aria-hidden") !== "true"
        && getComputedStyle(dialog).visibility !== "hidden"
      ));
    };
r.$closePanelForNativePurchaseDialog = function closePanelForNativePurchaseDialog() {
      if (!runtimeState.open || !r.$visibleNativePurchaseDialog()) return false;
      r.$setOpen(false);
      return true;
    };
r.$mutationAddsPageActionSource = function mutationAddsPageActionSource(record) {
      if (!record.addedNodes.length) return false;
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const ownedControls = ".bandcamp-hub-page-playlist, .bandcamp-hub-page-playlist-menu, .bandcamp-hub-page-tools, .bandkit-sales-feed-actions, .bandkit-track-analysis, .bandkit-page-scrub-control";
      if (target?.closest(ownedControls)) return false;
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) {
          if (target?.closest(r.$pageActionSourceSelector)) return true;
          continue;
        }
        if (node.matches(ownedControls)) continue;
        if (node.matches(r.$pageActionSourceSelector) || node.querySelector(r.$pageActionSourceSelector)) return true;
        if (target?.closest(r.$pageActionSourceSelector)) return true;
      }
      return false;
    };
r.$observePageActionSources = function observePageActionSources() {
      if (r.$pageActionsObserver || typeof MutationObserver !== "function") return;
      r.$pageActionsObserver = new MutationObserver((records) => {
        if (r.$closePanelForNativePurchaseDialog()) return;
        if (!records.some(r.$mutationAddsPageActionSource)) return;
        r.$pageActionsDirty = true;
        r.$scheduleLivePlayerMaintenance(120);
      });
      r.$pageActionsObserver.observe(document.body, { childList: true, subtree: true });
    };
r.$scheduleLivePlayerMaintenance = function scheduleLivePlayerMaintenance(delay = 7000) {
      window.clearTimeout(r.$scanTimer);
      if (r.$scanIdleCallback && "cancelIdleCallback" in window) window.cancelIdleCallback(r.$scanIdleCallback);
      r.$scanIdleCallback = 0;
      r.$scanTimer = window.setTimeout(() => {
        r.$scanTimer = 0;
        if (document.hidden) {
          r.$scheduleLivePlayerMaintenance();
          return;
        }
        if (Date.now() - r.$lastPageScrollAt < 450) {
          r.$scheduleLivePlayerMaintenance(700);
          return;
        }
        const run = () => {
          r.$scanIdleCallback = 0;
          if (document.hidden) {
            r.$scheduleLivePlayerMaintenance();
            return;
          }
          if (Date.now() - r.$lastPageScrollAt < 450) {
            r.$scheduleLivePlayerMaintenance(700);
            return;
          }
          r.$scanLivePlayer();
          if (!r.$scanTimer && !r.$scanIdleCallback) r.$scheduleLivePlayerMaintenance();
        };
        if ("requestIdleCallback" in window) {
          r.$scanIdleCallback = window.requestIdleCallback(run, { timeout: 1800 });
        } else {
          r.$scanTimer = window.setTimeout(run, 32);
        }
      }, Math.max(0, delay));
    };
}

function registerLiveScanning2(r) {
r.$scanLivePlayer = function scanLivePlayer() {
      r.$syncNativePlayerMode?.(); r.$syncPageAwareTheme?.();
      r.$scanLiveCart();
      r.$ensurePagePlayerWaveforms(); r.$injectPageDjToolsLink();
      if (r.$pageActionsDirty) r.$injectPlaylistButtons({ incremental: true }); if (!runtimeState.appearance.hideBandcampPlayer) return;
      const data = r.$getBandcampPageData();
      const audio = r.$getAudio();
      for (const candidate of document.querySelectorAll("audio")) {
        if (!runtimeSeamless.enabled) r.$applyDjToAudio(candidate);
        if (r.$observedAudio.has(candidate)) continue;
        r.$observedAudio.add(candidate);
        candidate.addEventListener("play", async () => {
          if (!runtimeState.appearance.hideBandcampPlayer) return;
          if (r.$nowPlayingExplicitlyCleared) {
            candidate.pause();
            return;
          }
          if (document.documentElement.dataset.bandkitCollectionPage === "true" && Date.now() < r.$collectionNativeFallbackUntil) {
            r.$scanLivePlayer();
            return;
          }
          const requestedFeedTrackId = r.$pendingFeedTrackId;
          const feedState = r.$getFeedPlayerState(requestedFeedTrackId);
          const feedStateTrackId = String(feedState?.track?.id || "");
          if (feedStateTrackId
            && feedStateTrackId === r.$feedNativeFallbackTrackId
            && Date.now() < r.$feedNativeFallbackUntil) {
            r.$restoreFeedAudioMute(feedStateTrackId);
            return;
          }
          if (feedState && r.$feedSwitchPendingDisable) {
            if (requestedFeedTrackId) r.$scheduleFeedHandoff(requestedFeedTrackId);
            return;
          }
          const sameSeamlessFeedTrack = Boolean(feedState?.track
            && runtimeSeamless.enabled
            && r.$matchingQueueTrack([runtimeSeamless.track], feedState.track));
          if (sameSeamlessFeedTrack) {
            if (!r.$pendingFeedTrackId && !candidate.paused) candidate.pause();
            return;
          }
          if (feedState?.track) {
            const feedTrackId = String(requestedFeedTrackId || feedState.track.id || "");
            r.$muteFeedAudioForHandoff(feedTrackId);
            r.$scheduleFeedHandoff(feedTrackId);
            return;
          }
          const tookOver = await r.$handoffPageAudio(candidate);
          if (!tookOver) {
            if (requestedFeedTrackId) r.$scheduleFeedHandoff(requestedFeedTrackId);
            else r.$scanLivePlayer();
          }
        });
        candidate.addEventListener("pause", r.$scanLivePlayer);
        candidate.addEventListener("ended", r.$scanLivePlayer);
        candidate.addEventListener("timeupdate", () => {
          if (!runtimeSeamless.enabled && candidate.duration) {
            runtimeLive.progress = candidate.currentTime / candidate.duration;
            r.$renderPlayer();
          }
        });
      }

      const modern = r.$getModernPlayerState();
      const discover = r.$getDiscoverPlayerState();
      const feed = r.$getFeedPlayerState(r.$pendingFeedTrackId);
      const sameModernTrack = Boolean(modern?.track && runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], modern.track));
      const radioHandoffReady = !r.$radioHandoffKey || modern?.key === r.$radioHandoffKey;
      if (modern?.isPlaying && !sameModernTrack && radioHandoffReady) {
        r.$radioHandoffKey = "";
        r.$scheduleModernHandoff(modern.key, modern.index);
      } else if (modern?.isPlaying && sameModernTrack) {
        r.$stopModernPagePlayer();
      }

      if (discover?.isPlaying) {
        r.$renderPlayer();
        r.$syncPagePlayerUi();
        const sameDiscoverTrack = Boolean(runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], discover.track));
        if ((r.$discoverTrackPlaybackActive || r.$playlistPlaybackStarting || r.$playlistIsActive()) && !r.$discoverSwitchPendingDisable) {
          r.$pageMediaCommand("pause");
        } else if (sameDiscoverTrack) {
          r.$pageMediaCommand("pause");
        } else if (r.$isReusableStreamUrl(discover.track?.url)) {
          void r.$handoffDiscoverPlayer();
          return;
        } else if (runtimeSeamless.enabled) {
          void r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
          window.setTimeout(r.$scanLivePlayer, 120);
          return;
        }
      }

      if (feed?.isPlaying) {
        const sameFeedTrack = Boolean(runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], feed.track));
        if (sameFeedTrack) {
          if (r.$pendingFeedTrackId) return;
          const feedAudio = r.$getAudio();
          if (feedAudio && !feedAudio.paused) feedAudio.pause();
        } else if (r.$isReusableStreamUrl(feed.track?.url)) {
          const feedTrackId = String(r.$pendingFeedTrackId || feed.track.id || "");
          r.$muteFeedAudioForHandoff(feedTrackId);
          r.$scheduleFeedHandoff(feedTrackId);
          return;
        } else if (runtimeSeamless.enabled) {
          void r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
          window.setTimeout(r.$scanLivePlayer, 120);
          return;
        }
      }

      if (runtimeSeamless.enabled) {
        r.$syncPagePlayerUi();
        r.$renderPlayer();
        return;
      }

      if (r.$nowPlayingExplicitlyCleared) {
        r.$resetLoadedPlayback();
        r.$renderPlayer();
        if (r.$isNowPlayingView() && !(r.$shadow.activeElement && r.$content.contains(r.$shadow.activeElement))) {
          r.$renderPanelContent();
        }
        return;
      }

      if (!data && !audio && !modern && !discover && !feed && !r.$getGenericPageItem()) return;
      const inlineTitle = document.querySelector(".inline_player .title")?.textContent?.trim();
      const activeRow = document.querySelector(".track_row_view .play_status.playing, .track_row_view.playing, .track_row_view.current");
      const rowTitle = activeRow?.querySelector(".track-title")?.textContent?.trim();
      const tracks = modern?.queue || (data?.tralbum?.trackinfo || []).map((track) => ({
        title: track.title,
        artist: track.artist || data.tralbum.artist || data.embed?.artist || "Bandcamp",
        id: String(track.track_id || track.id || track.title),
        pageUrl: r.$individualTrackPageUrl(track) || resolvedTrackPageUrl(track) || location.href,
        artistUrl: r.$artistUrlFromPageUrl(location.href)
      }));
      const genericItem = r.$getGenericPageItem();
      const currentTitle = modern?.track?.title || discover?.track?.title || feed?.track?.title || inlineTitle || rowTitle || genericItem?.title || runtimeLive.title;
      const artist = discover?.track?.artist || feed?.track?.artist || data?.tralbum?.artist || data?.embed?.artist || genericItem?.artist || runtimeLive.artist;
      const artUrl = discover?.track?.art || feed?.track?.art || genericItem?.art || document.querySelector('meta[property="og:image"]')?.content || document.querySelector("#tralbumArt img")?.src || runtimeLive.art;
      const currentIndex = modern ? modern.index : Math.max(0, tracks.findIndex((track) => track.title === currentTitle));
      const isPlaying = Boolean(modern?.isPlaying || discover?.isPlaying || feed?.isPlaying || (audio && !audio.paused && !audio.ended));
      const currentTime = modern?.currentTime ?? discover?.currentTime ?? feed?.currentTime ?? (Number(audio?.currentTime) || 0);
      r.$live = updateRuntimeLive({
        ...runtimeLive,
        available: Boolean(data || audio || modern || discover || feed || genericItem),
        isPlaying,
        hasPlaybackStarted: Boolean(runtimeLive.hasPlaybackStarted || isPlaying || Number(currentTime) > 0),
        title: currentTitle,
        artist,
        art: artUrl,
        pageUrl: modern?.track?.pageUrl || discover?.track?.pageUrl || feed?.track?.pageUrl || tracks[currentIndex]?.pageUrl || genericItem?.pageUrl || location.href,
        artistUrl: modern?.track?.artistUrl || discover?.track?.artistUrl || feed?.track?.artistUrl || genericItem?.artistUrl || r.$artistUrlFromPageUrl(location.href),
        currentTime,
        duration: modern?.duration ?? discover?.duration ?? feed?.duration ?? (Number(audio?.duration) || 0),
        progress: modern?.duration ? modern.currentTime / modern.duration
          : discover ? discover.progress
          : feed ? feed.progress
          : audio?.duration ? audio.currentTime / audio.duration
          : runtimeLive.progress,
        tracks: tracks.slice(currentIndex + 1)
      });

      if (runtimeLive.isPlaying) r.$recordListeningActivity();
      r.$renderPlayer();
      if (r.$isNowPlayingView() && !(r.$shadow.activeElement && r.$content.contains(r.$shadow.activeElement))) {
        r.$renderPanelContent();
      }
    };
r.$recordActivity = function recordActivity(item, { persist = true, render = true } = {}) {
      if (!r.$activityFeatureEnabled()) return;
      const createdAt = item?.createdAt || new Date().toISOString();
      runtimeState.activity.unshift({
        id: item?.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: String(item?.action || "activity"),
        title: String(item?.title || "Bandkit activity"),
        artist: String(item?.artist || ""),
        time: item?.time || "Just now · recorded locally",
        createdAt,
        art: item?.art || "",
        url: portableBandcampUrl(item?.url, true),
        artistUrl: portableBandcampUrl(item?.artistUrl),
        destination: String(item?.destination || "").slice(0, 120)
      });
      runtimeState.activity = runtimeState.activity.slice(0, 500);
      if (persist) runtimeSaveState();
      if (render && runtimeState.activeTab === "activity") r.$render();
    };
r.$recordListeningActivity = function recordListeningActivity() {
      const activityUrl = runtimeSeamless.track?.pageUrl || runtimeLive.pageUrl || location.href;
      const key = `${activityUrl}|${runtimeLive.title}`;
      if (key === r.$lastRecordedTrack) return;
      r.$lastRecordedTrack = key;
      r.$recordActivity({
        action: "listened",
        title: runtimeLive.title,
        artist: runtimeLive.artist,
        time: "Just now · recorded locally",
        createdAt: new Date().toISOString(),
        art: runtimeLive.art,
        url: portableBandcampUrl(activityUrl, true),
        artistUrl: portableBandcampUrl(runtimeSeamless.track?.artistUrl || runtimeLive.artistUrl || r.$artistUrlFromPageUrl(activityUrl))
      });
    };
}

function registerLiveScanning3(r) {
r.$setResizeCursor = function setResizeCursor(cursor, activeHandle = null) {
      r.$resizeCursorStyle?.remove();
      r.$resizeCursorStyle = null;
      const panelResizing = Boolean(cursor) && activeHandle?.classList.contains("hub-resize-handle");
      const playerResizing = Boolean(cursor) && activeHandle?.classList.contains("hub-player-resize-handle");
      r.$panel.classList.toggle("is-resizing", panelResizing);
      r.$panel.classList.toggle("is-player-resizing", playerResizing);
      r.$player.classList.toggle("is-resizing", playerResizing);
      for (const handle of r.$panel.querySelectorAll(".hub-resize-handle")) handle.classList.toggle("is-active", handle === activeHandle);
      for (const handle of r.$player.querySelectorAll(".hub-player-resize-handle")) handle.classList.toggle("is-active", handle === activeHandle);
      if (!cursor) return;
      r.$resizeCursorStyle = document.createElement("style");
      r.$resizeCursorStyle.textContent = `html, html * { cursor: ${cursor} !important; user-select: none !important; }`;
      document.head.append(r.$resizeCursorStyle);
    };
r.$beginScrub = function beginScrub(newInteraction = false) {
      if (newInteraction || !r.$scrubbing) r.$scrubRevision += 1;
      r.$scrubbing = true;
      window.clearTimeout(r.$scrubReleaseTimer);
    };
}

export const registerLiveScanning = [registerLiveScanning1, registerLiveScanning2, registerLiveScanning3];

function setupLiveScanning1(r) {
r.$launcher.addEventListener("pointerdown", (event) => {
      if (r.$launcher.classList.contains("is-header")) return;
      if (event.button !== 0) return;
      const rect = r.$launcher.getBoundingClientRect();
      r.$launcherDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false
      };
      r.$launcher.classList.add("is-dragging");
      try { r.$launcher.setPointerCapture(event.pointerId); } catch {}
      const move = (moveEvent) => {
        if (!r.$launcherDrag || moveEvent.pointerId !== r.$launcherDrag.pointerId) return;
        const deltaX = moveEvent.clientX - r.$launcherDrag.startX;
        const deltaY = moveEvent.clientY - r.$launcherDrag.startY;
        if (!r.$launcherDrag.moved && Math.hypot(deltaX, deltaY) < 3) return;
        r.$launcherDrag.moved = true;
        moveEvent.preventDefault();
        const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, r.$launcherDrag.left + deltaX));
        const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, r.$launcherDrag.top + deltaY));
        r.$launcher.style.left = `${left}px`;
        r.$launcher.style.right = "auto";
        r.$launcher.style.top = `${top}px`;
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
        window.removeEventListener("blur", finish, true);
      };
      const finish = (finishEvent) => {
        if (!r.$launcherDrag || (finishEvent?.pointerId !== undefined && finishEvent.pointerId !== r.$launcherDrag.pointerId)) return;
        const moved = r.$launcherDrag.moved;
        const pointerId = r.$launcherDrag.pointerId;
        r.$launcherDrag = null;
        cleanup();
        r.$launcher.classList.remove("is-dragging");
        try { r.$launcher.releasePointerCapture(pointerId); } catch {}
        if (!moved) return;
        const finalRect = r.$launcher.getBoundingClientRect();
        runtimeState.launcherPosition = { left: Math.round(finalRect.left), top: Math.round(finalRect.top) };
        r.$suppressLauncherClick = finishEvent?.type === "pointerup";
        runtimeSaveState();
        r.$saveLayoutState();
      };
      window.addEventListener("pointermove", move, { capture: true, passive: false });
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", finish, true);
      window.addEventListener("blur", finish, true);
    });
document.addEventListener("click", r.$handleNativeHeaderCart, true);
r.$launcher.addEventListener("click", (event) => {
      if (r.$suppressLauncherClick) {
        r.$suppressLauncherClick = false;
        event.preventDefault();
        return;
      }
      r.$setOpen(!runtimeState.open);
    });
r.$headerCloseButton.addEventListener("click", (event) => {
      // A pointer close should leave the music bar at rest. If the close button
      // remains focused, render() restores that focus to the panel launcher and
      // :focus-within keeps the transport replacing the artwork. Preserve the
      // normal focus return for keyboard activation only.
      if (event.detail !== 0) r.$headerCloseButton.blur();
      r.$setOpen(false);
    });
r.$headerResetButton.addEventListener("click", () => {
      if (runtimeState.layoutMode === "docked") r.$setOpen(false);
      else r.$resetPanelLayout();
    });
r.$layoutToggleButton.addEventListener("click", r.$toggleLayoutMode);
r.$panelHeader.addEventListener("pointerdown", (event) => {
      const uiScale = interfaceScale(runtimeState.appearance);
      if (r.$panel.classList.contains("is-contextual") || runtimeState.layoutMode === "docked" || event.button !== 0 || event.target.closest("button, a, input, select")) return;
      const rect = scaleRect(r.$panel.getBoundingClientRect(), uiScale);
      if (![(event.clientX / uiScale), (event.clientY / uiScale), rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return;
      r.$dragging = {
        pointerId: event.pointerId,
        startX: (event.clientX / uiScale),
        startY: (event.clientY / uiScale),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
      r.$panel.style.left = `${rect.left}px`;
      r.$panel.style.right = "auto";
      r.$panel.style.top = `${rect.top}px`;
      r.$panel.style.bottom = "auto";
      r.$panel.style.width = `${rect.width}px`;
      r.$panel.style.height = `${rect.height}px`;
      r.$panelHeader.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
r.$panelHeader.addEventListener("pointermove", (event) => {
      const uiScale = interfaceScale(runtimeState.appearance);
      if (!r.$dragging || event.pointerId !== r.$dragging.pointerId) return;
      if (![(event.clientX / uiScale), (event.clientY / uiScale)].every(Number.isFinite)) return;
      const maxLeft = Math.max(8, (window.innerWidth / uiScale) - r.$dragging.width - 8);
      const maxTop = Math.max(8, (window.innerHeight / uiScale) - r.$dragging.height - 8);
      const left = Math.max(8, Math.min(maxLeft, r.$dragging.left + (event.clientX / uiScale) - r.$dragging.startX));
      const top = Math.max(8, Math.min(maxTop, r.$dragging.top + (event.clientY / uiScale) - r.$dragging.startY));
      r.$panel.style.left = `${left}px`;
      r.$panel.style.top = `${top}px`;
      r.$schedulePlayerSectionGeometry();
    });
r.$finishDrag = (event) => {
      if (!r.$dragging || event.pointerId !== r.$dragging.pointerId) return;
      r.$dragging = null;
      r.$capturePanelLayout();
    };
r.$panelHeader.addEventListener("pointerup", r.$finishDrag);
r.$panelHeader.addEventListener("pointercancel", r.$finishDrag);
}

function bindFloatingPlayerResize(r) {
  const handles = ["left", "right"].map((edge) => {
    const handle = document.createElement("div");
    handle.className = `hub-player-resize-handle is-${edge}`;
    handle.dataset.edge = edge;
    handle.setAttribute("aria-hidden", "true");
    r.$player.append(handle);
    return handle;
  });
  let resizing = null;
  let resizeFrame = 0;
  const applyResizeWidth = (activeResize = resizing) => {
    if (!activeResize || !Number.isFinite(activeResize.pendingCustomWidth)) return;
    runtimeState.musicBarWidth = "custom";
    runtimeState.musicBarCustomWidth = activeResize.pendingCustomWidth;
    r.$syncMusicBarWidth();
    r.$schedulePlayerSectionGeometry();
  };
  const scheduleResizeWidth = () => {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      applyResizeWidth();
    });
  };
  const syncWidthSetting = () => r.$syncMusicBarWidthSetting?.();
  const finishResize = (event) => {
    if (!resizing || (event?.pointerId !== undefined && event.pointerId !== resizing.pointerId)) return;
    const activeResize = resizing;
    const { handle, moved, pointerId } = activeResize;
    if (resizeFrame) {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
    }
    applyResizeWidth(activeResize);
    resizing = null;
    r.$setResizeCursor("");
    try { handle.releasePointerCapture(pointerId); } catch {}
    if (!moved) return;
    syncWidthSetting();
    runtimeSaveState();
    window.requestAnimationFrame(() => r.$refreshScrubWaveform(true));
    r.$showToast(`Custom music bar width set to ${runtimeState.musicBarCustomWidth}px`);
  };

  for (const handle of handles) {
    handle.addEventListener("pointerdown", (event) => {
      const uiScale = interfaceScale(runtimeState.appearance);
      if (event.button !== 0) return;
      const rect = scaleRect(r.$player.querySelector(".hub-player-content")?.getBoundingClientRect(), uiScale);
      if (!rect) return;
      if (![(event.clientX / uiScale), rect.width].every(Number.isFinite)) return;
      resizing = {
        handle,
        edge: handle.dataset.edge,
        pointerId: event.pointerId,
        startX: (event.clientX / uiScale),
        width: rect.width,
        // Docked content is centred, so the widening timeline eats the same
        // space on both sides. Reserve the chevron's resting slot on each side
        // so the bar stops growing before it reaches the menu.
        reservedWidth: runtimeState.musicBarStyle === "docked" ? 112 : 0,
        pendingCustomWidth: runtimeState.musicBarCustomWidth,
        moved: false
      };
      r.$setResizeCursor("ew-resize", handle);
      try { handle.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      const uiScale = interfaceScale(runtimeState.appearance);
      if (!resizing || resizing.handle !== handle || event.pointerId !== resizing.pointerId || !Number.isFinite((event.clientX / uiScale))) return;
      const deltaX = (event.clientX / uiScale) - resizing.startX;
      if (!resizing.moved && Math.abs(deltaX) < 1) return;
      resizing.moved = true;
      const minShellWidth = 480 + resizing.reservedWidth;
      const maxShellWidth = Math.max(minShellWidth, Math.min(2000 + resizing.reservedWidth, (window.innerWidth / uiScale) - 24));
      const direction = resizing.edge === "left" ? -1 : 1;
      const requestedWidth = resizing.width + resizing.reservedWidth + deltaX * direction * 2;
      const shellWidth = Math.max(minShellWidth, Math.min(maxShellWidth, requestedWidth));
      resizing.pendingCustomWidth = Math.round(shellWidth - resizing.reservedWidth);
      scheduleResizeWidth();
      event.preventDefault();
    });

    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
    handle.addEventListener("lostpointercapture", finishResize);
  }
}

function setupLiveScanning2(r) {
bindDockChevron(r);
bindFloatingPlayerResize(r);
for (const handle of r.$panel.querySelectorAll(".hub-resize-handle")) {
      let resizing = null;
      handle.addEventListener("pointerdown", (event) => {
      const uiScale = interfaceScale(runtimeState.appearance);
        const pinnedContextualResize = r.$panel.classList.contains("is-contextual") && handle.dataset.edge === "top";
        if (r.$panel.classList.contains("is-contextual") && !pinnedContextualResize) return;
        const dockedEdge = runtimeState.dockSide === "left" ? "right" : "left";
        if (event.button !== 0 || (runtimeState.layoutMode === "docked" && handle.dataset.edge !== dockedEdge)) return;
        const rect = scaleRect(r.$panel.getBoundingClientRect(), uiScale);
        resizing = {
          pointerId: event.pointerId,
          startX: (event.clientX / uiScale),
          startY: (event.clientY / uiScale),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          pinnedContextual: pinnedContextualResize
        };
        if (runtimeState.layoutMode !== "docked" && !pinnedContextualResize) {
          r.$panel.style.left = `${rect.left}px`;
          r.$panel.style.right = "auto";
          r.$panel.style.top = `${rect.top}px`;
          r.$panel.style.bottom = "auto";
          r.$panel.style.height = `${rect.height}px`;
        }
        if (!pinnedContextualResize) r.$panel.style.width = `${rect.width}px`;
        r.$setResizeCursor(["top", "bottom"].includes(handle.dataset.edge) ? "ns-resize" : "ew-resize", handle);
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      handle.addEventListener("pointermove", (event) => {
      const uiScale = interfaceScale(runtimeState.appearance);
        if (!resizing || event.pointerId !== resizing.pointerId) return;
        const minWidth = 320;
        const minHeight = 520;
        if (resizing.pinnedContextual) {
          const requestedHeight = resizing.height - ((event.clientY / uiScale) - resizing.startY);
          const availableHeight = Math.max(220, resizing.bottom - 16);
          const height = Math.max(220, Math.min(availableHeight, requestedHeight));
          runtimeState.sectionPanelHeight = Math.round(height);
          r.$panel.style.setProperty("--hub-section-panel-height", `${height}px`);
          r.$schedulePlayerSectionGeometry();
          return;
        }
        if (runtimeState.layoutMode === "docked") {
          const deltaX = (event.clientX / uiScale) - resizing.startX;
          const requestedWidth = runtimeState.dockSide === "left" ? resizing.width + deltaX : resizing.width - deltaX;
          const dockedWidth = Math.max(minWidth, Math.min((window.innerWidth / uiScale), requestedWidth));
          r.$panel.style.width = `${dockedWidth}px`;
          runtimeState.dockedWidth = Math.round(dockedWidth);
          r.$schedulePlayerSectionGeometry();
          return;
        }
        if (handle.dataset.edge === "left") {
          const left = Math.max(8, Math.min(resizing.right - minWidth, resizing.left + (event.clientX / uiScale) - resizing.startX));
          r.$panel.style.left = `${left}px`;
          r.$panel.style.width = `${resizing.right - left}px`;
        } else if (handle.dataset.edge === "right") {
          const width = Math.max(minWidth, Math.min((window.innerWidth / uiScale) - resizing.left - 8, resizing.width + (event.clientX / uiScale) - resizing.startX));
          r.$panel.style.width = `${width}px`;
        } else if (handle.dataset.edge === "top") {
          const top = Math.max(8, Math.min(resizing.bottom - minHeight, resizing.top + (event.clientY / uiScale) - resizing.startY));
          r.$panel.style.top = `${top}px`;
          r.$panel.style.height = `${resizing.bottom - top}px`;
        } else if (handle.dataset.edge === "bottom") {
          const height = Math.max(minHeight, Math.min((window.innerHeight / uiScale) - resizing.top - 8, resizing.height + (event.clientY / uiScale) - resizing.startY));
          r.$panel.style.height = `${height}px`;
        }
        r.$schedulePlayerSectionGeometry();
      });
      const finishResize = (event) => {
        if (!resizing || event.pointerId !== resizing.pointerId) return;
        resizing = null;
        r.$setResizeCursor("");
        if (runtimeState.layoutMode === "docked") {
          runtimeSaveState();
          r.$saveLayoutState();
        }
        else if (r.$panel.classList.contains("is-contextual")) runtimeSaveState();
        else r.$capturePanelLayout();
      };
      handle.addEventListener("pointerup", finishResize);
      handle.addEventListener("pointercancel", finishResize);
      handle.addEventListener("lostpointercapture", (event) => {
        if (!resizing || event.pointerId !== resizing.pointerId) return;
        resizing = null;
        r.$setResizeCursor("");
        if (runtimeState.layoutMode === "docked") {
          runtimeSaveState();
          r.$saveLayoutState();
        }
        else if (r.$panel.classList.contains("is-contextual")) runtimeSaveState();
        else r.$capturePanelLayout();
      });
    }
const feedIntent = (event) => {
      if (!(event.target instanceof Element)) return;
      if (!document.body.classList.contains("feed") && !/\/feed\/?$/.test(location.pathname)) return;
      const control = event.target.closest(".track_play_auxiliary");
      const trackId = control?.dataset.trackid || control?.closest("[data-trackid]")?.dataset.trackid || "";
      // Hovering or focusing a story is the earliest reliable sign it is about
      // to be played, so resolve its stream while the pointer is still moving.
      if (trackId) void r.$prefetchFeedStream(trackId);
    };
document.addEventListener("pointerover", feedIntent, true);
document.addEventListener("focusin", feedIntent, true);
document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const onFeedPage = document.body.classList.contains("feed") || /\/feed\/?$/.test(location.pathname);
      const feedControl = onFeedPage ? event.target.closest(".track_play_auxiliary") : null;
      if (!feedControl) return;
      if (!runtimeState.appearance.hideBandcampPlayer) return;
      if (feedControl.closest('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"]')) return;
      const clickedTrackId = String(feedControl.dataset.trackid || feedControl.closest("[data-trackid]")?.dataset.trackid || "");
      if (!clickedTrackId) return;
      if (clickedTrackId === r.$feedNativeFallbackTrackId && Date.now() < r.$feedNativeFallbackUntil) return;
      r.$feedNativeFallbackTrackId = "";
      r.$feedNativeFallbackUntil = 0;
      r.$suppressedFeedTrackId = "";
      r.$releaseExplicitPlaybackClear();
      const storyTracklist = feedControl.closest(".story")?.querySelector(".bandkit-discover-tracklist");
      const storyQueue = (storyTracklist && r.$feedAlbumQueues?.get(storyTracklist)) || [];
      const controlsCurrentSeamlessTrack = Boolean(runtimeSeamless.enabled && (
        clickedTrackId === String(runtimeSeamless.track?.id || "")
        || r.$matchingPagePlaybackTrack?.(storyQueue, runtimeSeamless.track)
      ));
      if (controlsCurrentSeamlessTrack) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (r.$pendingFeedTrackId !== clickedTrackId) {
        r.$pendingFeedSeekTime = null;
        r.$pendingFeedSeekFraction = null;
        r.$pendingFeedSeekTrackId = "";
      }
      r.$pendingFeedTrackId = clickedTrackId;
      const pendingFeed = r.$getFeedPlayerState(clickedTrackId);
      if (pendingFeed?.track) {
        r.$live = updateRuntimeLive({
          ...runtimeLive,
          available: true,
          hasPlaybackStarted: true,
          isPlaying: false,
          title: pendingFeed.track.title,
          artist: pendingFeed.track.artist,
          art: pendingFeed.track.art,
          pageUrl: pendingFeed.track.pageUrl,
          artistUrl: pendingFeed.track.artistUrl,
          currentTime: pendingFeed.currentTime,
          duration: pendingFeed.duration,
          progress: pendingFeed.progress,
          tracks: pendingFeed.queue
        });
      }
      r.$syncFeedPagePlaybackUi();
      r.$renderPlayer();
      void r.$prefetchFeedStream(clickedTrackId);
      r.$muteFeedAudioForHandoff(clickedTrackId);
      r.$scheduleFeedHandoff(clickedTrackId);
      const nativeAudio = r.$getAudio();
      if (nativeAudio && !nativeAudio.paused) nativeAudio.pause();
      window.setTimeout(r.$scanLivePlayer, 160);
    }, true);
}

function setupLiveScanning3(r) {
document.addEventListener("click", (event) => {
      if (!runtimeState.open || !(event.target instanceof Element)) return;
      const purchaseControl = event.target.closest(".buy-link, .bandcamp-hub-page-buy");
      if (!purchaseControl || purchaseControl.closest("#bandcamp-hub-extension-root")) return;
      r.$setOpen(false);
    }, true);
document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !runtimeState.appearance.hideBandcampPlayer) return;
      if (r.$suppressModernControl || r.$suppressRecommendationControl || r.$suppressCollectionControl) return;
      if (event.target.closest(".track_play_auxiliary,.play-pause-button,.inline_player .playbutton,.inline_player [aria-label*='Play'],.track_row_view .play_status,.track_row_view .play_cell a,.track_row_view .play-col > a,#recommendations_container .recommended-album .play-button")) {
        r.$suppressedFeedTrackId = "";
        r.$releaseExplicitPlaybackClear();
        if (r.$playlistPlaybackStarting) {
          r.$playlistPlayRequest += 1;
          r.$playlistPlaybackStartingRequest = 0;
          r.$playlistPlaybackStarting = false;
          r.$pendingPlaylistItemId = "";
          r.$syncCurrentPlaylistPlaybackUi();
        }
      }
      const recommendationControl = event.target.closest("#recommendations_container .recommended-album .play-button, #recommendations_container .recommended-album .play-pause-button, #recommendations_container .recommended-album .playbutton, #recommendations_container .recommended-album [aria-label^='Play' i], #recommendations_container .recommended-album [aria-label^='Pause' i]");
      if (recommendationControl && !recommendationControl.closest(".bandcamp-hub-page-playlist")) {
        const card = recommendationControl.closest(".recommended-album");
        const requestedTrack = r.$recommendationTrackFromCard(card);
        if (!requestedTrack) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const controlsCurrentTrack = Boolean(runtimeSeamless.enabled && r.$matchingQueueTrack([requestedTrack], runtimeSeamless.track || {}));
        if (controlsCurrentTrack) void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        else void r.$playRecommendationCard(card, recommendationControl);
        return;
      }
      const collectionControl = event.target.closest('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .collection-item-container .track_play_auxiliary, #wishlist-items .collection-grid[data-iswish="true"] .collection-item-container .track_play_auxiliary');
      if (collectionControl) {
        const card = collectionControl.closest(".collection-item-container");
        const requestedTrack = r.$collectionTrackFromCard(card);
        if (!requestedTrack) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const controlsCurrentTrack = runtimeSeamless.enabled && runtimeSeamless.status !== "error"
          && Boolean(r.$matchingQueueTrack([requestedTrack], runtimeSeamless.track || {}));
        if (controlsCurrentTrack) {
          r.$collectionHandoffRequest += 1;
          r.$playlistPlayRequest += 1;
          void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        } else {
          void r.$playCollectionCard(card, collectionControl);
        }
        return;
      }
      const onFeedPage = document.body.classList.contains("feed") || /\/feed\/?$/.test(location.pathname);
      const feedControl = onFeedPage ? event.target.closest(".track_play_auxiliary") : null;
      if (feedControl) {
        const clickedTrackId = String(feedControl.dataset.trackid || feedControl.closest("[data-trackid]")?.dataset.trackid || "");
        if (clickedTrackId === r.$feedNativeFallbackTrackId && Date.now() < r.$feedNativeFallbackUntil) return;
        const controlsCurrentSeamlessTrack = Boolean(
          runtimeSeamless.enabled
          && clickedTrackId
          && clickedTrackId === String(runtimeSeamless.track?.id || "")
        );
        if (controlsCurrentSeamlessTrack) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
          return;
        }
        if (clickedTrackId && r.$pendingFeedTrackId !== clickedTrackId) {
          r.$pendingFeedSeekTime = null;
          r.$pendingFeedSeekFraction = null;
          r.$pendingFeedSeekTrackId = "";
        }
        if (clickedTrackId) r.$pendingFeedTrackId = clickedTrackId;
        const inFlightTrackId = r.$feedHandoffInFlight();
        if (clickedTrackId && inFlightTrackId && clickedTrackId !== inFlightTrackId) {
          r.$playlistPlayRequest += 1;
        }
        if (clickedTrackId) r.$scheduleFeedHandoff(clickedTrackId);
        window.setTimeout(r.$scanLivePlayer, 160);
        return;
      }
      const discoverControl = event.target.closest(".results-grid-item .play-pause-button, .discover-player .play-pause-button");
      if (discoverControl) {
        const discover = r.$getDiscoverPlayerState();
        // During capture the native panel still describes the previous album.
        // Any new play intent supersedes an in-flight handoff, even before Vue
        // has updated the focused release and its track metadata.
        if (r.$discoverHandoffBusy) {
          r.$playlistPlayRequest += 1;
          r.$discoverHandoffPending = true;
        }
        const controlsCurrentSeamlessTrack = Boolean(
          discoverControl.closest(".discover-player")
          && runtimeSeamless.enabled
          && r.$matchingQueueTrack([runtimeSeamless.track], discover?.track)
        );
        if (controlsCurrentSeamlessTrack) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
          return;
        }
        if (runtimeSeamless.enabled) {
          r.$discoverSwitchPendingDisable = true;
          void r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE).finally(() => {
            r.$discoverSwitchPendingDisable = false;
            window.setTimeout(r.$scanLivePlayer, 0);
          });
        } else {
          window.setTimeout(r.$scanLivePlayer, 160);
        }
        return;
      }
      const radioControl = event.target.closest(".radio-card .play-pause-button");
      if (radioControl) {
        const radioCard = radioControl.closest(".radio-card");
        const requestedKey = radioShowTracklistKey({ cardId: radioCard?.id, showHref: radioCard?.querySelector("a[href*='show=']")?.href, baseHref: location.href });
        r.$radioHandoffKey = requestedKey;
        window.setTimeout(() => { if (r.$radioHandoffKey === requestedKey) r.$radioHandoffKey = ""; }, 8000);
        if (runtimeSeamless.enabled) {
          void r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE).finally(() => {
            r.$scheduleModernHandoff(requestedKey, null, 14);
          });
        } else {
          r.$scheduleModernHandoff(requestedKey, null, 14);
        }
        return;
      }
      const previous = event.target.closest("section.floating-player .prev-track");
      const next = event.target.closest("section.floating-player .next-track");
      if (runtimeSeamless.enabled && (previous || next)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void r.$seamlessCommand(previous ? MESSAGES.SEAMLESS_PREVIOUS : MESSAGES.SEAMLESS_NEXT);
        return;
      }
      const control = event.target.closest(".play-pause-button[tracklistkey]");
      if (!control) return;
      const requestedKey = control.getAttribute("tracklistkey") || "";
      const requestedIndex = control.hasAttribute("trackindex") ? Number(control.getAttribute("trackindex")) : null;
      const modern = r.$getModernPlayerState();
      if (modern && runtimeSeamless.enabled && requestedKey === modern.key) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (requestedIndex !== null && modern.queue[requestedIndex]?.url !== runtimeSeamless.track?.url) void r.$handoffModernPlayer(requestedIndex);
        else void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        return;
      }
      if (runtimeSeamless.enabled && runtimeSeamless.isPlaying) void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      r.$scheduleModernHandoff(requestedKey, requestedIndex);
    }, true);
document.addEventListener("change", (event) => {
      if (!runtimeState.appearance.hideBandcampPlayer || !runtimeSeamless.enabled || !(event.target instanceof HTMLInputElement) || !event.target.matches("section.floating-player input[type='range']")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: Number(event.target.value) || 0 });
    }, true);
document.addEventListener("input", (event) => {
      if (!(event.target instanceof HTMLInputElement) || !event.target.matches("section.floating-player input[type='range']")) return;
      const control = event.target.closest(".bandkit-page-scrub-control");
      const maximum = Number(event.target.max) || 1;
      const progress = Math.max(0, Math.min(1, (Number(event.target.value) || 0) / maximum));
      control?.style.setProperty("--bandkit-page-scrub-progress", `${(progress * 100).toFixed(2)}%`);
    }, true);
document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !runtimeState.appearance.hideBandcampPlayer) return;
      if (event.target.closest(".bandcamp-hub-page-tools, .bandcamp-hub-page-playlist-menu")) return;
      const previous = event.target.closest(".inline_player .prevbutton, .inline_player [aria-label='Previous track'], .mplayer .prev");
      const next = event.target.closest(".inline_player .nextbutton, .inline_player [aria-label='Next track'], .mplayer .next");
      const progress = event.target.closest(".inline_player .progbar, .inline_player .progbar_empty");
      if (runtimeSeamless.enabled && (previous || next || progress)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (previous) void r.$seamlessCommand(MESSAGES.SEAMLESS_PREVIOUS);
        if (next) void r.$seamlessCommand(MESSAGES.SEAMLESS_NEXT);
        if (progress && runtimeSeamless.duration) {
          const rect = progress.getBoundingClientRect();
          const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
          void r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: fraction * runtimeSeamless.duration });
        }
        return;
      }
      const control = event.target.closest(".inline_player .playbutton, .inline_player [aria-label*='Play'], .inline_player [aria-label*='Pause'], .track_row_view .play_status, .track_row_view .play_cell a, .track_row_view .play-col > a, .mplayer .mpbutton, .mplayer .trtrack, article-playbutton icon");
      if (!control) return;
      if (!r.$requestClassicPagePlayback(control)) {
        if (runtimeSeamless.enabled) void r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const source = event.target.closest("[data-trackid], [data-track-id], [data-audiourl], .track_row_view, .searchresult, .result-info, .discover-item, .results-grid-item");
      const item = r.$itemFromNode(source);
      if (item) r.$lastPageItem = item;
      window.setTimeout(r.$scanLivePlayer, 250);
    }, true);
}

function setupLiveScanning4(r) {
r.$playButton.addEventListener("click", async () => {
      r.$releaseExplicitPlaybackClear();
      if (r.$pauseNativeDiscover?.()) return;
      if (runtimeSeamless.enabled) {
        await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        return;
      }
      if (r.$getModernPlayerState()) {
        await r.$handoffModernPlayer();
        return;
      }
      const discover = r.$getDiscoverPlayerState();
      if (discover?.control) {
        discover.control.click();
        window.setTimeout(r.$scanLivePlayer, 160);
        return;
      }
      const feed = r.$getFeedPlayerState();
      if (feed?.control) {
        feed.control.click();
        window.setTimeout(r.$scanLivePlayer, 160);
        return;
      }
      const audio = r.$getAudio();
      if (audio) {
        try {
          if (audio.paused) await audio.play();
          else audio.pause();
        } catch {
          r.$showToast("Use Bandcamp's page player once, then Bandkit can control it.");
        }
        r.$scanLivePlayer();
        return;
      }
      const pageControl = document.querySelector('.inline_player a[aria-label="Play/pause"], .play_cell a[role="button"], button[aria-label*="Play"], [role="button"][aria-label*="Play"]');
      if (pageControl) pageControl.click();
      else r.$showToast("No Bandcamp player was found on this page.");
      window.setTimeout(r.$scanLivePlayer, 250);
    });
r.$djPlayerButton.addEventListener("click", () => r.$toggleDjTools());
r.$nowPlayingButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      r.$clearCompactPanelNotice?.();
      const currentPanelVisible = runtimeState.open && runtimeState.activeTab === "playlist";
      runtimeState.musicBarRecentPanel = "playlist";
      runtimeState.activeTab = "playlist";
      runtimeState.open = !currentPanelVisible;
      runtimeSaveState();
      r.$saveLayoutState();
      r.$render();
    });
const playerMoreWrap = r.$player.querySelector(".hub-player-more-wrap");
const closePlayerMoreMenu = () => {
      r.$playerMoreMenu.hidden = true;
      r.$playerMoreButton.setAttribute("aria-expanded", "false");
      for (const property of ["bottom", "left", "position", "right", "top", "z-index"]) {
        r.$playerMoreMenu.style.removeProperty(property);
      }
      if (playerMoreWrap.isConnected && r.$playerMoreMenu.parentNode !== playerMoreWrap) {
        playerMoreWrap.append(r.$playerMoreMenu);
      }
    };
const openPlayerMoreMenu = () => {
      (r.$fullscreenVisualizerStage || r.$shadow).append(r.$playerMoreMenu);
      r.$playerMoreMenu.hidden = false;
      const anchor = r.$playerMoreButton.getBoundingClientRect();
      const menu = r.$playerMoreMenu.getBoundingClientRect();
      r.$playerMoreMenu.style.position = "fixed";
      r.$playerMoreMenu.style.bottom = "auto";
      r.$playerMoreMenu.style.right = "auto";
      r.$playerMoreMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.width - 8, anchor.right - menu.width))}px`;
      r.$playerMoreMenu.style.top = `${Math.max(8, anchor.top - menu.height - 6)}px`;
      r.$playerMoreMenu.style.zIndex = "2147483647";
      r.$playerMoreButton.setAttribute("aria-expanded", "true");
    };
const handlePlayerMoreFocusOut = () => window.setTimeout(() => {
      const activeElement = r.$shadow.activeElement;
      if (!playerMoreWrap.contains(activeElement) && !r.$playerMoreMenu.contains(activeElement)) {
        closePlayerMoreMenu();
      }
    }, 50);
r.$closePlayerMoreMenu = closePlayerMoreMenu;
r.$playerMoreButton.addEventListener("click", () => {
      if (r.$playerMoreButton.disabled) return;
      if (r.$playerMoreMenu.hidden) openPlayerMoreMenu();
      else closePlayerMoreMenu();
    });
playerMoreWrap.addEventListener("focusout", handlePlayerMoreFocusOut);
r.$playerMoreMenu.addEventListener("focusout", handlePlayerMoreFocusOut);
document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest(".bandcamp-hub-page-dj") : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      r.$togglePageDjTools();
    }, true);
r.$player.querySelector(".hub-previous-button").addEventListener("click", async () => {
      if (runtimeSeamless.enabled) {
        await r.$navigatePlayerQueue(-1);
        return;
      }
      const audio = r.$getAudio();
      if (audio) audio.currentTime = 0;
    });
r.$player.querySelector(".hub-next-button").addEventListener("click", async () => {
      if (runtimeSeamless.enabled) {
        await r.$navigatePlayerQueue(1);
        return;
      }
      const next = document.querySelector('.inline_player a[aria-label="Next track"], [aria-label*="Next"], .nextbutton')?.closest("a, button, [role='button']") || document.querySelector(".nextbutton");
      if (next) next.click();
      else r.$showToast("There is no next-track control on this page.");
      window.setTimeout(r.$scanLivePlayer, 250);
    });
}

export const setupLiveScanning = [setupLiveScanning1, setupLiveScanning2, setupLiveScanning3, setupLiveScanning4];
