import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { asset, createButtonIcon, formatDuration, parseClock, resolveImage, safeBandcampReleaseUrl, safeBandcampUrl } from "../core.js";
import { MAX_PLAYLIST_ITEMS } from "../state.js";
import { MESSAGES } from "../../shared/contracts.js";

function registerPlayerShell1(r) {
r.$syncPlayerSectionGeometry = function syncPlayerSectionGeometry() {
      r.$playerSectionGeometryFrame = 0;
      const rect = r.$panel.getBoundingClientRect();
      if (!rect.width) return;
      const signature = `${Math.round(rect.left)}|${Math.round(rect.width)}`;
      if (signature === r.$playerSectionGeometrySignature) return;
      r.$playerSectionGeometrySignature = signature;
      r.$player.style.setProperty("--hub-sections-center-x", `${Math.round(rect.left + rect.width / 2)}px`);
      r.$player.style.setProperty("--hub-sections-panel-width", `${Math.round(rect.width)}px`);
    };
r.$schedulePlayerSectionGeometry = function schedulePlayerSectionGeometry() {
      if (r.$playerSectionGeometryFrame) return;
      r.$playerSectionGeometryFrame = window.requestAnimationFrame(r.$syncPlayerSectionGeometry);
    };
r.$renderPlayer = function renderPlayer() {
      r.$syncMusicBarSize();
      r.$syncMusicBarWidth();
      r.$syncScrubberStyles();
      const hasCurrentTrack = Boolean(runtimeLive.hasPlaybackStarted && runtimeLive.title);
      const playbackLoading = Boolean(runtimeSeamless.enabled && runtimeSeamless.status === "loading");
      r.$playButton.disabled = !hasCurrentTrack || playbackLoading;
      r.$playButton.setAttribute("aria-disabled", String(!hasCurrentTrack || playbackLoading));
      r.$playButton.setAttribute("aria-label", playbackLoading ? `Loading ${runtimeLive.title || "track"}` : "Play or pause");
      r.$playerTrack.classList.toggle("is-empty", !hasCurrentTrack);
      const trackRenderSignature = hasCurrentTrack
        ? `${runtimeLive.title}\u0000${runtimeLive.artist}\u0000${runtimeLive.art}\u0000${runtimeLive.pageUrl}\u0000${runtimeLive.artistUrl}`
        : "empty";
      if (trackRenderSignature !== r.$playerTrackRenderSignature) {
        r.$playerTrackRenderSignature = trackRenderSignature;
        if (hasCurrentTrack) {
          const playerArtUrl = resolveImage(runtimeLive.art);
          if (playerArtUrl) r.$playerArt.src = playerArtUrl;
          else r.$playerArt.removeAttribute("src");
          r.$playerArtLink.hidden = !playerArtUrl;
          r.$playerArt.alt = "";
          r.$playerTitle.textContent = runtimeLive.title;
          r.$playerArtist.textContent = runtimeLive.artist;
          r.$updatePageLink(r.$playerArtLink, runtimeLive.pageUrl);
          r.$playerArtLink.setAttribute("aria-label", `Open ${runtimeLive.title}`);
          r.$updatePageLink(r.$playerTitle, runtimeLive.pageUrl);
          r.$updatePageLink(r.$playerArtist, runtimeLive.artistUrl || runtimeLive.pageUrl);
        } else {
          r.$playerArt.removeAttribute("src");
          r.$playerArtLink.hidden = true;
          r.$playerArt.alt = "";
          r.$playerTitle.textContent = "";
          r.$playerArtist.textContent = "";
          r.$updatePageLink(r.$playerArtLink, "");
          r.$playerArtLink.removeAttribute("aria-label");
          r.$updatePageLink(r.$playerTitle, "");
          r.$updatePageLink(r.$playerArtist, "");
        }
      }
      const playbackRenderState = runtimeLive.isPlaying ? "playing" : "paused";
      if (playbackRenderState !== r.$playerPlaybackRenderState) {
        r.$playerPlaybackRenderState = playbackRenderState;
        r.$playButton.replaceChildren(createButtonIcon(runtimeLive.isPlaying ? "icon-pause.svg" : "icon-play.svg"));
      }
      const audio = runtimeSeamless.enabled ? null : r.$getAudio();
      const duration = runtimeSeamless.enabled ? Number(runtimeSeamless.duration) || 0 : Number(audio?.duration) || Number(runtimeLive.duration) || 0;
      const currentTime = runtimeSeamless.enabled ? Number(runtimeSeamless.currentTime) || 0 : Number(audio?.currentTime) || Number(runtimeLive.currentTime) || 0;
      if (!r.$scrubbing) {
        r.$scrubSlider.value = String(duration ? Math.round(Math.max(0, Math.min(1, currentTime / duration)) * 1000) : 0);
        r.$currentTimeLabel.textContent = formatDuration(currentTime);
      }
      r.$syncScrubVisual();
      r.$refreshScrubWaveform();
      r.$scrubSlider.setAttribute("aria-valuetext", `${formatDuration((Number(r.$scrubSlider.value) / 1000) * duration)} of ${formatDuration(duration)}`);
      r.$scrubControl.classList.toggle("is-empty", !duration);
      r.$durationLabel.textContent = formatDuration(duration);
      const queuedTracks = runtimeState.playlist.length
        ? runtimeState.playlist.length
        : runtimeSeamless.enabled && Array.isArray(runtimeSeamless.queue) && runtimeSeamless.queue.length
        ? runtimeSeamless.queue.length
        : runtimeLive.hasPlaybackStarted
        ? 1 + (Array.isArray(runtimeLive.tracks) ? runtimeLive.tracks.length : 0)
        : 0;
      const showingSavedPlaylists = runtimeState.playlistView === "saved";
      const sectionCount = showingSavedPlaylists ? runtimeState.savedPlaylists.length : queuedTracks;
      const sectionLabel = showingSavedPlaylists ? "Playlists" : "Now Playing";
      const sectionIcon = showingSavedPlaylists ? "icon-playlist.svg" : "icon-now-playing.svg";
      const sectionCountLabel = showingSavedPlaylists
        ? `${sectionCount} saved`
        : `${sectionCount} song${sectionCount === 1 ? "" : "s"}`;
      r.$nowPlayingButton.dataset.view = showingSavedPlaylists ? "saved" : "current";
      r.$nowPlayingButton.querySelector(".hub-now-playing-icon")?.style.setProperty("--hub-icon", `url('${asset(sectionIcon)}')`);
      r.$nowPlayingButton.querySelector(".hub-now-playing-label").textContent = sectionLabel;
      r.$nowPlayingCount.textContent = String(sectionCount);
      r.$nowPlayingButton.setAttribute("aria-label", `${sectionLabel}, ${sectionCountLabel}`);
      r.$nowPlayingButton.title = r.$nowPlayingButton.getAttribute("aria-label");
      const sectionPanelActive = runtimeState.open && runtimeState.activeTab === "playlist";
      r.$nowPlayingButton.classList.toggle("is-active", sectionPanelActive);
      r.$nowPlayingButton.setAttribute("aria-expanded", String(sectionPanelActive));
      const djPlayerButtonRect = r.$djPlayerButton.getBoundingClientRect();
      r.$player.style.setProperty("--hub-dj-anchor-x", `${Math.round(djPlayerButtonRect.left + djPlayerButtonRect.width / 2)}px`);
      r.$renderPlayerMoreActions();
    };
r.$setOpen = function setOpen(open) {
      runtimeState.open = open;
      runtimeSaveState();
      r.$saveLayoutState();
      r.$render();
    };
r.$openBandKitCart = function openBandKitCart() {
      r.$closePagePlaylistMenu();
      runtimeState.open = true;
      runtimeState.activeTab = "cart";
      runtimeState.cartView = "current";
      runtimeState.selectedSavedCartId = null;
      runtimeSaveState();
      r.$saveLayoutState();
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
        button.setAttribute("aria-expanded", String(r.$pageDjOpen));
        button.setAttribute("aria-pressed", String(r.$pageDjOpen));
        button.title = r.$pageDjOpen ? "Hide DJ tools on this page" : "Show DJ tools on this page";
        button.setAttribute("aria-label", button.title);
      }
    };
r.$renderPageDjTools = function renderPageDjTools() {
      if (!r.$pageDjHost?.isConnected || !r.$pageDjSurface) return;
      r.$pageDjHost.hidden = !r.$pageDjOpen;
      r.$pageDjSurface.replaceChildren();
      if (r.$pageDjOpen) r.$pageDjSurface.append(r.$createDjToolsCard({ includeWaveform: false }));
      r.$syncPageDjToolsUi();
    };
r.$toggleDjTools = function toggleDjTools() {
      runtimeState.dj.open = !runtimeState.dj.open;
      runtimeSaveState();
      r.$renderDjTools();
    };
r.$togglePageDjTools = function togglePageDjTools() {
      r.$pageDjOpen = !r.$pageDjOpen;
      runtimeState.dj.pageOpen = r.$pageDjOpen;
      runtimeSaveState();
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
      const title = node.dataset.title || node.dataset.albumtitle || r.$elementText(node, [".track-title", ".release-title", ".title", "h3", "h4"]);
      if (!title) return null;
      const pageUrl = node.querySelector("a[href*='bandcamp.com'], a[href^='/']")?.href || location.href;
      return {
        title,
        artist: node.dataset.artist || r.$elementText(node, [".artist", ".by-artist", ".band-name", ".subtitle"]) || "Bandcamp",
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

function registerPlayerShell3(r) {
r.$getModernPlayerState = function getModernPlayerState() {
      const player = document.querySelector("section.floating-player.has-track, section.floating-player:has(.track-meta[streamurl])");
      if (!player) return null;
      const key = player.querySelector(".play-pause-button:is(.outline, .outline-opaque)[tracklistkey], .play-pause-button[tracklistkey]")?.getAttribute("tracklistkey") || "";
      const sourceContext = r.$modernPlayerSourceContext(player, key);
      const playlistSeed = r.$getModernPlaylistSeed(key);
      const sourceMetadataNode = sourceContext?.matches?.("[data-item-json]") ? sourceContext : sourceContext?.querySelector?.("[data-item-json]");
      const sourceItemData = r.$parseJsonAttribute(sourceMetadataNode, "data-item-json") || {};
      const sourceAlbum = sourceItemData.item_title
        || (sourceContext ? r.$elementText(sourceContext, [".collection-item-title", ".release-title", ".title"]) : "")
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
      if (preferredTrackId && audioTrackId !== trackId) return null;
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
      const duration = Number(audio?.duration) || Number(itemData.featured_track_duration) || parseClock(r.$elementText(storyNode, [".time_total"]));
      const currentTime = Number(audio?.currentTime) || parseClock(r.$elementText(storyNode, [".time_elapsed"]));
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
          album: itemData.item_title || r.$elementText(storyNode, [".collection-item-title"]),
          art: itemData.item_art_url || storyNode.querySelector(".tralbum-art-large, img")?.currentSrc || storyNode.querySelector(".tralbum-art-large, img")?.src || runtimeLive.art,
          pageUrl,
          artistUrl,
          duration,
          url: audio?.currentSrc || audio?.src || ""
        },
        queue: []
      };
    };
r.$suppressRemovedFeedTrack = function suppressRemovedFeedTrack(item) {
      const feed = r.$getFeedPlayerState();
      if (!feed?.track || !r.$matchingQueueTrack([item], feed.track)) return;
      r.$suppressedFeedTrackId = String(feed.track.id || item?.id || "");
      r.$pendingFeedTrackId = "";
      r.$pendingFeedSeekTime = null;
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

function registerPlayerShell4(r) {
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
        if (currentAudio !== expectedAudio || (currentTrackId && currentTrackId !== requestedTrackId)) return;
        if (!expectedAudio.paused) expectedAudio.pause();
        if (r.$pendingFeedTrackId === requestedTrackId) r.$pendingFeedTrackId = "";
        r.$pendingFeedSeekTime = null;
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
r.$scheduleModernHandoff = function scheduleModernHandoff(requestedKey = "", requestedIndex = null) {
      const request = ++r.$modernHandoffRequest;
      const poll = (attempt = 0) => {
        window.setTimeout(() => {
          if (request !== r.$modernHandoffRequest) return;
          const modern = r.$getModernPlayerState();
          if (modern && (!requestedKey || modern.key === requestedKey)) {
            if (r.$modernPlayerLinksReady(modern) || attempt >= 6) {
              void r.$handoffModernPlayer(requestedIndex);
              return;
            }
          }
          if (attempt < 6) poll(attempt + 1);
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
r.$handoffDiscoverPlayer = async function handoffDiscoverPlayer() {
      if (r.$discoverHandoffBusy) return false;
      const discover = r.$getDiscoverPlayerState();
      if (!discover?.track || !r.$isReusableStreamUrl(discover.track.url)) return false;
      r.$discoverHandoffBusy = true;
      r.$discoverHandoffTrackKey = r.$playlistTrackKey(discover.track);
      try {
        const prepared = await r.$prepareExternalNowPlaying(discover.track, [], { trustProvidedStreams: true });
        if (prepared.index < 0) return false;
        const latestDiscover = r.$getDiscoverPlayerState();
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
        if (prepared.request !== r.$playlistPlayRequest) return false;
        r.$pageMediaCommand("pause");
        r.$applySeamlessState(response.state);
        return true;
      } finally {
        r.$discoverHandoffBusy = false;
        r.$discoverHandoffTrackKey = "";
        if (r.$discoverHandoffPending) {
          r.$discoverHandoffPending = false;
          window.setTimeout(r.$scanLivePlayer, 0);
        }
      }
    };
}

function registerPlayerShell5(r) {
r.$handoffFeedPlayer = async function handoffFeedPlayer(requestedTrackId = "") {
      if (r.$feedHandoffBusy) {
        return Boolean(requestedTrackId && String(requestedTrackId) === r.$feedHandoffTrackId);
      }
      const feed = r.$getFeedPlayerState(requestedTrackId);
      if (!feed?.track || !feed.isPlaying || !r.$isReusableStreamUrl(feed.track.url)) return false;
      if (r.$suppressedFeedTrackId && String(feed.track.id || requestedTrackId || "") === r.$suppressedFeedTrackId) {
        r.$pendingFeedTrackId = "";
        r.$pendingFeedSeekTime = null;
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
      r.$feedHandoffBusy = true;
      r.$feedHandoffTrackId = String(feed.track.id || requestedTrackId || "");
      try {
        const prepared = await r.$prepareExternalNowPlaying(feed.track, [], { trustProvidedStreams: true });
        if (prepared.index < 0) return false;
        if (prepared.request !== r.$playlistPlayRequest) return false;
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
        if (prepared.request !== r.$playlistPlayRequest) return false;
        r.$applySeamlessState(response.state);
        if (r.$pendingFeedSeekTime !== null && r.$pendingFeedSeekRevision !== handoffSeekRevision) {
          await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: r.$pendingFeedSeekTime });
        }
        r.$finishFeedAudioHandoff(r.$feedHandoffTrackId, r.$getAudio());
        return true;
      } finally {
        r.$feedHandoffBusy = false;
        r.$feedHandoffTrackId = "";
      }
    };
r.$scheduleFeedHandoff = function scheduleFeedHandoff(trackId, attempt = 0) {
      const requestedTrackId = String(trackId || "");
      if (!requestedTrackId) return;
      if (requestedTrackId === r.$suppressedFeedTrackId) {
        r.$pendingFeedTrackId = "";
        r.$pendingFeedSeekTime = null;
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
          r.$restoreFeedAudioMute(requestedTrackId);
        }
      }, attempt ? 90 : 40);
    };
}

export const registerPlayerShell = [registerPlayerShell1, registerPlayerShell2, registerPlayerShell3, registerPlayerShell4, registerPlayerShell5];

export const setupPlayerShell = [];
