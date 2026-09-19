export function normalizedActivity(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item?.action && (item?.createdAt || item?.time))
    .slice(0, 500);
}

export function repairDuplicatedCartActivity(value) {
  const repaired = [];
  const recentByTitle = new Map();
  const normalizedTitle = (item) => String(item?.title || "")
    .replace(/,\s*digital\s+(?:album|track|discography)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
  const normalizedUrl = (item) => {
    try {
      const url = new URL(item?.url || "");
      return `${url.origin}${url.pathname}`;
    } catch {
      return "";
    }
  };
  const quality = (item) => (
    (item?.artist && String(item.artist).toLocaleLowerCase() !== "bandcamp" ? 4 : 0)
    + (item?.art ? 2 : 0)
    + (/\.bandcamp\.com\/(?:album|track)\//.test(normalizedUrl(item)) ? 1 : 0)
    + (!/,\s*digital\s+/i.test(item?.title || "") ? 1 : 0)
  );
  for (const item of normalizedActivity(value)) {
    if (item.action !== "added-to-cart") {
      repaired.push(item);
      continue;
    }
    const title = normalizedTitle(item);
    const timestamp = Date.parse(item.createdAt || item.time || "");
    const previous = recentByTitle.get(title);
    const previousItem = previous ? repaired[previous.index] : null;
    const closeTogether = previous && Number.isFinite(timestamp) && Number.isFinite(previous.timestamp)
      && Math.abs(timestamp - previous.timestamp) <= 180000;
    const relatedMetadata = previousItem && (
      normalizedUrl(item) === normalizedUrl(previousItem)
      || (item.art && item.art === previousItem.art)
      || [item.artist, previousItem.artist].some((artist) => String(artist || "").toLocaleLowerCase() === "bandcamp")
    );
    if (title && closeTogether && relatedMetadata) {
      if (quality(item) > quality(previousItem)) repaired[previous.index] = item;
      continue;
    }
    recentByTitle.set(title, { index: repaired.length, timestamp });
    repaired.push(item);
  }
  return repaired.slice(0, 500);
}
