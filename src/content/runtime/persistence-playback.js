import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState, updateRuntimeLive, updateRuntimeSeamless, updateRuntimeState } from "./context.js";
import { createElement, portableBandcampUrl, resolveImage, resolvedTrackPageUrl, safeBandcampUrl } from "../core.js";
import { defaultState, MAX_PLAYLIST_ITEMS, MAX_SAVED_PLAYLISTS } from "../state.js";
import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { BACKUP_FILENAME, restoreBackupFile, saveBackupFile } from "../../shared/backup-file.js";
import { createPlaylistModel } from "../playlist-model.js";
import { parseCartBackup, portableCartItem, portableCartRestore } from "../cart-model.js";

const BACKUP_REMINDER_DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_REMINDER_DAYS = new Set([0, 7, 14, 30]);

function registerPersistencePlayback1(r) {
r.$portableSettings = function portableSettings(value = runtimeState) {
      return {
        openHomeToFeed: Boolean(value.openHomeToFeed),
        autoAnalyzeTracks: value.autoAnalyzeTracks !== false,
        showTrackKeys: value.showTrackKeys !== false,
        pageActionLabels: Boolean(value.pageActionLabels),
        recordPlaylistMetadata: value.recordPlaylistMetadata !== false,
        scrubberStyle: value.scrubberStyle,
        musicBarSize: value.musicBarSize,
        musicBarWidth: value.musicBarWidth,
        musicBarCustomWidth: value.musicBarCustomWidth,
        layoutMode: value.layoutMode,
        dockSide: value.dockSide,
        dockedWidth: value.dockedWidth,
        appearance: structuredClone(value.appearance),
        dj: {
          range: value.dj.range,
          preservePitch: value.dj.preservePitch,
          autoTempo: value.dj.autoTempo,
          loopSize: value.dj.loopSize,
          knobMode: value.dj.knobMode
        }
      };
    };
r.$portableActivity = function portableActivity(value = runtimeState) {
      return value.activity.map((item) => ({
        action: String(item.action || "activity").slice(0, 80),
        title: String(item.title || "Untitled track").slice(0, 500),
        artist: String(item.artist || "Unknown artist").slice(0, 500),
        url: portableBandcampUrl(item.url),
        artistUrl: portableBandcampUrl(item.artistUrl),
        createdAt: item.createdAt || null
      }));
    };
r.$portableDataBackup = function portableDataBackup(value = runtimeState) {
      const exportedAt = new Date().toISOString();
      return {
        format: "bandkit-backup",
        version: 3,
        exportedAt,
        notice: "Bandkit does not collect or store bank account details, card numbers, passwords, or Bandcamp cookies.",
        playlists: {
          nowPlaying: r.$normalizePlaylist(value.playlist).map(r.$portablePlaylistItem).filter(Boolean),
          saved: r.$normalizeSavedPlaylists(value.savedPlaylists).map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            savedAt: playlist.savedAt,
            modifiedAt: playlist.modifiedAt || playlist.savedAt,
            items: playlist.items.map(r.$portablePlaylistItem).filter(Boolean)
          }))
        },
        carts: {
          current: value.cart.map((item) => portableCartItem(item)).filter(Boolean),
          saved: r.$cartAutosave.normalizeSavedCarts(value.savedCarts).map((cart) => ({
            id: cart.id,
            name: cart.name,
            savedAt: cart.savedAt,
            modifiedAt: cart.modifiedAt || cart.savedAt,
            sourcePage: portableBandcampUrl(cart.sourcePage),
            summary: cart.summary || null,
            items: (cart.items || []).map((item) => portableCartItem(item)).filter(Boolean)
          }))
        },
        activity: r.$portableActivity(value),
        settings: r.$portableSettings(value)
      };
    };
r.$backupReminderDays = function backupReminderDays() {
      const days = Number(runtimeState.backupReminderDays);
      return BACKUP_REMINDER_DAYS.has(days) ? days : 7;
    };
r.$backupReminderState = function backupReminderState() {
      if (Date.now() < Number(r.$backupSavedConfirmationUntil || 0)) return "saved";
      if (runtimeState.backupIntroSeen !== true) return "intro";
      const days = r.$backupReminderDays();
      if (!days) return null;
      const anchor = Math.max(
        Date.parse(runtimeState.lastBackupAt || "") || 0,
        Date.parse(runtimeState.backupReminderSnoozedAt || "") || 0
      );
      if (!anchor || Date.now() - anchor >= days * BACKUP_REMINDER_DAY_MS) return "due";
      return null;
    };
r.$savePortableBackup = async function savePortableBackup() {
      if (typeof globalThis.showSaveFilePicker !== "function") {
        throw new Error("This version of Chrome cannot open the backup save window.");
      }
      const handle = await globalThis.showSaveFilePicker({
        id: "bandkit-manual-backup",
        suggestedName: BACKUP_FILENAME,
        startIn: "downloads",
        types: [{ description: "Bandkit backup", accept: { "application/json": [".json"] } }]
      });
      const stored = await r.$storageGet(STORAGE_KEYS.STATE);
      const latestState = stored?.[STORAGE_KEYS.STATE] || runtimeState;
      const result = await saveBackupFile(handle, r.$portableDataBackup(latestState));
      if (!result?.ok) throw new Error(result?.error || "Bandkit could not save the backup file.");
      const savedAt = new Date().toISOString();
      runtimeState.backupIntroSeen = true;
      runtimeState.backupReminderSnoozedAt = null;
      runtimeState.lastBackupAt = savedAt;
      r.$backupSavedConfirmationUntil = Date.now() + 5000;
      r.$persistLocal({
        [STORAGE_KEYS.STATE]: {
          ...latestState,
          backupIntroSeen: true,
          backupReminderSnoozedAt: null,
          lastBackupAt: savedAt
        }
      });
      if (r.$hubReady) r.$render();
      window.setTimeout(() => {
        if (r.$hubReady && Date.now() >= r.$backupSavedConfirmationUntil) r.$render();
      }, 5100);
      r.$showToast("Backup saved");
      return result;
    };
r.$restorePortableBackup = async function restorePortableBackup() {
      if (typeof globalThis.showOpenFilePicker !== "function") {
        throw new Error("This version of Chrome cannot open the backup restore window.");
      }
      const [handle] = await globalThis.showOpenFilePicker({
        id: "bandkit-manual-restore",
        startIn: "downloads",
        multiple: false,
        types: [{ description: "Bandkit backup", accept: { "application/json": [".json"] } }]
      });
      const stored = await r.$storageGet(STORAGE_KEYS.STATE);
      const latestState = stored?.[STORAGE_KEYS.STATE] || runtimeState;
      const result = await restoreBackupFile(handle, latestState);
      const reminderDays = BACKUP_REMINDER_DAYS.has(Number(latestState.backupReminderDays))
        ? Number(latestState.backupReminderDays) : 7;
      const nextState = {
        ...defaultState,
        ...result.state,
        backupIntroSeen: true,
        backupReminderDays: reminderDays,
        backupReminderSnoozedAt: latestState.backupReminderSnoozedAt || null,
        lastBackupAt: latestState.lastBackupAt || null
      };
      r.$state = updateRuntimeState(r.$app.replaceState(nextState));
      r.$saveState();
      r.$render();
      const restored = Number(result.restoredPlaylists || 0) + Number(result.restoredCarts || 0);
      const updated = Number(result.updatedPlaylists || 0) + Number(result.updatedCarts || 0);
      r.$showToast(restored || updated
        ? `Restored ${restored + updated} saved item${restored + updated === 1 ? "" : "s"}`
        : "Backup checked — your saved items are already up to date");
      return result;
    };
r.$snoozeBackupReminder = function snoozeBackupReminder() {
      runtimeState.backupIntroSeen = true;
      runtimeState.backupReminderSnoozedAt = new Date().toISOString();
      r.$saveState();
      r.$render();
    };
r.$runBackupAction = async function runBackupAction(button, action) {
      button.disabled = true;
      try {
        return await action();
      } catch (error) {
        if (error?.name !== "AbortError") r.$showToast(error?.message || "Bandkit could not complete the backup action.");
        return null;
      } finally {
        button.disabled = false;
      }
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

function registerBackupReminder(r) {
r.$renderBackupReminder = function renderBackupReminder() {
      const reminderState = r.$backupReminderState();
      if (!reminderState) return null;
      const gate = createElement("section", `hub-backup-reminder is-${reminderState}`);
      const copy = createElement("div", "hub-backup-reminder-copy");
      const heading = reminderState === "saved"
        ? "Backup saved"
        : reminderState === "intro" ? "Saved in Chrome" : "Ready for another backup?";
      const message = reminderState === "saved"
        ? `A portable copy was saved as ${BACKUP_FILENAME}.`
        : reminderState === "intro"
          ? "Your playlists and carts stay in Chrome. Save a portable copy whenever you like."
          : "Your Chrome copy is up to date. Save a fresh portable copy when it suits you.";
      copy.append(
        createElement("strong", "hub-backup-reminder-heading", heading),
        createElement("span", "", message)
      );
      gate.append(copy);
      if (reminderState !== "saved") {
        const actions = createElement("div", "hub-backup-reminder-actions");
        const action = createElement("button", "hub-backup-reminder-save", "Save backup");
        action.type = "button";
        action.addEventListener("click", () => r.$runBackupAction(action, r.$savePortableBackup));
        const later = createElement("button", "hub-backup-reminder-later", "Later");
        later.setAttribute("aria-label", `Remind me in ${r.$backupReminderDays()} days`);
        later.type = "button";
        later.addEventListener("click", r.$snoozeBackupReminder);
        actions.append(action, later);
        gate.append(actions);
      }
      return gate;
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
      if (!r.$hasSavedPlaylistCapacity()) return null;
      const name = window.prompt("Name this playlist", suggestedName)?.trim();
      if (!name) return null;
      const savedAt = new Date().toISOString();
      const snapshot = {
        id: `saved-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.slice(0, 120),
        savedAt,
        modifiedAt: savedAt,
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
      if (!r.$hasSavedPlaylistCapacity()) return null;
      const suggestedName = `Playlist ${runtimeState.savedPlaylists.length + 1}`;
      const name = window.prompt("Name this playlist", suggestedName)?.trim();
      if (!name) return null;
      const savedAt = new Date().toISOString();
      const snapshot = {
        id: `saved-playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.slice(0, 120),
        savedAt,
        modifiedAt: savedAt,
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
        snapshot.modifiedAt = new Date().toISOString();
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

export const registerPersistencePlayback = [registerPersistencePlayback1, registerBackupReminder, registerPersistencePlayback2, registerPersistencePlayback3];

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
