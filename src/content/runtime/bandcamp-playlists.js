import { MESSAGES } from "../../shared/contracts.js";
import { createSavedCollectionCard } from "../components/collections.js";
import { createArt, createButtonIcon, createElement, formatDuration } from "../core.js";
import { runtimeSeamless, runtimeState } from "./context.js";

const FRESH_MS = 5 * 60_000;

// Playlists made on Bandcamp sit beside Bandkit's own in the Playlists view.
// They are read from Bandcamp when the view opens (at most every few minutes)
// and their tracks only when one is played; nothing is copied into Bandkit.
function fanId(r) {
  const page = r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob");
  return page?.fan_data?.is_own_page ? String(page.fan_data.fan_id) : String(r.$collectionCatalog?.activeAccount || "");
}
const viewOpen = () => runtimeState.activeTab === "playlist" && runtimeState.playlistView === "saved" && !runtimeState.selectedSavedPlaylistId;
function isActive(r, playlist) {
  const tracks = r.$bandcampPlaylistTracks.get(playlist.id) || [];
  return runtimeSeamless.enabled && runtimeSeamless.status !== "error"
    && tracks.some((track) => String(track.id) === String(runtimeSeamless.track?.id));
}
async function play(r, playlist) {
  if (isActive(r, playlist)) { await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE); return; }
  const request = ++r.$bandcampPlayRequest;
  try {
    let tracks = r.$bandcampPlaylistTracks.get(playlist.id);
    if (!tracks?.length || tracks.some((track) => !r.$isReusableStreamUrl(track.url))) {
      const response = await r.$runtimeMessage({ type: MESSAGES.LIBRARY, action: "bandcamp-playlist", url: playlist.url });
      if (!response?.ok) throw new Error(response?.error || "Bandcamp could not load this playlist.");
      tracks = response.tracks.filter((track) => r.$isReusableStreamUrl(track.url));
      r.$bandcampPlaylistTracks.set(playlist.id, tracks);
    }
    if (request !== r.$bandcampPlayRequest) return;
    if (!tracks.length) throw new Error("None of this playlist's tracks can be streamed.");
    await r.$playDiscoverReleaseTrack(tracks[0], tracks);
  } catch (error) {
    if (request === r.$bandcampPlayRequest) r.$showToast(error.message);
  }
}
function card(r, playlist) {
  const artwork = createElement("div", "hub-playlist-mosaic hub-collection-art");
  const image = createArt(playlist.art); image.loading = "lazy"; artwork.append(image);
  const element = createSavedCollectionCard({
    title: playlist.title, total: formatDuration(playlist.duration),
    summary: `${playlist.trackCount} track${playlist.trackCount === 1 ? "" : "s"}`,
    artwork, ariaLabel: `Open ${playlist.title} on Bandcamp`,
    onOpen: () => window.open(playlist.url, "_blank", "noopener")
  });
  element.classList.add("hub-bandcamp-playlist");
  element.dataset.bandcampPlaylistId = playlist.id;
  const button = createElement("button", "hub-saved-playlist-art-action");
  button.type = "button";
  button.addEventListener("click", (event) => { event.stopPropagation(); void play(r, playlist); });
  element.append(button);
  return element;
}

export function registerBandcampPlaylists(r) {
  r.$bandcampPlaylists = { items: [], loadedAt: 0, loading: false, fanId: "" };
  r.$bandcampPlaylistTracks = new Map();
  r.$bandcampPlayRequest = 0;
  r.$loadBandcampPlaylists = async function loadBandcampPlaylists({ force = false } = {}) {
    const state = r.$bandcampPlaylists;
    const id = fanId(r);
    if (!id || state.loading || (!force && state.fanId === id && Date.now() - state.loadedAt < FRESH_MS)) return;
    state.loading = true;
    try {
      const response = await r.$runtimeMessage({ type: MESSAGES.LIBRARY, action: "bandcamp-playlists", fanId: id });
      if (!response?.ok) return;
      const before = JSON.stringify(state.items);
      Object.assign(state, { items: response.playlists, loadedAt: Date.now(), fanId: id });
      if (before !== JSON.stringify(state.items) && viewOpen()) r.$render();
    } catch { /* Bandcamp playlists are optional; Bandkit's own still show. */ }
    finally { state.loading = false; }
  };
  r.$bandcampPlaylistCards = function bandcampPlaylistCards() {
    void r.$loadBandcampPlaylists();
    const cards = r.$bandcampPlaylists.items.map((playlist) => card(r, playlist));
    window.setTimeout(() => r.$syncBandcampPlaylistPlayback(), 0);
    return cards;
  };
  r.$syncBandcampPlaylistPlayback = function syncBandcampPlaylistPlayback() {
    for (const element of r.$content.querySelectorAll(".hub-bandcamp-playlist")) {
      const playlist = r.$bandcampPlaylists.items.find((entry) => entry.id === element.dataset.bandcampPlaylistId);
      if (!playlist) continue;
      const playing = isActive(r, playlist) && runtimeSeamless.isPlaying;
      const button = element.querySelector(".hub-saved-playlist-art-action");
      const label = `${playing ? "Pause" : "Play"} ${playlist.title}`;
      element.classList.toggle("is-playing", playing);
      if (button.getAttribute("aria-label") === label) continue;
      button.title = label; button.setAttribute("aria-label", label);
      button.replaceChildren(createButtonIcon(playing ? "icon-pause.svg" : "icon-play.svg"));
    }
  };
}
