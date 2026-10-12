import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/content/runtime/collection-preview.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles/modern/collection-preview.css", import.meta.url), "utf8");
const pageActions = fs.readFileSync(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8");
const discoverStyles = fs.readFileSync(new URL("../src/styles/modern/discover-tracks.css", import.meta.url), "utf8");
const discoverLayout = fs.readFileSync(new URL("../src/content/runtime/discover-layout.js", import.meta.url), "utf8");
const releaseStyles = fs.readFileSync(new URL("../src/styles/modern/release.css", import.meta.url), "utf8");
const interactionStyles = fs.readFileSync(new URL("../src/styles/modern/tracklist-interactions.css", import.meta.url), "utf8");
const playerUi = fs.readFileSync(new URL("../src/content/runtime/page-player-ui.js", import.meta.url), "utf8");
const handoff = fs.readFileSync(new URL("../src/content/runtime/dj-handoff.js", import.meta.url), "utf8");

assert.match(source, /#collection-items[\s\S]*#wishlist-items/, "collection and wishlist grids must share the preview behavior");
assert.match(source, /async function playCollectionCard[\s\S]*?matchingPagePlaybackTrack[\s\S]*?SEAMLESS_PLAY_PAUSE[\s\S]*?playDiscoverReleaseTrack\(tracks\[0\], tracks\)/,
  "collection and wishlist artwork play must load the complete release, then toggle the current navigated track");
assert.match(source, /const opened = await open\(card\);[\s\S]*?if \(!opened\) return;[\s\S]*?playDiscoverReleaseTrack\(tracks\[0\], tracks\)/,
  "the first collection or wishlist artwork play click must continue into playback after the preview loads");
assert.match(source, /event\.target\.closest\("\.item_link_play"\)[\s\S]*?preventDefault[\s\S]*?stopImmediatePropagation[\s\S]*?playCollectionCard\(r, card, selectedCard, preview, open\)/,
  "collection and wishlist artwork controls must not restart Bandcamp's native featured preview");
assert.match(source, /event\.target\.closest\("\.bandkit-collection-overlay-action"\)\) return;/, "the artwork add and download controls must remain direct actions");
assert.match(source, /selectedCard === card && preview\?\.panel\.isConnected[\s\S]*?close\(\)/, "clicking the selected artwork must close its preview");
assert.match(source, /event\.stopImmediatePropagation\(\)[\s\S]*?toggle\(card\)/, "artwork clicks must toggle the preview instead of starting native playback");
assert.match(source, /RESOLVE_DISCOVER_RELEASE/, "collection previews must reuse the Discover release resolver");
assert.match(source, /\$createDiscoverTrackList\(release\)/, "collection previews must reuse the Discover track list");
assert.match(source, /tracklist\.tabIndex = 0;/, "the independently scrolling collection track list must be keyboard reachable");
assert.match(source, /keydown[\s\S]*?bandkit-collection-preview \.bandkit-discover-tracks \.play-col a[\s\S]*?preventDefault\(\)[\s\S]*?stopImmediatePropagation\(\)[\s\S]*?trackControl\.click\(\)/,
  "Space on collection and wishlist track controls must play or pause instead of scrolling the preview");
assert.match(source, /document\.addEventListener\("keydown", \(event\) => \{\s*if \(event\.defaultPrevented\) return;/,
  "collection and wishlist rows must not replay a Space shortcut already handled by the shared transport");
assert.match(source, /routePreviewWheel[\s\S]*?getBoundingClientRect\(\)\.top <= stickyTop \+ 1[\s\S]*?window\.scrollBy/, "wheel input over an unpinned preview must scroll the page until the panel is fully visible");
assert.match(source, /bandkit-collection-preview-target/, "artwork must expose a dedicated track-preview target");
assert.match(source, /tralbum-purchase-options-browser/, "the preview must reuse the Discover panel structure");
assert.match(source, /release-buttons/, "the preview must reuse the Discover release action group");
assert.match(source, /createElement\("a", "buy-button", "Go to album"\)/, "the preview must preserve the Discover album destination");
assert.match(source, /createElement\("button", "wishlist-button"\)/, "the preview must preserve the Discover wishlist control");
assert.match(source, /createElement\("a", "bandkit-collection-preview-download"\)/, "owned collection previews must include their download action");
assert.match(styles, /#fan-container\s*\{[\s\S]*?max-width:\s*none\s*!important;/, "collection pages must use the wider Discover-like canvas");
assert.match(styles, /#fan-container\s*\{[\s\S]*?margin-left:\s*clamp\(24px, 4vw, 80px\)\s*!important;[\s\S]*?margin-right:\s*clamp\(24px, 4vw, 80px\)\s*!important;/, "profile pages must use matching left and right canvas gutters");
assert.match(styles, /#grid-tabs-sticky[\s\S]*?position:\s*sticky\s*!important;[\s\S]*?width:\s*100%\s*!important;/, "pinned collection tabs and controls must remain inside the wide profile canvas");
assert.match(styles, /:is\(\.fan-bio-wrapper, #grid-tabs, #owner-controls, #wishlist-controls, \.missing-purchases-wrapper\)[\s\S]*?width:\s*100%\s*!important;/, "profile header, tabs, search, and purchase controls must align to the wide collection canvas");
assert.match(styles, /:is\(#followers-grid, #following-grid,[^)]*#following-bands-container,[^)]*#following-fans-container,[^)]*#following-genres-container\)[\s\S]*?width:\s*100%\s*!important;/, "followers and following views must share the widened profile canvas");
assert.match(styles, /#followers-container, #following-tabs, #following-genre-controls/, "relationship headers and inner lists must align to the same wide canvas");
assert.match(styles, /\.missing-purchases-wrapper \.missing-purchases-link[\s\S]*?right:\s*0\s*!important;/, "the missing-purchase link must share the privacy control's right edge");
assert.match(styles, /#wishlist-controls[\s\S]*?\.wishlist-visibility-container[\s\S]*?right:\s*0\s*!important;/, "wishlist search and privacy controls must align to opposite canvas edges");
assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) clamp\(500px, 39vw, 608px\)/, "desktop collection previews must leave room for four fixed-size cards and a compact Discover-sized right column");
assert.match(styles, /:is\(#collection-search, #wishlist-search\)\.search/, "collection and wishlist searches must share the compact header-search treatment");
assert.match(styles, /\.collection-item-art-container > \.bandkit-collection-overlay-action/, "the add action must overlay collection artwork");
assert.match(styles, /\.collection-item-art-container > \.bandkit-collection-download-action\s*\{\s*left:\s*92px\s*!important;/, "download must join the artwork action row");
assert.match(styles, /@media \(min-width: 900px\)[\s\S]*?grid-template-columns:\s*repeat\(auto-fill, 188px\)[\s\S]*?width:\s*188px\s*!important;/, "desktop cards must keep exactly the same width with the preview open or closed while filling the wide canvas");
assert.match(styles, /> \.collection-grid > \.collection-item-container[\s\S]*?padding:\s*8px\s*!important;/, "collection cards must inset artwork and details inside their hover surface");
assert.match(styles, /\.collection-item-gallery-container\s*\{[\s\S]*?margin-top:\s*0\s*!important;/, "collection artwork must use the same top inset as the card's side insets");
assert.match(styles, /\.collection-item-art-container \.banner-container\s*\{[\s\S]*?height:\s*100%\s*!important;[\s\S]*?width:\s*100%\s*!important;/, "pre-order ribbons must resize with collection artwork");
assert.match(styles, /\.collection-item-art-container \.banner-inner\s*\{[\s\S]*?right:\s*-27%;[\s\S]*?width:\s*80%\s*!important;/, "pre-order ribbon text must stay inside resized artwork");
assert.match(styles, /\.ui-sortable-helper[\s\S]*?width:\s*var\(--bandkit-collection-card-width, 188px\)\s*!important;/, "dragged collection cards must retain the measured card width");
assert.match(styles, /\.collection-item-details-container[\s\S]*?\.why-edit-box textarea[\s\S]*?max-width:\s*100%\s*!important;/, "collection comment editors must fit the fixed card width");
assert.match(styles, /\.bandkit-collection-preview-close \.hub-button-icon[\s\S]*?mask:\s*var\(--hub-icon\)/, "the panel close control must render its icon");
assert.match(styles, /\.bandkit-collection-preview:is\(:hover, :focus-within\) \.bandkit-collection-preview-close[\s\S]*?opacity:\s*1;/, "the panel close control must appear only when the panel is hovered or keyboard-focused");
assert.match(styles, /\.bandkit-collection-preview\s*\{[\s\S]*?height:\s*max\(180px, calc\(100dvh - var\(--bandkit-collection-preview-visible-top, var\(--bandkit-collection-preview-top, 66px\)\) - 16px - var\(--bandkit-player-reserved-height, 0px\)\)\);[\s\S]*?overflow-y:\s*hidden;/, "collection previews must reserve their live visible top and player height while keeping album details pinned");
assert.match(styles, /\.bandkit-collection-preview \.bandkit-discover-tracklist\s*\{[\s\S]*?flex:\s*1 1 0\s*!important;[\s\S]*?overflow-y:\s*auto;/, "only the collection preview track list must scroll and it must be allowed to shrink below its content height");
assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.bandkit-collection-preview \.bandkit-discover-tracklist\s*\{[\s\S]*?align-self:\s*stretch;[\s\S]*?height:\s*100%;[\s\S]*?max-height:\s*100%;/, "desktop preview track lists must stay constrained to their final grid row");
assert.match(discoverStyles, /#DiscoverApp \.focused-result[\s\S]*?var\(--bandkit-discover-sticky-top, 66px\)[\s\S]*?var\(--bandkit-player-reserved-height, 0px\)[\s\S]*?overflow-y:\s*auto\s*!important;/, "Discover must keep its complete panel scrollable while reserving the live header and player heights");
assert.match(discoverLayout, /headerBottom[\s\S]*?\.menu-bar-container[\s\S]*?#content[\s\S]*?stickyTop = Math\.max\(66, headerBottom \+ 12/, "Discover must keep the panel below Bandcamp's visible header while scrolling upward");
assert.doesNotMatch(discoverStyles, /#DiscoverApp \.focused-result \.bandkit-discover-tracklist\s*\{[^}]*overflow-y:\s*auto;/, "Discover must scroll the complete panel because it contains content beyond the track list");
assert.match(source, /preview\.panel\.scrollTop = 0;/, "opening or switching releases must reset the panel so its title is visible");
assert.match(source, /\.menu-bar-wrapper[\s\S]*?#grid-tabs-sticky[\s\S]*?--bandkit-collection-preview-top[\s\S]*?--bandkit-collection-preview-visible-top[\s\S]*?window\.addEventListener\("scroll", syncLayout/, "collection previews must move below whichever Bandcamp header is currently visible");
assert.match(pageActions, /playlistButton\.classList\.toggle\("bandkit-collection-overlay-action", modernActions\)/, "modern collection add controls must use the artwork overlay");
assert.match(pageActions, /downloadButton\.classList\.toggle\("bandkit-collection-overlay-action", modernActions\)/, "modern collection downloads must use the artwork overlay");
assert.match(releaseStyles, /:is\(#DiscoverApp, \.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracks \.play-col > a/, "preview track rows must share Discover play-button styling");
assert.match(releaseStyles, /:is\(#DiscoverApp, \.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracks \.download-col/, "preview track rows must share Discover action styling");
assert.match(interactionStyles, /:is\(#DiscoverApp, \.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracks \.play-col::before/, "preview track rows must show track numbers at rest");
assert.match(interactionStyles, /\.bandkit-collection-preview\) \.bandkit-discover-tracks \.track_row_view\.bandcamp-hub-is-playing \.play-col > a/, "the active preview row must keep its pause control visible");
assert.match(playerUi, /:is\(#DiscoverApp, \.bandkit-collection-preview\)/, "preview rows must share Discover playback state");
assert.match(playerUi, /isCollectionCard && runtimeSeamless\.enabled[\s\S]*?\$matchingQueueTrack\(\[collectionTrack\], runtimeSeamless\.track\)/, "collection artwork controls must reset before marking only the active release as playing");
assert.doesNotMatch(styles, /collection-item-container:is\(\.playing, \[data-bandkit-feed-playback="playing"\]\)/, "stale native playing classes must not leave old artwork controls on pause");
assert.match(handoff, /#DiscoverApp, \.bandkit-collection-preview/, "preview tracks must become the active page queue");

console.log("Collection preview: collection and wishlist share the wider Discover panel, compact search, and artwork play/add controls.");
