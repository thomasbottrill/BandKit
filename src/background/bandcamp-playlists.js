import { decodeHtmlAttribute } from "./metadata.js";
import { isBandcampUrl } from "./urls.js";

// Playlists made with Bandcamp's own playlist feature. Private ones need the
// fan's sign-in, so both reads include credentials and only run here, where
// the extension can reach bandcamp.com from any page.
const text = (value, limit = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const streamUrl = (value) => /^https:\/\/[^/]+\.bcbits\.com\//.test(value || "") ? value : "";

export async function listBandcampPlaylists(fanId, fetchImpl = fetch) {
  const id = Number(fanId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Connect your collection to see your Bandcamp playlists.");
  const playlists = [];
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const response = await fetchImpl("https://bandcamp.com/api/fan_collection/1/playlists", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ page_fan_id: id, page_size: 50, next_cursor: cursor }), signal: globalThis.AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.items)) throw new Error("Bandcamp's playlists are unavailable right now.");
    for (const item of data.items) {
      if (!isBandcampUrl(item?.itemUrl) || !Number(item.itemId)) continue;
      playlists.push({
        id: `bc:${Number(item.itemId)}`, title: text(item.title, 200) || "Untitled playlist", url: item.itemUrl,
        art: Number(item.imageId) ? `https://f4.bcbits.com/img/${String(Number(item.imageId)).padStart(10, "0")}_10.jpg` : "",
        trackCount: Number(item.tracksSummary?.totalCount) || 0, duration: Number(item.tracksSummary?.totalDuration) || 0,
        isPrivate: item.isPrivate === true
      });
    }
    cursor = data.nextCursor || null;
    if (!cursor) break;
  }
  return playlists;
}

// A playlist page carries its whole track list, with the same stream links
// Bandcamp's own player uses. They expire, so this runs when someone presses play.
export async function bandcampPlaylistTracks(url, fetchImpl = fetch) {
  if (!isBandcampUrl(url) || !/^\/[^/]+\/playlist\/[^/]+\/?$/.test(new URL(url).pathname)) throw new Error("Invalid Bandcamp playlist.");
  const response = await fetchImpl(url, { credentials: "include", signal: globalThis.AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
  const html = await response.text();
  const tag = html.match(/<[^>]+\bid=["']PlaylistPage["'][^>]*>/i)?.[0] || "";
  const blob = tag.match(/\bdata-blob=(['"])([\s\S]*?)\1/i)?.[2];
  const tracks = blob ? JSON.parse(decodeHtmlAttribute(blob))?.appData?.tracklist?.tracks : null;
  if (!Array.isArray(tracks)) throw new Error("This playlist's tracks are unavailable.");
  return tracks.map((track, index) => {
    const pageUrl = isBandcampUrl(track.url) ? track.url : "";
    const releaseUrl = isBandcampUrl(track.album?.url) ? track.album.url : pageUrl;
    return {
      id: String(track.id || `${url}|${index}`), title: text(track.title) || `Track ${index + 1}`, number: index + 1,
      artist: text(track.artistName), album: text(track.album?.title),
      art: Number(track.artId) ? `https://f4.bcbits.com/img/a${Number(track.artId)}_7.jpg` : "",
      pageUrl, releaseUrl, artistUrl: isBandcampUrl(track.bandUrl) ? `${new URL(track.bandUrl).origin}/` : "",
      duration: Number(track.duration) || 0, url: track.isStreamingDisabled ? "" : streamUrl(track.streamUrl)
    };
  }).filter((track) => track.url);
}
