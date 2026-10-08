// Bandcamp's image host sends no CORS headers, so artwork drawn into a page
// canvas would taint it. The worker's host permission reads it untainted.
const MAX_ARTWORK_BYTES = 4 * 1024 * 1024;

export function isBandcampArtworkUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".bcbits.com") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function fetchArtworkDataUrl(value) {
  if (!isBandcampArtworkUrl(value)) throw new Error("Artwork must come from Bandcamp's image host.");
  const response = await fetch(value, { credentials: "omit" });
  if (!response.ok) throw new Error(`Artwork request failed with ${response.status}.`);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim();
  if (!/^image\/(?:jpeg|png|gif|webp)$/.test(type)) throw new Error("Artwork response was not an image.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_ARTWORK_BYTES) throw new Error("Artwork is too large.");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${type};base64,${globalThis.btoa(binary)}`;
}
