import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();
const menuStyles = await readFile(new URL("../src/content/runtime/page-player-ui.js", import.meta.url), "utf8");
const cartStyles = await readFile(new URL("../src/styles/hub/collections-interactions.css", import.meta.url), "utf8");
const [background, cartDelegate, cartBridge, contracts, currencyMinimums] = await Promise.all([
  readFile(new URL("../src/background/index.js", import.meta.url), "utf8"),
  readFile(new URL("../src/background/cart-delegate.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/page-cart-bridge.js", import.meta.url), "utf8"),
  readFile(new URL("../src/shared/contracts.js", import.meta.url), "utf8"),
  readFile(new URL("../src/background/currency-minimums.js", import.meta.url), "utf8")
]);

// Bandcamp only ships its cart bundle on release pages, so every cart action has
// to know whether this page can serve one before it tries.
assert.match(cartBridge, /function cartIsReady\(\)[\s\S]*?typeof window\.Sidecart\?\.add_to_cart === "function"[\s\S]*?window\.Sidecart\.initing !== true/,
  "a cart that has not finished loading must not count as ready");
assert.match(cartBridge, /function emitCart\(force = false\)[\s\S]*?if \(!cartIsReady\(\)\) return;/,
  "an unloaded cart must never be reported, or Bandkit saves it as an emptied cart");
assert.match(cartBridge, /function emitCartAvailability\(\)[\s\S]*?const available = cartIsReady\(\)[\s\S]*?bandkit:cart-availability/,
  "the page bridge must report whether Bandcamp's cart API exists on this page");
assert.match(cartBridge, /action === "getAvailability"[\s\S]*?lastCartAvailable = null[\s\S]*?emitCartAvailability\(\)/,
  "an availability request must re-answer even when the previous answer was the same");
assert.match(source, /function pageCartIsAvailable\(\)[\s\S]*?pageCartCommand\("getAvailability"\)[\s\S]*?return pageCartAvailable === true/,
  "cart availability must be re-checked at call time, not trusted from page load");

// Feed pages have no cart of their own, so the work is delegated rather than
// failing with a notice the listener can do nothing about.
assert.match(source, /function addResolvedItemsToCart[\s\S]*?if \(!pageCartIsAvailable\(\)\)[\s\S]*?CART_ADD_REMOTE/,
  "a page without Bandcamp's cart must delegate the add instead of reporting the cart as unavailable");
assert.match(source, /function removeLiveCartItem[\s\S]*?if \(!pageCartIsAvailable\(\)\)[\s\S]*?CART_REMOVE_REMOTE/,
  "removal must be delegated from a page without Bandcamp's cart too");
assert.match(source, /if \(message\?\.type === MESSAGES\.CART_ADD_ITEMS\)[\s\S]*?if \(!pageCartIsAvailable\(\)\) return false;[\s\S]*?sendCartRestore/,
  "a borrowed tab must stay silent until its cart is ready so the caller keeps waiting");
assert.match(cartDelegate, /chrome\.tabs\.create\(\{ url: pageUrl, active: false \}\)[\s\S]*?finally[\s\S]*?chrome\.tabs\.remove/,
  "the borrowed cart tab must open in the background and always be closed again");
assert.match(source, /function sendCartRemove[\s\S]*?cartRemovalKeys \|\|= new Set\(\);[\s\S]*?cartRemovalKeys\.add\(removalKey\)/,
  "a borrowed tab must suppress its own cart protection so the removal is not undone");
for (const name of ["CART_ADD_ITEMS", "CART_ADD_REMOTE", "CART_REMOVE_ITEM", "CART_REMOVE_REMOTE"]) {
  assert.match(contracts, new RegExp(`${name}: "BANDCAMP_HUB_`), `${name} must be a declared message type`);
}
for (const name of ["CART_ADD_REMOTE", "CART_REMOVE_REMOTE"]) {
  assert.match(background, new RegExp(`MESSAGES\\.${name}`), `${name} must be routed by the background`);
}
for (const name of ["CART_ADD_ITEMS", "CART_REMOVE_ITEM"]) {
  assert.match(cartDelegate, new RegExp(`MESSAGES\\.${name}`), `${name} must be sent to the borrowed cart tab`);
}

// The story's own buy control adds the release rather than navigating away.
assert.match(source, /purchaseAction\.addEventListener\("click"[\s\S]*?event\.preventDefault\(\)[\s\S]*?requestReleaseCartAdd\(purchaseAction, requested\)/,
  "a feed story's buy control must add to the cart instead of following its link");
assert.match(source, /purchaseAction\.addEventListener\("pointerenter"[\s\S]*?prefetchFeedPurchase/,
  "hovering a feed story's buy control must resolve its purchase terms ahead of the click");
assert.match(source, /function requestReleaseCartAdd[\s\S]*?namesOwnPrice = purchase\.status === "name-your-price" \|\| purchase\.minimum === true[\s\S]*?openPagePriceMenu/,
  "a name-your-price release must ask for an amount rather than assuming one");
assert.match(source, /function addReleaseToCart[\s\S]*?unitPrice !== null[\s\S]*?restore\.unit_price = item\.price/,
  "the chosen amount must reach the cart item Bandcamp receives");
assert.match(source, /view === "name-your-price"[\s\S]*?createPagePriceForm\(\{[\s\S]*?addReleaseToCart\(request\.track \|\| firstTrack, amount\)/,
  "the price prompt must reuse the existing page action menu rather than a separate surface");
assert.match(source, /Add album to current cart[\s\S]*?isRelease && albumTrack\) void requestReleaseCartAdd\(anchor, albumTrack\)/,
  "the menu's album cart action must ask for a name-your-price amount too");
assert.match(source, /function refreshFeedReleaseAddButtons[\s\S]*?is-feed-add-to[\s\S]*?applyFeedReleaseAddButton/,
  "a feed story must become an album action once its track list resolves");
assert.match(menuStyles, /\.bandcamp-hub-page-playlist-menu \.bandkit-page-price-form \.bandkit-page-price-input:is\(:focus,:focus-visible\)\{box-shadow:none!important;outline:none!important\}/,
  "the price field must out-specify Bandcamp's own focus ring rather than tie with it");
assert.match(source, /function createPagePriceForm[\s\S]*?const floor = minimumPrice > 0 \? minimumPrice : 0\.01[\s\S]*?input\.min = String\(floor\)/,
  "a release with no minimum must still refuse a cart add priced at nothing");
assert.match(source, /const syncSubmit = \(\) => \{[\s\S]*?submit\.disabled = !Number\.isFinite\(amount\) \|\| amount < floor[\s\S]*?if \(!Number\.isFinite\(amount\) \|\| amount < floor\) return;[\s\S]*?onSubmit\(amount\)/,
  "the price prompt must never submit less than Bandcamp will accept");
assert.match(source, /const missingSignature = missingItems\.map\(cartActivityIdentity\)[\s\S]*?hasBridgedCart && cartShrinkScans >= CART_SHRINK_CONFIRM_SCANS[\s\S]*?const acceptedItems = lossConfirmed \? uniqueItems : protectedItems/,
  "only Bandcamp's own cart may shrink the stored one, and only once the loss persists");
assert.match(source, /if \(lossConfirmed\) recoverMissingCartItems\(missingItems\)/,
  "recovery must wait for a loss to be confirmed rather than chase a transient reading");
assert.match(source, /const parsed = hasBridgedCart \? parsedFromBridge : pageCartPresent \? null : parsedFromDom;\s*\n\s*if \(!parsed\) return;/,
  "a page with its own cart must never fall back to reading the cart out of the markup");
assert.match(source, /const identifiable = \(item\) => Boolean\(item\?\.restore\?\.item_type\)[\s\S]*?const knownItems = hasBridgedCart \? state\.cart\.filter\(identifiable\) : state\.cart/,
  "entries with no product identity must be dropped once Bandcamp's own cart is authoritative");
assert.match(source, /function recoverMissingCartItems[\s\S]*?if \(!pageCartIsAvailable\(\)\) return;/,
  "cart recovery must never borrow a tab of its own");

// A borrowed tab owns Bandcamp's real cart, so it hands that cart back to the
// page that asked. Without it the feed's panel keeps showing the cart as it was
// before the action and a successful add reads as "already in my cart".
assert.match(source, /function adoptRemoteCart\(remote\)[\s\S]*?if \(!Array\.isArray\(remote\?\.cart\)\) return;[\s\S]*?state\.cart = remote\.cart/,
  "a cart returned by a borrowed tab must replace the caller's stale one");
assert.match(source, /function addResolvedItemsToCart[\s\S]*?CART_ADD_REMOTE[\s\S]*?adoptRemoteCart\(remote\)/,
  "a remote add must adopt the cart the borrowed tab produced");
assert.match(source, /function removeLiveCartItem[\s\S]*?CART_REMOVE_REMOTE[\s\S]*?adoptRemoteCart\(remote\)/,
  "a remote removal must adopt the cart the borrowed tab produced");
assert.match(source, /sendResponse\(\{ \.\.\.result, cart: state\.cart, cartSummary: state\.cartSummary \}\)/,
  "the borrowed tab must answer with the cart it just wrote");
assert.match(source, /result\.added === 0 && result\.alreadyPresent > 0\s*\?\s*"Already in your Bandcamp cart\."/,
  "an already-present result must say so plainly rather than report a failed restore");

// Every cart card keeps its title, artist and product type lines, so an item
// added from the feed is never shown as a bare album name.
assert.match(source, /const artistName = isGenericCartArtist\(item\.artist\) \? "Bandcamp" : item\.artist/,
  "cart cards must always render an artist line");
assert.doesNotMatch(cartStyles, /\.hub-cart-item-card \.hub-product-meta-row \{[^}]*opacity: 0/,
  "the cart card's product type must be visible at rest");

// Bandcamp's own collection minimum is what makes a name-your-price amount
// valid; anything below it produces a cart item that only fails at checkout
// with a "price has changed" error.
assert.match(currencyMinimums, /medium_min_price[\s\S]*?small_min_price|small_min_price[\s\S]*?medium_min_price/,
  "the currency minimum table must come from Bandcamp's own small/medium values");
assert.match(background, /cartMinimum: cartMinimumFor\(minimums, currency, itemType\)/,
  "release metadata must carry Bandcamp's collection minimum for the item type");
assert.match(source, /const floor = Math\.max\([\s\S]*?Number\(purchase\.minimumPrice\)[\s\S]*?Number\(metadata\?\.cartMinimum\)/,
  "the price prompt must never offer less than Bandcamp's collection minimum");
assert.match(source, /purchase\.status === "free"[\s\S]*?free download on Bandcamp/,
  "a free release must not be added to the cart at all");
assert.match(source, /function cartItemsBelowMinimum[\s\S]*?RESOLVE_CART_MINIMUMS[\s\S]*?unitPrice: Number\(item\.restore\?\.unit_price/,
  "checkout must be able to spot items priced below Bandcamp's minimum");
assert.match(source, /priced below Bandcamp's minimum[\s\S]*?Remove it and add it again with a valid amount/,
  "checkout must explain below-minimum items instead of opening an error page");
assert.match(source, /is-below-minimum[\s\S]*?Below Bandcamp's minimum/,
  "cart cards must mark items Bandcamp will refuse at checkout");
assert.match(cartBridge, /function cartMinimum\(item\)[\s\S]*?small_min_price[\s\S]*?medium_min_price/,
  "the cart bridge must know Bandcamp's per-currency minimum before adding");
assert.match(cartBridge, /minimum > 0 && Math\.max\(0, Number\(item\.unit_price\) \|\| 0\) < minimum[\s\S]*?result\.failed\.push/,
  "a below-minimum item must be refused rather than added to Bandcamp's cart");
assert.match(source, /const unpriced = items\.filter[\s\S]*?unit_price\) > 0[\s\S]*?name-your-price\. Set an amount/,
  "a name-your-price track must not be added at nothing");
assert.match(contracts, /RESOLVE_CART_MINIMUMS: "BANDCAMP_HUB_/,
  "the currency minimum request must be a declared message type");
assert.match(background, /async function resolveCartMinimums\(items\)[\s\S]*?cartMinimumFor\(minimums, item\?\.currency, item\?\.itemType\)/,
  "the background must answer the per-item minimum question");
assert.match(background, /MESSAGES\.RESOLVE_CART_MINIMUMS[\s\S]*?resolveCartMinimums\(message\.items\)/,
  "the currency minimum request must be routed by the background");

console.log("Feed cart add, name-your-price prompt and borrowed-cart delegation checks passed.");
