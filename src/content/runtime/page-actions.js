import { runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { asset, portableBandcampUrl, resolvedTrackPageUrl, safeBandcampReleaseUrl, safeBandcampUrl } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";
import { portableCartRestore } from "../cart-model.js";

function registerPageActions1(r) {
r.$maybeAnalyzePageTracks = function maybeAnalyzePageTracks() {
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
      r.$syncPageActionLabelMode();
      const player = document.querySelector(".inline_player");
      if (!player) return;
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
      r.$updatePagePlaylistButton(playlistButton, r.$currentInlinePlaylistTrack());
      if (cartButton.nextElementSibling !== playlistButton) cartButton.after(playlistButton);
      let button = tools.querySelector(".bandcamp-hub-page-dj");
      if (!button) {
        button = document.createElement("button");
        button.className = "bandcamp-hub-page-dj";
        button.type = "button";
        button.style.setProperty("--hub-dj-icon", `url('${asset("icon-dj.svg")}')`);
        button.setAttribute("aria-label", "Show DJ tools on this page");
        tools.append(button);
      }
      r.$setPageActionLabel(button, "DJ tools");
      if (playlistButton.nextElementSibling !== button) playlistButton.after(button);
      let overflowButton = tools.querySelector(".bandcamp-hub-page-overflow");
      if (!overflowButton) {
        overflowButton = r.$createPageReleaseOverflowButton();
        tools.append(overflowButton);
      }
      r.$setPageActionLabel(overflowButton, "More");
      r.$applyPageActionTheme(overflowButton);
      if (button.nextElementSibling !== overflowButton) button.after(overflowButton);
      const transportRow = tools.querySelector(":scope > .bandkit-page-transport-row");
      if (transportRow && tools.lastElementChild !== transportRow) tools.append(transportRow);
      let inlineHost = player.querySelector(":scope > .bandcamp-hub-page-dj-host");
      if (!inlineHost) {
        inlineHost = document.createElement("div");
        inlineHost.className = "bandcamp-hub-page-dj-host";
        tools.after(inlineHost);
      }
      const pageDjNeedsMount = r.$pageDjHost !== inlineHost || !inlineHost.shadowRoot;
      if (pageDjNeedsMount) {
        r.$pageDjHost = inlineHost;
        r.$pageDjShadow = inlineHost.shadowRoot || inlineHost.attachShadow({ mode: "open" });
        r.$pageDjShadow.replaceChildren();
        const inlineStyle = document.createElement("style");
        inlineStyle.textContent = `${r.$style.textContent}\n:host{display:block}.hub-page-dj-surface{background:var(--hub-card);border:1px solid var(--hub-line);border-radius:6px;padding:12px;width:100%}.hub-page-dj-surface .hub-dj-card{background:transparent;border:0;box-shadow:none;margin:0;overflow:visible;padding:0}`;
        r.$pageDjSurface = document.createElement("div");
        r.$pageDjSurface.className = "hub-page-dj-surface";
        r.$pageDjShadow.append(inlineStyle, r.$pageDjSurface);
        r.$syncPageDjTheme();
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
        const rawPageUrl = itemData.item_url || releaseLink?.href || "";
        pageUrl = safeBandcampUrl(new URL(String(rawPageUrl).startsWith("//") ? `https:${rawPageUrl}` : rawPageUrl, location.href).href);
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
        album: itemData.item_title || r.$elementText(story, [".collection-item-title", ".release-title"]),
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
        r.$updatePagePlaylistButton(button, track);
        const label = `Add ${track.title} to Now Playing or a playlist`;
        button.setAttribute("aria-label", label);
        button.title = label;
        if (playControl) {
          const controlWidth = playControl.offsetWidth || 36;
          const controlHeight = playControl.offsetHeight || 36;
          button.style.left = `${playControl.offsetLeft + controlWidth + 6}px`;
          button.style.top = `${playControl.offsetTop + Math.max(0, (controlHeight - 28) / 2)}px`;
          button.style.removeProperty("bottom");
        } else {
          button.style.left = "8px";
          button.style.top = "auto";
          button.style.bottom = "8px";
        }
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
r.$runNativeCollectionControl = function runNativeCollectionControl(control) {
      if (!control) return;
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
      r.$showToast(`Preparing ${track.title}…`);
      try {
        const prepared = await r.$prepareExternalNowPlaying(track);
        if (prepared.cancelled || prepared.capacity) return false;
        if (request !== r.$collectionHandoffRequest) return false;
        if (prepared.index < 0) throw new Error(prepared.error || "This collection item is not streamable.");
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
        if (!response?.ok) throw new Error(response?.error || "Bandkit could not start this collection item.");
        if (request !== r.$collectionHandoffRequest) return false;
        if (prepared.request !== r.$playlistPlayRequest) return false;
        r.$applySeamlessState(response.state);
        return true;
      } catch {
        if (request !== r.$collectionHandoffRequest) return false;
        r.$showToast("Using Bandcamp's player for this item.");
        if (runtimeSeamless.enabled) await r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
        r.$runNativeCollectionControl(control);
        return false;
      }
    };
r.$injectCollectionItemActions = function injectCollectionItemActions() {
      const collectionGrids = [...document.querySelectorAll('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"], #wishlist-items .collection-grid[data-iswish="true"]')];
      document.documentElement.dataset.bandkitCollectionPage = String(collectionGrids.length > 0);
      if (!collectionGrids.length) return;
      for (const card of collectionGrids.flatMap((grid) => [...grid.querySelectorAll(".collection-item-container")])) {
        const track = r.$collectionTrackFromCard(card);
        const downloadSource = card.querySelector('.bottom-owner-controls .redownload-item a[href*="/download"]');
        const titleDetails = card.querySelector(".collection-item-gallery-container .collection-title-details");
        const isWishlistItem = Boolean(card.closest('#wishlist-items .collection-grid[data-iswish="true"]'));
        if (!track || !titleDetails || (!isWishlistItem && !downloadSource)) continue;

        let actionRow = titleDetails.querySelector(":scope > .bandkit-collection-action-row");
        if (!actionRow) {
          actionRow = document.createElement("div");
          actionRow.className = "bandkit-feed-action-row bandkit-collection-action-row";
          titleDetails.append(actionRow);
        }

        let playlistButton = card.querySelector(".bandcamp-hub-page-playlist");
        if (!playlistButton) playlistButton = r.$createPagePlaylistButton();
        playlistButton.classList.add("is-feed-compact-action", "is-collection-action");
        playlistButton.classList.remove("is-feed-add-to", "is-feed-sidebar-action");
        playlistButton._bandkitOwned = !isWishlistItem;
        r.$updatePagePlaylistButton(playlistButton, track);
        playlistButton.title = `Add ${track.title} to Now Playing or a playlist`;
        if (playlistButton.parentElement !== actionRow) actionRow.append(playlistButton);

        if (downloadSource) {
          let downloadButton = actionRow.querySelector(".bandkit-collection-download-action");
          if (!downloadButton) {
            downloadButton = document.createElement("a");
            downloadButton.className = "bandkit-feed-purchase-action bandkit-collection-download-action";
            downloadButton.style.setProperty("--bandkit-feed-action-icon", `url('${asset("icon-downloads.svg")}')`);
            actionRow.append(downloadButton);
          }
          downloadButton.href = downloadSource.href;
          r.$setPageActionLabel(downloadButton, "Download");
          downloadButton.setAttribute("aria-label", `Download ${track.title}`);
          downloadButton.title = `Download ${track.title}`;
        }
      }
    };
}

function registerPageActionInjectionHelpers(r) {
r.$injectFeedPageActions = function injectFeedPageActions({ incremental, onFeedPage }) {
      if (onFeedPage) {
        const feedControls = document.querySelectorAll([
          `.story-innards a${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`,
          `.story-innards button${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`,
          `#sidebar .collection-item-container a${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`,
          `#sidebar .collection-item-container button${incremental ? ":not([data-bandkit-feed-action-scanned])" : ""}`
        ].join(","));
        for (const purchaseAction of feedControls) {
          purchaseAction.dataset.bandkitFeedActionScanned = "true";
          if (!/^(?:pre[- ]?order|buy now)$/i.test(r.$pageActionControlText(purchaseAction))) continue;
          const track = r.$feedTrackFromAction(purchaseAction);
          if (!track) continue;
          const story = purchaseAction.closest(".story-innards, .story, .story-container, .new-release, .collection-item-container");
          const existingButtons = [...(story?.querySelectorAll(".bandcamp-hub-page-playlist") || [])];
          let button = existingButtons.find((candidate) => candidate.classList.contains("is-feed-add-to")) || existingButtons[0] || null;
          if (!button) button = r.$createPagePlaylistButton();
          button.classList.add("is-feed-add-to");
          r.$updatePagePlaylistButton(button, track);
          for (const duplicate of existingButtons) {
            if (duplicate !== button) duplicate.remove();
          }

          const sidebarCard = purchaseAction.closest(".collection-grid .collection-item-container");
          button.classList.add("is-feed-compact-action");
          button.classList.toggle("is-feed-sidebar-action", Boolean(sidebarCard));
          r.$setPageActionLabel(button, "Add");
          button.title = `Add ${track.title} to Now Playing or a playlist`;
          purchaseAction.classList.add("bandkit-feed-purchase-action");
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
          const actionList = purchaseAction.closest("ul");
          actionList?.classList.add("bandkit-feed-action-row");
          if (sidebarCard) actionList?.classList.add("bandkit-feed-sidebar-actions");
          const hearMoreAction = [...(actionList?.querySelectorAll("a, button") || [])].find((control) => /^hear more$/i.test(r.$pageActionControlText(control)));
          if (hearMoreAction) {
            hearMoreAction.classList.add("bandkit-feed-hear-more-action");
            r.$setPageActionLabel(hearMoreAction, "Hear more");
            hearMoreAction.title = `Hear more from ${track.album || track.artist || track.title}`;
            hearMoreAction.setAttribute("aria-label", hearMoreAction.title);
            hearMoreAction.style.setProperty("--bandkit-feed-action-icon", `url('${asset("icon-hear-more.svg")}')`);
          }
          const wishlistItem = actionList?.querySelector("li[id^='collect-item_']")
            || [...(actionList?.querySelectorAll("li") || [])].find((item) => /^(?:in )?wishlist$/i.test(r.$pageActionControlText(item)));
          wishlistItem?.classList.add("bandkit-feed-wishlist-action");
          wishlistItem?.style.setProperty("--bandkit-feed-wishlist-icon", `url('${asset("icon-wishlist.svg")}')`);
          const wishlistControl = wishlistItem?.querySelector(".wishlist-msg")
            || [...(wishlistItem?.querySelectorAll("a, button") || [])].find((control) => /^wishlist$/i.test(r.$pageActionControlText(control)));
          const wishlistedControl = wishlistItem?.querySelector(".wishlisted-msg > span:first-child")
            || [...(wishlistItem?.querySelectorAll("a, button") || [])].find((control) => /^in wishlist$/i.test(r.$pageActionControlText(control)));
          if (wishlistControl) {
            wishlistControl.classList.add("bandkit-feed-wishlist-control");
            r.$setPageActionLabel(wishlistControl, "Wishlist");
            wishlistControl.title = `Add ${track.album || track.title} to your wishlist`;
            wishlistControl.setAttribute("aria-label", wishlistControl.title);
          }
          if (wishlistedControl) {
            wishlistedControl.classList.add("bandkit-feed-wishlist-control");
            r.$setPageActionLabel(wishlistedControl, "Wishlisted");
            wishlistedControl.title = `${track.album || track.title} is in your wishlist`;
            wishlistedControl.setAttribute("aria-label", wishlistedControl.title);
          }
          if (purchaseAction.previousElementSibling !== button) purchaseAction.before(button);
        }
      }
    };
r.$injectDiscoverPageActions = function injectDiscoverPageActions({ incremental, discover }) {
      if (document.querySelector("#DiscoverApp, .results-grid")) {
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
            : playControl.closest(".focused-result, .discover-detail") || playControl.parentElement;
          if (!parent) continue;
          if (resultCard) playControl.dataset.bandkitDiscoverActionScanned = "true";
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
          r.$updatePagePlaylistButton(button, cardTrack);
          button.setAttribute("aria-label", `Add ${cardTrack.title} to Now Playing or a playlist`);
          button.title = button.getAttribute("aria-label");
          discoverButtonLayouts.push({ button, playControl });
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
        if (hasDeferredDiscoverControls) {
          r.$pageActionsDirty = true;
          r.$scheduleLivePlayerMaintenance(80);
        }
      }
    };
}

function registerPageActions4(r) {
r.$injectPlaylistButtons = function injectPlaylistButtons({ incremental = false } = {}) {
      r.$pageActionsDirty = false;
      r.$ensurePageStyles();
      r.$syncPageActionLabelMode();
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
        const itemData = r.$parseJsonAttribute(node, "data-item-json") || {};
        const title = itemData.featured_track_title || r.$elementText(node, [".track-title", ".title-text", ".player-info .title", ".fav-track-title", ".collection-item-title", ".title"]);
        const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase();
        const nodeStream = node.getAttribute?.("streamurl") || "";
        const fallback = r.$itemFromNode(node);
        const fallbackPageUrl = safeBandcampUrl(itemData.item_url) || fallback?.pageUrl || "";
        let fallbackIsTrack = false;
        try { fallbackIsTrack = new URL(fallbackPageUrl).pathname.includes("/track/"); } catch {}
        const feedTrack = itemData.featured_track_title ? {
          id: String(node.dataset.trackid || itemData.featured_track_id || title),
          title,
          artist: itemData.band_name || fallback?.artist || "Bandcamp",
          album: itemData.item_title || "",
          art: itemData.item_art_url || fallback?.art || "",
          pageUrl: fallbackPageUrl,
          artistUrl: safeBandcampUrl(itemData.band_url) || r.$artistUrlFromPageUrl(fallbackPageUrl),
          duration: Number(itemData.featured_track_duration) || 0,
          url: ""
        } : null;
        const track = available.find((item) => nodeStream && item.url === nodeStream)
          || available.find((item) => String(item.title || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle)
          || feedTrack
          || (fallbackIsTrack ? { ...fallback, id: String(node.dataset.trackid || node.dataset.trackId || title), duration: 0, url: "" } : null);
        if (!track || !resolvedTrackPageUrl(track)) continue;
        if (node.matches(".discover-player") && node.closest(".focused-result, .discover-detail")?.querySelector(".bandcamp-hub-page-playlist.is-discover-add-to")) continue;
        const isClassicTrackRow = node.matches(".track_row_view");
        if (isClassicTrackRow) {
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
          if (!buyTrack) {
            buyTrack = document.createElement("button");
            buyTrack.type = "button";
            buyTrack.className = "bandcamp-hub-page-buy bandkit-generated-track-buy";
            buyTrack.textContent = "Buy";
            buyTrack.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              void r.$openTrackAction(buyTrack._bandkitTrack, "cart");
            });
            button.before(buyTrack);
          }
          buyTrack._bandkitTrack = track;
          button.classList.remove("bandcamp-hub-page-buy");
          button.style.removeProperty("--hub-buy-icon");
          buyTrack.classList.add("bandcamp-hub-page-buy");
          buyTrack.classList.toggle("is-download-action", isFreeDownload);
          if (!isFreeDownload) {
            for (const node of [...buyTrack.childNodes]) {
              if (node.nodeType === 3 && /^\s*buy track\s*$/i.test(node.textContent || "")) node.textContent = "Buy";
            }
          }
          r.$setPageActionLabel(buyTrack, isFreeDownload ? "Download" : "Buy");
          buyTrack.style.setProperty("--hub-buy-icon", `url('${asset(isFreeDownload ? "icon-downloads.svg" : "icon-cart.svg")}')`);
          r.$applyPageActionTheme(button);
          r.$applyPageActionTheme(buyTrack);
          buyTrack.setAttribute("aria-label", `${isFreeDownload ? "Download" : "Buy"} ${track.title}`);
          buyTrack.title = buyTrack.getAttribute("aria-label");
          if (buyTrack.nextElementSibling !== button) buyTrack.after(button);
          r.$updatePagePlaylistButton(button, track);
          continue;
        }
        if (node.matches(".collection-item-container") && document.documentElement.dataset.bandkitFeedPage === "true") continue;
        if (node.closest('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"], #wishlist-items .collection-grid[data-iswish="true"]')) continue;
        const titleNode = node.querySelector(".track-title, .title-text, .player-info .title, .fav-track-title, .collection-item-title, .title");
        const target = titleNode?.closest("a")?.parentElement || titleNode?.parentElement || node;
        let button = target.querySelector(":scope > .bandcamp-hub-page-playlist");
        if (!button) {
          button = r.$createPagePlaylistButton();
          target.append(button);
        }
        button.classList.toggle("is-modern-player-track-action", node.matches("section.floating-player .track-meta[streamurl]"));
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

      const parsed = hasBridgedCart ? parsedFromBridge : parsedFromDom;

      const uniqueItems = [...new Map(parsed.map((item) => [
        `${item.url}|${item.title}|${item.artist}`,
        item
      ])).values()];
      r.$queueCartArtistResolution(uniqueItems);

      const signature = (items) => JSON.stringify(items.map(({ title, artist, price, currency, url, art, restore }) => ({
        title, artist, price, currency, url, art, restoreKey: restore ? `${restore.item_type}:${restore.item_id}:${restore.option_id ?? ""}` : ""
      })));
      const summarySignature = JSON.stringify(r.$bridgedCartSummary || null);
      if (signature(uniqueItems) === signature(runtimeState.cart) && summarySignature === JSON.stringify(runtimeState.cartSummary || null)) return;
      runtimeState.cart = uniqueItems;
      runtimeState.cartSummary = r.$bridgedCartSummary ? {
        subtotal: Number.isFinite(Number(r.$bridgedCartSummary.subtotal)) ? Number(r.$bridgedCartSummary.subtotal) : null,
        currency: /^[A-Z]{3}$/.test(r.$bridgedCartSummary.currency || "") ? r.$bridgedCartSummary.currency : null
      } : null;
      runtimeState.cartSavedAt = Date.now();
      runtimeState.savedCarts = r.$cartAutosave.upsertAutoSavedCart(runtimeState.savedCarts, runtimeState.cart, {
        savedAt: new Date(runtimeState.cartSavedAt).toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        summary: runtimeState.cartSummary
      }).savedCarts;
      runtimeSaveState();
      if (runtimeState.activeTab === "cart") r.$render();
    };
}

export const registerPageActions = [registerPageActionInjectionHelpers, registerPageActions1, registerPageActions2, registerPageActions3, registerPageActions4, registerPageActions5];

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
      "#recommendations_container"
    ].join(",");
}

export const setupPageActions = [setupPageActions1];
