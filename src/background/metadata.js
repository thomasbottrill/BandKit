export function stableTrackId(value) {
  const match = String(value || "").trim().match(/^(?:track-)?(\d+)$/i);
  return match ? match[1].replace(/^0+(?=\d)/, "") : "";
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:0*39|x0*27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function tralbumDataFromHtml(html) {
  const match = String(html || "").match(/<script[^>]+data-tralbum=(['"])([\s\S]*?)\1[^>]*>/i);
  if (!match) return null;
  try {
    return JSON.parse(decodeHtmlAttribute(match[2]));
  } catch {
    return null;
  }
}

export function artistNameFromHtml(html) {
  const tralbumArtist = String(tralbumDataFromHtml(html)?.artist || "").trim();
  if (tralbumArtist) return tralbumArtist;
  const scripts = [...String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const json = JSON.parse(match[1]);
      const candidates = Array.isArray(json) ? json : [json];
      for (const candidate of candidates) {
        const artist = candidate?.byArtist?.name || candidate?.publisher?.name || candidate?.brand?.name;
        if (String(artist || "").trim()) return String(artist).trim();
      }
    } catch {
      // Ignore unrelated or malformed JSON-LD blocks.
    }
  }
  return "";
}

export function metadataImageFromHtml(html) {
  for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    const property = tag.match(/\b(?:property|name)\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase();
    if (!['og:image', 'twitter:image'].includes(property)) continue;
    const content = decodeHtmlAttribute(tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] || "");
    try {
      const url = new URL(content.startsWith("//") ? `https:${content}` : content);
      if (url.protocol === "https:") return url.href;
    } catch {
      // Try the next image metadata tag.
    }
  }
  return "";
}

export function jsonLdProperty(object, name) {
  return object?.additionalProperty?.find((property) => property?.name === name)?.value;
}

export function findDigitalOffer(json, itemUrl, requestedItemType = "", requestedTitle = "") {
  const candidates = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const itemType = jsonLdProperty(value, "item_type");
    if ((itemType === "a" || itemType === "t") && value.offers) candidates.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
  const expectedType = ["a", "t"].includes(requestedItemType)
    ? requestedItemType
    : new URL(itemUrl).pathname.includes("/track/") ? "t" : "a";
  const typedCandidates = candidates.filter((candidate) => jsonLdProperty(candidate, "item_type") === expectedType);
  const normalizedTitle = String(requestedTitle || "").replace(/\s+/g, " ").trim().toLowerCase();
  const titleMatch = normalizedTitle && typedCandidates.find((candidate) => String(candidate.name || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle);
  return titleMatch
    || (new URL(itemUrl).pathname.includes(`/${expectedType === "t" ? "track" : "album"}/`) && typedCandidates.find((candidate) => candidate["@id"] === itemUrl))
    || (!normalizedTitle && typedCandidates[0])
    || (!requestedItemType && candidates.find((candidate) => candidate["@id"] === itemUrl))
    || (!requestedItemType && candidates[0])
    || null;
}
