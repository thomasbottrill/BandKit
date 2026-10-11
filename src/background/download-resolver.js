import { decodeHtmlAttribute } from "./metadata.js";
import { redownloadItemKey } from "../shared/download-formats.js";

const FETCH_TIMEOUT_MS = 45_000;

export function isDownloadFileUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === "https:"
      && (host.endsWith(".bandcamp.com") || host.endsWith(".bcbits.com"))
      && url.pathname.startsWith("/download/");
  } catch {
    return false;
  }
}

// Service workers have no DOMParser, so the blob is read straight from the
// markup. Bandcamp writes it as the only attribute-encoded JSON on the page.
export function pageDataFromHtml(html) {
  const tag = String(html || "").match(/<div\b[^>]*\bid=(["'])pagedata\1[^>]*>/i)?.[0] || "";
  const blob = tag.match(/\bdata-blob=(["'])([\s\S]*?)\1/i)?.[2];
  if (!blob) return null;
  try {
    return JSON.parse(decodeHtmlAttribute(blob));
  } catch {
    return null;
  }
}

export function parseSizeMb(value) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return null;
  const unit = String(value).trim().toLowerCase().match(/([kmgt])b$/)?.[1] || "m";
  return amount * { k: 1 / 1024, m: 1, g: 1024, t: 1024 * 1024 }[unit];
}

export function digitalDownloadFromPageData(data, format, key = "") {
  const items = Array.isArray(data?.digital_items) ? data.digital_items : null;
  if (!items) return { status: "unreadable" };
  const item = items.find((candidate) => key && String(candidate?.sale_item_id ?? candidate?.sale_id ?? "") === key)
    || items[0];
  if (!item?.downloads) {
    return data?.identities?.fan?.verified === false ? { status: "unverified" } : { status: "no-downloads" };
  }
  const entry = item.downloads[format];
  if (!entry || !isDownloadFileUrl(entry.url)) return { status: "format-missing" };
  return {
    status: "ok",
    url: entry.url,
    sizeMb: parseSizeMb(entry.size_mb),
    title: String(item.title || ""),
    artist: String(item.artist || ""),
    artId: Number(item.art_id) || 0
  };
}

export function statUrlFor(downloadUrl, random = Math.random) {
  if (!isDownloadFileUrl(downloadUrl)) return "";
  const url = new URL(downloadUrl);
  url.pathname = url.pathname.replace("/download/", "/statdownload/");
  url.searchParams.set(".rand", String(Math.floor(random() * 1e12)));
  url.searchParams.set(".vrs", "1");
  return url.href;
}

// The stat endpoint answers with a JSONP call: statResult({ result: "ok", ... }).
// Anything other than "ok" means the format is still being encoded.
export function parseStatResponse(body) {
  const payload = String(body || "").match(/statResult\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*\}?\s*;?\s*$/)?.[1];
  if (!payload) return null;
  try {
    const result = JSON.parse(payload);
    if (result?.result !== "ok") return { ready: false, errortype: String(result?.errortype || "") };
    return { ready: true, downloadUrl: isDownloadFileUrl(result.download_url) ? result.download_url : "" };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Resolves one queued release to a file URL the browser can save. Failures
// come back typed so the queue can choose between waiting, retrying and
// giving up, instead of treating every problem as fatal.
export async function resolveDownload(item, { fetchImpl = fetch } = {}) {
  const key = redownloadItemKey(item?.redownloadUrl);
  if (!key) return { status: "failed", error: "This item has no Bandcamp download link." };
  let response;
  try {
    response = await fetchWithTimeout(fetchImpl, item.redownloadUrl, { credentials: "include" });
  } catch {
    return { status: "error", error: "Bandcamp could not be reached." };
  }
  if (response.status === 429) return { status: "rate-limited" };
  if (!response.ok) return { status: "error", error: `Bandcamp returned ${response.status}.` };
  const data = pageDataFromHtml(await response.text());
  if (!data) return { status: "rate-limited" };
  const download = digitalDownloadFromPageData(data, item.format, key);
  if (download.status === "unverified") return { status: "failed", error: "Confirm your email address with Bandcamp, then retry." };
  if (download.status === "no-downloads") return { status: "unavailable", error: "Bandcamp has no download for this item." };
  if (download.status === "format-missing") return { status: "unavailable", error: "Not available in this format." };
  if (download.status !== "ok") return { status: "error", error: "Bandcamp's download page could not be read." };

  let stat = null;
  try {
    const statResponse = await fetchWithTimeout(fetchImpl, statUrlFor(download.url), { credentials: "include" });
    if (statResponse.status === 429) return { status: "rate-limited" };
    stat = parseStatResponse(await statResponse.text());
  } catch {
    stat = null;
  }
  if (stat && !stat.ready) return { status: "preparing" };
  return {
    status: "ok",
    // An unreadable stat reply is not proof the file is missing. The browser
    // download reports a real failure if Bandcamp refuses the file.
    url: stat?.downloadUrl || download.url,
    sizeMb: download.sizeMb,
    title: download.title,
    artist: download.artist
  };
}
