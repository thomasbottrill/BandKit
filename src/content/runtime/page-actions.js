import { createCollectionActionRow, setPageCardActionRow } from "../components/page-cards.js";
import { createPageDjButton, createPageTrackPurchaseButton, createPageSearchPlayButton } from "../components/page-actions.js";
import { runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { asset, portableBandcampUrl, removeStyleProperty, resolvedTrackPageUrl, safeBandcampReleaseUrl, safeBandcampUrl, setAttributeValue, setStyleProperty } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";
import { cartActivityIdentity, mergeCartSnapshots, portableCartRestore } from "../cart-model.js";
import { startPreparedPageTrack } from "./page-track-playback.js";

// Bandcamp's cart answers briefly report fewer items; a real removal persists.
const CART_SHRINK_CONFIRM_SCANS = 3;
// Keep signed stream links briefly; a long-lived collection tab must refresh them.
const COLLECTION_STREAM_TTL_MS = 5 * 60 * 1000;
function registerPageActions1(r) {
r.$maybeAnalyzePageTracks = function maybeAnalyzePageTracks() {
      if (runtimeState.djToolsEnabled === false) {
        r.$syncPageTrackAnalysisUi();
        return;
      }
      const tracks = r.$buildSeamlessQueue();
      if (!tracks.length) return;
      const signature = r.$pageAnalysisSignature(tracks);
      if (signature !== r.$pageTrackAnalysisSignature) {
        r.$pageTrackAnalysisSignature = signature;
        r.$pageTrackAnalysis = new Map();
        r.$pageTrackAnalysisStatus = "idle";
      }
      r.$syncPageTrackAnalysisUi();
      if (runtimeState.autoAnalyzeTracks !== false && r.$pageTrackAnalysisStatus === "idle") {
        void r.$analyzePageTracks();
      }
    };
r.$currentInlinePlaylistTrack = function currentInlinePlaylistTrack() {
      const queue = r.$buildSeamlessQueue();
      const title = r.$elementText(document.querySelector(".inline_player"), [".title", ".track-title"]);
      const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase();
      return queue.find((track) => String(track.title || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle)
        || queue[0]
        || null;
    };
r.$injectPageDjToolsLink = function injectPageDjToolsLink() {
      r.$ensurePageStyles();
      if (runtimeState.djToolsEnabled === false) {
        r.$pageDjOpen = false;
        runtimeState.dj.pageOpen = false;
        document.querySelectorAll(".bandcamp-hub-page-dj").forEach((button) => button.remove());
        document.querySelectorAll(".bandcamp-hub-page-dj-host").forEach((host) => host.remove());
        r.$pageDjHost = null;
        r.$pageDjSurface = null;
        r.$syncPageTrackAnalysisUi();
        return;
      }
      const modernActions = Boolean(runtimeState.appearance.modernReleasePages);
      const player = document.querySelector(".inline_player");
      if (!player) { if (r.$discoverReleaseTracks?.length) r.$maybeAnalyzePageTracks(); return; }
      let tools = player.querySelector(":scope > .bandcamp-hub-page-tools");
      if (!tools) {
        tools = document.createElement("div");
        tools.className = "bandcamp-hub-page-tools";
        player.append(tools);
      }
      let cartButton = tools.querySelector(".bandcamp-hub-page-cart");
      if (!cartButton) {
        cartButton = r.$createPageCartButton();
        tools.append(cartButton);
      }
      const pageCurrent = r.$getBandcampPageData()?.tralbum?.current;
      r.$updatePageCartButton(cartButton, pageCurrent?.type === "track" ? r.$currentInlinePlaylistTrack() : null);
      let playlistButton = tools.querySelector(".bandcamp-hub-page-playlist.is-player-control");
      if (!playlistButton) {
        playlistButton = r.$createPagePlaylistButton();
        playlistButton.classList.add("is-player-control");
        tools.append(playlistButton);
      }
      const releaseTracks = pageCurrent?.type === "album" ? r.$buildSeamlessQueue() : [];
      playlistButton._bandkitRelease = releaseTracks.length > 0;
      playlistButton._bandkitTracks = releaseTracks.length ? releaseTracks : null;
      playlistButton._bandkitReleaseTitle = releaseTracks[0]?.album || pageCurrent?.title || "this album";
      r.$updatePagePlaylistButton(playlistButton, r.$currentInlinePlaylistTrack());
      let button = tools.querySelector(".bandcamp-hub-page-dj");
      if (!button) {
        button = createPageDjButton();
        tools.append(button);
      }
      r.$setPageActionLabel(button, "BPM");
      if (!modernActions) {
        tools.querySelectorAll(":scope > :not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-dj)").forEach((control) => control.remove());
        if (playlistButton.nextElementSibling !== button) playlistButton.after(button);
      } else {
        if (cartButton.nextElementSibling !== playlistButton) cartButton.after(playlistButton);
        if (playlistButton.nextElementSibling !== button) playlistButton.after(button);
        let overflowButton = tools.querySelector(".bandcamp-hub-page-overflow");
        if (!overflowButton) {
          overflowButton = r.$createPageReleaseOverflowButton();
          tools.append(overflowButton);
        }
        r.$setPageActionLabel(overflowButton, "More");
        r.$applyPageActionTheme(overflowButton);
        overflowButton.hidden = !r.$nativeGiftControl() && runtimeState.autoAnalyzeTracks !== false;
        if (button.nextElementSibling !== overflowButton) button.after(overflowButton);
        const transportRow = tools.querySelector(":scope > .bandkit-page-transport-row");
        if (transportRow && tools.lastElementChild !== transportRow) tools.append(transportRow);
      }
      let inlineHost = player.querySelector(":scope > .bandcamp-hub-page-dj-host");
      if (!inlineHost) {
        inlineHost = document.createElement("div");
        inlineHost.className = "bandcamp-hub-page-dj-host";
      }
      inlineHost.classList.toggle("is-classic-page-dj", !modernActions);
      if (inlineHost.nextElementSibling !== tools) tools.before(inlineHost);
      const pageDjNeedsMount = r.$pageDjHost !== inlineHost
        || !inlineHost.shadowRoot
        || !r.$pageDjSurface?.isConnected
        || r.$pageDjSurface.getRootNode() !== inlineHost.shadowRoot;
      const pageDjCss = `${r.$style.textContent}\n:host{display:block}.hub-page-dj-surface{background:transparent;border:1px solid transparent;border-radius:6px;container-type:inline-size;padding:10px;width:100%}.hub-page-dj-surface:is(:hover,:focus-within){border-color:var(--hub-line)}.hub-page-dj-surface .hub-dj-card{background:transparent;border:0;box-shadow:none;margin:0;overflow:visible;padding:0}:host(.is-classic-page-dj) .hub-dj-card-page{grid-template-columns:minmax(0,1fr);row-gap:10px}:host(.is-classic-page-dj) .hub-dj-card-page .hub-dj-analysis-row{box-sizing:border-box;grid-column:1;grid-template-columns:minmax(76px,1fr) minmax(44px,max-content) minmax(48px,max-content);padding-right:28px;width:100%}:host(.is-classic-page-dj) .hub-dj-page-tempo{grid-column:1;width:100%}:host(.is-classic-page-dj) .hub-dj-page-modes{grid-column:1;grid-template-columns:repeat(2,minmax(48px,max-content));justify-self:start}:host(.is-classic-page-dj) .hub-dj-page-close{position:absolute;right:0;top:0}@container(max-width:280px){:host(.is-classic-page-dj) .hub-dj-card-page .hub-dj-analysis-row{grid-template-columns:minmax(64px,1fr) 42px 46px;gap:3px}}`;
      if (pageDjNeedsMount) {
        r.$pageDjHost = inlineHost;
        r.$syncCornerStyle?.();
        r.$syncScrubberStyles?.();
        r.$pageDjShadow = inlineHost.shadowRoot || inlineHost.attachShadow({ mode: "open" });
        r.$pageDjShadow.replaceChildren();
        r.$pageDjStyle = document.createElement("style");
        r.$pageDjStyle.dataset.bandkitPageDjStyle = "true";
        r.$pageDjStyle.textContent = pageDjCss;
        r.$pageDjSurface = document.createElement("div");
        r.$pageDjSurface.className = "hub-page-dj-surface";
        r.$pageDjShadow.append(r.$pageDjStyle, r.$pageDjSurface);
        r.$syncPageDjTheme();
      } else if (!r.$pageDjStyle?.isConnected
        || r.$pageDjStyle.getRootNode() !== r.$pageDjShadow
        || !r.$pageDjStyle.textContent.trim()) {
        r.$pageDjStyle = document.createElement("style");
        r.$pageDjStyle.dataset.bandkitPageDjStyle = "true";
        r.$pageDjStyle.textContent = pageDjCss;
        r.$pageDjShadow.prepend(r.$pageDjStyle);
      } else if (r.$pageDjStyle.textContent !== pageDjCss) {
        r.$pageDjStyle.textContent = pageDjCss;
      }
      if (pageDjNeedsMount || (r.$pageDjOpen && !r.$pageDjSurface.firstElementChild)) r.$renderPageDjTools();
      else r.$pageDjHost.hidden = !r.$pageDjOpen;
      r.$syncPageDjToolsUi();
      r.$maybeAnalyzePageTracks();
    };
r.$feedTrackFromAction = function feedTrackFromAction(action) {
      const story = action.closest(".story-innards, .story, .story-container, .new-release, .collection-item-container");
      if (!story) return null;
      const metadataNode = story.matches("[data-item-json]") ? story : story.querySelector("[data-item-json]");
      const itemData = r.$parseJsonAttribute(metadataNode, "data-item-json") || {};
      const releaseLink = story.querySelector("a.item-link[href], a[href*='.bandcamp.com/album/'], a[href*='.bandcamp.com/track/']");
      let pageUrl = "";
      try {
        // A story whose release link has not hydrated keeps an empty href, which
        // would otherwise resolve to the feed page itself.
        const rawPageUrl = itemData.item_url || releaseLink?.getAttribute("href")?.trim() || "";
        const resolved = rawPageUrl
          ? new URL(rawPageUrl.startsWith("//") ? `https:${rawPageUrl}` : rawPageUrl, location.href).href
          : "";
        pageUrl = /\/album\/|\/track\//.test(resolved) ? safeBandcampUrl(resolved) : "";
      } catch {
        pageUrl = "";
      }
      const title = itemData.featured_track_title
        || r.$elementText(story, [".fav-track-title", ".featured-track .title", ".track-title", ".collection-item-title"]);
      if (!pageUrl || !title) return null;
      const trackId = String(metadataNode?.dataset.trackid
        || story.querySelector("[data-trackid]")?.dataset.trackid
        || itemData.featured_track_id
        || title);
      const liveFeedTrack = r.$getFeedPlayerState()?.track;
      return {
        id: trackId,
        title,
        artist: itemData.band_name
          || r.$elementText(story, [".collection-item-artist", ".artist-name", ".band-name"]).replace(/^by\s+/i, "")
          || "Bandcamp",
        album: r.$elementText(story, [".collection-item-title", ".release-title"]) || itemData.item_title,
        art: itemData.item_art_url || story.querySelector("img")?.currentSrc || story.querySelector("img")?.src || "",
        pageUrl,
        artistUrl: safeBandcampUrl(itemData.band_url) || r.$artistUrlFromPageUrl(pageUrl),
        duration: Number(itemData.featured_track_duration) || 0,
        url: String(liveFeedTrack?.id) === trackId ? liveFeedTrack.url : ""
      };
    };
}

function registerPageActions2(r) {
r.$discoverTrackFromCard = function discoverTrackFromCard(card) {
      if (!card) return null;
      const pageLink = card.querySelector(".content a.stretch-link[href], a.stretch-link[href], a[href*='.bandcamp.com/album/'], a[href*='.bandcamp.com/track/']");
      const pageUrl = safeBandcampReleaseUrl(pageLink?.href);
      const title = r.$elementText(card, [".content .title", ".header .title", ".title"]);
      if (!pageUrl || !title) return null;
      const artist = r.$elementText(card, [".attribution-meta", ".artist", ".subtitle"]).replace(/^by\s+/i, "") || "Bandcamp";
      const track = {
        id: `${pageUrl}|${title}`,
        title,
        artist,
        album: title,
        art: card.querySelector(".image-container img, img")?.currentSrc || card.querySelector(".image-container img, img")?.src || "",
        pageUrl,
        artistUrl: r.$artistUrlFromPageUrl(pageUrl),
        duration: 0,
        url: ""
      };
      const liveTrack = r.$getDiscoverPlayerState()?.track;
      try {
        const cardRelease = new URL(pageUrl);
        const liveRelease = new URL(liveTrack?.pageUrl || "", location.href);
        if (cardRelease.origin === liveRelease.origin && cardRelease.pathname === liveRelease.pathname) {
          return { ...track, ...liveTrack, pageUrl, album: liveTrack.album || title };
        }
      } catch {}
      return track;
    };
r.$recommendationTrackFromCard = function recommendationTrackFromCard(card) {
      if (!card?.matches?.("#recommendations_container .recommended-album")) return null;
      const pageLink = card.querySelector("a.album-link[href], a.go-to-album[href], a[href*='/album/'], a[href*='/track/']");
      const pageUrl = resolvedTrackPageUrl({ pageUrl: pageLink?.href });
      const album = String(card.dataset.albumtitle || r.$elementText(card, [".release-title", ".title"])).replace(/\s+/g, " ").trim();
      const title = String(card.dataset.tracktitle || album).replace(/\s+/g, " ").trim();
      if (!pageUrl || !title) return null;
      const streamData = r.$parseJsonAttribute(card, "data-audiourl") || {};
      const streamUrl = typeof streamData === "string" ? streamData : streamData["mp3-128"] || "";
      const artist = String(card.dataset.artist || r.$elementText(card, [".by-artist", ".artist"])).replace(/^by\s+/i, "").trim() || "Bandcamp";
      return {
        id: String(card.dataset.trackid || `${pageUrl}|${title}`),
        title,
        artist,
        album,
        art: card.querySelector(".album-art")?.currentSrc || card.querySelector(".album-art, img")?.src || "",
        pageUrl,
        artistUrl: r.$artistUrlFromPageUrl(pageUrl),
        duration: Math.max(0, Number(card.dataset.duration) || 0),
        url: r.$isReusableStreamUrl(streamUrl) ? streamUrl : ""
      };
    };
r.$recommendationPlayControl = function recommendationPlayControl(card) {
      return card?.querySelector?.(".album-art-container > .play-button, .album-art-container > .play-pause-button, .album-art-container > .playbutton, [aria-label^='Play' i], [aria-label^='Pause' i]") || null;
    };
r.$syncRecommendationPlaybackUi = function syncRecommendationPlaybackUi() {
      for (const card of document.querySelectorAll("#recommendations_container .recommended-album")) {
        const track = r.$recommendationTrackFromCard(card);
        const current = Boolean(track && runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], track));
        const playing = current && Boolean(runtimeSeamless.isPlaying);
        card.classList.toggle("bandkit-recommendation-current", current);
        card.classList.toggle("bandkit-recommendation-playing", playing);
        const control = r.$recommendationPlayControl(card);
        if (!control || !track) continue;
        control.setAttribute("role", "button");
        if (!control.hasAttribute("tabindex")) control.tabIndex = 0;
        control.setAttribute("aria-label", current ? (playing ? `Pause ${track.title}` : `Resume ${track.title}`) : `Play ${track.title}`);
        control.setAttribute("aria-pressed", String(playing));
        r.$setPageActionLabel(control, playing ? "Pause" : "Play");
      }
    };
r.$injectRecommendationActions = function injectRecommendationActions() {
      const placements = [];
      for (const card of document.querySelectorAll("#recommendations_container .recommended-album")) {
        const track = r.$recommendationTrackFromCard(card);
        const artContainer = card.querySelector(".album-art-container");
        if (!track || !artContainer) continue;
        const playControl = r.$recommendationPlayControl(card);
        if (playControl && playControl.dataset.bandkitKeyboardBound !== "true") {
          playControl.dataset.bandkitKeyboardBound = "true";
          playControl.addEventListener("keydown", (event) => {
            if (!["Enter", " "].includes(event.key)) return;
            event.preventDefault();
            playControl.click();
          });
        }
        let button = card.querySelector(".bandcamp-hub-page-playlist.is-recommendation-add-to");
        if (!button) {
          button = r.$createPagePlaylistButton();
          button.classList.add("is-discover-add-to", "is-recommendation-add-to");
          artContainer.append(button);
        } else if (button.parentElement !== artContainer) {
          artContainer.append(button);
        }
        // A recommended album is a release like any other, so its menu offers
        // album destinations rather than the one track that was previewed.
        button._bandkitReleaseTrack = track;
        r.$bindReleaseAddPrefetch(button);
        r.$updatePagePlaylistButton(button, track);
        const label = `Add ${track.title} to Now Playing or a playlist`;
        setAttributeValue(button, "aria-label", label);
        setAttributeValue(button, "title", label);
        placements.push({ button, playControl });
      }
      // Measure every control before positioning any button. Interleaving the
      // reads with the writes above costs one full page layout per card, which
      // is the most expensive thing a playback update can do on a release page.
      const measured = placements.map(({ button, playControl }) => playControl
        ? {
          button,
          left: `${playControl.offsetLeft + (playControl.offsetWidth || 36) + 6}px`,
          top: `${playControl.offsetTop + Math.max(0, ((playControl.offsetHeight || 36) - 28) / 2)}px`
        }
        : { button, left: "8px", top: "auto", bottom: "8px" });
      for (const { button, left, top, bottom } of measured) {
        setStyleProperty(button.style, "left", left);
        setStyleProperty(button.style, "top", top);
        if (bottom) setStyleProperty(button.style, "bottom", bottom);
        else removeStyleProperty(button.style, "bottom");
      }
      r.$syncRecommendationPlaybackUi();
    };
r.$runNativeRecommendationControl = function runNativeRecommendationControl(control) {
      if (!control) return;
      r.$suppressRecommendationControl = true;
      control.click();
      window.setTimeout(() => {
        r.$suppressRecommendationControl = false;
        window.setTimeout(r.$scanLivePlayer, 0);
      }, 0);
    };
r.$playRecommendationCard = async function playRecommendationCard(card, control) {
      const track = r.$recommendationTrackFromCard(card);
      if (!track) return false;
      const request = ++r.$recommendationHandoffRequest;
      r.$showToast(`Preparing ${track.title}…`);
      try {
        const prepared = await r.$prepareExternalNowPlaying(track);
        if (prepared.cancelled || prepared.capacity || request !== r.$recommendationHandoffRequest) return false;
        if (prepared.index < 0) throw new Error(prepared.error || "This recommendation is not currently streamable.");
        r.$silenceNativePagePlayback();
        const response = await r.$runtimeMessage({
          type: MESSAGES.SEAMLESS_ENABLE,
          queue: prepared.queue,
          index: prepared.index,
          currentTime: 0,
          autoplay: true,
          rate: runtimeState.dj.rate,
          preservePitch: runtimeState.dj.preservePitch,
          filterValue: runtimeState.dj.filterValue,
          gainDb: runtimeState.dj.gainDb,
          eqLowDb: runtimeState.dj.eqLowDb,
          eqMidDb: runtimeState.dj.eqMidDb,
          eqHighDb: runtimeState.dj.eqHighDb
        });
        if (!response?.ok) throw new Error(response?.error || "Bandkit could not start this recommendation.");
        if (request !== r.$recommendationHandoffRequest || prepared.request !== r.$playlistPlayRequest) return false;
        r.$applySeamlessState(response.state);
        return true;
      } catch {
        if (request !== r.$recommendationHandoffRequest) return false;
        r.$showToast("Using Bandcamp's player for this recommendation.");
        if (runtimeSeamless.enabled) await r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
        r.$runNativeRecommendationControl(control);
        return false;
      }
    };
r.$playSearchResult = async function playSearchResult(track, { revealPanel = true } = {}) {
      if (!track) return false;
      r.$addTracksToPlaylist([track], { quiet: true, syncQueue: false });
      const index = runtimeState.playlist.findIndex((item) => r.$playlistTracksMatch(item, track));
      if (index < 0) return false;
      return r.$playPlaylistAt(index, { forceRefresh: true, revealPanel });
    };
r.$syncSearchPlaybackUi = function syncSearchPlaybackUi() {
      for (const playButton of document.querySelectorAll(".searchresult .bandkit-search-play")) {
        const track = playButton._bandkitTrack;
        if (!track) continue;
        const current = Boolean(runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], track));
        const playing = current && Boolean(runtimeSeamless.isPlaying);
        playButton.style.setProperty("--bandkit-search-play-icon", `url('${asset(playing ? "icon-pause.svg" : "icon-play.svg")}')`);
        playButton.setAttribute("aria-label", current ? (playing ? `Pause ${track.title}` : `Resume ${track.title}`) : `Play ${track.title}`);
        playButton.setAttribute("aria-pressed", String(playing));
        playButton.title = playButton.getAttribute("aria-label");
        r.$applyPageActionTheme(playButton);
      }
    };
}
function registerPageActions3(r) {
r.$collectionTrackFromCard = function collectionTrackFromCard(card) {
      if (!card) return null;
      const metadataNode = card.matches("[data-item-json]") ? card : card.querySelector("[data-item-json]");
      const itemData = r.$parseJsonAttribute(metadataNode, "data-item-json") || {};
      const itemLink = card.querySelector(".collection-item-gallery-container a.item-link[href]")
        || card.querySelector("a.item-link[href*='.bandcamp.com/album/'], a.item-link[href*='.bandcamp.com/track/']");
      const pageUrl = resolvedTrackPageUrl({ pageUrl: itemData.item_url || itemLink?.href });
      const releaseTitle = card.dataset.title
        || itemData.item_title
        || r.$elementText(card, [".collection-item-gallery-container .collection-item-title", ".collection-item-title"]);
      const title = itemData.featured_track_title
        || card.dataset.tracktitle
        || r.$elementText(card, [".fav-track-title", ".fav-track-link", ".fav-track-static", ".featured-track .title", ".track-title"])
        || releaseTitle;
      if (!pageUrl || !title) return null;
      const artist = String(itemData.band_name || r.$elementText(card, [".collection-item-gallery-container .collection-item-artist", ".collection-item-artist"]))
        .replace(/^by\s+/i, "") || "Bandcamp";
      const itemType = String(card.dataset.tralbumtype || card.dataset.itemtype || "").toLowerCase();
      return {
        id: String(itemData.featured_track_id || metadataNode?.dataset.trackid || card.dataset.trackid || title),
        title,
        artist,
        album: itemData.item_title || (itemType === "a" || itemType === "album" ? releaseTitle : ""),
        art: itemData.item_art_url || card.querySelector(".collection-item-art")?.currentSrc || card.querySelector(".collection-item-art")?.src || "",
        pageUrl,
        artistUrl: safeBandcampReleaseUrl(itemData.band_url) || safeBandcampUrl(itemData.band_url) || r.$artistUrlFromPageUrl(pageUrl),
        duration: Number(itemData.featured_track_duration) || 0,
        url: ""
      };
    };
// A collection or wishlist card carries no stream URL, so the first click has
// to read the release page before anything can play. Reading it on hover makes
// the click itself immediate, and the resolved URL is reused for the session.
r.$prefetchCollectionStream = function prefetchCollectionStream(track) {
      const key = track && r.$playlistTrackKey(track);
      if (!key || r.$collectionStreamRequests.has(key)) return;
      const cached = r.$collectionStreams.get(key);
      if (cached && Date.now() - cached.at < COLLECTION_STREAM_TTL_MS) return;
      r.$collectionStreamRequests.set(key, r.$runtimeMessage({
        type: MESSAGES.RESOLVE_PLAYLIST_ITEMS,
        items: [track]
      }).then((response) => {
        const item = response?.items?.[0];
        const url = item && r.$isReusableStreamUrl(item.url) ? item.url : "";
        if (url) r.$collectionStreams.set(key, { url, at: Date.now() });
        return url;
      }).catch(() => "").finally(() => r.$collectionStreamRequests.delete(key)));
    };
r.$collectionStreamUrl = function collectionStreamUrl(track) {
      const key = track && r.$playlistTrackKey(track);
      const cached = key ? r.$collectionStreams.get(key) : null;
      return cached && Date.now() - cached.at < COLLECTION_STREAM_TTL_MS ? cached.url : "";
    };
r.$cacheCollectionStream = function cacheCollectionStream(track, item) {
      const key = track && r.$playlistTrackKey(track);
      if (key && item && r.$isReusableStreamUrl(item.url)) r.$collectionStreams.set(key, { url: item.url, at: Date.now() });
    };
r.$runNativeCollectionControl = function runNativeCollectionControl(control) {
      if (!control) return;
      const activeCard = control.closest(".collection-item-container");
      for (const card of document.querySelectorAll("#collection-items .collection-item-container, #wishlist-items .collection-item-container")) {
        card.toggleAttribute("data-bandkit-native-collection-playing", card === activeCard);
      }
      r.$releaseExplicitPlaybackClear();
      r.$collectionNativeFallbackUntil = Date.now() + 5000;
      r.$suppressCollectionControl = true;
      control.click();
      window.setTimeout(() => {
        r.$suppressCollectionControl = false;
      }, 0);
    };
r.$playCollectionCard = async function playCollectionCard(card, control) {
      const track = r.$collectionTrackFromCard(card);
      if (!track) return false;
      const request = ++r.$collectionHandoffRequest;
      r.$discoverPlaybackRequest += 1;
      r.$discoverPendingTrack = null;
      const knownStream = r.$collectionStreamUrl(track);
      if (!knownStream) r.$showToast(`Preparing ${track.title}…`);
      try {
        const prepared = await r.$prepareExternalNowPlaying(
          knownStream ? { ...track, url: knownStream } : track,
          [],
          { trustProvidedStreams: Boolean(knownStream) }
        );
        if (prepared.cancelled || prepared.capacity) return false;
        if (request !== r.$collectionHandoffRequest) return false;
        if (prepared.index < 0) throw new Error(prepared.error || "This collection item is not streamable.");
        r.$cacheCollectionStream(track, prepared.queue[prepared.index]);
        r.$silenceNativePagePlayback();
        const state = await startPreparedPageTrack(r, prepared, runtimeState.dj);
        if (!state) return false;
        if (request !== r.$collectionHandoffRequest) return false;
        if (prepared.request !== r.$playlistPlayRequest) return false;
        r.$cacheCollectionStream(track, state.track);
        r.$applySeamlessState(state);
        return true;
      } catch {
        if (request !== r.$collectionHandoffRequest) return false;
        r.$showToast("Using Bandcamp's player for this item.");
        // Start Bandcamp's own player straight away. Stopping the seamless one
        // only has to land before the native stream starts making sound, and
        // waiting for that round trip first made the fallback feel broken.
        r.$runNativeCollectionControl(control);
        if (runtimeSeamless.enabled) void r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
        return false;
      }
    };
r.$injectCollectionItemActions = function injectCollectionItemActions() {
      const modernActions = Boolean(runtimeState.appearance.modernReleasePages);
      const collectionGrids = [...document.querySelectorAll('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"], #wishlist-items .collection-grid[data-iswish="true"]')];
      document.documentElement.dataset.bandkitCollectionPage = String(collectionGrids.length > 0);
      if (!collectionGrids.length) return;
      for (const card of collectionGrids.flatMap((grid) => [...grid.querySelectorAll(".collection-item-container")])) {
        const track = r.$collectionTrackFromCard(card);
        const downloadSource = card.querySelector('.bottom-owner-controls .redownload-item a[href*="/download"]');
        const titleDetails = card.querySelector(".collection-item-gallery-container .collection-title-details");
        const isWishlistItem = Boolean(card.closest('#wishlist-items .collection-grid[data-iswish="true"]'));
        if (!track || !titleDetails) continue;

        // Read the stream on hover so pressing play does not wait on a release
        // page fetch first. Bound once per card: the sweeps rebuild controls,
        // not the card itself.
        if (card.dataset.bandkitStreamPrefetch !== "true") {
          card.dataset.bandkitStreamPrefetch = "true";
          const prefetchStream = () => r.$prefetchCollectionStream(r.$collectionTrackFromCard(card));
          card.addEventListener("pointerenter", () => {
            window.clearTimeout(card._bandkitStreamPrefetchTimer);
            // A brief settle keeps a mouse sweep across the grid from reading
            // every release page it passes over.
            card._bandkitStreamPrefetchTimer = window.setTimeout(prefetchStream, 120);
          }, { passive: true });
          card.addEventListener("pointerleave", () => {
            window.clearTimeout(card._bandkitStreamPrefetchTimer);
          }, { passive: true });
          card.addEventListener("focusin", prefetchStream);
        }

        if (!isWishlistItem && !downloadSource) continue;

        let actionRow = titleDetails.querySelector(":scope > .bandkit-collection-action-row");
        if (!actionRow) {
          actionRow = createCollectionActionRow();
          titleDetails.append(actionRow);
        }
        setPageCardActionRow(actionRow, modernActions);

        let playlistButton = card.querySelector(".bandcamp-hub-page-playlist");
        if (!playlistButton) playlistButton = r.$createPagePlaylistButton();
        playlistButton.classList.add("is-collection-action");
        playlistButton.classList.toggle("is-feed-compact-action", !modernActions);
        playlistButton.classList.toggle("is-discover-add-to", modernActions);
        playlistButton.classList.toggle("bandkit-collection-overlay-action", modernActions);
        playlistButton.classList.remove("is-feed-add-to", "is-feed-sidebar-action");
        playlistButton._bandkitOwned = !isWishlistItem;
        // A collection or wishlist card stands for the release it links to, so
        // an album card offers album destinations instead of its featured
        // track. The click resolves the track list before deciding.
        playlistButton._bandkitReleaseTrack = track;
        r.$bindReleaseAddPrefetch(playlistButton);
        r.$updatePagePlaylistButton(playlistButton, track);
        playlistButton.title = `Add ${track.title} to Now Playing or a playlist`;
        const art = card.querySelector(".collection-item-art-container");
        const playlistHost = modernActions && art ? art : actionRow;
        if (playlistButton.parentElement !== playlistHost) playlistHost.append(playlistButton);

        if (downloadSource) {
          let downloadButton = card.querySelector(".bandkit-collection-download-action");
          if (!downloadButton) {
            downloadButton = document.createElement("a");
            downloadButton.className = "bandkit-feed-purchase-action bandkit-collection-download-action";
            downloadButton.style.setProperty("--bandkit-feed-action-icon", `url('${asset("icon-downloads.svg")}')`);
          }
          downloadButton.classList.toggle("bandkit-collection-overlay-action", modernActions);
          const downloadHost = modernActions && art ? art : actionRow;
          if (downloadButton.parentElement !== downloadHost) downloadHost.append(downloadButton);
          downloadButton.href = downloadSource.href;
          r.$setPageActionLabel(downloadButton, "Download");
          downloadButton.setAttribute("aria-label", `Download ${track.title}`);
          downloadButton.title = `Download ${track.title}`;
        }
      }
    };
}

function registerDiscoverReleaseAddButton(r) {
r.$applyDiscoverReleaseAddButton = function applyDiscoverReleaseAddButton(button, fallbackTrack) {
      // Discover's release control stands for the whole release, matching the album
      // page. Until the tracks resolve it falls back to the featured track, but
      // keeps that track so a click can resolve the release rather than adding it.
      const releaseTracks = r.$discoverRelease?.tracks || [];
      button._bandkitRelease = releaseTracks.length > 0;
      button._bandkitTracks = releaseTracks.length ? releaseTracks : null;
      button._bandkitReleaseTitle = r.$discoverRelease?.album || fallbackTrack?.album || "this album";
      button._bandkitReleaseTrack = fallbackTrack || releaseTracks[0] || null;
      r.$bindReleaseAddPrefetch(button);
      r.$updatePagePlaylistButton(button, releaseTracks[0] || fallbackTrack);
      button.classList.add("is-discover-release-add");
    };
// Reading the release once on hover keeps the click's menu immediate.
r.$bindReleaseAddPrefetch = function bindReleaseAddPrefetch(button) {
      if (button._bandkitReleasePrefetchBound) return;
      button._bandkitReleasePrefetchBound = true;
      button.addEventListener("pointerenter", () => {
        void r.$resolveFeedReleaseTracks(button._bandkitReleaseTrack);
        r.$prefetchFeedPurchase(button._bandkitReleaseTrack?.releaseUrl || button._bandkitReleaseTrack?.pageUrl);
      });
    };
// A feed story for an album must add that album, not its featured track, so the
// cart and wishlist receive one album item the way the release page does. The
// story only counts as a release once its own track list has resolved, so the
// menu never offers an album action it cannot fulfil.
r.$applyFeedReleaseAddButton = function applyFeedReleaseAddButton(button, story, track) {
      button._bandkitFeedStory = story;
      button._bandkitFeedTrack = track;
      const releaseHost = story?.querySelector(".bandkit-discover-tracklist");
      const releaseTracks = (releaseHost && r.$feedAlbumQueues?.get(releaseHost)) || [];
      const isAlbumStory = /\/album\//.test(track.pageUrl || "");
      const asRelease = isAlbumStory && releaseTracks.length > 0;
      button._bandkitRelease = asRelease;
      button._bandkitTracks = asRelease ? releaseTracks : null;
      button._bandkitReleaseTitle = track.album || track.title || "this album";
      r.$updatePagePlaylistButton(button, asRelease ? releaseTracks[0] : track);
    };
// The release control belongs beside Buy and Wishlist whenever a release is open,
// not only while Bandcamp's own preview player happens to be visible. Discover
// rebuilds those actions around a selection, so the resolved tracklist calls this
// directly rather than relying on a sweep landing after the rebuild.
r.$syncDiscoverReleaseAddControl = function syncDiscoverReleaseAddControl(fallbackTrack) {
      const releaseActions = document.querySelector(".focused-result .release-buttons, .discover-detail .release-buttons");
      const releaseTrack = r.$discoverRelease?.tracks?.[0] || fallbackTrack;
      if (!releaseActions || !releaseTrack) return;
      let button = releaseActions.querySelector(":scope > .bandcamp-hub-page-playlist.is-discover-add-to");
      if (!button) {
        button = r.$createPagePlaylistButton();
        button.classList.add("is-discover-add-to");
        releaseActions.append(button);
      }
      button.style.removeProperty("left");
      button.style.removeProperty("top");
      r.$applyDiscoverReleaseAddButton(button, releaseTrack);
      // The selected release is whatever the focused result links to, which can
      // already have moved on from the track list held in memory. Anchor the
      // button to that URL so its click resolves the release actually on screen.
      const releaseUrl = safeBandcampUrl(releaseActions.querySelector("a.buy-button[href]")?.href);
      if (releaseUrl) button._bandkitReleaseTrack = { ...(releaseTrack || {}), pageUrl: releaseUrl, releaseUrl };
    };
}

function registerFeedReleaseAddRefresh(r) {
r.$refreshFeedReleaseAddButtons = function refreshFeedReleaseAddButtons() {
      // A story is only known to be an album once its track list resolves, which
      // lands after the action sweep has already marked the story scanned. Without
      // this pass the control keeps offering the featured track alone.
      for (const button of document.querySelectorAll(".story-innards .bandcamp-hub-page-playlist.is-feed-add-to")) {
        const track = button._bandkitFeedTrack;
        if (!track || button._bandkitRelease) continue;
        r.$applyFeedReleaseAddButton(button, button._bandkitFeedStory, track);
      }
    };
}
function registerPageActionInjectionHelpers(r) {
r.$injectFeedPageActions = function injectFeedPageActions({ incremental, onFeedPage }) {
      if (onFeedPage) {
        r.$refreshFeedReleaseAddButtons();
        const modernActions = Boolean(runtimeState.appearance.modernReleasePages);
        // Only the story action rows can carry a purchase control. Scanning
        // every story link instead marked thousands of nodes on each sweep,
        // which the page session replay then had to serialise.
        const unscanned = incremental ? ":not([data-bandkit-feed-action-scanned])" : "";
        const feedControls = document.querySelectorAll([
          `.story-innards .tralbum-wrapper-collect-controls :is(a, button)${unscanned}`,
          `#sidebar .collection-item-container .collect-item :is(a, button)${unscanned}`
        ].join(","));
        for (const purchaseAction of feedControls) {
          purchaseAction.dataset.bandkitFeedActionScanned = "true";
          if (!/^(?:pre[- ]?order|buy now)$/i.test(r.$pageActionControlText(purchaseAction))) continue;
          const track = r.$feedTrackFromAction(purchaseAction);
          if (!track) continue;
          const story = purchaseAction.closest(".story-innards, .story, .story-container, .new-release, .collection-item-container");
          // Generated album rows own their own per-track add buttons; the story
          // action row must never adopt or remove them.
          const existingButtons = [...(story?.querySelectorAll(".bandcamp-hub-page-playlist:not(.is-track-action)") || [])];
          let button = existingButtons.find((candidate) => candidate.classList.contains("is-feed-add-to")) || existingButtons[0] || null;
          if (!button) button = r.$createPagePlaylistButton();
          button.classList.add("is-feed-add-to");
          r.$applyFeedReleaseAddButton(button, story, track);
          for (const duplicate of existingButtons) {
            if (duplicate !== button) duplicate.remove();
          }

          const sidebarCard = purchaseAction.closest(".collection-grid .collection-item-container");
          button.classList.toggle("is-feed-compact-action", modernActions);
          button.classList.toggle("is-feed-sidebar-action", modernActions && Boolean(sidebarCard));
          r.$setPageActionLabel(button, "Add");
          if (!button._bandkitRelease) button.title = `Add ${track.title} to Now Playing or a playlist`;
          purchaseAction.classList.toggle("bandkit-feed-purchase-action", modernActions);
          const purchaseLabel = /^pre[- ]?order$/i.test(r.$pageActionControlText(purchaseAction)) ? "Pre-order" : "Buy now";
          r.$setPageActionLabel(purchaseAction, purchaseLabel);
          purchaseAction.title = `${purchaseLabel} ${track.album || track.title}`;
          purchaseAction.setAttribute("aria-label", purchaseAction.title);
          purchaseAction.style.setProperty("--bandkit-feed-action-icon", `url('${asset(purchaseLabel === "Pre-order" ? "icon-preorder.svg" : "icon-cart.svg")}')`);
          if (purchaseAction.matches("a[href]")) {
            const purchaseUrl = safeBandcampUrl(purchaseAction.href);
            if (purchaseUrl) {
              const target = new URL(purchaseUrl);
              target.hash = "bandkit-cart";
              purchaseAction.href = target.href;
            }
          }
          // The story's own control adds the release here instead of handing the
          // listener to the release page, which only ever opened its buy panel.
          if (!purchaseAction._bandkitCartBound) {
            purchaseAction._bandkitCartBound = true;
            purchaseAction.addEventListener("pointerenter", () => {
              r.$prefetchFeedPurchase(purchaseAction._bandkitCartTrack?.releaseUrl || purchaseAction._bandkitCartTrack?.pageUrl);
            });
            purchaseAction.addEventListener("click", (event) => {
              const requested = purchaseAction._bandkitCartTrack;
              if (!requested || !r.$cartFeaturesEnabled()) return;
              event.preventDefault();
              event.stopPropagation();
              void r.$requestReleaseCartAdd(purchaseAction, requested);
            });
          }
          purchaseAction._bandkitCartTrack = purchaseLabel === "Pre-order" ? null : track;
          const actionList = purchaseAction.closest("ul");
          setPageCardActionRow(actionList, modernActions, Boolean(sidebarCard));
          const hearMoreAction = [...(actionList?.querySelectorAll("a, button") || [])].find((control) => /^hear more$/i.test(r.$pageActionControlText(control)));
          if (hearMoreAction) {
            hearMoreAction.classList.toggle("bandkit-feed-hear-more-action", modernActions);
            r.$setPageActionLabel(hearMoreAction, "Hear more");
            hearMoreAction.title = `Hear more from ${track.album || track.artist || track.title}`;
            hearMoreAction.setAttribute("aria-label", hearMoreAction.title);
            hearMoreAction.style.setProperty("--bandkit-feed-action-icon", `url('${asset("icon-hear-more.svg")}')`);
          }
          const wishlistItem = actionList?.querySelector("li[id^='collect-item_']")
            || [...(actionList?.querySelectorAll("li") || [])].find((item) => /^(?:in )?wishlist$/i.test(r.$pageActionControlText(item)));
          wishlistItem?.classList.toggle("bandkit-feed-wishlist-action", modernActions);
          if (modernActions) {
            wishlistItem?.style.setProperty("--bandkit-feed-wishlist-icon", `url('${asset("icon-wishlist.svg")}')`);
            wishlistItem?.style.setProperty("--bandkit-feed-wishlist-filled-icon", `url('${asset("icon-wishlist-filled.svg")}')`);
          } else {
            wishlistItem?.style.removeProperty("--bandkit-feed-wishlist-icon");
            wishlistItem?.style.removeProperty("--bandkit-feed-wishlist-filled-icon");
          }
          const wishlistControl = wishlistItem?.querySelector(".wishlist-msg")
            || [...(wishlistItem?.querySelectorAll("a, button") || [])].find((control) => /^wishlist$/i.test(r.$pageActionControlText(control)));
          const wishlistedControl = wishlistItem?.querySelector(".wishlisted-msg > span:first-child")
            || [...(wishlistItem?.querySelectorAll("a, button") || [])].find((control) => /^in wishlist$/i.test(r.$pageActionControlText(control)));
          if (wishlistControl) {
            wishlistControl._bandkitActivityTrack = track;
            if (wishlistControl.dataset.bandkitActivityBound !== "true") {
              wishlistControl.dataset.bandkitActivityBound = "true";
              wishlistControl.addEventListener("click", () => {
                const selectedTrack = wishlistControl._bandkitActivityTrack;
                if (selectedTrack) window.setTimeout(() => r.$markWishlistTrack(selectedTrack, true), 0);
              });
            }
            wishlistControl.classList.toggle("bandkit-feed-wishlist-control", modernActions);
            r.$setPageActionLabel(wishlistControl, "Wishlist");
            wishlistControl.title = `Add ${track.album || track.title} to your wishlist`;
            wishlistControl.setAttribute("aria-label", wishlistControl.title);
          }
          if (wishlistedControl) {
            wishlistedControl._bandkitActivityTrack = track;
            if (wishlistedControl.dataset.bandkitActivityBound !== "true") {
              wishlistedControl.dataset.bandkitActivityBound = "true";
              wishlistedControl.addEventListener("click", () => {
                const selectedTrack = wishlistedControl._bandkitActivityTrack;
                if (selectedTrack) window.setTimeout(() => r.$markWishlistTrack(selectedTrack, false), 0);
              });
            }
            wishlistedControl.classList.toggle("bandkit-feed-wishlist-control", modernActions);
            r.$setPageActionLabel(wishlistedControl, "In Wishlist");
            wishlistedControl.title = `${track.album || track.title} is in your wishlist`;
            wishlistedControl.setAttribute("aria-label", wishlistedControl.title);
          }
          if (purchaseAction.previousElementSibling !== button) purchaseAction.before(button);
        }
      }
    };
r.$injectDiscoverPageActions = function injectDiscoverPageActions({ incremental, discover }) {
      if (document.querySelector("#DiscoverApp, .results-grid")) {
        r.$syncDiscoverReleaseAddControl(discover?.track);
        const allDiscoverPlayControls = [...document.querySelectorAll([
          ".results-grid-item .image-container > .play-pause-button",
          ".results-grid-item .image-container > .play-button",
          ".focused-result .play-pause-button",
          ".focused-result .play-button",
          ".focused-result .playbutton",
          ".discover-detail .play-pause-button",
          ".discover-detail .play-button",
          ".discover-detail .playbutton",
          ".focused-result [aria-label^='Play' i]",
          ".focused-result [aria-label^='Pause' i]",
          ".discover-detail [aria-label^='Play' i]",
          ".discover-detail [aria-label^='Pause' i]"
        ].join(", "))];
        const pendingDiscoverPlayControls = incremental
          ? allDiscoverPlayControls.filter((control) => !control.closest(".results-grid-item") || control.dataset.bandkitDiscoverActionScanned !== "true")
          : allDiscoverPlayControls;
        const discoverBatchSize = incremental ? 12 : pendingDiscoverPlayControls.length;
        const visibleDiscoverPlayControls = pendingDiscoverPlayControls.slice(0, discoverBatchSize);
        const hasDeferredDiscoverControls = pendingDiscoverPlayControls.length > visibleDiscoverPlayControls.length;
        const discoverButtonLayouts = [];
        for (const playControl of visibleDiscoverPlayControls) {
          if (playControl.closest(".bandcamp-hub-page-playlist")) continue;
          const nativeDiscoverPlayer = playControl.closest(".discover-player");
          if (nativeDiscoverPlayer && getComputedStyle(nativeDiscoverPlayer).display === "none") continue;
          const resultCard = playControl.closest(".results-grid-item");
          const cardTrack = resultCard ? r.$discoverTrackFromCard(resultCard) : discover?.track;
          if (!cardTrack) continue;
          const parent = resultCard
            ? playControl.parentElement
            : playControl.closest(".focused-result, .discover-detail")?.querySelector(".release-buttons")
              || playControl.closest(".focused-result, .discover-detail") || playControl.parentElement;
          if (!parent) continue;
          if (resultCard) playControl.dataset.bandkitDiscoverActionScanned = "true";
          r.$applyPageActionTheme(playControl);
          r.$setPageActionLabel(playControl, /^pause/i.test(playControl.getAttribute("aria-label") || "") ? "Pause" : "Play");
          const detail = playControl.closest(".results-grid-item, .focused-result, .discover-detail") || parent;
          let button = detail.querySelector(".bandcamp-hub-page-playlist.is-discover-add-to");
          if (!button) {
            button = r.$createPagePlaylistButton();
            button.classList.add("is-discover-add-to");
            parent.append(button);
          } else if (button.parentElement !== parent) {
            parent.append(button);
          }
          const inReleaseActions = parent.matches(".release-buttons");
          if (inReleaseActions) {
            r.$applyDiscoverReleaseAddButton(button, cardTrack);
            button.style.removeProperty("left");
            button.style.removeProperty("top");
          } else {
            button._bandkitRelease = false;
            button._bandkitTracks = null;
            // The grid control stands for whatever release its card links to.
            // Hold the card track so a click resolves the album's track list
            // instead of asking the cart for a track the album page cannot
            // serve. Hovering resolves it ahead of the click.
            button._bandkitReleaseTrack = cardTrack;
            r.$bindReleaseAddPrefetch(button);
            r.$updatePagePlaylistButton(button, cardTrack);
            button.setAttribute("aria-label", `Add ${cardTrack.title} to Now Playing or a playlist`);
            button.title = button.getAttribute("aria-label");
            button.classList.remove("is-discover-release-add");
            discoverButtonLayouts.push({ button, playControl });
          }
        }
        // Measure every native control before writing any positions. Interleaving
        // offset reads with per-card style writes forced a full Discover layout
        // dozens of times during each scan, which became increasingly expensive
        // after the virtualised grid had been scrolled.
        const measuredDiscoverButtonLayouts = discoverButtonLayouts.map(({ button, playControl }) => ({
          button,
          left: playControl.offsetLeft + (playControl.offsetWidth || 64) + 8,
          top: playControl.offsetTop
        }));
        for (const { button, left, top } of measuredDiscoverButtonLayouts) {
          button.style.left = `${left}px`;
          button.style.top = `${top}px`;
        }
        // The generated tracklist owns its own row controls, so the shared sweep only
        // keeps their themed colours in step with the rest of the page.
        for (const control of document.querySelectorAll(".bandkit-discover-tracks .bandkit-discover-track-actions > *")) {
          if (control._bandkitTrack) r.$updatePagePlaylistButton(control, control._bandkitTrack);
          else r.$applyPageActionTheme(control);
        }
        if (hasDeferredDiscoverControls) {
          r.$pageActionsDirty = true;
          r.$scheduleLivePlayerMaintenance(80);
        }
      }
    };
}

function registerPageActions4(r) {
// Page buttons are rebuilt from the same queue every time, so a burst of
// playlist updates repeats identical work. Keep at most one sweep per frame,
// and let a full request win over an incremental one queued beside it.
r.$schedulePlaylistButtons = function schedulePlaylistButtons({ incremental = false } = {}) {
      if (!incremental) r.$pendingPlaylistButtonsFull = true;
      if (r.$playlistButtonsFrame) return;
      r.$playlistButtonsFrame = window.requestAnimationFrame(() => {
        const full = r.$pendingPlaylistButtonsFull === true;
        r.$injectPlaylistButtons({ incremental: !full });
      });
    };
r.$injectPlaylistButtons = function injectPlaylistButtons({ incremental = false } = {}) {
      if (r.$playlistButtonsFrame) {
        window.cancelAnimationFrame(r.$playlistButtonsFrame);
        r.$playlistButtonsFrame = 0;
      }
      r.$pendingPlaylistButtonsFull = false;
      r.$pageActionsDirty = false;
      r.$ensurePageStyles();
      r.$injectHomeSalesActions();
      r.$injectCollectionItemActions();
      r.$injectRecommendationActions();
      const playerPlaylistButton = document.querySelector(".inline_player .bandcamp-hub-page-playlist.is-player-control");
      if (playerPlaylistButton) r.$updatePagePlaylistButton(playerPlaylistButton, r.$currentInlinePlaylistTrack());
      const discover = r.$getDiscoverPlayerState();
      const feed = r.$getFeedPlayerState();
      const available = [
        ...r.$buildSeamlessQueue(),
        ...(r.$getModernPlayerState()?.queue || []),
        discover?.track,
        feed?.track
      ].filter(Boolean);
      const onFeedPage = document.documentElement.dataset.bandkitFeedPage === "true";
      const candidates = [
        ...document.querySelectorAll(".track_row_view"),
        ...document.querySelectorAll("section.floating-player .track-meta[streamurl]"),
        ...document.querySelectorAll(onFeedPage ? ".searchresult" : ".searchresult, .collection-item-container[data-trackid]")
      ];

      r.$injectFeedPageActions({ incremental, onFeedPage });
      r.$injectDiscoverPageActions({ incremental, discover });

      if (discover?.player) candidates.push(discover.player);
      if (feed?.player) candidates.push(feed.player);

      for (const node of [...new Set(candidates)]) {
        // Generated Discover and feed rows own their controls; skip them before
        // any per-row metadata work.
        if (node.matches?.(".track_row_view") && node.closest(".bandkit-discover-tracks")) continue;
        const itemData = r.$parseJsonAttribute(node, "data-item-json") || {};
        const title = itemData.featured_track_title || r.$elementText(node, [".track-title", ".title-text", ".player-info .title", ".fav-track-title", ".collection-item-title", ".title"]);
        const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase();
        const nodeStream = node.getAttribute?.("streamurl") || "";
        const fallback = r.$itemFromNode(node);
        const fallbackPageUrl = safeBandcampUrl(itemData.item_url) || fallback?.pageUrl || "";
        let fallbackIsTrack = false;
        let fallbackIsSearchRelease = false;
        try {
          const fallbackPath = new URL(fallbackPageUrl).pathname;
          fallbackIsTrack = fallbackPath.includes("/track/");
          fallbackIsSearchRelease = node.matches(".searchresult")
            && /^(?:album|track)$/i.test(r.$elementText(node, [".itemtype"]));
        } catch {}
        const feedTrack = itemData.featured_track_title ? {
          id: String(node.dataset.trackid || itemData.featured_track_id || title),
          title,
          artist: itemData.band_name || fallback?.artist || "Bandcamp",
          album: r.$elementText(node, [".collection-item-title", ".release-title"]) || itemData.item_title || "",
          art: itemData.item_art_url || fallback?.art || "",
          pageUrl: fallbackPageUrl,
          artistUrl: safeBandcampUrl(itemData.band_url) || r.$artistUrlFromPageUrl(fallbackPageUrl),
          duration: Number(itemData.featured_track_duration) || 0,
          url: ""
        } : null;
        const track = available.find((item) => nodeStream && item.url === nodeStream)
          || available.find((item) => String(item.title || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle)
          || feedTrack
          || (fallbackIsTrack || fallbackIsSearchRelease
            ? { ...fallback, album: fallbackIsTrack ? "" : fallback?.title || "", id: String(node.dataset.trackid || node.dataset.trackId || title), duration: 0, url: "" }
            : null);
        if (!track || !resolvedTrackPageUrl(track)) continue;
        if (node.matches(".discover-player") && node.closest(".focused-result, .discover-detail")?.querySelector(".bandcamp-hub-page-playlist.is-discover-add-to")) continue;
        const isClassicTrackRow = node.matches(".track_row_view");
        if (isClassicTrackRow) {
          if (node.closest(".bandkit-discover-tracks")) continue;
          const modernActions = Boolean(runtimeState.appearance.modernReleasePages);
          const actionCell = node.querySelector(".download-col, .track-row-actions");
          if (!actionCell) continue;
          const nativeControls = [...actionCell.querySelectorAll("a, button")]
            .filter((control) => !control.matches(".bandcamp-hub-page-playlist, .bandkit-generated-track-buy"));
          const nativeBuyTrack = nativeControls.find((control) => (
            control.classList.contains("bandcamp-hub-page-buy")
            || /^buy(?: track)?$/i.test(r.$pageActionControlText(control))
          )) || null;
          const downloadTrack = nativeControls.find((control) => /^download$/i.test(r.$pageActionControlText(control))) || null;
          const isFreeDownload = Boolean(downloadTrack && !nativeBuyTrack);
          const generatedBuyTrack = actionCell.querySelector(".bandkit-generated-track-buy");
          let buyTrack = isFreeDownload ? downloadTrack : nativeBuyTrack || generatedBuyTrack;
          if (generatedBuyTrack && generatedBuyTrack !== buyTrack) generatedBuyTrack.remove();
          let button = node.querySelector(".bandcamp-hub-page-playlist.is-track-action");
          if (!button) {
            button = r.$createPagePlaylistButton("a");
            button.className = `${buyTrack?.className || ""} bandcamp-hub-page-playlist is-track-action`.trim();
            if (buyTrack) buyTrack.after(button);
            else actionCell.append(button);
          }
          if (!buyTrack && modernActions) {
            buyTrack = createPageTrackPurchaseButton();
            buyTrack.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              void r.$openTrackAction(buyTrack._bandkitTrack, "cart");
            });
            button.before(buyTrack);
          }
          button.classList.remove("bandcamp-hub-page-buy");
          button.style.removeProperty("--hub-buy-icon");
          if (buyTrack) {
            buyTrack._bandkitTrack = track;
            buyTrack.classList.toggle("bandcamp-hub-page-buy", modernActions);
            buyTrack.classList.toggle("is-download-action", modernActions && isFreeDownload);
            if (modernActions && !isFreeDownload) {
              for (const child of [...buyTrack.childNodes]) {
                if (child.nodeType === 3 && /^\s*buy track\s*$/i.test(child.textContent || "")) child.textContent = "Buy";
              }
            }
            r.$setPageActionLabel(buyTrack, isFreeDownload ? "Download" : "Buy");
            if (modernActions) buyTrack.style.setProperty("--hub-buy-icon", `url('${asset(isFreeDownload ? "icon-downloads.svg" : "icon-cart.svg")}')`);
            else buyTrack.style.removeProperty("--hub-buy-icon");
            r.$applyPageActionTheme(buyTrack);
            buyTrack.setAttribute("aria-label", `${isFreeDownload ? "Download" : "Buy"} ${track.title}`);
            buyTrack.title = buyTrack.getAttribute("aria-label");
            if (buyTrack.nextElementSibling !== button) buyTrack.after(button);
          }
          r.$applyPageActionTheme(button);
          r.$updatePagePlaylistButton(button, track);
          continue;
        }
        if (node.matches(".collection-item-container") && document.documentElement.dataset.bandkitFeedPage === "true") continue;
        if (node.closest('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"], #wishlist-items .collection-grid[data-iswish="true"]')) continue;
        if (node.matches(".searchresult")) {
          const art = node.querySelector(".art");
          let playButton = art?.querySelector(":scope > .bandkit-search-play");
          if (art && !playButton) {
            playButton = createPageSearchPlayButton();
            playButton.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              const requestedTrack = playButton._bandkitTrack;
              if (!requestedTrack) return;
              const current = Boolean(runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], requestedTrack));
              if (current) void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
              else void r.$playSearchResult(requestedTrack);
            });
            art.append(playButton);
          }
          if (playButton) {
            const current = Boolean(runtimeSeamless.enabled && r.$matchingQueueTrack([runtimeSeamless.track], track));
            const playing = current && Boolean(runtimeSeamless.isPlaying);
            playButton._bandkitTrack = track;
            playButton.style.setProperty("--bandkit-search-play-icon", `url('${asset(playing ? "icon-pause.svg" : "icon-play.svg")}')`);
            playButton.setAttribute("aria-label", current ? (playing ? `Pause ${track.title}` : `Resume ${track.title}`) : `Play ${track.title}`);
            playButton.setAttribute("aria-pressed", String(playing));
            playButton.title = playButton.getAttribute("aria-label");
            r.$applyPageActionTheme(playButton);
          }
        }
        const titleNode = node.querySelector(".track-title, .title-text, .player-info .title, .fav-track-title, .collection-item-title, .title, .heading");
        const target = titleNode?.closest("a")?.parentElement || titleNode?.parentElement || node;
        let button = target.querySelector(":scope > .bandcamp-hub-page-playlist");
        if (!button) {
          button = r.$createPagePlaylistButton();
          target.append(button);
        }
        button.classList.toggle("is-search-add-to", node.matches(".searchresult"));
        button.classList.toggle("is-modern-player-track-action", node.matches("section.floating-player .track-meta[streamurl]"));
        // An album search result is a release too; its menu should offer the
        // album rather than the track Bandcamp happened to feature.
        if (node.matches(".searchresult") && /\/album\//.test(fallbackPageUrl)) {
          button._bandkitReleaseTrack = track;
          r.$bindReleaseAddPrefetch(button);
        }
        r.$updatePagePlaylistButton(button, track);
      }
      r.$syncPageTypography();
    };
}

function registerPageActions5(r) {
r.$elementText = function elementText(root, selectors) {
      if (!root) return "";
      for (const selector of selectors) {
        const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
        if (value) return value;
      }
      return "";
    };
r.$isGenericCartArtist = function isGenericCartArtist(value) {
      const artist = String(value || "").trim();
      return !artist || artist.toLowerCase() === "bandcamp";
    };
r.$queueCartArtistResolution = function queueCartArtistResolution(items) {
      const unresolved = [...new Map((items || [])
        .filter((item) => r.$isGenericCartArtist(item.artist) && safeBandcampUrl(item.url) && !r.$cartArtistPending.has(item.url) && !r.$cartArtistAttempted.has(item.url))
        .map((item) => [item.url, { url: item.url }])).values()];
      if (!unresolved.length) return;
      for (const item of unresolved) {
        r.$cartArtistPending.add(item.url);
        r.$cartArtistAttempted.add(item.url);
      }
      void r.$runtimeMessage({ type: MESSAGES.RESOLVE_CART_METADATA, items: unresolved }).then((response) => {
        let metadataChanged = false;
        for (const item of response?.items || []) {
          const url = safeBandcampUrl(item?.url);
          const artist = String(item?.artist || "").trim();
          if (!url || r.$isGenericCartArtist(artist)) continue;
          r.$cartArtistCache.set(url, artist);
          metadataChanged = true;
        }
        for (const item of unresolved) r.$cartArtistPending.delete(item.url);
        if (!metadataChanged) return;
        runtimeState.savedCarts = runtimeState.savedCarts.map((snapshot) => ({
          ...snapshot,
          items: (snapshot.items || []).map((item) => {
            const artist = r.$cartArtistCache.get(safeBandcampUrl(item.url));
            return artist && r.$isGenericCartArtist(item.artist) ? { ...item, artist } : item;
          })
        }));
        r.$scanLiveCart();
        runtimeSaveState();
        if (runtimeState.activeTab === "cart") r.$render();
      }).catch(() => {
        for (const item of unresolved) r.$cartArtistPending.delete(item.url);
      });
    };
r.$scanLiveCart = function scanLiveCart() {
      // Turned off, Bandkit neither mirrors nor protects the cart: anything it
      // did here could fight the Bandcamp cart the listener is now using.
      if (!r.$cartFeaturesEnabled()) return;
      // A page whose cart exists but has not loaded must be left alone. Reading
      // the markup behind it yields rows without artwork or product identity,
      // which then sit in the cart alongside the real ones.
      r.$pageCartCommand("getAvailability");
      if (r.$pageCartPresent && !r.$pageCartAvailable) return;
      const hasBridgedCart = Array.isArray(r.$bridgedCart);
      const releaseCandidates = (item) => Array.isArray(item?.releases) ? item.releases : [];
      const firstReleaseValue = (item, fields) => {
        for (const release of releaseCandidates(item)) {
          for (const field of fields) {
            const value = release?.[field];
            if (value !== undefined && value !== null && value !== "") return value;
          }
        }
        return "";
      };
      const bridgeArt = (item) => {
        const directUrl = item.item_art_url || item.art_url || firstReleaseValue(item, ["item_art_url", "art_url"]);
        if (/^https?:/i.test(directUrl || "")) return directUrl;
        const artId = Number(item.art_id || item.album_art_id || item.item_art_id || firstReleaseValue(item, ["art_id", "album_art_id", "item_art_id"]));
        if (artId) return `https://f4.bcbits.com/img/a${artId}_7.jpg`;
        const imageId = Number(item.image_id || firstReleaseValue(item, ["image_id"]));
        if (imageId) return `https://f4.bcbits.com/img/${String(imageId).padStart(10, "0")}_37.jpg`;
        return "";
      };
      const parsedFromBridge = Array.isArray(r.$bridgedCart) ? r.$bridgedCart.map((item) => {
        const url = safeBandcampUrl(item.url || firstReleaseValue(item, ["url"])) || location.href;
        const payloadArtist = item.artist_name || item.band_name || item.band_title || item.selling_band_name
          || item.artist || item.artist_title
          || firstReleaseValue(item, ["artist_name", "band_name", "band_title", "selling_band_name", "artist", "artist_title"]);
        const artist = r.$isGenericCartArtist(payloadArtist) ? r.$cartArtistCache.get(url) || "Bandcamp" : payloadArtist;
        return {
          id: `bandcamp-${item.item_type}-${item.item_id}-${item.option_id ?? ""}`,
          title: item.item_title2 || item.item_title || "Bandcamp item",
          artist,
          kind: item.option_name || ({ a: "Digital album", t: "Digital track", b: "Digital discography", p: "Merch" }[item.item_type] || "Saved cart item"),
          price: Math.max(0, Number(item.unit_price) || 0) * Math.max(1, Number(item.quantity) || 1),
          currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD",
          art: bridgeArt(item),
          url,
          unavailable: item.unavailable === true,
          restore: portableCartRestore({
            ...item,
            associated_license_id: item.associated_license_id ?? item.license_id ?? null
          })
        };
      }) : [];
      const candidates = [...document.querySelectorAll("#sidecart #item_list > *, [data-test='cart-item'], .cart-item")]
        .filter((node) => node.children.length > 0 && getComputedStyle(node).display !== "none");
      if (!hasBridgedCart && !candidates.length) return;
      const parsedFromDom = candidates.map((row, index) => {
        const title = r.$elementText(row, [".item-title", ".product-title", ".title", "h3", "h4", "a[href]"]);
        if (!title) return null;
        const nativeArtist = r.$elementText(row, [".artist", ".band-name", ".item-artist", ".secondaryText"]);
        const priceText = r.$elementText(row, [".item-price", ".price", ".numeric", "[data-price]"]);
        const numericPrice = Number((priceText.match(/[\d,.]+/) || ["0"])[0].replace(/,/g, ""));
        const currency = /£|\bGBP\b/i.test(priceText) ? "GBP" : /€|\bEUR\b/i.test(priceText) ? "EUR" : /¥|\bJPY\b/i.test(priceText) ? "JPY" : "USD";
        const link = row.querySelector("a[href]")?.href || location.href;
        const imageNode = row.querySelector(".thumb img, .item-art img, .cart-item-art img, img.album-art, img.package-art");
        const backgroundNode = row.querySelector(".thumb, .item-art, .cart-item-art");
        const backgroundImage = backgroundNode ? getComputedStyle(backgroundNode).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1] : "";
        const image = imageNode?.currentSrc || imageNode?.src || backgroundImage || "";
        return {
          id: row.getAttribute("data-item-id") || row.id || `${link}|${title}|${index}`,
          title,
          artist: r.$isGenericCartArtist(nativeArtist) ? r.$cartArtistCache.get(safeBandcampUrl(link)) || "Bandcamp" : nativeArtist,
          kind: r.$elementText(row, [".item-type", ".format", ".description"]) || "Saved cart item",
          price: Number.isFinite(numericPrice) ? numericPrice : 0,
          currency,
          art: image,
          url: link
        };
      }).filter(Boolean);
      // Reading the cart out of the markup produces rows with no product
      // identity: they cannot be bought, matched or removed, and they do not
      // deduplicate against the real ones. Only a page with no cart of its own
      // is allowed to fall back to it.
      const parsed = hasBridgedCart ? parsedFromBridge : r.$pageCartPresent ? null : parsedFromDom;
      if (!parsed) return;
      const observedItems = [...new Map(parsed.map((item) => [`${item.url}|${item.title}|${item.artist}`, item])).values()];
      // Once Bandcamp's own cart is speaking it is the authority, so entries it
      // has never confirmed and that carry no identity are dropped rather than
      // protected beside real ones.
      const identifiable = (item) => Boolean(item?.restore?.item_type)
        && item?.restore?.item_id !== undefined
        && item?.restore?.item_id !== null;
      const knownItems = hasBridgedCart ? runtimeState.cart.filter(identifiable) : runtimeState.cart;
      const protectedSnapshot = mergeCartSnapshots(knownItems, observedItems);
      const protectedItems = protectedSnapshot.items;
      const observedKeys = new Set(observedItems.map(cartActivityIdentity).filter(Boolean));
      const missingItems = knownItems.filter((item) => item.unavailable !== true && !observedKeys.has(cartActivityIdentity(item)) && !r.$cartRemovalKeys?.has(cartActivityIdentity(item)));
      // Bandcamp reports a smaller cart for a moment while it answers a cart
      // request, and a rejected one never settles back through this path at all.
      // Taking that at face value would record the difference as a removal and
      // save it, so a loss has to persist before Bandkit believes it.
      const missingSignature = missingItems.map(cartActivityIdentity).filter(Boolean).sort().join("\n");
      if (missingSignature && missingSignature === r.$cartShrinkSignature) r.$cartShrinkScans += 1;
      else {
        r.$cartShrinkSignature = missingSignature;
        r.$cartShrinkScans = missingSignature ? 1 : 0;
      }
      // Only Bandcamp's own cart may shrink the stored one. A page reading the
      // cart any other way can add to what Bandkit knows but never take away,
      // so a partial or stale view can no longer look like a removal.
      const lossConfirmed = !missingSignature
        || (hasBridgedCart && r.$cartShrinkScans >= CART_SHRINK_CONFIRM_SCANS);
      const uniqueItems = observedItems;
      const acceptedItems = lossConfirmed ? uniqueItems : protectedItems;
      r.$queueCartArtistResolution(protectedItems);

      const activityKeys = new Set(uniqueItems.map(cartActivityIdentity).filter(Boolean));
      const previousActivityKeys = r.$cartActivityKeys;
      const cartActivityGrew = previousActivityKeys instanceof Set && activityKeys.size > previousActivityKeys.size;
      const suppressStartupHydration = Date.now() < r.$cartActivityReadyAt;
      r.$cartActivityKeys = activityKeys;
      const observedSummary = r.$bridgedCartSummary ? {
        subtotal: Number.isFinite(Number(r.$bridgedCartSummary.subtotal)) ? Number(r.$bridgedCartSummary.subtotal) : null,
        total: Number.isFinite(Number(r.$bridgedCartSummary.total)) ? Number(r.$bridgedCartSummary.total) : null,
        currency: /^[A-Z]{3}$/.test(r.$bridgedCartSummary.currency || "") ? r.$bridgedCartSummary.currency : null } : null;
      const nextSummary = observedSummary && Object.values(observedSummary).some((value) => value !== null) ? observedSummary : null;
      const liveCartSignature = JSON.stringify({ items: uniqueItems, summary: nextSummary });
      if (liveCartSignature === r.$lastLiveCartSignature) return;
      r.$lastLiveCartSignature = liveCartSignature;
      const summarySignature = JSON.stringify(nextSummary);
      if (r.$cartAutosave.cartSignature(acceptedItems) === r.$cartAutosave.cartSignature(runtimeState.cart)
        && summarySignature === JSON.stringify(runtimeState.cartSummary || null)) return;
      const addedItems = cartActivityGrew && !suppressStartupHydration ? uniqueItems.filter((item) => {
        const key = cartActivityIdentity(item);
        return !previousActivityKeys.has(key) && !r.$cartRecoveryKeys?.has(key);
      }) : [];
      const cartGrew = acceptedItems.length > knownItems.length;
      if (cartGrew) runtimeState.musicBarRecentPanel = "cart";
      runtimeState.cart = acceptedItems;
      runtimeState.cartSummary = nextSummary;
      runtimeState.cartSavedAt = Date.now();
      runtimeState.savedCarts = r.$cartAutosave.upsertAutoSavedCart(runtimeState.savedCarts, protectedSnapshot.partial ? protectedItems : runtimeState.cart, {
        savedAt: new Date(runtimeState.cartSavedAt).toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        summary: protectedSnapshot.partial ? null : runtimeState.cartSummary
      }).savedCarts;
      for (const item of addedItems) {
        r.$recordActivity({
          action: "added-to-cart",
          title: item.title,
          artist: item.artist,
          art: item.art,
          url: item.url,
          artistUrl: r.$artistUrlFromPageUrl(item.url)
        }, { persist: false, render: false });
      }
      runtimeSaveState();
      r.$render();
      if (cartGrew) r.$showCompactPanelNotice("icon-cart.svg", "Added to Cart");
      if (lossConfirmed) r.$recoverMissingCartItems(missingItems);
    };
}

export const registerPageActions = [
  registerDiscoverReleaseAddButton, registerFeedReleaseAddRefresh, registerPageActionInjectionHelpers,
  registerPageActions1, registerPageActions2, registerPageActions3, registerPageActions4, registerPageActions5
];
function setupPageActions1(r) {
r.$pageActionSourceSelector = [
      ".track_row_view",
      "section.floating-player",
      ".searchresult",
      ".results-grid-item",
      ".focused-result",
      ".discover-detail",
      ".discover-player",
      ".collection-item-container",
      "#recommendations_container",
      "#sales-feed .item"
    ].join(",");
}
export const setupPageActions = [setupPageActions1];
