import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState, updateRuntimeLive, updateRuntimeSeamless } from "./context.js";
import { asset, createElement, portableBandcampUrl, resolveImage, resolvedTrackPageUrl, safeBandcampUrl } from "../core.js";
import { DEFAULT_DATA_PARENT, MAX_PLAYLIST_ITEMS, MAX_SAVED_PLAYLISTS } from "../state.js";
import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { dataHomeFolderName, saveDataDirectoryHandle, writeDataHomeToHandle } from "../../shared/data-home.js";
import { createPlaylistModel } from "../playlist-model.js";
import { parseCartBackup, portableCartItem, portableCartRestore } from "../cart-model.js";

function registerPersistencePlayback1(r) {
r.$portableSettings = function portableSettings() {
      return {
        openHomeToFeed: Boolean(runtimeState.openHomeToFeed),
        autoAnalyzeTracks: runtimeState.autoAnalyzeTracks !== false,
        showTrackKeys: runtimeState.showTrackKeys !== false,
        pageActionLabels: Boolean(runtimeState.pageActionLabels),
        recordPlaylistMetadata: runtimeState.recordPlaylistMetadata !== false,
        scrubberStyle: runtimeState.scrubberStyle,
        musicBarSize: runtimeState.musicBarSize,
        musicBarWidth: runtimeState.musicBarWidth,
        musicBarCustomWidth: runtimeState.musicBarCustomWidth,
        layoutMode: runtimeState.layoutMode,
        dockSide: runtimeState.dockSide,
        dockedWidth: runtimeState.dockedWidth,
        appearance: structuredClone(runtimeState.appearance),
        dj: {
          range: runtimeState.dj.range,
          preservePitch: runtimeState.dj.preservePitch,
          autoTempo: runtimeState.dj.autoTempo,
          loopSize: runtimeState.dj.loopSize,
          knobMode: runtimeState.dj.knobMode
        }
      };
    };
r.$portableActivity = function portableActivity() {
      return runtimeState.activity.map((item) => ({
        action: String(item.action || "activity").slice(0, 80),
        title: String(item.title || "Untitled track").slice(0, 500),
        artist: String(item.artist || "Unknown artist").slice(0, 500),
        url: portableBandcampUrl(item.url),
        artistUrl: portableBandcampUrl(item.artistUrl),
        createdAt: item.createdAt || null
      }));
    };
r.$portableDataBackup = function portableDataBackup() {
      const exportedAt = new Date().toISOString();
      return {
        format: "bandkit-data-home",
        version: 1,
        exportedAt,
        notice: "Bandkit does not collect or store bank account details, card numbers, passwords, or Bandcamp cookies.",
        playlists: {
          nowPlaying: r.$normalizePlaylist(runtimeState.playlist).map(r.$portablePlaylistItem).filter(Boolean),
          saved: r.$normalizeSavedPlaylists(runtimeState.savedPlaylists).map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            savedAt: playlist.savedAt,
            items: playlist.items.map(r.$portablePlaylistItem).filter(Boolean)
          }))
        },
        carts: {
          current: runtimeState.cart.map((item) => portableCartItem(item)).filter(Boolean),
          saved: r.$cartAutosave.normalizeSavedCarts(runtimeState.savedCarts).map((cart) => ({
            id: cart.id,
            name: cart.name,
            savedAt: cart.savedAt,
            sourcePage: portableBandcampUrl(cart.sourcePage),
            summary: cart.summary || null,
            items: (cart.items || []).map((item) => portableCartItem(item)).filter(Boolean)
          }))
        },
        activity: r.$portableActivity(),
        settings: r.$portableSettings()
      };
    };
r.$flushPortableDataHome = async function flushPortableDataHome({ notify = false } = {}) {
      if (!r.$dataHomeReady || !r.$dataDirectoryHandle || r.$localDataHomePermission !== "granted") return false;
      if (r.$portableDataSyncBusy) {
        r.$portableDataSyncPending = true;
        return false;
      }
      r.$portableDataSyncBusy = true;
      try {
        const response = await writeDataHomeToHandle(r.$dataDirectoryHandle, r.$portableDataBackup());
        if (!response?.ok) {
          if (response?.needsPermission) {
            const permissionWasGranted = r.$localDataHomePermission === "granted";
            r.$localDataHomePermission = response.permission || "prompt";
            if (r.$hubReady) {
              r.$render();
              if (permissionWasGranted) r.$showToast("Folder backup paused — restore access to keep your Bandkit folder up to date.", 6500);
            }
            return false;
          }
          if (response?.needsSetup) {
            r.$dataDirectoryHandle = null;
            r.$localDataHomePermission = "missing";
            r.$dataHomeReady = runtimeState.dataFolderSetup === true;
            if (r.$hubReady) r.$render();
          }
          throw new Error(response?.error || "Bandkit could not write to your data folder.");
        }
        if (response.folderName && runtimeState.dataFolderName !== response.folderName) {
          runtimeState.dataFolderName = response.folderName;
          r.$persistLocal({ [STORAGE_KEYS.STATE]: runtimeState });
        }
        if (notify) r.$showToast(`Bandkit is ready · saving to ${response.folderName}`);
        return true;
      } finally {
        r.$portableDataSyncBusy = false;
        if (r.$portableDataSyncPending) {
          r.$portableDataSyncPending = false;
          r.$schedulePortableDataHomeSync();
        }
      }
    };
r.$savePortableDataHome = async function savePortableDataHome() {
      r.$dataDirectoryHandle = await window.showDirectoryPicker({
        id: "bandkit-data-home",
        mode: "readwrite",
        startIn: DEFAULT_DATA_PARENT
      });
      await saveDataDirectoryHandle(r.$dataDirectoryHandle);
      r.$localDataHomePermission = "granted";
      r.$dataHomeReady = true;
      runtimeState.dataFolderName = dataHomeFolderName(r.$dataDirectoryHandle);
      runtimeState.dataFolderSetup = true;
      runtimeSaveState();
      r.$render();
      await r.$flushPortableDataHome({ notify: true });
      return true;
    };
r.$restorePortableDataHomeAccess = async function restorePortableDataHomeAccess({ notify = true } = {}) {
      if (!r.$dataDirectoryHandle || typeof r.$dataDirectoryHandle.requestPermission !== "function") return false;
      let permission = "denied";
      try {
        permission = await r.$dataDirectoryHandle.requestPermission({ mode: "readwrite" });
      } catch {
        permission = "denied";
      }
      r.$localDataHomePermission = permission;
      if (permission !== "granted") {
        if (r.$hubReady) r.$render();
        if (notify) r.$showToast("Folder access was not restored. Your Chrome copy is safe, but folder backup remains paused.", 6500);
        return false;
      }
      r.$dataHomeReady = true;
      runtimeState.dataFolderSetup = true;
      runtimeState.dataFolderName ||= dataHomeFolderName(r.$dataDirectoryHandle);
      runtimeSaveState();
      await r.$flushPortableDataHome({ notify });
      if (r.$hubReady) r.$render();
      return true;
    };
r.$requireDataHome = function requireDataHome() {
      if (r.$dataHomeReady) return true;
      runtimeState.open = true;
      r.$saveLayoutState();
      r.$render();
      return false;
    };
r.$renderDataHomeGate = function renderDataHomeGate() {
      r.$panelTitle.textContent = "Set up Bandkit";
      const gate = createElement("section", "hub-data-home-gate");
      const icon = document.createElement("img");
      icon.className = "hub-data-home-gate-icon";
      icon.src = asset("icon-bandkit.svg");
      icon.alt = "";
      const heading = createElement("h2", "hub-data-home-gate-heading", "Choose where Bandkit saves");
      const copy = createElement("p", "hub-data-home-gate-copy", "Pick a folder to create your Bandkit data home. Your playlists, saved carts, activity, and settings will stay organized there.");
      const choose = createElement("button", "hub-data-home-gate-action", "Choose folder");
      choose.type = "button";
      choose.addEventListener("click", async () => {
        choose.disabled = true;
        choose.textContent = "Opening folder setup…";
        try {
          await r.$savePortableDataHome();
        } catch (error) {
          r.$showToast(error?.message || "Bandkit could not open folder setup.");
        } finally {
          choose.disabled = false;
          choose.textContent = "Choose folder";
        }
      });
      gate.append(icon, heading, copy, choose);
      r.$content.append(gate);
    };
r.$savedLayoutState = function savedLayoutState(value = runtimeState) {
      return {
        revision: r.$layoutRevision,
        open: Boolean(value.open),
        layoutMode: value.layoutMode === "docked" ? "docked" : "floating",
        dockSide: value.dockSide === "left" ? "left" : "right",
        dockedWidth: Math.max(320, Number(value.dockedWidth) || 420),
        layout: value.layout && typeof value.layout === "object" ? { ...value.layout } : null,
        launcherPosition: value.launcherPosition && typeof value.launcherPosition === "object" ? { ...value.launcherPosition } : null
      };
    };
}

function registerDataHomePermission(r) {
r.$refreshPortableDataHomePermission = async function refreshPortableDataHomePermission({ notify = false } = {}) {
      if (!r.$dataDirectoryHandle || typeof r.$dataDirectoryHandle.queryPermission !== "function") return r.$localDataHomePermission;
      const previousPermission = r.$localDataHomePermission;
      let permission = "denied";
      try {
        permission = await r.$dataDirectoryHandle.queryPermission({ mode: "readwrite" });
      } catch {
        permission = "denied";
      }
      if (permission === previousPermission) return permission;
      r.$localDataHomePermission = permission;
      if (r.$hubReady) r.$render();
      if (notify && permission !== "granted") {
        r.$showToast("Folder backup needs access. Your Chrome copy is safe; restore access to resume folder updates.", 6500);
      }
      if (permission === "granted") void r.$flushPortableDataHome();
      return permission;
    };
r.$renderDataHomePermissionWarning = function renderDataHomePermissionWarning() {
      if (!r.$dataHomeReady || r.$localDataHomePermission === "granted") return null;
      const warning = createElement("section", "hub-data-home-warning");
      warning.setAttribute("role", "alert");
      const copy = createElement("div", "hub-data-home-warning-copy");
      copy.append(
        createElement("strong", "", "Folder backup paused"),
        createElement("span", "", `Your data is still safe in Chrome, but Bandkit cannot update ${runtimeState.dataFolderName || "your selected folder"} until access is restored.`)
      );
      const restore = createElement("button", "hub-data-home-warning-action", r.$dataDirectoryHandle ? "Restore access" : "Choose folder");
      restore.type = "button";
      restore.addEventListener("click", async () => {
        restore.disabled = true;
        try {
          if (r.$dataDirectoryHandle) await r.$restorePortableDataHomeAccess();
          else await r.$savePortableDataHome();
        } catch (error) {
          if (error?.name !== "AbortError") r.$showToast(error?.message || "Bandkit could not restore folder access.", 6500);
        } finally {
          restore.disabled = false;
        }
      });
      warning.append(copy, restore);
      r.$content.append(warning);
      return warning;
    };
r.$placeDataHomePermissionWarning = function placeDataHomePermissionWarning(warning) {
      if (!warning) return;
      const header = [...r.$content.children].find((element) => element !== warning && element.matches(
        ".hub-cart-view-header, .hub-saved-cart-detail-toolbar, .hub-section-heading"
      ));
      if (!header) return;
      let anchor = header;
      while (anchor.nextElementSibling && anchor.nextElementSibling !== warning && anchor.nextElementSibling.matches(".hub-cart-backup")) {
        anchor = anchor.nextElementSibling;
      }
      anchor.after(warning);
    };
}

function registerPersistencePlayback2(r) {
r.$applyPersistedLayout = function applyPersistedLayout(value) {
      if (!value || typeof value !== "object") return false;
      runtimeState.open = Boolean(value.open);
      runtimeState.layoutMode = value.layoutMode === "docked" ? "docked" : "floating";
      runtimeState.dockSide = value.dockSide === "left" ? "left" : "right";
      runtimeState.dockedWidth = Math.max(320, Number(value.dockedWidth) || 420);
      runtimeState.layout = value.layout && typeof value.layout === "object" ? { ...value.layout } : null;
      runtimeState.launcherPosition = value.launcherPosition && typeof value.launcherPosition === "object" ? { ...value.launcherPosition } : null;
      r.$layoutRevision = Math.max(r.$layoutRevision, Number(value.revision) || 0);
      return true;
    };
r.$saveLayoutState = function saveLayoutState() {
      r.$layoutRevision = Math.max(Date.now(), r.$layoutRevision + 1);
      r.$persistLocal({ [STORAGE_KEYS.LAYOUT]: r.$savedLayoutState() });
    };
r.$syncPageTypography = function syncPageTypography() {
      const pageFont = getComputedStyle(document.body).fontFamily?.trim();
      const fontFamily = pageFont && pageFont !== "initial"
        ? pageFont
        : '"Helvetica Neue", Helvetica, Arial, sans-serif';
      r.$host.style.setProperty("--hub-font-family", fontFamily);
      for (const control of document.querySelectorAll(".bandcamp-hub-page-playlist:not([data-bandkit-font-synced]), .bandcamp-hub-page-playlist-menu:not([data-bandkit-font-synced])")) {
        control.style.setProperty("--hub-font-family", fontFamily);
        control.dataset.bandkitFontSynced = "true";
      }
    };
r.$activePlaylistAnalysis = function activePlaylistAnalysis(track) {
      if (runtimeState.recordPlaylistMetadata === false || !runtimeSeamless.track || !r.$matchingQueueTrack([runtimeSeamless.track], track)) return null;
      const bpm = r.$normalizePlaylistBpm(runtimeSeamless.detectedBpm);
      const key = r.$normalizePlaylistKey(runtimeSeamless.detectedKey);
      return bpm || key ? { bpm, key } : null;
    };
r.$capturePlaylistAnalysis = function capturePlaylistAnalysis(track) {
      const analysis = r.$activePlaylistAnalysis(track);
      return analysis ? { ...track, ...analysis } : track;
    };
r.$playlistIsActive = function playlistIsActive() {
      return Boolean(runtimeSeamless.enabled && runtimeSeamless.track && r.$matchingQueueTrack(runtimeSeamless.queue, runtimeSeamless.track));
    };
r.$syncActivePlaylistQueue = async function syncActivePlaylistQueue() {
      if (!r.$playlistIsActive()) return;
      const playable = runtimeState.playlist.filter((track) => r.$isReusableStreamUrl(track.url));
      await r.$seamlessCommand(MESSAGES.SEAMLESS_UPDATE_QUEUE, { queue: playable });
    };
r.$resetLoadedPlayback = function resetLoadedPlayback() {
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
        ...runtimeSeamless,
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
      });
    };
r.$clearLocalPlaybackState = function clearLocalPlaybackState({ persist = true } = {}) {
      r.$clearedPageQueueSignature ||= `${runtimeLive.pageUrl}|${runtimeLive.title}`;
      r.$nowPlayingExplicitlyCleared = true;
      r.$playlistPlayRequest += 1;
      r.$playlistPlaybackStartingRequest = 0;
      r.$playlistPlaybackStarting = false;
      r.$pendingPlaylistItemId = "";
      runtimeState.playlist = [];
      runtimeState.playlistMode = "browse";
      if (persist) runtimeSaveState();

      r.$pageMediaCommand("pause");
      r.$stopModernPagePlayer();
      for (const audio of document.querySelectorAll("audio")) {
        if (!audio.paused) audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          // Some page audio elements are not seekable until metadata is loaded.
        }
      }
      r.$resetLoadedPlayback();
      r.$syncPagePlayerUi();
      r.$syncRecommendationPlaybackUi();
      r.$render();
      r.$injectPlaylistButtons();
    };
r.$releaseExplicitPlaybackClear = function releaseExplicitPlaybackClear() {
      r.$nowPlayingExplicitlyCleared = false;
      r.$clearedPageQueueSignature = "";
    };
r.$clearNowPlayingPlayback = async function clearNowPlayingPlayback({ notify = true } = {}) {
      r.$clearedPageQueueSignature = `${runtimeLive.pageUrl}|${runtimeLive.title}`;
      r.$clearLocalPlaybackState();
      await r.$runtimeMessage({ type: MESSAGES.CLEAR_PLAYBACK });

      // Apply the empty state last so a delayed pre-clear playback broadcast
      // cannot leave stale metadata in the persistent footer.
      r.$clearLocalPlaybackState();
      if (notify) r.$showToast("Now Playing cleared");
    };
r.$addTracksToPlaylist = function addTracksToPlaylist(tracks, { quiet = false } = {}) {
      r.$releaseExplicitPlaybackClear();
      const incoming = r.$normalizePlaylist((Array.isArray(tracks) ? tracks : []).map(r.$capturePlaylistAnalysis));
      if (incoming.length) runtimeState.playlistMode = "manual";
      let added = 0;
      let refreshed = 0;
      let atCapacity = false;
      for (const source of incoming) {
        const existingIndex = runtimeState.playlist.findIndex((item) => r.$playlistTracksMatch(item, source));
        if (existingIndex >= 0) {
          const existing = runtimeState.playlist[existingIndex];
          const replacement = {
            ...existing,
            ...source,
            playlistItemId: existing.playlistItemId,
            bpm: source.bpm ?? existing.bpm,
            key: source.key ?? existing.key
          };
          if (JSON.stringify(replacement) !== JSON.stringify(existing)) {
            runtimeState.playlist[existingIndex] = replacement;
            refreshed += 1;
          }
          continue;
        }
        if (runtimeState.playlist.length >= MAX_PLAYLIST_ITEMS) {
          atCapacity = true;
          continue;
        }
        source.playlistItemId = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        source.addedAt ||= new Date().toISOString();
        runtimeState.playlist.push(source);
        added += 1;
      }
      if (added || refreshed) {
        runtimeState.playlist = r.$normalizePlaylist(runtimeState.playlist);
        runtimeSaveState();
        void r.$syncActivePlaylistQueue();
        if (r.$isNowPlayingView()) r.$render();
        r.$injectPlaylistButtons();
      }
      const capacitySuffix = atCapacity ? ` · ${MAX_PLAYLIST_ITEMS}-track limit reached` : "";
      if (!quiet) r.$showToast(added
        ? `Added ${added} track${added === 1 ? "" : "s"} to Now Playing${capacitySuffix}`
        : atCapacity ? `Now Playing can hold up to ${MAX_PLAYLIST_ITEMS} tracks` : "Already in Now Playing");
      return added;
    };
r.$addTrackToPlaylist = function addTrackToPlaylist(track) {
      return r.$addTracksToPlaylist([track]);
    };
}

function registerPersistencePlayback3(r) {
r.$hasSavedPlaylistCapacity = function hasSavedPlaylistCapacity() {
      if (runtimeState.savedPlaylists.length < MAX_SAVED_PLAYLISTS) return true;
      r.$showToast(`You can save up to ${MAX_SAVED_PLAYLISTS} playlists. Delete one before creating another.`);
      return false;
    };
r.$createSavedPlaylistWithTracks = function createSavedPlaylistWithTracks(tracks, suggestedName = "New playlist") {
      const items = r.$normalizePlaylist((Array.isArray(tracks) ? tracks : []).map(r.$capturePlaylistAnalysis));
      if (!items.length) return null;
      if (!r.$requireDataHome()) return null;
      if (!r.$hasSavedPlaylistCapacity()) return null;
      const name = window.prompt("Name this playlist", suggestedName)?.trim();
      if (!name) return null;
      const snapshot = {
        id: `saved-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.slice(0, 120),
        savedAt: new Date().toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        items
      };
      runtimeState.savedPlaylists.unshift(snapshot);
      runtimeState.savedPlaylists = r.$normalizeSavedPlaylists(runtimeState.savedPlaylists);
      runtimeSaveState();
      if (runtimeState.activeTab === "playlist" && runtimeState.playlistView === "saved") r.$render();
      r.$showToast(`Saved to “${snapshot.name}”`);
      return snapshot;
    };
r.$createEmptySavedPlaylist = function createEmptySavedPlaylist() {
      if (!r.$requireDataHome()) return null;
      if (!r.$hasSavedPlaylistCapacity()) return null;
      const suggestedName = `Playlist ${runtimeState.savedPlaylists.length + 1}`;
      const name = window.prompt("Name this playlist", suggestedName)?.trim();
      if (!name) return null;
      const snapshot = {
        id: `saved-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.slice(0, 120),
        savedAt: new Date().toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        items: []
      };
      runtimeState.savedPlaylists.unshift(snapshot);
      runtimeState.savedPlaylists = r.$normalizeSavedPlaylists(runtimeState.savedPlaylists);
      runtimeState.playlistView = "saved";
      runtimeSaveState();
      r.$render();
      r.$showToast(`Created “${snapshot.name}”`);
      return snapshot;
    };
r.$addTracksToSavedPlaylist = function addTracksToSavedPlaylist(tracks, snapshotId) {
      if (!r.$requireDataHome()) return 0;
      const snapshot = runtimeState.savedPlaylists.find((entry) => entry.id === snapshotId);
      const incoming = r.$normalizePlaylist((Array.isArray(tracks) ? tracks : []).map(r.$capturePlaylistAnalysis));
      if (!snapshot || !incoming.length) return 0;
      let added = 0;
      let atCapacity = false;
      for (const item of incoming) {
        if (snapshot.items.some((entry) => r.$playlistTracksMatch(entry, item))) continue;
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
        snapshot.items = r.$normalizePlaylist(snapshot.items);
        runtimeSaveState();
        if (runtimeState.activeTab === "playlist" && runtimeState.playlistView === "saved") r.$render();
      }
      const capacitySuffix = atCapacity ? ` · ${MAX_PLAYLIST_ITEMS}-track limit reached` : "";
      r.$showToast(added
        ? `Added ${added} track${added === 1 ? "" : "s"} to “${snapshot.name}”${capacitySuffix}`
        : atCapacity ? `“${snapshot.name}” can hold up to ${MAX_PLAYLIST_ITEMS} tracks` : `Already in “${snapshot.name}”`);
      return added;
    };
r.$addTrackToSavedPlaylist = function addTrackToSavedPlaylist(track, snapshotId) {
      return r.$addTracksToSavedPlaylist([track], snapshotId) > 0;
    };
r.$hydratePlaylist = async function hydratePlaylist(items) {
      const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_PLAYLIST_ITEMS, items });
      if (!response?.ok) return { items: r.$normalizePlaylist(items), failed: items.length, error: response?.error || "Could not refresh the playlist." };
      const hydrated = r.$normalizePlaylist(response.items);
      return {
        items: hydrated,
        failed: hydrated.filter((item) => !r.$isReusableStreamUrl(item.url)).length,
        error: ""
      };
    };
r.$playlistItemNeedsMetadata = function playlistItemNeedsMetadata(item) {
      return !resolveImage(item?.art) || !String(item?.artist || "").trim() || String(item.artist).trim().toLowerCase() === "bandcamp";
    };
r.$refreshIncompletePlaylistMetadata = async function refreshIncompletePlaylistMetadata() {
      const metadataCandidates = [
        ...runtimeState.playlist,
        ...runtimeState.savedPlaylists.flatMap((snapshot) => snapshot.items || [])
      ].filter((item) => r.$playlistItemNeedsMetadata(item));
      const unique = [...new Map(metadataCandidates.map((item) => [r.$playlistTrackKey(item), item])).values()];
      if (!unique.length) return false;
      const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_PLAYLIST_ITEMS, items: unique });
      if (!response?.ok || !Array.isArray(response.items)) return false;
      const refreshed = r.$normalizePlaylist(response.items);
      const byKey = new Map(refreshed.map((item) => [r.$playlistTrackKey(item), item]));
      let changed = false;
      const repair = (item) => {
        const replacement = byKey.get(r.$playlistTrackKey(item)) || refreshed.find((candidate) => r.$playlistTracksMatch(candidate, item));
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
          url: r.$isReusableStreamUrl(replacement.url) ? replacement.url : item.url,
          restoreError: r.$isReusableStreamUrl(replacement.url) ? "" : item.restoreError
        };
        if (JSON.stringify(repaired) !== JSON.stringify(item)) changed = true;
        return repaired;
      };
      runtimeState.playlist = r.$normalizePlaylist(runtimeState.playlist.map(repair));
      runtimeState.savedPlaylists = r.$normalizeSavedPlaylists(runtimeState.savedPlaylists.map((snapshot) => ({
        ...snapshot,
        items: (snapshot.items || []).map(repair)
      })));
      if (!changed) return false;
      runtimeSaveState();
      void r.$syncActivePlaylistQueue();
      if (runtimeState.activeTab === "playlist") r.$render();
      return true;
    };
r.$prepareExternalNowPlaying = async function prepareExternalNowPlaying(track, sourceQueue = [], { trustProvidedStreams = false } = {}) {
      r.$releaseExplicitPlaybackClear();
      const incoming = r.$normalizePlaylistItem(track);
      if (!incoming) return { queue: [], index: -1, error: "This Bandcamp track could not be added to Now Playing." };
      const prepareRequest = ++r.$playlistPlayRequest;
      r.$playlistPlaybackStartingRequest = 0;
      r.$playlistPlaybackStarting = false;
      r.$pendingPlaylistItemId = "";
      r.$syncCurrentPlaylistPlaybackUi();
      const sourceItems = (Array.isArray(sourceQueue) ? sourceQueue : [])
        .map(r.$normalizePlaylistItem)
        .filter(Boolean);
      const sourceIndex = sourceItems.findIndex((item) => r.$playlistTracksMatch(item, incoming));
      const replacement = sourceIndex >= 0 ? sourceItems.slice(sourceIndex) : [incoming];
      runtimeState.playlistMode = "browse";
      runtimeState.playlist = r.$normalizePlaylist(replacement);
      runtimeSaveState();
      if (r.$isNowPlayingView()) r.$render();
      r.$injectPlaylistButtons();

      if (trustProvidedStreams && r.$isReusableStreamUrl(incoming.url)) {
        const queue = runtimeState.playlist.filter((item) => r.$isReusableStreamUrl(item.url));
        const index = queue.findIndex((item) => Boolean(r.$matchingQueueTrack([item], incoming)));
        if (index >= 0) {
          return { queue, index, error: "", request: prepareRequest, usedFreshStreams: true };
        }
      }

      const hydrated = await r.$hydratePlaylist(runtimeState.playlist);
      if (prepareRequest !== r.$playlistPlayRequest) return { queue: [], index: -1, error: "Playback request was replaced.", cancelled: true, request: prepareRequest };
      runtimeState.playlist = r.$mergeHydratedPlaylist(runtimeState.playlist, hydrated.items);
      runtimeSaveState();
      const queue = runtimeState.playlist.filter((item) => r.$isReusableStreamUrl(item.url));
      const index = queue.findIndex((item) => Boolean(r.$matchingQueueTrack([item], incoming)));
      if (r.$isNowPlayingView()) r.$render();
      return {
        queue,
        index,
        error: index >= 0 ? "" : hydrated.error || "This Bandcamp track is not currently streamable.",
        request: prepareRequest
      };
    };
}

export const registerPersistencePlayback = [registerPersistencePlayback1, registerDataHomePermission, registerPersistencePlayback2, registerPersistencePlayback3];

function setupPersistencePlayback1(r) {
({ canonicalPlaylistPageUrl: r.$canonicalPlaylistPageUrl, mergeHydratedPlaylist: r.$mergeHydratedPlaylist, normalizePlaylist: r.$normalizePlaylist, normalizePlaylistBpm: r.$normalizePlaylistBpm, normalizePlaylistItem: r.$normalizePlaylistItem, normalizePlaylistKey: r.$normalizePlaylistKey, normalizeSavedPlaylists: r.$normalizeSavedPlaylists, playlistTrackKey: r.$playlistTrackKey, playlistTracksMatch: r.$playlistTracksMatch, portablePlaylistItem: r.$portablePlaylistItem } = createPlaylistModel({
      isReusableStreamUrl: r.$isReusableStreamUrl,
      maxItems: MAX_PLAYLIST_ITEMS,
      normalizedTrackTitle: r.$normalizedTrackTitle,
      portableBandcampUrl,
      resolveImage,
      resolvedTrackPageUrl,
      safeBandcampUrl
    }));
Object.assign(r.$app.services, {
      cartModel: { parseCartBackup, portableCartItem, portableCartRestore },
      playlistModel: {
        canonicalPlaylistPageUrl: r.$canonicalPlaylistPageUrl,
        mergeHydratedPlaylist: r.$mergeHydratedPlaylist,
        normalizePlaylist: r.$normalizePlaylist,
        normalizeSavedPlaylists: r.$normalizeSavedPlaylists,
        playlistTrackKey: r.$playlistTrackKey,
        playlistTracksMatch: r.$playlistTracksMatch,
        portablePlaylistItem: r.$portablePlaylistItem
      }
    });
}

export const setupPersistencePlayback = [setupPersistencePlayback1];
