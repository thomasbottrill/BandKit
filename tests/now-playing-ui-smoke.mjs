import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { MESSAGES } from "../src/shared/contracts.js";
import { playlistAlbumLabel } from "../src/content/runtime/collection-views.js";
import { playerAlbumLabel } from "../src/content/runtime/player-metadata.js";
import { classicPageReleaseMetadata } from "../src/content/runtime/dj-handoff.js";
import { readContentSource, readHubStyles } from "./support/source.mjs";
const source = readContentSource(); const hubCss = readHubStyles();
const pageActionsSource = fs.readFileSync(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8");
const playerShellSource = ["player-shell.js", "player-handoffs.js", "dj-handoff.js"].map((file) => (
  fs.readFileSync(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
)).join("\n");
const backgroundSource = fs.readFileSync(new URL("../src/background/index.js", import.meta.url), "utf8");
const persistencePlaybackSource = fs.readFileSync(new URL("../src/content/runtime/persistence-playback.js", import.meta.url), "utf8"); const lifecycleSource = fs.readFileSync(new URL("../src/content/runtime/lifecycle.js", import.meta.url), "utf8");
const cartModelSource = fs.readFileSync(new URL("../src/content/cart-model.js", import.meta.url), "utf8");
const collectionViewsSource = fs.readFileSync(new URL("../src/content/runtime/collection-views.js", import.meta.url), "utf8");
assert.doesNotMatch(collectionViewsSource, /window\.confirm\("Clear Now Playing\?/, "Clear Now Playing must not open a browser-native confirmation dialog");
assert.match(collectionViewsSource, /createToolbarMenuAction\("Clear Now Playing"[\s\S]*?async \(\) => \{\s*await r\.\$clearNowPlayingPlayback\(\);/,
  "Clear Now Playing must immediately use the existing clear-and-notify flow");
assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Shuffle Progression - Fears EP" }), "Fears EP");
assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Fears EP — Shuffle Progression" }), "Fears EP");
assert.equal(playlistAlbumLabel({ title: "Fears EP", artist: "Shuffle Progression", album: "Fears EP" }), "");
assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Shuffle Progression" }), "");
assert.equal(playlistAlbumLabel({ title: "Fears (Ecstasy Mix)", artist: "Shuffle Progression", album: "Fears EP" }), "Fears EP");
assert.equal(playerAlbumLabel({ title: "Anthem", artist: "44th Move", album: "Anthem", pageUrl: "https://44thmove.bandcamp.com/track/anthem" }, "https://44thmove.bandcamp.com/album/anthem"), "Anthem");
assert.equal(playerAlbumLabel({ title: "Anthem", artist: "44th Move", album: "Anthem, by 44th Move", pageUrl: "https://44thmove.bandcamp.com/track/anthem" }, "https://44thmove.bandcamp.com/album/anthem"), "Anthem");
assert.equal(playerAlbumLabel({ title: "Anthem", artist: "44th Move", album: "Anthem", pageUrl: "https://44thmove.bandcamp.com/album/anthem?from=player" }, "https://44thmove.bandcamp.com/album/anthem"), "");
assert.deepEqual(classicPageReleaseMetadata({
  tralbum: { current: { type: "track" }, album_url: "/album/edit-pack-vol-4" },
  embed: {
    album_title: "Edit Pack vol. 4",
    album_embed_data: { album_title: "Edit Pack vol. 4", linkback: "https://pxmpmusic.bandcamp.com/album/edit-pack-vol-4" }
  }
}, "https://pxmpmusic.bandcamp.com/track/212-edit", "212 (Edit), by Pxmp"), {
  album: "Edit Pack vol. 4",
  releaseUrl: "https://pxmpmusic.bandcamp.com/album/edit-pack-vol-4"
});
assert.match(playerShellSource, /albumCandidates = hasCurrentTrack \? \[matchingPageTrack, displayTrack, matchingSeamlessTrack\][\s\S]*?find\(\(candidate\) => playerAlbumLabel\(candidate, candidate\.releaseUrl \|\| candidate\.pageUrl\)\)/,
  "the live page must repair stale player album metadata before duplicate-title suppression");
assert.match(playerShellSource, /const \{ album, releaseUrl \} = classicPageReleaseMetadata\(data\)[\s\S]*?album,[\s\S]*?releaseUrl,/,
  "classic seamless queues must keep the parent album title and link together");
assert.match(backgroundSource, /releaseUrl:\s*isPublicReleaseUrl\(track\.releaseUrl\)\s*\?\s*track\.releaseUrl\s*:\s*""/, "offscreen playback state keeps the distinct album link");
function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find ${name} in content.js`);
  const start = match.index;
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not parse ${name} from content.js`);
}
assert.match(extractFunction("renderPlaylistTrack"), /hub-playlist-media-toggle/,
  "Now Playing rows must use the artwork slot as their play and pause control");
assert.match(extractFunction("syncCurrentPlaylistAnalysisUi"), /current\.replaceWith\(next\)/,
  "analysis updates must patch a Now Playing card in place instead of replacing the hovered card");
assert.match(extractFunction("renderPlaylistTrack"), /findIndex\(\(track\) => track\.playlistItemId === item\.playlistItemId\)[\s\S]*?playPlaylistAt\(currentIndex\)/,
  "Now Playing row playback must resolve its live item position instead of retaining a stale rendered index");
assert.match(extractFunction("applySeamlessState"), /playlistAnalysisChanged[\s\S]*?syncCurrentPlaylistAnalysisUi\(\)[\s\S]*?syncCurrentPlaylistPlaybackUi\(\)[\s\S]*?else\s*\{\s*render\(\)/,
  "routine playback analysis updates must preserve Now Playing card DOM identity");
assert.doesNotMatch(extractFunction("renderPlaylistTrack"), /hub-playlist-position-play/,
  "Now Playing rows must not retain a separate play column before the artwork");
assert.doesNotMatch(extractFunction("renderPlaylistTrack"), /is-play-action|createTrackActionControls|createPlaylistDestinationControl/,
  "Now Playing rows must not restore the legacy right-side play, add, wishlist, or cart action cluster");
assert.match(extractFunction("renderPlaylistTrack"), /createNowPlayingTrackActions\(card, item, \{/,
  "each Now Playing row must install its shared ellipsis and context-menu actions");
assert.match(extractFunction("renderPlaylistTrack"), /hub-playlist-detail-row[\s\S]*?playlistAlbumLabel\(item\)[\s\S]*?createPageLink\(album, item\.releaseUrl \|\| matchingQueueTrack\(buildSeamlessQueue\(\), item\)\?\.releaseUrl \|\| item\.pageUrl, "hub-playlist-album-link hub-inline-link"\)[\s\S]*?detailRow\.append\(analysisMeta\)/,
  "Now Playing cards must link the release while keeping time and analysis on one compact metadata row");
assert.match(source, /function playlistAlbumLabel[\s\S]*?`, by \$\{artist\}`[\s\S]*?album = album\.slice\(0, -suffix\.length\)\.trim\(\)/,
  "Now Playing release labels must remove Bandcamp's redundant ', by Artist' suffix");
assert.match(hubCss, /\.hub-playlist-detail-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*overflow:\s*hidden;/s,
  "Now Playing cards must truncate release metadata while pinning BPM and key to the right");
assert.doesNotMatch(extractFunction("createPlaylistAnalysisMeta"), /analysis-chip|is-bpm|is-key/,
  "playlist BPM and key metadata must render as plain text rather than badges");
assert.match(hubCss, /\.hub-playlist-meta\s*\{[^}]*font-size:\s*11px;[^}]*line-height:\s*15px;/s,
  "playlist release and duration metadata must be comfortably readable");
assert.match(hubCss, /\.hub-playlist-album-link\s*\{[^}]*color:\s*inherit;/s,
  "Now Playing release links must use the same quiet colour as their surrounding metadata");
assert.match(pageActionsSource, /album:\s*r\.\$elementText\(story, \["\.collection-item-title", "\.release-title"\]\) \|\| itemData\.item_title/,
  "feed actions must preserve the complete visible EP or release title in Now Playing");
assert.match(playerShellSource, /album:\s*r\.\$elementText\(storyNode, \["\.collection-item-title", "\.release-title"\]\) \|\| itemData\.item_title/,
  "live feed playback must preserve the complete visible EP or release title in Now Playing");
assert.match(persistencePlaybackSource, /schedulePlaylistMetadataRefresh[\s\S]*?playlistMetadataRefreshInFlight[\s\S]*?playlistMetadataRefreshPending[\s\S]*?refreshIncompletePlaylistMetadata\(\)\.finally/,
  "missing Now Playing artwork refreshes must be prompt, deduplicated, and retried after an overlapping request");
assert.match(playerShellSource, /function setOpen\(open\)[\s\S]*?if \(open\) r\.\$schedulePlaylistMetadataRefresh\(0\)/,
  "opening Bandkit must immediately retry any missing Now Playing artwork");
assert.match(lifecycleSource, /r\.\$scanLivePlayer\(\);\s*r\.\$render\(\);\s*r\.\$schedulePlaylistMetadataRefresh\(0\)/,
  "startup must immediately hydrate incomplete Now Playing artwork");
assert.match(lifecycleSource, /resumePageRuntime[\s\S]*?schedulePlaylistMetadataRefresh\(0\)[\s\S]*?visibilitychange[\s\S]*?schedulePlaylistMetadataRefresh\(0\)/,
  "returning to a Bandcamp page must immediately retry any missing Now Playing artwork");
assert.match(hubCss, /\.hub-playlist-analysis-text\s*\{[^}]*color:\s*var\(--hub-muted\);[^}]*font-size:\s*11px;[^}]*font-weight:\s*500;[^}]*line-height:\s*15px;/s,
  "playlist analysis text must remain quiet, readable metadata without badge chrome");
assert.match(extractFunction("createPlaylistAnalysisMeta"), /pageTrackAnalysis[\s\S]*?item\.bpm \|\| matchingPageAnalysis\?\.bpm[\s\S]*?item\.key \|\| matchingPageAnalysis\?\.key/,
  "Now Playing cards must reuse analysis already available for every page track");
assert.match(extractFunction("syncPageTrackAnalysisUi"), /syncCurrentPlaylistAnalysisUi\?\.\(\)/,
  "completed page analysis must update visible Now Playing cards immediately");
const pageQueueFallbackSource = extractFunction("renderPageQueueFallback");
assert.match(pageQueueFallbackSource, /renderPlaylistTrack\(track, index, \{[\s\S]*?transient:\s*true/,
  "the live-page fallback queue must reuse the current Now Playing card renderer");
assert.doesNotMatch(pageQueueFallbackSource, /createTrackActionControls|hub-queue-action|hub-current-track-toggle/,
  "the fallback queue must not restore the legacy right-side action and transport cluster");
const nowPlayingActionsSource = extractFunction("createNowPlayingTrackActions");
assert.match(nowPlayingActionsSource, /hub-playlist-track-more[\s\S]*?aria-haspopup[\s\S]*?icon-more\.svg/,
  "each Now Playing row must expose a single accessible ellipsis menu trigger");
assert.match(nowPlayingActionsSource, /context\.menuView \|\| "now-playing"[\s\S]*?card\.classList\.add\("has-open-menu"\)/,
  "shared row action menus must support saved playlists and escape the compact card while open");
assert.match(nowPlayingActionsSource, /addEventListener\("contextmenu"[\s\S]*?preventDefault\(\)[\s\S]*?openMenu\(\)/,
  "right-clicking a Now Playing row must open the same action menu as its ellipsis trigger");
const destinationMenuSource = extractFunction("populatePlaylistDestinationMenu");
for (const label of ["Add to playlist", "Add to cart", "Add to Wishlist", "Remove"]) {
  assert.ok(destinationMenuSource.includes(label), `Now Playing menus must include ${label}`);
}
assert.match(destinationMenuSource, /createPlaylistMenuOption\("Remove",[\s\S]*?icon:\s*"icon-close\.svg"/,
  "Now Playing and saved-playlist menus must use the same concise icon-labeled Remove action");
assert.match(destinationMenuSource, /New playlist[\s\S]*?prominent: true[\s\S]*?Current Bandcamp cart[\s\S]*?prominent: true/,
  "new-playlist and current-cart destinations must receive the stronger menu emphasis");
assert.doesNotMatch(destinationMenuSource, /Add to [Pp]laylist…[^\n]*prominent: true/,
  "add-to-playlist destinations must keep the standard menu weight");
assert.match(source, /hub-playlist-menu-option-glyph[\s\S]*?label\.slice\(glyph\[0\]\.length\)/,
  "music-bar destination menus must place leading glyphs in a dedicated icon column");
assert.match(hubCss, /\.hub-playlist-menu-option\s*\{[^}]*display:\s*flex;[^}]*gap:\s*7px;[^}]*text-decoration:\s*none\s*!important;/s,
  "music-bar destination options must align their icons and remove inherited underlines");
assert.match(hubCss, /\.hub-inline-link\s*\{[^}]*text-decoration:\s*none;[^}]*\}[\s\S]*?\.hub-inline-link:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--hub-accent\);[^}]*text-decoration:\s*none;/s,
  "track and metadata links must use accent colour without underlines on pointer or keyboard intent");
assert.match(hubCss, /\.hub-panel a,[\s\S]*?\.hub-player a,[\s\S]*?\.hub-dj-drawer a\s*\{[^}]*text-decoration:\s*none\s*!important;[^}]*\}[\s\S]*?\.hub-panel a:not\(\[aria-disabled="true"\]\):is\(:hover, :focus-visible\),[\s\S]*?color:\s*var\(--hub-accent\)\s*!important;[^}]*text-decoration:\s*none\s*!important;/s,
  "every player, panel, and DJ-drawer anchor must use the local theme accent without link decoration");
assert.match(hubCss, /\.hub-playlist-menu-option-glyph\s*\{[^}]*flex:\s*0 0 14px;[^}]*font-size:\s*14px;[^}]*width:\s*14px;/s,
  "music-bar destination glyphs must match the wishlist icon footprint");
assert.match(hubCss, /\.hub-playlist-menu-option\.is-prominent\s*\{[^}]*font-weight:\s*600;/,
  "primary playlist and cart destinations must be slightly bolder than secondary options");
assert.match(hubCss, /\.hub-compact-media-card\s*\{[^}]*height:\s*64px;[^}]*overflow:\s*hidden;[^}]*position:\s*relative;/s,
  "Now Playing, playlist, cart, and Activity cards must share one compact 64px shell");
assert.match(hubCss, /\.hub-compact-media-card \.hub-playlist-media-toggle\s*\{[^}]*border-radius:\s*var\(--hub-control-radius\);/s,
  "compact track artwork must round all four corners through the shared control token");
assert.match(hubCss, /data-corner-style="custom"[^}]*\.hub-compact-media-card[\s\S]*?border-radius:\s*var\(--hub-custom-corner-radius, 12px\)\s*!important;/s,
  "custom corner mode must apply the same radius to all four corners of compact-card artwork");
assert.match(hubCss, /\.hub-playlist-track\.hub-compact-media-card\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\) auto;[^}]*padding:\s*0 8px 0 0;/s,
  "Now Playing rows must use a full-height flush-left 64px media slot");
assert.match(hubCss, /\.hub-saved-playlist-track\.hub-compact-media-card\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\) auto;[^}]*padding:\s*0 8px 0 0;/s,
  "opened saved-playlist rows must keep full-height artwork without reserving a separate number column");
assert.match(hubCss, /\.hub-playlist-media-toggle:is\(:hover, :focus-visible\) \.hub-playlist-media-art\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*scale\(0\.88\);/s,
  "hovering or focusing Now Playing artwork must fade and shrink it like the music bar");
assert.match(hubCss, /\.hub-playlist-media-toggle:is\(:hover, :focus-visible\) \.hub-playlist-media-icon\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*scale\(1\);/s,
  "hovering or focusing Now Playing artwork must reveal the playback symbol in its place");
assert.match(hubCss, /\.hub-compact-media-card \.hub-playlist-media-art,[\s\S]*?height:\s*64px;[^}]*width:\s*64px;/s,
  "Now Playing artwork must fill the complete shared card height");
assert.match(hubCss, /\.hub-playlist-media-icon\s*\{[^}]*background:\s*transparent;[^}]*opacity:\s*0;[^}]*position:\s*absolute;/s,
  "Now Playing and opened-playlist artwork controls must leave the artwork unwashed");
assert.match(hubCss, /\.hub-playlist-media-icon \.hub-button-icon\s*\{[^}]*color:\s*var\(--hub-accent\);[^}]*filter:\s*none;[^}]*height:\s*24px;[^}]*mix-blend-mode:\s*normal;/s,
  "card playback glyphs must remain sharp and theme-coloured after replacing the artwork");
assert.match(hubCss, /\.hub-saved-playlist-card:has\(\.hub-saved-playlist-art-action:is\(:hover, :focus-visible\)\) \.hub-playlist-mosaic\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*scale\(0\.88\);/s,
  "saved playlists must use the same artwork replacement animation");
assert.doesNotMatch(hubCss, /\.hub-saved-playlist-card\.is-playing \.hub-saved-playlist-art-action/,
  "saved-playlist playback symbols must disappear again when artwork is no longer engaged");
assert.doesNotMatch(hubCss, /\.hub-playlist-media-toggle:(?:hover|active)[^{]*\{[^}]*transform:/s,
  "Now Playing play and pause controls must not move when hovered or pressed");
assert.doesNotMatch(hubCss, /\.hub-playlist-track\.is-playing \.hub-playlist-media-(?:art|icon)/,
  "the active Now Playing row must keep its artwork until hover or keyboard focus");
assert.match(hubCss, /\.hub-panel-card\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*box-shadow:\s*none;/s,
  "Now Playing, playlist, cart, and Activity cards must not paint a resting surface");
assert.match(hubCss, /\.hub-panel-card:is\(:hover, :focus-within\)\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;/s,
  "panel cards must remain unfilled and borderless while revealing their contextual controls");
assert.match(hubCss, /\.hub-cart-remove-button\s*\{[^}]*border-color:\s*transparent;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
  "cart remove buttons must be visually absent and borderless until their card is engaged");
assert.match(hubCss, /\.hub-panel-card:is\(:hover, :focus-within\) \.hub-cart-remove-button\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  "cart remove buttons must appear for pointer hover and keyboard focus within the card");
assert.match(hubCss, /\.hub-cart-remove-button:is\(:hover, :focus-visible\):not\(:disabled\)\s*\{[^}]*border-color:\s*transparent;/s,
  "cart remove buttons must retain their hit area without drawing a hover outline");
assert.match(hubCss, /\.hub-activity-item\.hub-compact-media-card\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\);[^}]*padding:\s*0 10px 0 0;/s,
  "Activity must share the compact full-bleed media-card geometry");
assert.match(hubCss, /\.hub-activity-item \.hub-activity-art,[\s\S]*?height:\s*64px;[^}]*overflow:\s*hidden;[^}]*width:\s*64px;/s,
  "Activity artwork and fallback icons must fill the left side of the card");
assert.match(hubCss, /\.hub-activity-item:is\(:hover, :focus-within\)\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;/s,
  "Activity cards must reveal their contextual controls without restoring a card surface");
assert.match(hubCss, /\.hub-activity-copy\s*\{[^}]*font-size:\s*12px;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
  "Activity titles and artists must stay on one compact ellipsized line above the action badge");
assert.doesNotMatch(extractFunction("activityRow"), /You \$\{action\.verb\}|action\.suffix|item\.destination/,
  "Activity cards must let the action badge explain the event instead of repeating a sentence");
assert.match(extractFunction("activityRow"), /copy\.title = \[item\.title, item\.artist\]/,
  "Activity cards must expose the complete clipped title and artist on hover");
assert.doesNotMatch(extractFunction("renderSavedCartList"), /hub-card-footer|createSavedCartActions/,
  "saved-cart list cards must defer every management control until the cart is opened");
assert.doesNotMatch(extractFunction("renderSavedCartList"), /hub-saved-cart-date|slice\(0, 3\)/,
  "saved-cart summary cards must show only their name, item count, and total");
assert.doesNotMatch(extractFunction("renderSavedPlaylists"), /hub-card-footer|createSavedPlaylistActions/,
  "saved-playlist list cards must defer management controls until the playlist is opened");
assert.doesNotMatch(extractFunction("renderSavedPlaylists"), /hub-saved-cart-date|slice\(0, 3\)/,
  "saved-playlist summary cards must show only their name, track count, and duration");
assert.match(extractFunction("renderSavedPlaylists"), /isActivePlaylist[\s\S]*?createSavedCollectionCard[\s\S]*?hub-saved-playlist-art-action[\s\S]*?SEAMLESS_PLAY_PAUSE[\s\S]*?playSavedPlaylist\(snapshot\)/,
  "saved-playlist cards must separate body opening from artwork play and pause");
assert.match(extractFunction("createSavedCollectionCard"), /body\.addEventListener\("click", onOpen\)[\s\S]*?hub-saved-collection-title[\s\S]*?body\.append\(artwork, copy\)[\s\S]*?card\.append\(body\)/,
  "the shared saved card must retain its body-opening action and expose its title as the navigation cue");
assert.doesNotMatch(extractFunction("createSavedCollectionCard"), /hub-card-open-indicator|icon-open\.svg/,
  "saved collection cards must not reveal a redundant open arrow");
assert.match(hubCss, /\.hub-saved-playlist-card:is\(:hover, :focus-within\) \.hub-saved-collection-title\s*\{[^}]*color:\s*var\(--hub-accent\)/s,
  "hovered and keyboard-focused saved cards must identify their title with the accent colour");
assert.match(hubCss, /:is\(\.hub-saved-cart-stack, \.hub-saved-playlist-stack\):is\(:hover, :focus-within\) > \.hub-saved-playlist-card\s*\{[^}]*opacity:\s*0\.42/s,
  "saved-card groups must defocus sibling cards while the user is choosing one");
assert.match(hubCss, /:is\(\.hub-saved-cart-stack, \.hub-saved-playlist-stack\) > \.hub-saved-playlist-card:is\(:hover, :focus-within\)\s*\{[^}]*opacity:\s*1/s,
  "the active saved card must remain fully focused");
assert.match(hubCss, /\.hub-saved-playlist-open:hover,[\s\S]*?\.hub-saved-playlist-open:focus-visible\s*\{[^}]*background:\s*transparent;/s,
  "saved playlist bodies must not create a disconnected top-only hover surface");
assert.match(hubCss, /\.hub-cart-view-tab\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*700;[^}]*letter-spacing:\s*normal;[^}]*line-height:\s*20px;/s,
  "Cart, Saved, Now Playing, and Playlists view headings must match the primary section-title typography");
assert.match(hubCss, /\.hub-now-playing-toolbar \.hub-playlist-toolbar-icon\s*\{[^}]*transition:\s*none;/s,
  "Now Playing toolbar hover colours must not restart a transition when playback refreshes the panel");
assert.match(hubCss, /\.hub-now-playing-toolbar \.hub-playlist-toolbar-icon > \*\s*\{[^}]*pointer-events:\s*none;/s,
  "Now Playing toolbar icons must leave the button as the single stable hover target");
const currentPlaylistSource = extractFunction("renderCurrentPlaylist");
assert.match(currentPlaylistSource, /icon-shuffle\.svg[\s\S]*?aria-pressed[\s\S]*?shuffle\.hidden = songCount < 2[\s\S]*?actions\.append\(addPage, shuffle, moreWrap\)/,
  "Now Playing must expose an accessible Shuffle toggle immediately before overflow when the queue has multiple tracks");
assert.match(currentPlaylistSource, /protectNowPlayingShuffleClick\(r, shuffle\)/,
  "the Now Playing shuffle control must defer panel replacement until its pointer click has completed");
assert.match(currentPlaylistSource, /togglePlaylistShuffle\(\)[\s\S]*?syncNowPlayingShuffleButton\(shuffle, state\.playlistShuffleEnabled === true\)/,
  "shuffle must update its visible and accessible active state synchronously after every click");
assert.match(extractFunction("togglePlaylistShuffle"), /schedulePlaylistShuffleQueueSync\(\)/,
  "rapid Shuffle toggles must coalesce their complete-queue playback synchronization");
assert.match(extractFunction("consumeCompletedNowPlayingItems"), /playlistShuffleSyncTimer[\s\S]*?playlistShuffleConsumptionGuardUntil/,
  "playback snapshots emitted while Shuffle is reordering must never consume playlist items");
assert.match(hubCss, /\.hub-playlist-toolbar-icon\.is-active\s*\{[^}]*background:\s*var\(--hub-accent\);[^}]*color:\s*var\(--hub-on-accent\);/s,
  "active Shuffle must use the current theme accent and its readable foreground colour");
assert.match(extractFunction("renderCurrentPlaylist"), /classList\.toggle\("is-empty-now-playing", songCount === 0\)/,
  "an empty Now Playing render must expose a stable layout state for its header inset");
assert.match(extractFunction("render"), /renderPanelContent\(\);/,
  "the main render must use the shared panel-content refresh path");
const panelContentSource = extractFunction("renderPanelContent");
assert.match(panelContentSource, /deferNowPlayingShuffleRefresh\(r\)[\s\S]*?return;/,
  "panel refreshes must not replace the shuffle control between pointer-down and click");
assert.match(panelContentSource, /hub-playlist-track:hover, \.hub-playlist-track:focus-within[\s\S]*?playlistPanelRefreshPending = true/,
  "Now Playing and saved-playlist refreshes must wait for pointer or keyboard interaction to finish instead of replacing a row and flashing its controls");
assert.match(panelContentSource, /forcePlaylistRefresh[\s\S]*?!forcePlaylistRefresh && state\.activeTab === "playlist"/,
  "an explicit queue-consuming selection must bypass the routine hovered-card refresh guard");
assert.match(panelContentSource, /addEventListener\("pointerleave", finishInteraction[\s\S]*?addEventListener\("focusout", finishInteraction/,
  "deferred playlist refreshes must resume after either pointer or keyboard interaction finishes");
assert.match(panelContentSource, /activeTab === "activity"[\s\S]*?hub-activity-date-menu:not\(\[hidden\]\)[\s\S]*?return/,
  "live player refreshes must not replace Activity while its date selector is open");
assert.match(panelContentSource, /classList\.remove\("is-section-layout", "is-empty-now-playing"\);\s*content\.replaceChildren\(\);/,
  "each panel-content refresh must restore its base inset before rebuilding a section");
assert.match(panelContentSource, /mountPanelClose\(\);[\s\S]*?organizePanelContentScrolling\(\);/,
  "each panel-content refresh must restore the fixed heading and scrolling body");
assert.match(panelContentSource, /renderedPanelKey === panelKey[\s\S]*?hub-content-scroll, \.hub-current-cart-list[\s\S]*?scrollTop[\s\S]*?organizePanelContentScrolling\(\)[\s\S]*?element\.scrollTop = scrollPositions/,
  "live panel refreshes must preserve wheel and dragged scrollbar positions within the current view");
const panelScrollingSource = extractFunction("organizePanelContentScrolling");
assert.match(panelScrollingSource, /hub-cart-view-header, \.hub-saved-cart-detail-toolbar, \.hub-section-heading/,
  "Cart, playlist detail, Activity, and Settings headings must share the fixed header region");
assert.match(panelScrollingSource, /matches\("\.hub-cart-backup, \.hub-panel-secondary-nav"\)[\s\S]*?hub-content-pinned[\s\S]*?hub-content-scroll/,
  "section toolbars and secondary Back rows must remain pinned with their heading while lists and cards move into the scroll body");
assert.match(hubCss, /\.hub-content\.is-section-layout\s*\{[^}]*overflow:\s*hidden;[^}]*padding:\s*0;/s,
  "the outer section panel must not scroll once its fixed and scrolling regions are organized");
assert.match(hubCss, /\.hub-content-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s,
  "only the section content body must own scrolling");
assert.match(hubCss, /\.hub-content-scroll\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
  "panel sections must never expose a horizontal scrollbar");
assert.match(hubCss, /\.hub-empty\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
  "empty panel messages must wrap within the available panel width");
assert.match(hubCss, /\.hub-content-scroll\s*\{[^}]*overflow-anchor:\s*none;[^}]*overscroll-behavior:\s*contain;/s,
  "panel content must not jump when refreshed or when artwork changes size during wheel scrolling");
assert.match(hubCss, /\.hub-content-pinned\s*\{[^}]*overflow:\s*visible;[^}]*position:\s*relative;[^}]*z-index:\s*4;/s,
  "pinned panel controls must layer open menus above the scrolling body without clipping");
assert.match(hubCss, /:host \*\s*\{[^}]*scrollbar-color:\s*color-mix\(in srgb, var\(--hub-panel-muted\) 58%, transparent\) transparent;[^}]*scrollbar-width:\s*thin;/s,
  "every panel scroll region must use a compact theme-aware scrollbar");
assert.match(hubCss, /:host \*::\-webkit-scrollbar-track,\s*:host \*::\-webkit-scrollbar-corner\s*\{[^}]*background:\s*transparent;/s,
  "panel scrollbar tracks must stay transparent rather than widening the panel visually");
assert.match(hubCss, /:host \*::\-webkit-scrollbar-thumb\s*\{[^}]*border:\s*1px solid transparent;[^}]*border-radius:\s*999px;/s,
  "panel scrollbar thumbs must render as narrow floating handles");
assert.doesNotMatch(hubCss, /\.hub-content\.is-empty-now-playing[^\{]*\{/,
  "empty and populated Now Playing must share the same inset rules");
for (const functionName of ["scanLivePlayer", "applySeamlessState"]) {
  const functionSource = extractFunction(functionName);
  assert.doesNotMatch(functionSource, /content\.replaceChildren\(\);\s*renderPlaylist\(\);/,
    `${functionName} must not bypass the shared panel-content layout refresh`);
  assert.match(functionSource, /renderPanelContent\(\)/,
    `${functionName} must restore the pinned header after playback-driven content updates`);
}
assert.doesNotMatch(extractFunction("recordListeningActivity"), /renderActivity\(\)/,
  "live Activity updates must use the complete panel render so the pinned header structure is preserved");
assert.match(extractFunction("renderCurrentPlaylist"), /createToolbarOverflow\("More Now Playing actions", \[save, download, share, clear\]/,
  "Now Playing must retain save, download, share, and clear inside the overflow menu");
assert.match(extractFunction("renderPlayer"), /: live\.hasPlaybackStarted\s*\? 1 \+ \(Array\.isArray\(live\.tracks\)/,
  "the footer count must not treat a latent page queue as Now Playing before playback starts");
assert.match(extractFunction("renderCurrentPlaylist"), /: live\.hasPlaybackStarted\s*\? pageTracks\s*: \[\]/,
  "the Now Playing toolbar must not count or export a latent page queue before playback starts");
assert.match(hubCss, /\.hub-toolbar-actions-menu\s*\{[^}]*min-width:\s*180px;/s,
  "toolbar overflows must present readable labeled actions");
assert.match(extractFunction("renderCurrentCart"), /createToolbarOverflow\("More cart actions", \[exportButton, shareButton, importButton\]/,
  "Cart must keep download, share, and import in its overflow menu");
assert.match(extractFunction("renderCartItemCard"), /createPanelMediaCard\("hub-cart-item-card"\)/,
  "current and opened saved-cart items must use the common compact card shell");
assert.match(hubCss, /\.hub-cart-item-card \.hub-product-main\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\);[^}]*height:\s*64px;[^}]*padding:\s*0 8px 0 0;/s,
  "cart items must match Now Playing height with flush-left full-height artwork");
assert.match(hubCss, /\.hub-cart-item-card \.hub-cart-remove-button\s*\{[^}]*height:\s*22px;[^}]*margin-top:\s*-3px;[^}]*width:\s*22px;/s,
  "the current-cart remove control must fit quietly within the compact card");
assert.match(extractFunction("renderCartItemCard"), /hub-product-meta-row[\s\S]*?item\.kind/,
  "cart item type must remain available as progressively disclosed metadata");
assert.match(hubCss, /\.hub-cart-item-card \.hub-product-meta-row\s*\{[^}]*opacity:\s*0;[^}]*transition:\s*opacity 100ms ease;[^}]*\}[\s\S]*?\.hub-cart-item-card:is\(:hover, :focus-within\) \.hub-product-meta-row\s*\{[^}]*opacity:\s*1;/s,
  "cart item type must appear only when its card is hovered or keyboard-focused");
assert.match(hubCss, /\.hub-row-title \.hub-price\s*\{[^}]*font-size:\s*13px;/s,
  "cart item prices must match the quiet saved-card duration scale");
assert.match(extractFunction("renderPlaylist"), /createPlaylistToolbarButton\("Import playlist"[\s\S]*createPlaylistToolbarButton\("New playlist"/,
  "saved playlist import and create actions must use standard icon buttons");
assert.match(extractFunction("renderSavedPlaylistDetail"), /createNowPlayingTrackActions\(card, item, \{[\s\S]*?menuView:\s*"saved-playlist"[\s\S]*?removeSavedPlaylistItem\(snapshot, item\)/,
  "saved playlist tracks must collapse add, cart, wishlist, and remove actions into one ellipsis menu");
assert.match(extractFunction("renderSavedPlaylistDetail"), /renderPlaylistTrack\(item, index,[\s\S]*?position:\s*index \+ 1[\s\S]*?playSavedPlaylist\(snapshot, \{ startIndex: index \}\)/,
  "opened saved playlists must reuse the compact artwork playback card and start from the selected track");
assert.match(extractFunction("renderPlaylistTrack"), /hub-playlist-media-art[\s\S]*?options\.position != null[\s\S]*?hub-playlist-position-badge[\s\S]*?artwork\.append\(position\)/,
  "saved playlist positions must overlay the artwork instead of consuming a track-row column");
assert.doesNotMatch(extractFunction("renderPlaylistTrack"), /card\.append\(createElement\("div", "hub-queue-number"/,
  "saved playlist positions must not render as a separate track-row column");
assert.match(hubCss, /\.hub-playlist-position-badge\s*\{[^}]*bottom:\s*4px;[^}]*left:\s*4px;[^}]*position:\s*absolute;/s,
  "saved playlist position badges must sit over the bottom-left of their artwork");
assert.match(hubCss, /\.hub-saved-playlist-track\.hub-compact-media-card\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\) auto;/s,
  "saved playlist rows must give their former number column back to the track copy");
assert.match(hubCss, /\.hub-playlist-track\.has-open-menu\s*\{[^}]*overflow:\s*visible;[^}]*z-index:\s*10;/s,
  "opened playlist action menus must not be clipped by the compact card shell");
assert.match(extractFunction("renderSavedPlaylistDetail"), /includeShufflePlay: true, includeAdd: false/,
  "an open saved playlist must replace the redundant add-to-Now-Playing action with Play shuffled");
assert.match(extractFunction("hasSavedPlaylistCapacity"), /MAX_SAVED_PLAYLISTS[\s\S]*Delete one before creating another/,
  "saved playlist creation must refuse the limit instead of silently deleting the oldest playlist");
for (const functionName of ["savePlaylistSnapshot", "createSavedPlaylistWithTracks", "createEmptySavedPlaylist", "importPlaylist"]) {
  assert.match(extractFunction(functionName), /hasSavedPlaylistCapacity\(\)/,
    `${functionName} must enforce the saved-playlist limit before inserting`);
}
assert.match(extractFunction("renderActivity"), /createPlaylistToolbarButton\("Download activity"/,
  "Activity download must use the standard icon button");
assert.match(extractFunction("activityDateFilter"), /hub-activity-date-opener[\s\S]*?Choose activity date[\s\S]*?hub-activity-date-menu/,
  "Activity must provide a stable icon-triggered date menu rather than a page-dependent native picker");
assert.match(extractFunction("activityDateFilter"), /hub-activity-date-trigger[\s\S]*?trigger\.append\(opener, menu\)/,
  "the Activity date menu must be positioned from the calendar button itself");
assert.match(extractFunction("renderActivity"), /const today = activityDateKey[\s\S]*?activityDateFilter \|\| ""\)[\s\S]*?: today/,
  "Activity must open on today's local date instead of an empty date placeholder");
assert.match(extractFunction("activityDateFilter"), /new Set[\s\S]*?map\(activityDateKey\)[\s\S]*?filter\(Boolean\)[\s\S]*?slice\(0, 7\)[\s\S]*?menuitemradio[\s\S]*?activityDateFilter = date/,
  "the Activity date menu must offer up to seven shortcuts containing recorded activity rather than empty calendar days");
assert.match(extractFunction("activityDateFilter"), /hub-activity-date-custom[\s\S]*?type = "date"[\s\S]*?activityDateFilter = customInput\.value/,
  "the Activity date menu must retain a real calendar input for dates outside its shortcuts");
assert.match(extractFunction("activityDateFilter"), /createElement\("label", "hub-activity-date-custom"\)[\s\S]*?customDate\.append\(customIcon,[\s\S]*?customInput\)/,
  "the Activity Choose date row must contain a directly clickable native date input");
assert.match(hubCss, /\.hub-activity-date-custom-input::\-webkit-calendar-picker-indicator\s*\{[^}]*height:\s*100%;[^}]*width:\s*100%;/s,
  "the native calendar indicator must cover the complete visible Choose date row");
assert.match(extractFunction("activityDateFilter"), /hub-activity-date-icon[\s\S]*?icon-calendar\.svg/,
  "the Activity date field must use Bandkit's Lucide calendar asset");
assert.match(extractFunction("createActivityDocument"), /new Set\(activityItems\.map[\s\S]*?slice\(0, 7\)[\s\S]*?collectionArtwork\(item\.art[\s\S]*?<label id="activity-date-custom"[\s\S]*?input\.addEventListener\('change'/,
  "downloaded Activity HTML must include artwork, populated quick dates, and a directly activated calendar picker");
assert.match(extractFunction("createCartDocument"), /collectionArtwork\(cartItemArt\(item\), item\.title, itemUrl\)/,
  "shared Cart HTML must keep each item's captured artwork");
assert.match(extractFunction("createCartDocument"), /format:[\s\S]*?version: 1,[\s\S]*?name: safeName/,
  "importable Cart HTML must embed its user-facing cart name rather than relying on the filename");
assert.match(extractFunction("createPlaylistDocument"), /collectionArtwork\(item\.art, item\.title, pageUrl\)/,
  "shared Playlist HTML must keep each track's captured artwork");
assert.match(source, /"added-to-cart"[\s\S]*?"added-to-playlist"[\s\S]*?"backed-up"[\s\S]*?listened[\s\S]*?wishlisted/,
  "Activity must render the reliable listening, playlist, cart, backup, and wishlist event types");
assert.match(extractFunction("recordActivity"), /state\.activity\.unshift[\s\S]*?slice\(0, 500\)/,
  "the shared Activity recorder must keep a useful bounded history");
assert.match(source, /function scanLiveCart[\s\S]*?addedItems[\s\S]*?action: "added-to-cart"[\s\S]*?recordActivity/,
  "newly observed Bandcamp cart items must be recorded in Activity");
assert.match(pageActionsSource, /scanLiveCart[\s\S]*?cartAutosave\.cartSignature\(uniqueItems\)[\s\S]*?cartAutosave\.cartSignature\(runtimeState\.cart\)/,
  "unchanged Bandcamp carts must use the canonical autosave identity and never trigger a panel render loop");
assert.match(pageActionsSource, /observedSummary[\s\S]*?Object\.values\(observedSummary\)\.some[\s\S]*?observedSummary : null/,
  "an empty bridged cart summary must stay null instead of oscillating persisted state and rebuilding the panel");
assert.match(pageActionsSource, /liveCartSignature = JSON\.stringify[\s\S]*?lastLiveCartSignature\) return;[\s\S]*?lastLiveCartSignature = liveCartSignature[\s\S]*?cartSavedAt = Date\.now\(\)/,
  "repeated identical Bandcamp cart observations must stop before state persistence can rebuild interactive panels");
assert.match(cartModelSource, /function cartActivityIdentity[\s\S]*?restore\.item_type[\s\S]*?restore\.item_id/,
  "cart Activity must compare stable Bandcamp product identities");
assert.match(pageActionsSource, /cartActivityGrew[\s\S]*?suppressStartupHydration/,
  "cart Activity must use stable product identity and suppress initial cart hydration");
assert.match(source, /function markWishlistTrack[\s\S]*?!wasActive[\s\S]*?action: "wishlisted"[\s\S]*?recordActivity/,
  "Bandkit wishlist actions must be recorded once in Activity");
assert.match(extractFunction("populatePlaylistDestinationMenu"), /wishlisted \? "In Wishlist" : "Add to Wishlist"[\s\S]*?openTrackAction\(track, "wishlist", \{ active: !wishlisted \}\)[\s\S]*?wishlist: true, active: wishlisted/,
  "the Add menu wishlist option must toggle between its active and inactive states");
assert.match(extractFunction("openTrackAction"), /\{ active = true \}[\s\S]*?activateNativeTrackAction\(action, active\)[\s\S]*?markWishlistTrack\(track, active\)[\s\S]*?bandkit_wishlist_active/,
  "wishlist actions must carry the requested add or remove state through Bandcamp");
assert.match(hubCss, /\.hub-playlist-menu-option\.is-wishlist\.is-active[\s\S]*?\.hub-wishlist-action\.is-active[\s\S]*?color:\s*#ff9c00/,
  "active wishlist controls must use the shared filled-orange-heart treatment");
assert.match(pageActionsSource, /bandkitActivityBound[\s\S]*?addEventListener\("click"[\s\S]*?markWishlistTrack\(selectedTrack, true\)/,
  "native Feed wishlist controls must also record their successful user action");
assert.match(extractFunction("createSavedPlaylistWithTracks"), /recordPlaylistActivity\(r, items, snapshot\.name\)[\s\S]*?saveState\(\)/,
  "tracks used to create a playlist must be recorded in Activity with their destination");
assert.match(extractFunction("addTracksToSavedPlaylist"), /addedItems[\s\S]*?recordPlaylistActivity\(r, addedItems, snapshot\.name\)/,
  "tracks added to an existing playlist must be recorded in Activity with their destination");
assert.match(source, /function recordPlaylistActivity[\s\S]*?action: "added-to-playlist"[\s\S]*?destination/,
  "playlist Activity events must retain their track metadata and named destination");
assert.match(extractFunction("portableActivity"), /destination: String\(item\.destination \|\| ""\)/,
  "playlist destinations must survive portable Activity backups");
assert.match(source, /function savePortableBackup[\s\S]*?action: "backed-up"[\s\S]*?title: "your Bandkit data"/,
  "successful portable backups must be recorded in Activity");
assert.match(hubCss, /\.hub-activity-date-value\s*\{[^}]*color:\s*var\(--hub-ink\);[^}]*font-size:\s*10px;[^}]*font-variant-numeric:\s*tabular-nums;/s,
  "Activity must show its selected date as compact plain text rather than a bordered input");
assert.match(hubCss, /\.hub-activity-date-icon\s*\{[^}]*background:\s*currentColor;[^}]*mask:\s*var\(--hub-activity-date-icon\)/s,
  "the Lucide calendar icon must inherit the active theme accent");
assert.match(hubCss, /\.hub-activity-date-opener\s*\{[^}]*color:\s*var\(--hub-muted\);[^}]*cursor:\s*pointer;[^}]*height:\s*22px;[^}]*width:\s*22px;/s,
  "the compact calendar button must use the muted theme colour at rest");
assert.match(hubCss, /\.hub-activity-date-menu\s*\{[^}]*background:\s*var\(--hub-card\);[^}]*left:\s*0;[^}]*max-height:\s*220px;[^}]*position:\s*absolute;[^}]*z-index:\s*8;/s,
  "the Activity date selector must open as a bounded anchored theme surface");
assert.match(hubCss, /\.hub-event-chip\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--hub-accent\) 14%, transparent\);[^}]*color:\s*var\(--hub-accent\);[^}]*display:\s*inline-flex;/s,
  "Activity badges must derive their consistent colour treatment from the active theme");
assert.match(hubCss, /\.hub-event-chip-icon\s*\{[^}]*background:\s*currentColor;[^}]*mask:\s*var\(--hub-event-chip-icon\)/s,
  "every Activity badge must include its associated theme-coloured action icon");
assert.match(extractFunction("renderSavedCartList"), /createPlaylistToolbarButton\("New cart", "icon-plus\.svg"/,
  "saved carts must use the same standard icon-only create action as other panels");
const playlistViewTabsSource = extractFunction("renderPlaylistViewTabs");
assert.ok(
  playlistViewTabsSource.indexOf('label: "Now Playing"') < playlistViewTabsSource.indexOf('label: "Playlists"'),
  "the combined playlist panel must put Now Playing before Playlists"
);
assert.match(playlistViewTabsSource, /createPanelViewTabs\([\s\S]*?headerClass: "hub-playlist-view-header"/,
  "the combined playlist panel must reuse the Cart/Saved tab structure");
assert.doesNotMatch(playlistViewTabsSource, /hub-cart-view-count|\.count/,
  "Now Playing and Playlists tabs must not include visual count badges");
assert.doesNotMatch(extractFunction("renderCartViewTabs"), /hub-cart-view-count|\.count/,
  "Cart and Saved tabs must not include visual count badges");
assert.doesNotMatch(extractFunction("renderCartViewTabs"), /hub-cart-view-meta|metaText/,
  "Cart and Saved headers must not show secondary data beside the close button");
assert.doesNotMatch(extractFunction("renderPlaylistViewTabs"), /hub-cart-view-meta|metaText/,
  "Now Playing and Playlists headers must not show secondary data beside the close button");
assert.doesNotMatch(extractFunction("renderActivity"), /entryCount|createSectionHeading\("Activity",/,
  "Activity must not show an entry count beside the close button");
assert.doesNotMatch(hubCss, /hub-section-heading-meta|hub-cart-view-meta/,
  "panel styles must not retain the removed top-right metadata treatment");
assert.match(hubCss, /\.hub-cart-view-header\.hub-panel-content-header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) var\(--hub-control-size\);/s,
  "tabbed panel headers must align their tabs directly with the close button");
assert.match(extractFunction("renderCurrentCart"), /hub-panel-count-summary[\s\S]*?itemCount/,
  "the current cart header must show only its concise item count");
assert.doesNotMatch(extractFunction("renderCart"), /Total:/,
  "the active cart total must not remain in the top header");
assert.match(extractFunction("renderCurrentCart"), /hub-cart-checkout[\s\S]*?hub-cart-checkout-total[\s\S]*?cartTotalLabel/,
  "the active cart total must be included inside the checkout button");
assert.match(extractFunction("renderCurrentCart"), /unavailableCount[\s\S]*?Remove \$\{unavailableCount\} unavailable item[\s\S]*?checkout\.disabled = !state\.cart\.length \|\| unavailableCount > 0/,
  "checkout must explain and block carts containing unavailable items");
assert.match(extractFunction("renderCartItemCard"), /is-unavailable[\s\S]*?hub-cart-item-status[\s\S]*?Unavailable/,
  "unavailable cart items must retain a visible status in Bandkit");
assert.match(extractFunction("openBandcampCheckout"), /unavailableItems[\s\S]*?to be removed before checkout/,
  "the checkout handoff must defensively reject unavailable cart items");
assert.match(source, /hub-icon-button hub-close[\s\S]*?hub-button-icon[\s\S]*?icon-close\.svg/,
  "the panel close control must use a theme-colourable masked icon");
assert.match(hubCss, /\.hub-icon-button\.hub-close\s*\{[^}]*color:\s*var\(--hub-muted\);[\s\S]*?\.hub-icon-button\.hub-close:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--hub-accent\);/s,
  "panel close controls must remain quiet at rest and use the theme accent without a hover backing");
assert.match(hubCss, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.hub-panel \.hub-close\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[\s\S]*?\.hub-panel:is\(:hover, :focus-within\) \.hub-close,[\s\S]*?opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  "desktop panels must reveal the close control only on panel hover or keyboard focus");
assert.match(extractFunction("renderCurrentPlaylist"), /hub-panel-count-summary[\s\S]*?track\$\{songCount === 1 \? "" : "s"\}/,
  "Now Playing must use the shared concise track-count summary");
assert.match(extractFunction("renderPlaylist"), /hub-panel-count-summary[\s\S]*?playlist\$\{playlistCount === 1 \? "" : "s"\}/,
  "Playlists must use the shared concise playlist-count summary");
assert.match(extractFunction("cartTotalLabel"), /summary\?\.total[\s\S]*?summary\?\.subtotal/,
  "the checkout button must prefer Bandcamp's official tax-inclusive total");
assert.match(extractFunction("organizePanelContentScrolling"), /is-current-cart[\s\S]*?hub-cart-checkout/,
  "the active cart must opt into its bounded list and checkout layout");
assert.match(hubCss, /\.hub-content-scroll\.is-current-cart\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s,
  "the active cart body must reserve its overflow for the item list");
assert.match(hubCss, /\.hub-current-cart-list\s*\{[^}]*flex:\s*0 1 auto;[^}]*margin-right:\s*-16px;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*padding-right:\s*16px;/s,
  "long carts must scroll above checkout with their handle aligned to the panel edge while cards retain the standard inset");
assert.match(hubCss, /\.hub-cart-checkout\s*\{[^}]*flex:\s*0 0 auto;[^}]*margin-top:\s*12px;/s,
  "checkout must remain visible below a constrained active-cart list");
assert.match(extractFunction("renderPlaylist"), /renderPlaylistViewTabs[\s\S]*state\.playlistView === "current"[\s\S]*renderCurrentPlaylist\(\)/,
  "the playlist section must route its first internal tab to Now Playing");
assert.match(source, /id: "playlist", label: "Now Playing & Playlists", icon: "icon-playlist\.svg"/,
  "the combined primary section must use the list-and-note icon for queues and playlists");
assert.doesNotMatch(source, /toggleSectionPanel\("nowPlaying"\)/,
  "Now Playing must no longer open a separate section panel");
assert.match(extractFunction("persistNowPlayingSession"), /MESSAGES\.SET_NOW_PLAYING[\s\S]*?playlistShuffleEnabled[\s\S]*?playlistShuffleOrder/,
  "Now Playing and its reversible Shuffle state must be persisted through the browser-session queue channel");
assert.match(extractFunction("persistNowPlayingSession"), /transitionTrackKey[\s\S]*?transitionExpiresAt/,
  "page-track queue replacements must broadcast their pending playback target to every Bandcamp tab");
assert.match(source, /MESSAGES\.GET_NOW_PLAYING/,
  "startup must restore Now Playing from session storage rather than durable app state");
assert.match(lifecycleSource, /MESSAGES\.NOW_PLAYING_STATE[\s\S]*?playlistShuffleEnabled[\s\S]*?playlistShuffleOrder/,
  "Shuffle state must follow Now Playing when another Bandcamp tab changes the queue");
assert.match(lifecycleSource, /MESSAGES\.NOW_PLAYING_STATE[\s\S]*?if \(r\.\$isNowPlayingView\(\)\) r\.\$render\(\);\s*else r\.\$renderPlayer\(\);/,
  "queue broadcasts must not rebuild an open saved playlist when only the footer depends on them");
console.log("now playing UI and source contracts smoke test passed");
