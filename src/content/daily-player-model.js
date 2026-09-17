import { safeBandcampUrl } from "./core.js";

export function parseDailyPlayerInfos(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((info) => info && typeof info === "object") : [];
  } catch {
    return [];
  }
}

export function dailyPlayerQueue(info) {
  if (!info || !Array.isArray(info.tracklist)) return [];
  const releaseUrl = safeBandcampUrl(info.tralbum_url) || "";
  const artistUrl = safeBandcampUrl(info.band_url) || "";
  return info.tracklist.map((track, index) => {
    const artId = Number(track?.art_id || info.art_id) || 0;
    return {
      id: String(track?.track_id || `${info.player_id || info.tralbum_key || "daily"}:${index}`),
      title: String(track?.track_title || `Bandcamp track ${index + 1}`).trim(),
      artist: String(track?.artist || info.band_name || "Bandcamp").trim(),
      album: String(info.title || "").trim(),
      art: artId ? `https://f4.bcbits.com/img/a${artId}_5.jpg` : "",
      pageUrl: releaseUrl,
      releaseUrl,
      artistUrl,
      duration: Number(track?.audio_track_duration) || 0,
      url: String(track?.audio_url?.["mp3-128"] || "")
    };
  }).filter((track) => track.title && track.url);
}
