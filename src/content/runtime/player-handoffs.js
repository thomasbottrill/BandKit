import { runtimeLive, runtimeSeamless, runtimeState } from "./context.js";
import { parseClock } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";

function registerPlayerHandoffs1(r) { r.$getModernPlayerState = function getModernPlayerState() {
      const player = document.querySelector("section.floating-player.has-track, section.floating-player:has(.track-meta[streamurl])");
      if (!player) return null;
      const key = player.querySelector(".play-pause-button:is(.outline, .outline-opaque)[tracklistkey], .play-pause-button[tracklistkey]")?.getAttribute("tracklistkey") || "";
      const sourceContext = r.$modernPlayerSourceContext(player, key);
      const playlistSeed = r.$getModernPlaylistSeed(key);
      const sourceMetadataNode = sourceContext?.matches?.("[data-item-json]") ? sourceContext : sourceContext?.querySelector?.("[data-item-json]");
      const sourceItemData = r.$parseJsonAttribute(sourceMetadataNode, "data-item-json") || {};
      const sourceAlbum = (sourceContext ? r.$elementText(sourceContext, [".collection-item-title", ".release-title", ".title"]) : "")
        || sourceItemData.item_title
        || "";
      const modernTrackCandidates = [...player.querySelectorAll(".meta-wrapper-wide .track-meta[streamurl], .track-meta[streamurl]")];
      const unique = [...new Map(modernTrackCandidates.map((node) => [node.getAttribute("streamurl"), node])).values()];
      const domQueue = unique.map((node, index) => {
        const pageUrl = r.$modernTrackPageUrl(node, sourceContext);
        const artist = r.$elementText(node, [".artist-name"]).replace(/^by\s+/i, "") || "Bandcamp";
        return {
          id: node.id || `${node.getAttribute("streamurl")}|${index}`,
          title: r.$elementText(node, [".title-text", ".track-title", ".title"]) || `Bandcamp track ${index + 1}`,
          artist,
          album: sourceAlbum || document.title,
          art: node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || sourceContext?.querySelector("img")?.currentSrc || sourceContext?.querySelector("img")?.src || "",
          pageUrl,
          artistUrl: r.$modernTrackArtistUrl(node, pageUrl),
          duration: Number(node.getAttribute("duration")) || 0,
          url: node.getAttribute("streamurl") || ""
        };
      }).filter((track) => /^https:\/\/[^/]*\.bcbits\.com\//.test(track.url));
      const seedQueue = playlistSeed?.tracks
        .map((item, sourceIndex) => r.$modernPlaylistTrack(item, playlistSeed.title, sourceIndex))
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
    };
r.$modernPlayerLinksReady = function modernPlayerLinksReady(modern) {
      return Boolean(modern?.queue.length && modern.queue.every((track) => r.$modernReleasePageUrl(track.pageUrl)));
    };
r.$getDiscoverPlayerState = function getDiscoverPlayerState() {
      const player = document.querySelector(".discover-player");
      if (!player) return null;
      const control = player.querySelector(".play-pause-button");
      const focused = player.closest(".focused-result") || player.parentElement;
      const links = [...player.querySelectorAll(".player-info a[href], a[href]")];
      const albumLink = links.find((link) => /^from\s+/i.test(link.textContent || "")) || links.find((link) => /album\//.test(link.href));
      const artistLink = links.find((link) => /^by\s+/i.test(link.textContent || ""));
      const title = r.$elementText(player, [".player-info .title", ".title"]);
      if (!title) return null;
      const pageUrl = albumLink?.href || focused?.querySelector("a[href*='bandcamp.com']")?.href || location.href;
      const artistUrl = artistLink?.href || r.$artistUrlFromPageUrl(pageUrl);
      const artist = (artistLink?.textContent || "Bandcamp").replace(/^by\s+/i, "").trim() || "Bandcamp";
      const displayedCurrentTime = parseClock(r.$elementText(player, [".playback-time.current"]));
      const displayedDuration = parseClock(r.$elementText(player, [".playback-time.total"]));
      const currentTime = Number(r.$bridgedMedia?.currentTime) || displayedCurrentTime;
      const duration = Number(r.$bridgedMedia?.duration) || displayedDuration;
      const timeline = player.querySelector("input[type='range']");
      const sliderProgress = Number(timeline?.value);
      const progress = Number.isFinite(sliderProgress) ? sliderProgress : duration ? currentTime / duration : 0;
      return {
        player,
        control,
        timeline,
        isPlaying: control?.getAttribute("aria-label") === "Pause" || Boolean(r.$bridgedMedia && !r.$bridgedMedia.paused && !r.$bridgedMedia.ended),
        currentTime,
        duration,
        progress: Math.max(0, Math.min(1, progress)),
        track: {
          id: `${pageUrl}|${title}`,
          title,
          artist,
          album: (albumLink?.textContent || "").replace(/^from\s+/i, "").trim(),
          art: focused?.querySelector("img[alt^='View'], img")?.currentSrc || focused?.querySelector("img[alt^='View'], img")?.src || runtimeLive.art,
          pageUrl,
          artistUrl,
          duration,
          url: r.$bridgedMedia?.src || ""
        },
        queue: []
      };
    };
r.$feedStreamTrackId = function feedStreamTrackId(value) {
      try {
        return new URL(value || "", location.href).searchParams.get("track_id") || "";
      } catch {
        return "";
      }
    };
r.$getFeedPlayerState = function getFeedPlayerState(preferredTrackId = "") {
      if (!document.body.classList.contains("feed") && !/\/feed\/?$/.test(location.pathname)) return null;
      const audio = r.$getAudio();
      const audioTrackId = r.$feedStreamTrackId(audio?.currentSrc || audio?.src);
      const playingNode = document.querySelector(".collection-item-container.playing[data-trackid]");
      const trackId = String(preferredTrackId || playingNode?.dataset.trackid || audioTrackId);
      if (!trackId) return null;
      const seededFromPendingClick = Boolean(
        preferredTrackId
        && audioTrackId !== trackId
        && r.$pendingFeedTrackId === trackId
      );
      if (preferredTrackId && audioTrackId !== trackId && !seededFromPendingClick) return null;
      const audioMatchesTrack = audioTrackId === trackId;
      const matchingNodes = [...document.querySelectorAll(".collection-item-container[data-trackid]")]
        .filter((node) => node.dataset.trackid === trackId);
      const metadataNode = matchingNodes.find((node) => node.dataset.itemJson) || playingNode || matchingNodes[0];
      if (!metadataNode) return null;
      const itemData = r.$parseJsonAttribute(metadataNode, "data-item-json") || {};
      const storyNode = matchingNodes.find((node) => node.classList.contains("story-innards")) || metadataNode;
      const itemLink = storyNode.querySelector("a.item-link[href]") || metadataNode.querySelector("a.item-link[href], a[href*='bandcamp.com/album/'], a[href*='bandcamp.com/track/']");
      const artistLink = storyNode.querySelector("a.artist-name[href]");
      const pageUrl = itemData.item_url || itemLink?.href || location.href;
      const artistUrl = itemData.band_url || artistLink?.href || r.$artistUrlFromPageUrl(pageUrl);
      const title = itemData.featured_track_title || r.$elementText(storyNode, [".fav-track-title", ".collection-item-title", ".waypoint-item-title"]);
      if (!title) return null;
      const artist = itemData.band_name || r.$elementText(storyNode, [".collection-item-artist", ".artist-name", ".waypoint-artist-title"]).replace(/^by\s+/i, "") || "Bandcamp";
      const duration = (audioMatchesTrack ? Number(audio?.duration) : 0)
        || Number(itemData.featured_track_duration)
        || parseClock(r.$elementText(storyNode, [".time_total"]))
        || Number(r.$feedStreams.get(trackId)?.duration)
        || 0;
      const currentTime = seededFromPendingClick
        && r.$pendingFeedSeekTrackId === trackId
        && (r.$pendingFeedSeekTime !== null || r.$pendingFeedSeekFraction !== null)
        ? r.$pendingFeedSeekTime !== null ? Number(r.$pendingFeedSeekTime) || 0 : (Number(r.$pendingFeedSeekFraction) || 0) * duration
        : (audioMatchesTrack ? Number(audio?.currentTime) : 0)
          || parseClock(r.$elementText(storyNode, [".time_elapsed"]));
      const control = storyNode.querySelector(".track_play_auxiliary") || metadataNode.querySelector(".track_play_auxiliary") || document.querySelector(`.track_play_auxiliary[data-trackid="${trackId}"]`);
      return {
        player: storyNode,
        control,
        isPlaying: seededFromPendingClick || Boolean(audioMatchesTrack && audio && !audio.paused && !audio.ended),
        seededFromPendingClick,
        currentTime,
        duration,
        progress: duration ? Math.max(0, Math.min(1, currentTime / duration)) : 0,
        track: {
          id: String(trackId),
          title,
          artist,
          album: r.$elementText(storyNode, [".collection-item-title", ".release-title"]) || itemData.item_title,
          art: itemData.item_art_url || storyNode.querySelector(".tralbum-art-large, img")?.currentSrc || storyNode.querySelector(".tralbum-art-large, img")?.src || runtimeLive.art,
          pageUrl,
          artistUrl,
          duration,
          url: audioMatchesTrack
            ? audio?.currentSrc || audio?.src || ""
            : seededFromPendingClick ? r.$feedStreamUrl(trackId) : ""
        },
        queue: []
      };
    };
r.$suppressRemovedFeedTrack = function suppressRemovedFeedTrack(item) {
      const feed = r.$getFeedPlayerState();
      if (!feed?.track || !r.$matchingQueueTrack([item], feed.track)) return;
      r.$suppressedFeedTrackId = String(feed.track.id || item?.id || "");
      r.$pendingFeedTrackId = "";
      r.$pendingFeedSeekTime = null; r.$pendingFeedSeekFraction = null;
      r.$pendingFeedSeekTrackId = "";
      window.clearTimeout(r.$feedHandoffTimer);
      const audio = r.$getAudio();
      if (audio && !audio.paused) audio.pause();
    };
r.$muteFeedAudioForHandoff = function muteFeedAudioForHandoff(trackId) {
      const audio = r.$getAudio();
      if (!audio) return;
      if (r.$mutedFeedAudio !== audio) {
        if (r.$mutedFeedAudio) r.$mutedFeedAudio.muted = r.$mutedFeedAudioWasMuted;
        r.$mutedFeedAudio = audio;
        r.$mutedFeedAudioWasMuted = Boolean(audio.muted);
      }
      r.$mutedFeedTrackId = String(trackId || "");
      audio.muted = true;
    };
}

// Discover never returns its own control to "Play" once Bandkit has taken the
// stream over, so that label cannot say whether the native preview is still the
// audible source. Treating a silenced preview as audible strands its row on the
// pause glyph and pins the scrub readout to zero. The bridged media element
// mirrors Bandcamp's own audio, so it is the honest answer; the label only
// stands in until the bridge has seen that element.
function audibleNativeDiscover(r, native = r.$getDiscoverPlayerState?.()) {
      if (!native || r.$discoverTrackPlaybackActive) return null;
      const media = r.$bridgedMedia;
      if (media?.src) return media.paused || media.ended ? null : native;
      return native.control?.getAttribute("aria-label") === "Pause" ? native : null;
    }

function pauseNativeDiscover(r, track = null) {
      const native = r.$getDiscoverPlayerState();
      if (native?.control?.getAttribute("aria-label") !== "Pause" || r.$discoverTrackPlaybackActive) return false;
      if (track && !r.$matchingPagePlaybackTrack([track], native.track)) return false;
      // Cancel preparation before pausing so an in-flight handoff cannot restart audio.
      r.$playlistPlayRequest += 1;
      r.$discoverPendingTrack = null;
      native.control.click();
      window.setTimeout(r.$scanLivePlayer, 0);
      return true;
    }

async function resolveDiscoverHandoffQueue(r, track) {
  let releaseQueue = r.$discoverReleaseTracks || [];
  let releaseTrack = r.$matchingPagePlaybackTrack?.(releaseQueue, track) || null;
  if (releaseTrack || !r.$resolveFeedReleaseTracks) return { releaseQueue, releaseTrack };
  const resolvedQueue = await r.$resolveFeedReleaseTracks(track);
  const resolvedTrack = r.$matchingPagePlaybackTrack?.(resolvedQueue, track) || null;
  if (resolvedTrack) {
    releaseQueue = resolvedQueue;
    releaseTrack = resolvedTrack;
  }
  return { releaseQueue, releaseTrack };
}

function registerPlayerHandoffs2(r) {
r.$restoreFeedAudioMute = function restoreFeedAudioMute(trackId = "") {
      if (!r.$mutedFeedAudio || (trackId && r.$mutedFeedTrackId && String(trackId) !== r.$mutedFeedTrackId)) return;
      r.$mutedFeedAudio.muted = r.$mutedFeedAudioWasMuted;
      r.$mutedFeedAudio = null;
      r.$mutedFeedAudioWasMuted = false;
      r.$mutedFeedTrackId = "";
    };
r.$finishFeedAudioHandoff = function finishFeedAudioHandoff(trackId, expectedAudio = r.$getAudio()) {
      const requestedTrackId = String(trackId || "");
      if (!expectedAudio || !requestedTrackId) return;
      window.clearTimeout(r.$feedNativePauseTimer);
      const finish = () => {
        if (r.$pendingFeedTrackId && r.$pendingFeedTrackId !== requestedTrackId) return;
        const currentAudio = r.$getAudio();
        const currentTrackId = r.$feedStreamTrackId(currentAudio?.currentSrc || currentAudio?.src);
        const isMutedHandoffAudio = currentAudio === r.$mutedFeedAudio;
        if (currentAudio !== expectedAudio || (!isMutedHandoffAudio && currentTrackId && currentTrackId !== requestedTrackId)) return;
        if (!expectedAudio.paused) expectedAudio.pause();
        r.$restoreFeedAudioMute(requestedTrackId);
      };
      const afterNativePlaySettles = () => {
        window.clearTimeout(r.$feedNativePauseTimer);
        r.$feedNativePauseTimer = window.setTimeout(finish, 60);
      };
      if (expectedAudio.paused) {
        finish();
        return;
      }
      expectedAudio.addEventListener("playing", afterNativePlaySettles, { once: true });
      r.$feedNativePauseTimer = window.setTimeout(finish, 500);
    };
r.$stopModernPagePlayer = function stopModernPagePlayer() {
      const button = document.querySelector("section.floating-player .play-pause-button.outline[aria-label='Pause'], section.floating-player .player-controls .play-pause-button[aria-label='Pause']");
      if (!button) return;
      r.$suppressModernControl = true;
      button.click();
      window.setTimeout(() => {
        r.$suppressModernControl = false;
      }, 0);
    };
r.$silenceNativePagePlayback = function silenceNativePagePlayback() {
      r.$pageMediaCommand("pauseAll");
      for (const media of document.querySelectorAll("audio, video")) {
        if (!media.paused) media.pause();
      }
      r.$stopModernPagePlayer();
    };
r.$handoffModernPlayer = async function handoffModernPlayer(requestedIndex = null) {
      const modern = r.$getModernPlayerState();
      if (!modern) return false;
      const sourceIndex = requestedIndex === null ? modern.sourceIndex : Math.max(0, Number(requestedIndex) || 0);
      const requestedTrackKey = r.$playlistTrackKey(modern.queue.find((track) => Number(track.sourceIndex) === sourceIndex))
        || `${modern.key}:${sourceIndex}`;
      if (r.$modernHandoffBusy) {
        if (requestedTrackKey && (requestedTrackKey !== r.$modernHandoffTrackKey || r.$modernHandoffSuperseded)) {
          if (!r.$modernHandoffSuperseded) r.$playlistPlayRequest += 1;
          r.$modernHandoffSuperseded = true;
          r.$modernHandoffPendingIndex = sourceIndex;
        }
        return false;
      }
      r.$modernHandoffBusy = true;
      r.$modernHandoffTrackKey = requestedTrackKey;
      r.$modernHandoffSuperseded = false;
      try {
        const loaded = await r.$loadModernPlaylistQueue(modern);
        if (r.$modernHandoffSuperseded) return false;
        const index = loaded.sourceToQueue.get(sourceIndex);
        if (index === undefined || !loaded.queue[index]) return false;
        const prepared = await r.$prepareExternalNowPlaying(loaded.queue[index], loaded.queue, {
          trustProvidedStreams: true,
          replaceQueue: modern.isPlaylistPage
        });
        if (r.$modernHandoffSuperseded) return false;
        if (prepared.index < 0) return false;
        const latestModern = r.$getModernPlayerState() || modern;
        const response = await r.$runtimeMessage({
          type: MESSAGES.SEAMLESS_ENABLE,
          queue: prepared.queue,
          index: prepared.index,
          currentTime: requestedIndex === null ? latestModern.currentTime : 0,
          handoffStartedAt: Date.now(),
          autoplay: true,
          rate: runtimeState.dj.rate,
          preservePitch: runtimeState.dj.preservePitch,
          filterValue: runtimeState.dj.filterValue,
          gainDb: runtimeState.dj.gainDb,
          eqLowDb: runtimeState.dj.eqLowDb,
          eqMidDb: runtimeState.dj.eqMidDb,
          eqHighDb: runtimeState.dj.eqHighDb
        });
        if (!response?.ok) return false;
        if (prepared.request !== r.$playlistPlayRequest) return false;
        r.$stopModernPagePlayer();
        r.$radioHandoffKey = "";
        r.$applySeamlessState(response.state);
        return true;
      } finally {
        r.$modernHandoffBusy = false;
        r.$modernHandoffTrackKey = "";
        r.$modernHandoffSuperseded = false;
        if (r.$modernHandoffPendingIndex !== null) {
          const pendingIndex = r.$modernHandoffPendingIndex;
          r.$modernHandoffPendingIndex = null;
          window.setTimeout(() => void r.$handoffModernPlayer(pendingIndex), 0);
        }
      }
    };
r.$scheduleModernHandoff = function scheduleModernHandoff(requestedKey = "", requestedIndex = null, maxAttempts = 6) {
      const request = ++r.$modernHandoffRequest;
      const poll = (attempt = 0) => {
        window.setTimeout(() => {
          if (request !== r.$modernHandoffRequest) return;
          const modern = r.$getModernPlayerState();
          if (modern && (!requestedKey || modern.key === requestedKey)) {
            if (r.$modernPlayerLinksReady(modern) || attempt >= maxAttempts) {
              void r.$handoffModernPlayer(requestedIndex);
              return;
            }
          }
          if (attempt < maxAttempts) poll(attempt + 1);
        }, attempt ? Math.min(500, 100 + attempt * 75) : 40);
      };
      poll();
    };
r.$isReusableStreamUrl = function isReusableStreamUrl(value) {
      try {
        const url = new URL(value);
        const isBcbits = url.hostname === "bcbits.com" || url.hostname.endsWith(".bcbits.com");
        const isBandcampRedirect = url.hostname === "bandcamp.com" && url.pathname === "/stream_redirect" && url.searchParams.has("track_id");
        return url.protocol === "https:" && (isBcbits || isBandcampRedirect);
      } catch {
        return false;
      }
    };
r.$pauseNativeDiscover = (track) => pauseNativeDiscover(r, track);
r.$audibleNativeDiscover = (native) => audibleNativeDiscover(r, native);
r.$handoffDiscoverPlayer = async function handoffDiscoverPlayer() {
      if (r.$discoverHandoffBusy || r.$discoverTrackPlaybackActive) return false;
      const discover = r.$getDiscoverPlayerState();
      if (!discover?.track || !r.$isReusableStreamUrl(discover.track.url)) return false;
      r.$discoverHandoffBusy = true;
      r.$discoverHandoffTrackKey = r.$playlistTrackKey(discover.track);
      // Present the native track before queue persistence and audio handoff finish.
      r.$discoverPendingTrack = discover.track;
      r.$renderPlayer?.();
      try {
        // The artwork play button can start before Discover's generated
        // tracklist has resolved, so make the full release part of the handoff.
        const { releaseQueue, releaseTrack } = await resolveDiscoverHandoffQueue(r, discover.track);
        const prepared = await r.$prepareExternalNowPlaying(releaseTrack || discover.track, releaseQueue, { trustProvidedStreams: true });
        if (prepared.index < 0) return false;
        if (r.$discoverTrackPlaybackActive || prepared.request !== r.$playlistPlayRequest) return false;
        const latestDiscover = r.$getDiscoverPlayerState();
        if (!latestDiscover?.isPlaying) return false;
        if (!latestDiscover?.track || r.$playlistTrackKey(latestDiscover.track) !== r.$discoverHandoffTrackKey) {
          r.$discoverHandoffPending = true;
          return false;
        }
        const latestCurrentTime = Number(latestDiscover.currentTime);
        const handoffCurrentTime = Number.isFinite(latestCurrentTime)
          ? Math.max(0, latestCurrentTime)
          : Math.max(0, Number(discover.currentTime) || 0);
        const response = await r.$runtimeMessage({
          type: MESSAGES.SEAMLESS_ENABLE,
          queue: prepared.queue,
          index: prepared.index,
          currentTime: handoffCurrentTime,
          handoffStartedAt: Date.now(),
          autoplay: true,
          rate: runtimeState.dj.rate,
          preservePitch: runtimeState.dj.preservePitch,
          filterValue: runtimeState.dj.filterValue,
          gainDb: runtimeState.dj.gainDb,
          eqLowDb: runtimeState.dj.eqLowDb,
          eqMidDb: runtimeState.dj.eqMidDb,
          eqHighDb: runtimeState.dj.eqHighDb
        });
        if (!response?.ok) return false;
        const completedDiscover = r.$getDiscoverPlayerState();
        if (prepared.request !== r.$playlistPlayRequest
          || r.$discoverTrackPlaybackActive
          || !completedDiscover?.isPlaying
          || r.$playlistTrackKey(completedDiscover.track) !== r.$discoverHandoffTrackKey) {
          r.$discoverHandoffPending = true;
          return false;
        }
        r.$pageMediaCommand("pause");
        r.$applySeamlessState(response.state);
        return true;
      } finally {
        r.$discoverHandoffBusy = false;
        r.$discoverHandoffTrackKey = "";
        if (r.$discoverPendingTrack === discover.track) r.$discoverPendingTrack = null;
        r.$renderPlayer?.();
        if (r.$discoverHandoffPending) {
          r.$discoverHandoffPending = false;
          window.setTimeout(r.$scanLivePlayer, 0);
        }
      }
    };
}

function registerPlayerHandoffs3(r) {
r.$feedHandoffInFlight = function feedHandoffInFlight() {
      // A handoff that never settles must not strand the feed, so one that has
      // outlived any plausible round trip is treated as abandoned.
      if (!r.$feedHandoffTrackId) return "";
      if (Date.now() - r.$feedHandoffStartedAt > 8000) return "";
      return r.$feedHandoffTrackId;
    };
r.$handoffFeedPlayer = async function handoffFeedPlayer(requestedTrackId = "") {
      const requested = String(requestedTrackId || "");
      // Repeat scans must not restart the handoff already running for this
      // track, but a different track always supersedes it.
      if (requested && requested === r.$feedHandoffInFlight()) return true;
      const feed = r.$getFeedPlayerState(requested);
      if (!feed?.track || !feed.isPlaying) return false;
      const trustProvidedStreams = r.$isReusableStreamUrl(feed.track.url);
      if (!trustProvidedStreams && !feed.track.pageUrl) return false;
      if (r.$suppressedFeedTrackId && String(feed.track.id || requestedTrackId || "") === r.$suppressedFeedTrackId) {
        r.$pendingFeedTrackId = "";
        r.$pendingFeedSeekTime = null;
        r.$pendingFeedSeekFraction = null;
        r.$pendingFeedSeekTrackId = "";
        const suppressedAudio = r.$getAudio();
        if (suppressedAudio && !suppressedAudio.paused) suppressedAudio.pause();
        r.$restoreFeedAudioMute(feed.track.id || requestedTrackId);
        return true;
      }
      const sameSeamlessTrack = Boolean(runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], feed.track));
      if (sameSeamlessTrack) {
        const currentAudio = r.$getAudio();
        if (currentAudio && !currentAudio.paused) currentAudio.pause();
        r.$restoreFeedAudioMute(feed.track.id || requestedTrackId);
        return true;
      }
      const handoffRequest = ++r.$feedHandoffRequest;
      r.$feedHandoffTrackId = String(feed.track.id || requested || "");
      r.$feedHandoffStartedAt = Date.now();
      try {
        // A story that carries Bandcamp's own signed stream starts straight
        // away, the way a release page does. Anything the page world could not
        // describe still falls back to resolving the release metadata.
        const visibleQueue = r.$feedAlbumQueueForTrack?.(feed.track) || [];
        const resolvedQueue = visibleQueue.length
          ? visibleQueue
          : await r.$resolveFeedReleaseTracks?.(feed.track) || [];
        const prepared = await r.$prepareExternalNowPlaying(feed.track, resolvedQueue, { trustProvidedStreams });
        if (handoffRequest !== r.$feedHandoffRequest) return false;
        if (prepared.index < 0) return false;
        if (prepared.request !== r.$playlistPlayRequest) return false;
        const preparedDuration = Number(prepared.queue[prepared.index]?.duration) || 0;
        if (r.$pendingFeedSeekFraction !== null && preparedDuration) r.$pendingFeedSeekTime = r.$pendingFeedSeekFraction * preparedDuration;
        const handoffSeekRevision = r.$pendingFeedSeekRevision;
        const handoffCurrentTime = r.$pendingFeedSeekTime === null ? feed.currentTime : r.$pendingFeedSeekTime;
        const response = await r.$runtimeMessage({
          type: MESSAGES.SEAMLESS_ENABLE,
          queue: prepared.queue,
          index: prepared.index,
          currentTime: handoffCurrentTime,
          autoplay: true,
          rate: runtimeState.dj.rate,
          preservePitch: runtimeState.dj.preservePitch,
          filterValue: runtimeState.dj.filterValue,
          gainDb: runtimeState.dj.gainDb,
          eqLowDb: runtimeState.dj.eqLowDb,
          eqMidDb: runtimeState.dj.eqMidDb,
          eqHighDb: runtimeState.dj.eqHighDb
        });
        if (!response?.ok) return false;
        if (handoffRequest !== r.$feedHandoffRequest) return false;
        if (prepared.request !== r.$playlistPlayRequest) return false;
        const responseDuration = Number(response.state?.duration) || Number(response.state?.track?.duration) || 0;
        if (r.$pendingFeedSeekTime === null && r.$pendingFeedSeekFraction !== null && responseDuration) {
          r.$pendingFeedSeekTime = r.$pendingFeedSeekFraction * responseDuration;
        }
        r.$applySeamlessState(response.state);
        if (r.$pendingFeedSeekTime !== null
          && (r.$pendingFeedSeekRevision !== handoffSeekRevision || Math.abs(r.$pendingFeedSeekTime - handoffCurrentTime) > 0.05)) {
          await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: r.$pendingFeedSeekTime });
        }
        r.$finishFeedAudioHandoff(r.$feedHandoffTrackId, r.$getAudio());
        return true;
      } finally {
        if (handoffRequest === r.$feedHandoffRequest) {
          r.$feedHandoffTrackId = "";
          r.$feedHandoffStartedAt = 0;
        }
      }
    };
r.$scheduleFeedHandoff = function scheduleFeedHandoff(trackId, attempt = 0) {
      const requestedTrackId = String(trackId || "");
      if (!requestedTrackId) return;
      if (requestedTrackId === r.$suppressedFeedTrackId) {
        r.$pendingFeedTrackId = "";
        r.$pendingFeedSeekTime = null;
        r.$pendingFeedSeekFraction = null;
        r.$pendingFeedSeekTrackId = "";
        r.$syncFeedPagePlaybackUi();
        r.$renderPlayer();
        return;
      }
      r.$pendingFeedTrackId = requestedTrackId;
      window.clearTimeout(r.$feedHandoffTimer);
      r.$feedHandoffTimer = window.setTimeout(async () => {
        if (r.$pendingFeedTrackId !== requestedTrackId) return;
        if (r.$feedSwitchPendingDisable) {
          if (attempt < 15) r.$scheduleFeedHandoff(requestedTrackId, attempt + 1);
          return;
        }
        if (await r.$handoffFeedPlayer(requestedTrackId)) return;
        if (r.$pendingFeedTrackId !== requestedTrackId) return;
        if (attempt < 15) r.$scheduleFeedHandoff(requestedTrackId, attempt + 1);
        else {
          r.$pendingFeedTrackId = "";
          r.$pendingFeedSeekTime = null;
          r.$pendingFeedSeekFraction = null;
          r.$pendingFeedSeekTrackId = "";
          r.$syncFeedPagePlaybackUi();
          r.$renderPlayer();
          r.$restoreFeedAudioMute(requestedTrackId);
          const fallbackControl = document.querySelector(`.track_play_auxiliary[data-trackid="${CSS.escape(requestedTrackId)}"]`);
          if (fallbackControl) {
            r.$feedNativeFallbackTrackId = requestedTrackId;
            r.$feedNativeFallbackUntil = Date.now() + 5000;
            fallbackControl.click();
          }
        }
      }, attempt ? 90 : 0);
    };
}

export const registerPlayerHandoffs = [registerPlayerHandoffs1, registerPlayerHandoffs2, registerPlayerHandoffs3];
