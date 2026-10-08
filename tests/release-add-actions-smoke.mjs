import assert from "node:assert/strict";
import fs from "node:fs";

const commerce = fs.readFileSync(new URL("../src/content/runtime/page-commerce-analysis.js", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8");
const menu = fs.readFileSync(new URL("../src/content/runtime/page-player-ui.js", import.meta.url), "utf8");
const cart = fs.readFileSync(new URL("../src/content/runtime/layout-cart.js", import.meta.url), "utf8");

assert.match(actions, /pageCurrent\?\.type === "album" \? r\.\$buildSeamlessQueue\(\) : \[\][\s\S]*?_bandkitRelease = releaseTracks\.length > 0[\s\S]*?_bandkitTracks = releaseTracks\.length \? releaseTracks : null/,
  "the page-level Add control should select the album while track-row Add controls stay track-specific");
assert.match(commerce, /button\._bandkitRelease \? "bandkit-release" : "bandkit-track-batch"/,
  "album selections should remain distinguishable from generic track batches");
assert.match(menu, /isRelease \? "＋ Add album to Now Playing"[\s\S]*?isRelease \? "＋ Add album to Playlist…"[\s\S]*?isRelease \? "＋ Add album to Cart…"/,
  "the album menu should use consistent wording for its destinations");
assert.match(menu, /isRelease \? "Add album to Wishlist" : "Add to Wishlist"/,
  "the album Add menu should include the whole-release wishlist destination");
assert.match(menu, /const cartTracks = albumTrack \? \[albumTrack\] : tracks[\s\S]*?isRelease && albumTrack\) void r\.\$requestReleaseCartAdd\(anchor, albumTrack\)[\s\S]*?r\.\$addTracksToCurrentCart\(cartTracks, "t"\)/,
  "the current-cart album action should resolve one digital album instead of every track");
assert.match(menu, /addTracksToSavedCart\(cartTracks, snapshot\.id, isRelease \? "a" : "t"\)/,
  "saved-cart album actions should also store one digital album");
assert.match(cart, /url: resolvedCartItemPageUrl\(track, requestedItemType\)/,
  "album resolution should use the release URL instead of the representative track URL");
assert.doesNotMatch(menu, /option\("Add all to (?:playlist|cart)…"/,
  "the release overflow should not duplicate the page-level Add destinations");

// Every album-level Add control, on whichever surface, must reach the same
// "bandkit-release" selection so the cart and wishlist receive one album item
// rather than each track. Only the whole-release controls may claim it.
assert.match(actions, /applyDiscoverReleaseAddButton\(button, fallbackTrack\) \{[\s\S]*?const releaseTracks = r\.\$discoverRelease\?\.tracks \|\| \[\];[\s\S]*?button\._bandkitRelease = releaseTracks\.length > 0;[\s\S]*?button\._bandkitTracks = releaseTracks\.length \? releaseTracks : null;/,
  "the Discover release Add control should select the whole release");
assert.match(actions, /applyFeedReleaseAddButton\(button, story, track\) \{[\s\S]*?const asRelease = isAlbumStory && releaseTracks\.length > 0;[\s\S]*?button\._bandkitRelease = asRelease;[\s\S]*?button\._bandkitTracks = asRelease \? releaseTracks : null;/,
  "a feed story for an album should add that album, not its featured track");
assert.match(actions, /const isAlbumStory = \/\\\/album\\\/\/\.test\(track\.pageUrl \|\| ""\);/,
  "only album stories may claim the release selection; track stories stay track-specific");
assert.match(actions, /button\._bandkitRelease = false;\s*button\._bandkitTracks = null;[\s\S]*?button\._bandkitReleaseTrack = cardTrack;[\s\S]*?r\.\$updatePagePlaylistButton\(button, cardTrack\);/,
  "Discover grid cards must drop any release selection until their release resolves");
assert.match(commerce, /button\._bandkitReleaseTrack[\s\S]*?await r\.\$resolveFeedReleaseTracks\(button\._bandkitReleaseTrack\)[\s\S]*?button\._bandkitRelease = true;[\s\S]*?button\._bandkitTracks = tracks;/,
  "a release control must resolve the release behind its card before adding");
assert.match(actions, /function bindReleaseAddPrefetch\(button\)[\s\S]*?resolveFeedReleaseTracks\(button\._bandkitReleaseTrack\)[\s\S]*?prefetchFeedPurchase\(/,
  "release add controls must resolve their release and purchase terms on hover");
assert.match(actions, /function injectCollectionItemActions[\s\S]*?playlistButton\._bandkitReleaseTrack = track;[\s\S]*?bindReleaseAddPrefetch\(playlistButton\)/,
  "collection and wishlist cards must resolve their release like the feed and Discover");
assert.match(actions, /function injectRecommendationActions[\s\S]*?button\._bandkitReleaseTrack = track;[\s\S]*?bindReleaseAddPrefetch\(button\)/,
  "recommended albums must offer album destinations");
assert.match(actions, /node\.matches\("\.searchresult"\) && \/\\\/album\\\/\/\.test\(fallbackPageUrl\)[\s\S]*?button\._bandkitReleaseTrack = track;/,
  "album search results must offer album destinations");
// A release selection is only honest when its tracks are known, so no surface may
// label an album action it cannot fulfil.
for (const [label, pattern] of [
  ["Discover", /const releaseTracks = r\.\$discoverRelease\?\.tracks \|\| \[\];/],
  ["feed", /const releaseTracks = \(releaseHost && r\.\$feedAlbumQueues\?\.get\(releaseHost\)\) \|\| \[\];/]
]) {
  assert.match(actions, pattern, `the ${label} Add control must derive its release from resolved tracks`);
}

console.log("Release Add actions keep album and track destinations distinct.");
