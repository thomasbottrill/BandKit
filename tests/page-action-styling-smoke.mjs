import assert from "node:assert/strict";
import fs from "node:fs";

const playerUi = ["runtime/page-player-ui.js", "components/page-actions.js"].map(file => fs.readFileSync(new URL(`../src/content/${file}`, import.meta.url), "utf8")).join("\n");
// The page theme moved into its own document_start stylesheet; its rules are
// still part of what theme application ships.
const appearance = ["../src/content/runtime/appearance.js", "../src/styles/page/theme.css"].map((file) => (
  fs.readFileSync(new URL(file, import.meta.url), "utf8")
)).join("\n");
const modernLayout = ["modern-layout.js", "modern-release-layout.js"].map((file) => (
  fs.readFileSync(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
)).join("\n");
const playerShell = ["player-shell.js", "player-handoffs.js"].map((file) => (
  fs.readFileSync(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
)).join("\n");
const releaseCss = fs.readFileSync(new URL("../src/styles/modern/release.css", import.meta.url), "utf8");
const releaseDetailsCss = fs.readFileSync(new URL("../src/styles/modern/release-details.css", import.meta.url), "utf8");
const feedCss = fs.readFileSync(new URL("../src/styles/modern/feed.css", import.meta.url), "utf8");
const releaseActionsCss = fs.readFileSync(new URL("../src/styles/modern/release-actions.css", import.meta.url), "utf8");

assert.match(playerUi, /:not\(\.is-active\):not\(\.is-added\):not\(\[aria-pressed="true"\]\):not\(\[aria-expanded="true"\]\)\{background:transparent!important;border-color:transparent!important\}/,
  "inactive page actions should show only their icon and label");
assert.match(playerUi, /:is\(:hover,:focus-visible\)[^}]*\{background:color-mix\(in srgb,[^}]* 8%,[^}]*\)!important;border-color:transparent!important;outline:0!important\}/,
  "hovered page actions should reveal only a muted fill");
assert.match(playerUi, /:is\(\.is-active,\.is-added,\[aria-pressed="true"\],\[aria-expanded="true"\]\)\{background:transparent!important;border-color:var\(--hub-accent,/,
  "active page actions should retain the accent outline");
assert.match(playerUi, /data-bandkit-modern-release="true"[^}]*\.bandcamp-hub-page-tools[^}]*:is\(\.is-active,\.is-added,\[aria-pressed="true"\],\[aria-expanded="true"\]\)\{background:transparent!important;border-color:var\(--hub-accent,/,
  "release active states should outrank the page hover and focus layer");
assert.match(playerUi, /#track_table :is\(\.play-col>a:has\(:is\(\.playbutton,\.play_status\)\.playing\),\.track_row_view\.bandcamp-hub-is-playing \.play-col>a\)\{border-color:transparent!important\}/,
  "the active track-list Pause control should remain outline-free at rest");
assert.match(playerUi, /#track_table :is\(\.play-col>a:has\(:is\(\.playbutton,\.play_status\)\.playing\),\.track_row_view\.bandcamp-hub-is-playing \.play-col>a\):is\(:hover,:focus-visible\)\{border-color:var\(--hub-accent,/,
  "the active track-list Pause control should reveal its outline only on hover or focus");
assert.match(playerUi, /data-bandkit-feed-page="true"[^}]*body\.feed[^}]*:is\(:hover,:focus-visible\)[^}]*background:color-mix\(in srgb,var\(--bandkit-feed-accent,[^}]*var\(--bandkit-feed-card,/,
  "every Feed action should resolve its hover against the shared Feed surface");
assert.match(playerUi, /data-bandkit-collection-page[^;]*\.bandkit-collection-action-row[^;]*\.bandkit-collection-download-action[^}]*background:transparent!important/s,
  "collection Add and Download actions should be transparent at rest");
assert.match(playerUi, /wishlisted-msg>\.bandkit-feed-wishlist-control:is\(:hover,:focus-visible\)\{border-color:transparent!important\}/,
  "the filled orange wishlist heart should not receive an outline");
assert.match(playerUi, /New playlist[\s\S]*?is-prominent[\s\S]*?Add all to current cart[\s\S]*?Add to current cart[\s\S]*?is-prominent/,
  "page destination menus must emphasize new-playlist and current-cart actions");
assert.doesNotMatch(playerUi, /Add (?:all to )?Playlist…[^\n]*is-prominent/,
  "page add-to-playlist destinations must keep the standard menu weight");
assert.match(playerUi, /label\.match\(\/\^\(\[＋✓←\]\)\\s\+\/\)[\s\S]*?bandkit-page-menu-icon/,
  "page destination menus must render leading glyphs in a shared icon column");
assert.match(playerUi, /bandcamp-hub-page-playlist-menu button\{[^}]*display:flex[^}]*gap:7px[^}]*text-decoration:none!important/s,
  "page destination menu labels must align after fixed icons without link underlines");
assert.match(playerUi, /bandkit-page-menu-icon\{[^}]*flex:0 0 14px[^}]*font-size:14px[^}]*width:14px/s,
  "page destination glyphs must match the wishlist icon footprint");
assert.match(playerUi, /bandcamp-hub-page-playlist-menu \.is-prominent\{font-weight:600\}/,
  "prominent page destination actions must use the slightly heavier text weight");

assert.match(releaseCss, /\.bandcamp-hub-page-tools :is\([\s\S]*?\) \{[\s\S]*?background: transparent !important;[\s\S]*?border-color: transparent !important;/,
  "release toolbar buttons should be transparent at rest");
assert.match(releaseCss, /\.bandcamp-hub-page-tools :is\([\s\S]*?\):is\(:hover, :focus-visible\) \{[\s\S]*? 8%, var\(--hub-card, var\(--bandkit-release-surface\)\)\) !important;[\s\S]*?border-color: transparent !important;/,
  "release toolbar hover should use the shared action surface and remain outline-free");
assert.match(releaseCss, /#track_table \.download-col :is\(\.bandcamp-hub-page-playlist\.is-track-action, \.bandcamp-hub-page-buy\):is\(:hover, :focus-visible\) \{[^}]*var\(--hub-card, var\(--bandkit-release-surface\)\)/s,
  "track Buy and Add hover fills should resolve against the same surface as page toolbar actions");
assert.match(releaseCss, /#recommendations_container[^}]*border: 1px solid transparent !important;/,
  "artwork overlay actions should reserve a transparent border instead of showing an outline");
assert.match(feedCss, /background: transparent !important;[\s\S]*?border-color: transparent !important;[\s\S]*?background: color-mix\(in srgb, var\(--bandkit-feed-accent\) 9%,/,
  "feed actions should be transparent at rest and theme-filled on hover");
assert.match(appearance, /data-bandkit-collection-page="true"[^\n]*background: transparent !important; border-color: transparent !important;/,
  "theme application should preserve the collection action rest treatment");
assert.match(releaseActionsCss, /share-embed-label > button\.is-active\s*\{[^}]*border-color: var\(--hub-accent,/,
  "the open Share and Embed control should receive the active outline");
assert.match(releaseActionsCss, /\.share-embed-label > button:is\(:hover, :focus-visible\) \{[^}]*var\(--hub-card, var\(--bandkit-release-surface\)\)/s,
  "Share and Embed should use the shared action hover surface");
assert.match(releaseActionsCss, /#collect-item:not\(\.wishlisted\) #wishlist-msg:is\(:hover, :focus-visible\) \{[^}]*var\(--hub-card, var\(--bandkit-release-surface\)\)/s,
  "Wishlist should use the shared action hover surface");
assert.match(releaseActionsCss, /:is\(\s*#wishlisted-msg > \.wishlist-wrapper > \.view,\s*#purchased-msg > span > \.bandkit-modern-collection-link\s*\):is\(:hover, :focus-visible\) \{[^}]*var\(--hub-card, var\(--bandkit-release-surface\)\)/s,
  "View and In Collection should use the same shared action hover surface");
assert.match(releaseActionsCss, /#collect-item\s*\{[^}]*align-items: center;[^}]*display: inline-flex;[^}]*gap: 8px;/s,
  "Wishlist and ownership state must share one vertically centered action row");
assert.match(releaseActionsCss, /#collect-item\.bandkit-modern-owned #purchased-msg,?[\s\S]*?#collect-item\.bandkit-modern-owned #purchased-msg a\s*\{[^}]*align-items: center;[^}]*display: inline-flex !important;[^}]*line-height: 1 !important;/s,
  "the native ownership link must align to the Wishlist control rather than its text baseline");
assert.match(modernLayout, /applyCollectionOwnership[\s\S]*?collectItem\.classList\.add\("bandkit-modern-owned"\)[\s\S]*?purchasedLink\.textContent = "In Collection"[\s\S]*?RESOLVE_COLLECTION_MEMBERSHIP[\s\S]*?response\.owned === true\) applyCollectionOwnership/,
  "native purchases and collection-index matches should use the In Collection link");
assert.match(releaseActionsCss, /#collect-item\.bandkit-modern-owned #wishlisted-msg > \.wishlist-wrapper\s*\{[^}]*display: none !important;/s,
  "owned releases must suppress the redundant wishlist View link");
assert.match(releaseActionsCss, /#collect-item\.wishlisted #wishlisted-msg > \.action\s*\{[^}]*background: transparent !important;[^}]*border-color: transparent !important;[^}]*color: #ff9c00 !important;/s,
  "the artist-page wishlist control should use a filled orange heart without an outline");
assert.match(modernLayout, /for \(const \{ action, control \} of giftEntries\)[\s\S]*?control\.setAttribute\("aria-label", "Send as gift"\)/,
  "every purchase Gift action should retain an accessible label");
assert.doesNotMatch(modernLayout, /icon-gift\.svg/,
  "purchase Gift actions should use text rather than the old gift icon");
assert.match(releaseActionsCss, /\.buyItem:has\(> \.bandkit-modern-purchase-actions\) > \.ft > :is\([\s\S]*?\.compound-button\.main-button,[\s\S]*?\.compound-button\.send-as-gift[\s\S]*?display: none !important;/,
  "Bandcamp must not reintroduce duplicate native purchase and Gift controls beside the normalized action row");
assert.match(releaseActionsCss, /\.bandkit-modern-gift-action\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*visibility:\s*hidden;/s,
  "Gift should remain hidden until its purchase card is engaged");
assert.match(releaseActionsCss, /\.buyItem:is\(:hover, :focus-within\) \.bandkit-modern-gift-action\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;[^}]*visibility:\s*visible;/s,
  "hovering or focusing a purchase card should reveal its plain Gift icon");
assert.match(releaseActionsCss, /\.bandkit-modern-gift-control:is\(:hover, :focus-visible\)\s*\{[^}]*var\(--bandkit-release-accent\) 8%, var\(--bandkit-release-surface\)[^}]*border-color: transparent !important;/s,
  "Gift should use the shared muted release hover fill without an outline");
assert.match(releaseDetailsCss, /#rightColumn \.bandkit-modern-purchase-list \.bandkit-modern-buy-control,[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?border:\s*1px solid transparent\s*!important;[\s\S]*?color:\s*var\(--bandkit-release-accent\)\s*!important;/,
  "Buy Digital and Follow should use accent text without a resting fill or outline");
assert.match(releaseDetailsCss, /#rightColumn \.bandkit-modern-purchase-list \.bandkit-modern-buy-control:is\(:hover, :focus-visible, :active\),[\s\S]*?background:\s*color-mix\(in srgb, var\(--bandkit-release-accent\) 8%, var\(--bandkit-release-surface\)\)\s*!important;[\s\S]*?border-color:\s*transparent\s*!important;/,
  "Buy Digital and Follow should share a soft accent-derived hover, focus, and pressed fill");
assert.match(releaseDetailsCss, /#rightColumn \.bandkit-modern-purchase-list \.hd button\.buy-link\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;/s,
  "purchase titles should not inherit the generic themed button fill");
assert.doesNotMatch(appearance, /:is\([^)]*\.inline_player[^)]*\)\s*\{\s*background-color:\s*var\(--bandkit-page-card\)/,
  "the page theme must not paint a card surface behind the inline release player");
assert.match(releaseDetailsCss, /\.collected-by \.more-thumbs:hover,[\s\S]*?background: color-mix\(in srgb, var\(--bandkit-release-accent\) 8%, var\(--bandkit-release-surface\)\);[\s\S]*?border-color: transparent;/s,
  "Supported by More should use the shared muted release hover fill without an outline");
assert.match(releaseDetailsCss, /\.bandkit-modern-supporters-toggle\s*\{[^}]*border: 1px solid transparent !important;[^}]*border-radius: 4px !important;[^}]*font-size: 12px !important;[^}]*font-weight: 600;[^}]*padding: 6px 11px !important;/s,
  "Supported by Minimize must share the More button's quiet rectangular treatment");
assert.match(releaseDetailsCss, /\.bandkit-modern-supporters-toggle:hover,[\s\S]*?background: color-mix\(in srgb, var\(--bandkit-release-accent\) 8%, var\(--bandkit-release-surface\)\) !important;[\s\S]*?border-color: transparent !important;/s,
  "Supported by Minimize must share the More button's hover fill without an outline");
assert.match(releaseActionsCss, /\.bandkit-modern-discography-more-link a:hover\s*\{[^}]*var\(--bandkit-release-accent\) 8%, var\(--bandkit-release-surface\)[^}]*border-color: transparent !important;/s,
  "More releases should use the shared muted release hover fill without an outline");
assert.match(playerUi, /data-bandkit-collection-page="true"[^}]*\.bandkit-collection-action-row[^}]*:is\(:hover,:focus-visible\)[^}]*background:color-mix\(in srgb,var\(--bandkit-page-accent,currentColor\) 8%,var\(--bandkit-page-card,#fff\)\)!important/,
  "Collection and Wishlist Add controls should share Download's blue or themed hover palette");
assert.match(modernLayout, /shareButton\?\.addEventListener\("click", markShareActive\)[\s\S]*?shareButton\?\.removeEventListener\("click", markShareActive\)/,
  "Share and Embed should track its open interaction state and clean up the handler");
assert.match(playerUi, /syncPageCartButtonUi[\s\S]*?runtimeState\.open && runtimeState\.activeTab === "cart"[\s\S]*?bandcamp-hub-page-cart[\s\S]*?aria-expanded/,
  "the Name your price control should reflect the open cart panel");
assert.match(playerShell, /aria-expanded[^\n]*r\.\$syncPageCartButtonUi\(\)/,
  "page cart active state should refresh with the music bar panel state");

// The sidebar releases and the story column must read on one vertical rhythm:
// an 8px track gap plus each row's 6px inset leaves 20px between artworks,
// matching the 20px that separates the story cards beside them.
assert.match(feedCss, /body\.feed \.story \{[^}]*margin: 0 0 20px !important;/s,
  "feed story cards must keep their 20px separation");
assert.match(feedCss, /body\.feed #dash-container \{[^}]*gap: 20px;/s,
  "the feed's column gutter must match the 20px rhythm between the cards stacked inside it");
assert.match(feedCss, /#sidebar \.collection-grid \{[^}]*gap: 8px !important;/s,
  "the sidebar release list must use the 8px track gap that yields a 20px artwork rhythm");
assert.match(feedCss, /#sidebar \.collection-grid > \.collection-item-container \{[^}]*padding: 6px !important;/s,
  "each sidebar release row must keep a 6px inset so its hover state still has breathing room");
assert.match(feedCss, /#sidebar \.collection-grid > \.collection-item-container \{[^}]*gap: 0 12px;/s,
  "the sidebar row must not add a vertical track gap that would push its artwork rhythm past 20px");

console.log("Page action styling smoke checks passed.");
