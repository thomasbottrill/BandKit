// Bandcamp's own encoding names, in the order its download page lists them.
export const DOWNLOAD_FORMATS = Object.freeze([
  Object.freeze({ id: "mp3-v0", label: "MP3 V0" }),
  Object.freeze({ id: "mp3-320", label: "MP3 320" }),
  Object.freeze({ id: "flac", label: "FLAC" }),
  Object.freeze({ id: "aac-hi", label: "AAC" }),
  Object.freeze({ id: "vorbis", label: "Ogg Vorbis" }),
  Object.freeze({ id: "alac", label: "ALAC" }),
  Object.freeze({ id: "wav", label: "WAV" }),
  Object.freeze({ id: "aiff-lossless", label: "AIFF" })
]);

export const DEFAULT_DOWNLOAD_FORMAT = "flac";

export function normalizeDownloadFormat(value) {
  return DOWNLOAD_FORMATS.some((format) => format.id === value) ? value : DEFAULT_DOWNLOAD_FORMAT;
}

export function downloadFormatLabel(value) {
  return DOWNLOAD_FORMATS.find((format) => format.id === value)?.label || String(value || "").toUpperCase();
}

// A collection download link carries the sale item it belongs to. That id is
// the one key the card, Bandcamp's page data and its collection API all share.
export function redownloadItemKey(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "bandcamp.com" || url.pathname !== "/download") return "";
    const key = url.searchParams.get("sitem_id") || "";
    return /^\d{1,20}$/.test(key) && url.searchParams.has("sig") ? key : "";
  } catch {
    return "";
  }
}
