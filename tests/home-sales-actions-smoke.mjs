import assert from "node:assert/strict";
import fs from "node:fs";

const actions = fs.readFileSync(new URL("../src/content/runtime/home-sales-actions.js", import.meta.url), "utf8");
const scanning = fs.readFileSync(new URL("../src/content/runtime/live-scanning.js", import.meta.url), "utf8");
const playback = fs.readFileSync(new URL("../src/content/runtime/page-player-ui.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/modern/home-sales.css", import.meta.url), "utf8");
const artworkCss = fs.readFileSync(new URL("../src/styles/modern/artwork-actions.css", import.meta.url), "utf8");

assert.match(actions, /homeSaleTrackFromCard[\s\S]*?\^\\\/\(album\|track\)\\\/[\s\S]*?item-artist[\s\S]*?item-img img/,
  "home sale metadata should accept playable releases and retain the visible artist and artwork");
assert.match(actions, /injectHomeSalesActions[\s\S]*?bandkit-home-sale-play[\s\S]*?playHomeSaleTrack[\s\S]*?is-home-sale-add[\s\S]*?addTrackToPlaylist/,
  "play and direct Now Playing actions should be mounted on live-sale cards");
assert.match(actions, /\$homeSalePlaybackRequest\s*=\s*0/,
  "live-sale playback requests should start from a comparable request id");
assert.match(actions, /playHomeSaleTrack[\s\S]*?hydratePlaylist[\s\S]*?isReusableStreamUrl[\s\S]*?playSearchResult/,
  "playing a live sale should resolve its stream and use the shared queue playback path");
assert.match(actions, /playSearchResult\(playableTrack, \{ revealPanel: false \}\)/,
  "playing a live sale should not reveal the Now Playing panel");
assert.match(actions, /syncHomeSalesPlaybackUi[\s\S]*?icon-pause\.svg[\s\S]*?is-added[\s\S]*?aria-pressed/,
  "live-sale actions should expose playback and queue state accessibly");
assert.match(scanning, /bandkit-sales-feed-actions/,
  "extension-owned live-sale controls should not recursively dirty the page scan");
assert.match(playback, /syncHomeSalesPlaybackUi/,
  "live-sale controls should refresh when the global playback state changes");
assert.match(playback, /data-bandkit-hide-bandcamp-player="false"[\s\S]*?\.bandkit-sales-feed-actions[\s\S]*?\.bandkit-search-play[\s\S]*?\.bandcamp-hub-page-playlist[\s\S]*?:not\(#bandkit-native-player-control\)[\s\S]*?display:none!important/,
  "native-player mode should hide Bandkit-only play and add controls");
assert.match(css, /data-bandkit-hide-bandcamp-player="false"[\s\S]*?#HomepageApp #sales-feed \.item > \.bandkit-sales-feed-actions[\s\S]*?display:\s*none !important/,
  "native-player mode should hide the complete live-sale action group above its important child layout");
assert.match(css, /\.item:is\(:hover, :focus-within, \.bandkit-home-sale-current\)[\s\S]*?opacity:\s*1/,
  "live-sale controls should use hover and keyboard-focus progressive disclosure");
assert.match(css, /@media \(hover: none\)[\s\S]*?opacity:\s*1/,
  "live-sale controls should remain discoverable on touch devices");
assert.match(actions, /item-img[\s\S]*?offsetLeft \+ 8[\s\S]*?offsetTop \+ artwork\.offsetHeight - 40/,
  "live-sale controls should be measured into the artwork's lower-left corner");
assert.match(actions, /syncHomepageArtworkPlayActions[\s\S]*?playlist-card[\s\S]*?new-notable[\s\S]*?applyPageActionTheme/,
  "homepage playlist and New and Notable play controls should receive the active Bandkit action theme");
assert.match(artworkCss, /#HomepageApp[\s\S]*?playlist-card[\s\S]*?new-notable[\s\S]*?::before[\s\S]*?var\(--hub-card[\s\S]*?height:\s*32px[\s\S]*?width:\s*32px/,
  "homepage artwork play glyphs should reuse the themed Selling right now action surface");
assert.match(artworkCss, /play-pause-button\.over-image::before[\s\S]*?bottom:\s*8px;[\s\S]*?left:\s*8px;[\s\S]*?transform:\s*none;[\s\S]*?play-pause-button\.over-image::after[\s\S]*?bottom:\s*24px;[\s\S]*?left:\s*24px;[\s\S]*?translate\(-50%, 50%\)/,
  "homepage playlist and New and Notable play affordances should sit at the artwork's lower-left inset");

console.log("home sales actions smoke test passed");
