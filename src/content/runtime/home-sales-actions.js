import { createPageAddButton, createPageSearchPlayButton } from "../components/page-actions.js";
import { asset, portableBandcampUrl, resolvedTrackPageUrl } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";
import { runtimeSeamless, runtimeState } from "./context.js";

function registerHomeSalesMetadata(r) {
  r.$homeSaleTrackFromCard = function homeSaleTrackFromCard(card) {
    if (!card?.matches?.("#sales-feed .item")) return null;
    const releaseLink = card.querySelector(":scope > a[href*='from=salesfeed']");
    const pageUrl = resolvedTrackPageUrl({ pageUrl: releaseLink?.href });
    let releaseType = "";
    try {
      releaseType = new URL(pageUrl).pathname.match(/^\/(album|track)\//)?.[1] || "";
    } catch {}
    const title = r.$elementText(card, ["h5 cite", "h5", ".item-album"])
      || releaseLink?.querySelector("img")?.alt?.trim()
      || "";
    if (!pageUrl || !releaseType || !title) return null;
    const artist = r.$elementText(card, [".item-artist"]).replace(/^by\s+/i, "") || "Bandcamp";
    return {
      id: `${pageUrl}|${title}`,
      title,
      artist,
      album: releaseType === "album" ? title : "",
      art: releaseLink?.querySelector(".item-img img, img")?.currentSrc || releaseLink?.querySelector(".item-img img, img")?.src || "",
      pageUrl,
      artistUrl: r.$artistUrlFromPageUrl(pageUrl),
      duration: 0,
      url: ""
    };
  };
  r.$homeSaleMatchesTrack = function homeSaleMatchesTrack(left, right) {
    const leftPage = portableBandcampUrl(left?.pageUrl, true);
    const rightPage = portableBandcampUrl(right?.pageUrl, true);
    return Boolean(leftPage && leftPage === rightPage);
  };
}

function registerHomeSalesPlayback(r) {
  r.$homeSalePlaybackRequest = 0;
  r.$syncHomeSalesPlaybackUi = function syncHomeSalesPlaybackUi() {
    for (const card of document.querySelectorAll("#sales-feed .item")) {
      const playButton = card.querySelector(".bandkit-home-sale-play");
      const addButton = card.querySelector(".bandcamp-hub-page-playlist.is-home-sale-add");
      const track = playButton?._bandkitTrack || addButton?._bandkitTrack;
      if (!track) continue;
      const current = Boolean(runtimeSeamless.enabled && r.$homeSaleMatchesTrack(runtimeSeamless.track, track));
      const playing = current && Boolean(runtimeSeamless.isPlaying);
      const queued = runtimeState.playlist.some((item) => r.$homeSaleMatchesTrack(item, track));
      card.classList.toggle("bandkit-home-sale-current", current);
      if (playButton) {
        const label = current ? (playing ? `Pause ${track.title}` : `Resume ${track.title}`) : `Play ${track.title}`;
        playButton.style.setProperty("--bandkit-search-play-icon", `url('${asset(playing ? "icon-pause.svg" : "icon-play.svg")}')`);
        playButton.setAttribute("aria-label", label);
        playButton.setAttribute("aria-pressed", String(playing));
        playButton.title = label;
      }
      if (addButton) {
        addButton.classList.toggle("is-added", queued);
        addButton.setAttribute("aria-pressed", String(queued));
        addButton.setAttribute("aria-label", queued ? `${track.title} is in Now Playing` : `Add ${track.title} to Now Playing`);
        addButton.title = addButton.getAttribute("aria-label");
      }
    }
  };
  r.$playHomeSaleTrack = async function playHomeSaleTrack(track, playButton) {
    if (!track) return false;
    const request = ++r.$homeSalePlaybackRequest;
    playButton.disabled = true;
    playButton.setAttribute("aria-busy", "true");
    r.$showToast(`Preparing ${track.title}…`);
    try {
      const hydrated = await r.$hydratePlaylist([track]);
      const playableTrack = hydrated.items.find((item) => r.$isReusableStreamUrl(item.url));
      if (!playableTrack) throw new Error(hydrated.error || "This release is not currently streamable.");
      if (request !== r.$homeSalePlaybackRequest) return false;
      return r.$playSearchResult(playableTrack, { revealPanel: false });
    } catch (error) {
      if (request === r.$homeSalePlaybackRequest) r.$showToast(error?.message || "This release is not currently streamable.");
      return false;
    } finally {
      if (playButton.isConnected) {
        playButton.disabled = false;
        playButton.removeAttribute("aria-busy");
      }
      if (request === r.$homeSalePlaybackRequest) r.$syncHomeSalesPlaybackUi();
    }
  };
}

function registerHomeSalesInjection(r) {
  r.$syncHomepageArtworkPlayActions = function syncHomepageArtworkPlayActions() {
    for (const playButton of document.querySelectorAll([
      "#HomepageApp .playlist-card .image-container .play-pause-button.over-image",
      "#HomepageApp .new-notable .tralbum-card .image-container .play-pause-button.over-image"
    ].join(", "))) {
      r.$applyPageActionTheme(playButton);
    }
  };
  r.$injectHomeSalesActions = function injectHomeSalesActions() {
    r.$syncHomepageArtworkPlayActions();
    const actionLayouts = [];
    for (const card of document.querySelectorAll("#sales-feed .item")) {
      const track = r.$homeSaleTrackFromCard(card);
      const existingActions = card.querySelector(":scope > .bandkit-sales-feed-actions");
      if (!track) {
        existingActions?.remove();
        continue;
      }
      let actions = existingActions;
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "bandkit-sales-feed-actions";
        const playButton = createPageSearchPlayButton();
        playButton.classList.add("bandkit-home-sale-play");
        playButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const requestedTrack = playButton._bandkitTrack;
          if (!requestedTrack) return;
          const current = Boolean(runtimeSeamless.enabled && r.$homeSaleMatchesTrack(runtimeSeamless.track, requestedTrack));
          if (current) void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
          else void r.$playHomeSaleTrack(requestedTrack, playButton);
        });
        const addButton = createPageAddButton();
        addButton.classList.add("is-home-sale-add");
        addButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (addButton._bandkitTrack) r.$addTrackToPlaylist(addButton._bandkitTrack);
        });
        actions.append(playButton, addButton);
        card.append(actions);
      }
      const playButton = actions.querySelector(".bandkit-home-sale-play");
      const addButton = actions.querySelector(".bandcamp-hub-page-playlist.is-home-sale-add");
      if (playButton) {
        playButton._bandkitTrack = track;
        r.$applyPageActionTheme(playButton);
      }
      if (addButton) {
        addButton._bandkitTrack = track;
        r.$applyPageActionTheme(addButton);
      }
      const artwork = card.querySelector(":scope > a .item-img");
      if (artwork) actionLayouts.push({ actions, artwork });
    }
    const measuredLayouts = actionLayouts.map(({ actions, artwork }) => ({
      actions,
      left: artwork.offsetLeft + 8,
      top: artwork.offsetTop + artwork.offsetHeight - 40
    }));
    for (const { actions, left, top } of measuredLayouts) {
      actions.style.setProperty("--bandkit-home-sale-actions-left", `${left}px`);
      actions.style.setProperty("--bandkit-home-sale-actions-top", `${Math.max(8, top)}px`);
    }
    r.$syncHomeSalesPlaybackUi();
  };
}

export const registerHomeSalesActions = [registerHomeSalesMetadata, registerHomeSalesPlayback, registerHomeSalesInjection];
