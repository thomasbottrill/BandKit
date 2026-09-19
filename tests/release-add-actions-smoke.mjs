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
assert.match(menu, /const cartTracks = albumTrack \? \[albumTrack\] : tracks[\s\S]*?addTracksToCurrentCart\(cartTracks, isRelease \? "a" : "t"\)/,
  "the current-cart album action should resolve one digital album instead of every track");
assert.match(menu, /addTracksToSavedCart\(cartTracks, snapshot\.id, isRelease \? "a" : "t"\)/,
  "saved-cart album actions should also store one digital album");
assert.match(cart, /url: resolvedCartItemPageUrl\(track, requestedItemType\)/,
  "album resolution should use the release URL instead of the representative track URL");
assert.doesNotMatch(menu, /option\("Add all to (?:playlist|cart)…"/,
  "the release overflow should not duplicate the page-level Add destinations");

console.log("Release Add actions keep album and track destinations distinct.");
