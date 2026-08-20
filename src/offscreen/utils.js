export function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function gainFromDb(value) {
  return value <= -30 ? 0 : Math.pow(10, value / 20);
}

export function compensatedHandoffTime(currentTime, startedAt, autoplay = false) {
  const elapsed = autoplay && Number(startedAt) > 0
    ? Math.max(0, Math.min(10, (Date.now() - Number(startedAt)) / 1000))
    : 0;
  return Math.max(0, finiteNumber(currentTime) + elapsed);
}

export function trackKey(track) {
  const id = String(track?.id || "").trim();
  const stableId = id.match(/^(?:track-)?(\d+)$/i)?.[1]?.replace(/^0+(?=\d)/, "");
  if (stableId) return `id:${stableId}`;
  let pageUrl = String(track?.pageUrl || "");
  try {
    const canonical = new URL(pageUrl);
    canonical.hash = "";
    canonical.search = "";
    canonical.pathname = canonical.pathname.replace(/\/+$/, "") || "/";
    pageUrl = canonical.href;
  } catch {
    pageUrl = "";
  }
  return [pageUrl, id, track?.title, track?.artist]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}
