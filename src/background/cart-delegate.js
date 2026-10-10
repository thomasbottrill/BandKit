import { MESSAGES } from "../shared/contracts.js";
import { isBandcampUrl } from "./urls.js";

// Bandcamp ships its cart bundle only on release pages, so a page like the feed
// has no cart API to call. Rather than sending the listener off to the release
// page, borrow one in a background tab, act there through Bandcamp's own cart
// code, and close it again. The wishlist action already works this way.
//
// The borrowed tab must never answer before its cart has loaded: Bandkit saves
// whatever cart it is shown, and an empty one would read as "everything was
// removed". The page bridge holds that line, so keep polling until it speaks.
const READY_TIMEOUT_MS = 20000;
const READY_POLL_MS = 250;

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function sendThroughTab(tabId, message) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response) return response;
    } catch (error) {
      // The content script is not listening yet on a tab that is still loading.
      lastError = error?.message || "";
    }
    await delay(READY_POLL_MS);
  }
  return { error: lastError || "Bandcamp's cart page did not respond in time." };
}

async function throughBorrowedCart(pageUrl, message) {
  if (!isBandcampUrl(pageUrl)) return { ok: false, error: "This item has no Bandcamp page to use its cart from." };
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: pageUrl, active: false });
    const result = await sendThroughTab(tab.id, message);
    return { ok: !result.error, ...result };
  } catch (error) {
    return { ok: false, error: error?.message || "Bandcamp's cart could not be opened." };
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

export async function addItemsToCartRemotely({ items, url }) {
  const target = Array.isArray(items) && items.length ? items : null;
  if (!target) return { ok: false, error: "There was nothing to add to the cart." };
  const pageUrl = [url, ...target.map((item) => item?.restore?.url || item?.url)].find((value) => isBandcampUrl(value));
  const result = await throughBorrowedCart(pageUrl, { type: MESSAGES.CART_ADD_ITEMS, items: target });
  return { added: 0, alreadyPresent: 0, failed: [], ...result };
}

// A release that has been taken down has no page left to borrow, yet it stays
// in the cart until something deletes it. Bandcamp's cart is one cart on every
// release page, so the caller passes other pages that can do the removal.
const MAX_REMOVE_PAGES = 4;

export async function removeItemFromCartRemotely({ item, url, urls, clear = false }) {
  if (!item && !clear) return { ok: false, error: "There was nothing to remove from the cart." };
  const candidates = [...new Set([url, ...(Array.isArray(urls) ? urls : []), item?.restore?.url, item?.url]
    .filter((value) => isBandcampUrl(value)))].slice(0, MAX_REMOVE_PAGES);
  let result = { ok: false, error: "This item has no Bandcamp page to use its cart from." };
  for (const pageUrl of candidates) {
    result = await throughBorrowedCart(pageUrl, { type: MESSAGES.CART_REMOVE_ITEM, item, clear });
    // A page that answered had a loaded cart, so its verdict is final.
    if (result.ok || Array.isArray(result.cart)) break;
  }
  return { removed: false, ...result };
}
