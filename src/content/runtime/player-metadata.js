import { playlistAlbumLabel } from "./collection-views.js";

function normalizedPlayerLink(value) {
  if (!value) return "";
  try {
    const url = new URL(value, "https://bandcamp.com/");
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(value).trim();
  }
}

export function playerAlbumLabel(item, albumUrl) {
  const condensed = playlistAlbumLabel(item);
  if (condensed) return condensed;
  const album = playlistAlbumLabel({ ...item, title: "" });
  const title = String(item?.title || "").trim();
  const titleUrl = normalizedPlayerLink(item?.pageUrl);
  const releaseUrl = normalizedPlayerLink(albumUrl);
  return album && title && album.toLocaleLowerCase() === title.toLocaleLowerCase()
    && titleUrl && releaseUrl && titleUrl !== releaseUrl ? album : "";
}
