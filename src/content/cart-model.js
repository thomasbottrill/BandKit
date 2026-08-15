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
      restore: sanitizeImportedRestore(item.restore)
    };
  }).filter(Boolean);
  if (!items.length) throw new Error("The backup does not contain any restorable Bandcamp items.");
  const exportedAt = new Date(payload.exportedAt);
  return {
    items,
    savedAt: Number.isNaN(exportedAt.getTime()) ? new Date().toISOString() : exportedAt.toISOString(),
    sourcePage: portableBandcampUrl(payload.sourcePage),
    summary: payload.summary && typeof payload.summary === "object" ? {
      subtotal: Number.isFinite(Number(payload.summary.subtotal)) ? Number(payload.summary.subtotal) : null,
      currency: /^[A-Z]{3}$/.test(payload.summary.currency || "") ? payload.summary.currency : null
    } : null
  };
}
