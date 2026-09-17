import { portableBandcampUrl, safeBandcampUrl } from "./core.js";

export function portableCartRestore(restore) {
  if (!restore || typeof restore !== "object") return null;
  const fields = [
    "item_type", "item_id", "item_title", "item_title2", "band_id", "artist_name",
    "unit_price", "currency", "quantity", "option_id", "option_name", "discount_id",
    "discount_type", "art_id", "image_id", "album_art_id", "item_art_id",
    "item_art_url", "art_url", "band_name", "band_title", "selling_band_name", "artist",
    "artist_title", "album_title", "license_id", "associated_license_id", "is_paypalable"
  ];
  const portable = {};
  for (const field of fields) {
    const value = restore[field];
    if (["string", "number", "boolean"].includes(typeof value) || value === null) portable[field] = value;
  }
  portable.url = portableBandcampUrl(restore.url, true);
  return ["a", "t", "b", "p"].includes(portable.item_type) && Number.isFinite(Number(portable.item_id))
    ? portable
    : null;
}

export function cartActivityIdentity(item) {
  const restore = item?.restore;
  if (restore?.item_type && restore?.item_id !== undefined && restore?.item_id !== null) {
    return `bandcamp:${restore.item_type}:${restore.item_id}:${restore.option_id ?? ""}:${restore.discount_id ?? ""}`;
  }
  let url = safeBandcampUrl(item?.url);
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    url = parsed.href;
  } catch {}
  const title = String(item?.title || "")
    .replace(/,\s*digital\s+(?:album|track|discography)\s*$/i, "")
    .trim()
    .toLocaleLowerCase();
  return url || title ? `page:${url}|${title}` : "";
}

export function mergeCartSnapshots(knownItems, observedItems) {
  const known = Array.isArray(knownItems) ? knownItems : [];
  const observed = Array.isArray(observedItems) ? observedItems : [];
  const merged = [];
  const positions = new Map();
  for (const item of [...observed, ...known]) {
    const identity = cartActivityIdentity(item) || `fallback:${JSON.stringify(item)}`;
    if (positions.has(identity)) continue;
    positions.set(identity, merged.length);
    merged.push(item);
  }
  return { items: merged, partial: merged.length > observed.length };
}

export function portableCartItem(item, { includeRestore = true } = {}) {
  if (!item || typeof item !== "object") return null;
  return {
    id: String(item.id || "").slice(0, 500),
    title: String(item.title || "Bandcamp item").slice(0, 500),
    artist: String(item.artist || "Bandcamp").slice(0, 500),
    album: String(item.album || "").slice(0, 500),
    kind: String(item.kind || "Bandcamp release").slice(0, 500),
    price: Math.max(0, Number(item.price) || 0),
    currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD",
    art: typeof item.art === "string" ? item.art.slice(0, 4000) : "",
    url: portableBandcampUrl(item.url, true),
    unavailable: item.unavailable === true,
    ...(includeRestore ? { restore: portableCartRestore(item.restore) } : {})
  };
}

function sanitizeImportedRestore(restore) {
  if (!restore || typeof restore !== "object") return null;
  return portableCartRestore(restore);
}

export function parseCartBackup(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("The selected file is empty.");
  let payload;
  if (source.startsWith("{")) {
    payload = JSON.parse(source);
  } else {
    const documentNode = new DOMParser().parseFromString(source, "text/html");
    const embedded = documentNode.querySelector("#bandkit-cart-data")?.textContent;
    if (!embedded) throw new Error("This HTML file does not contain a Bandkit cart backup.");
    payload = JSON.parse(embedded);
  }
  if (payload?.format !== "bandkit-cart" || Number(payload.version) !== 1 || !Array.isArray(payload.items)) {
    throw new Error("This is not a supported Bandkit cart backup.");
  }
  const items = payload.items.slice(0, 100).map((item, index) => {
    const url = safeBandcampUrl(item?.url || item?.restore?.url);
    if (!item || typeof item !== "object" || !url || !String(item.title || "").trim()) return null;
    return {
      id: String(item.id || `imported-${index}`).slice(0, 500),
      title: String(item.title).trim().slice(0, 500),
      artist: String(item.artist || "Bandcamp").trim().slice(0, 500),
      kind: String(item.kind || "Imported cart item").trim().slice(0, 500),
      price: Math.max(0, Number(item.price) || 0),
      currency: /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD",
      art: /^https?:/i.test(item.art || "") ? String(item.art).slice(0, 4000) : "",
      url,
      unavailable: item.unavailable === true,
      restore: sanitizeImportedRestore(item.restore)
    };
  }).filter(Boolean);
  if (!items.length) throw new Error("The backup does not contain any restorable Bandcamp items.");
  const exportedAt = new Date(payload.exportedAt);
  return {
    name: String(payload.name || "").trim().slice(0, 120),
    items,
    savedAt: Number.isNaN(exportedAt.getTime()) ? new Date().toISOString() : exportedAt.toISOString(),
    sourcePage: portableBandcampUrl(payload.sourcePage),
    summary: payload.summary && typeof payload.summary === "object" ? {
      subtotal: Number.isFinite(Number(payload.summary.subtotal)) ? Number(payload.summary.subtotal) : null,
      total: Number.isFinite(Number(payload.summary.total)) ? Number(payload.summary.total) : null,
      currency: /^[A-Z]{3}$/.test(payload.summary.currency || "") ? payload.summary.currency : null
    } : null
  };
}

// The page-world bridge publishes cart state as an ordinary DOM event, which any
// script running on the Bandcamp page can also dispatch. The bridge applies this
// allowlist before emitting; re-applying it here means a forged event cannot push
// unexpected fields or unbounded data into a saved cart snapshot.
export const MAX_BRIDGED_CART_ITEMS = 200;
const MAX_BRIDGED_RELEASES = 25;

const BRIDGED_CART_FIELDS = [
  "id", "local_id", "item_type", "item_id", "item_title", "item_title2", "band_id",
  "artist_name", "unit_price", "currency", "quantity", "option_id", "option_name",
  "discount_id", "discount_type", "url", "art_id", "image_id",
  "album_art_id", "item_art_id", "item_art_url", "art_url", "band_name", "band_title",
  "selling_band_name", "artist", "artist_title", "album_title",
  "license_id", "associated_license_id", "is_paypalable"
];
const BRIDGED_RELEASE_FIELDS = [
  "item_type", "item_id", "title", "item_title", "album_title", "artist", "artist_name",
  "band_name", "band_title", "selling_band_name", "artist_title", "url", "art_id", "image_id",
  "album_art_id", "item_art_id", "item_art_url", "art_url"
];

function bridgedScalars(source, fields) {
  const data = {};
  for (const field of fields) {
    const value = source?.[field];
    if (["string", "number", "boolean"].includes(typeof value) || value === null) data[field] = value;
  }
  return data;
}

export function normalizeBridgedCart(detail) {
  if (!Array.isArray(detail?.items)) return null;
  const items = detail.items.slice(0, MAX_BRIDGED_CART_ITEMS).map((item) => {
    const data = bridgedScalars(item, BRIDGED_CART_FIELDS);
    const releases = Array.isArray(item?.releases) ? item.releases : [];
    data.releases = releases
      .slice(0, MAX_BRIDGED_RELEASES)
      .map((release) => bridgedScalars(release, BRIDGED_RELEASE_FIELDS))
      .filter((release) => Object.keys(release).length);
    data.unavailable = item?.unavailable === true;
    return data;
  });
  const source = detail.summary && typeof detail.summary === "object" ? detail.summary : null;
  const summary = source ? {
    subtotal: Number.isFinite(Number(source.subtotal)) ? Number(source.subtotal) : null,
    total: Number.isFinite(Number(source.total)) ? Number(source.total) : null,
    currency: /^[A-Z]{3}$/.test(source.currency || "") ? source.currency : null
  } : null;
  return { items, summary };
}
