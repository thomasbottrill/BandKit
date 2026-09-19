import { asset, createElement, resolveImage } from "../core.js";

// The panel uses a four-image mosaic; collection pages use five vertical strips.
export function createPlaylistArtwork(items, variant = "panel") {
  const page = variant === "page";
  const artwork = [];
  const seen = new Set();
  for (const item of items || []) {
    const url = resolveImage(item?.art);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    artwork.push(url);
    if (artwork.length === (page ? 5 : 4)) break;
  }
  const mosaic = createElement(page ? "span" : "div", page ? "bandkit-collection-playlist-art" : "hub-playlist-mosaic");
  if (page) {
    mosaic.dataset.count = String(artwork.length);
    mosaic.style.setProperty("--bandkit-playlist-art-count", String(Math.max(1, artwork.length)));
  } else mosaic.classList.add(`has-${artwork.length}`);
  if (!artwork.length) {
    const placeholder = createElement(page ? "img" : "span", page ? "bandkit-collection-playlist-placeholder" : "hub-playlist-mosaic-placeholder");
    if (page) {
      placeholder.src = asset("icon-playlist.svg");
      placeholder.alt = "";
    } else placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
    mosaic.append(placeholder);
  } else for (const url of artwork) {
    const image = createElement("img", page ? "bandkit-collection-playlist-artwork" : "hub-playlist-mosaic-image");
    image.src = url;
    image.alt = "";
    if (page) image.loading = "lazy";
    mosaic.append(image);
  }
  return mosaic;
}
