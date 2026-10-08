// Feed stories hand the page a signed redirect rather than a media file, and
// that redirect is re-followed on every load, so playing one costs an extra
// round trip that release pages never pay. Resolve it once here, where host
// permissions make the hop cheap, and hand the player the same kind of final
// bcbits URL a release page already provides.
const RESOLVED_TTL_MS = 20 * 60 * 1000;
const MAX_CACHED = 400;
const MAX_PER_REQUEST = 12;

const resolved = new Map();
const inFlight = new Map();

function isFeedStreamUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "bandcamp.com"
      && url.pathname === "/stream_redirect"
      && url.searchParams.has("track_id");
  } catch {
    return false;
  }
}

function isMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "bcbits.com" || url.hostname.endsWith(".bcbits.com"));
  } catch {
    return false;
  }
}

function remember(trackId, url) {
  resolved.delete(trackId);
  resolved.set(trackId, { url, resolvedAt: Date.now() });
  while (resolved.size > MAX_CACHED) resolved.delete(resolved.keys().next().value);
}

function cached(trackId) {
  const entry = resolved.get(trackId);
  if (!entry) return "";
  if (Date.now() - entry.resolvedAt > RESOLVED_TTL_MS) {
    resolved.delete(trackId);
    return "";
  }
  return entry.url;
}

async function followRedirect(trackId, streamUrl) {
  // A one-byte range keeps the probe to its headers; the media element still
  // fetches the audio itself once playback starts.
  const response = await fetch(streamUrl, {
    credentials: "omit",
    redirect: "follow",
    headers: { Range: "bytes=0-0" }
  });
  await response.body?.cancel().catch(() => {});
  if (!isMediaUrl(response.url)) throw new Error("Bandcamp did not redirect to a media stream.");
  remember(trackId, response.url);
  return response.url;
}

function resolveOne(trackId, streamUrl) {
  const hit = cached(trackId);
  if (hit) return Promise.resolve(hit);
  if (!inFlight.has(trackId)) {
    inFlight.set(trackId, followRedirect(trackId, streamUrl)
      .catch(() => "")
      .finally(() => inFlight.delete(trackId)));
  }
  return inFlight.get(trackId);
}

export async function resolveFeedStreams(items) {
  const requests = (Array.isArray(items) ? items : []).slice(0, MAX_PER_REQUEST).map((item) => {
    const trackId = String(item?.trackId || "");
    const streamUrl = String(item?.url || "");
    if (!trackId || !isFeedStreamUrl(streamUrl)) return null;
    return { trackId, streamUrl };
  }).filter(Boolean);
  const streams = await Promise.all(requests.map(async ({ trackId, streamUrl }) => ({
    trackId,
    url: await resolveOne(trackId, streamUrl)
  })));
  return streams.filter((stream) => stream.url);
}
