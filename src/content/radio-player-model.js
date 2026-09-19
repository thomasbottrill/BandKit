export function radioShowTracklistKey({ cardId = "", showHref = "", baseHref = "https://bandcamp.com/radio" } = {}) {
  let showId = String(cardId).replace(/^show-/, "");
  if (!showId && showHref) {
    try {
      showId = new URL(showHref, baseHref).searchParams.get("show") || "";
    } catch {
      showId = "";
    }
  }
  return /^\d+$/.test(showId) ? `radio:${showId}` : "";
}
