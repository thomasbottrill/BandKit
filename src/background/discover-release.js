import { artistNameFromHtml, metadataImageFromHtml, tralbumDataFromHtml } from "./metadata.js";
import { isBandcampUrl } from "./urls.js";

// Only selected releases are requested; cache metadata briefly, never audio bytes.
const releases = new Map();
export async function resolveDiscoverRelease(value) {
  if (!isBandcampUrl(value)) throw new Error("Invalid Bandcamp release URL.");
  const parsed = new URL(value);
  if (!/^\/(album|track)\/[^/]+\/?$/.test(parsed.pathname)) throw new Error("Invalid release path.");
  parsed.search = "";
  parsed.hash = "";
  const pageUrl = parsed.href;
  const cached = releases.get(pageUrl);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const response = await fetch(pageUrl, { credentials: "omit" });
    if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
    const html = await response.text();
    const data = tralbumDataFromHtml(html);
    if (!Array.isArray(data?.trackinfo)) throw new Error("Track list is unavailable.");
    const artist = data.artist || artistNameFromHtml(html) || "Bandcamp";
    const album = data.current?.title || "";
    const art = metadataImageFromHtml(html);
    return { pageUrl, album, tracks: data.trackinfo.map((track, index) => {
      const trackUrl = new URL(track.title_link || pageUrl, pageUrl).href;
      return {
        id: String(track.track_id || track.id || `${pageUrl}|${index}`),
        title: String(track.title || `Track ${index + 1}`),
        number: Number(track.track_num) || index + 1,
        artist: String(track.artist || artist), album, art,
        pageUrl: isBandcampUrl(trackUrl) ? trackUrl : pageUrl,
        releaseUrl: pageUrl, artistUrl: `${parsed.origin}/`,
        duration: Number(track.duration) || 0,
        url: /^https:\/\/[^/]+\.bcbits\.com\//.test(track.file?.["mp3-128"] || "") ? track.file["mp3-128"] : ""
      };
    }) };
  })();
  releases.set(pageUrl, { promise, expires: Date.now() + 5 * 60_000 });
  if (releases.size > 24) releases.delete(releases.keys().next().value);
  try { return await promise; }
  catch (error) { releases.delete(pageUrl); throw error; }
}
