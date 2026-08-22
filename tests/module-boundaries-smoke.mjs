import assert from "node:assert/strict";
import { createAppContext } from "../src/content/app-context.js";
import { parseCartBackup, portableCartItem } from "../src/content/cart-model.js";
import { accessibleScrubberPalette, contrast, hexColor } from "../src/content/color.js";
import { safeBandcampReleaseUrl } from "../src/content/core.js";
import { createPlaylistModel } from "../src/content/playlist-model.js";
import { defaultState } from "../src/content/state.js";
import { waveformAmplitudes, waveformPathData } from "../src/content/waveform.js";
import { MESSAGES, STORAGE_KEYS } from "../src/shared/contracts.js";

const context = createAppContext(defaultState);
assert.notEqual(context.state, defaultState, "Application state must be cloned per content-script instance");
assert.equal(context.state.appearance.applyToPage, false);
context.replaceState({ ...context.state, open: true });
assert.equal(context.state.open, true);

const cleanupOrder = [];
context.registerCleanup(() => cleanupOrder.push("first"));
context.registerCleanup(() => cleanupOrder.push("second"));
context.cleanup();
context.cleanup();
assert.deepEqual(cleanupOrder, ["second", "first"], "Cleanup must be reverse-order and idempotent");

assert.equal(MESSAGES.SEAMLESS_ENABLE, "BANDCAMP_HUB_SEAMLESS_ENABLE");
assert.equal(STORAGE_KEYS.STATE, "bandcampHubState");
assert.equal(STORAGE_KEYS.NOW_PLAYING, "bandcampHubNowPlayingSession");
assert.ok(Object.isFrozen(MESSAGES) && Object.isFrozen(STORAGE_KEYS));

const playlist = createPlaylistModel({
  isReusableStreamUrl: (value) => String(value || "").startsWith("https://"),
  maxItems: 2,
  normalizedTrackTitle: (value) => String(value || "").trim().toLowerCase(),
  portableBandcampUrl: (value) => value || "",
  resolveImage: (value) => value || "",
  resolvedTrackPageUrl: (track) => track.pageUrl || "",
  safeBandcampUrl: (value) => value || ""
});
const normalized = playlist.normalizePlaylist([
  { id: "1", title: "One", pageUrl: "https://artist.bandcamp.com/track/one", url: "https://t4.bcbits.com/one" },
  { id: "2", title: "Two", pageUrl: "https://artist.bandcamp.com/track/two" },
  { id: "3", title: "Three", pageUrl: "https://artist.bandcamp.com/track/three" }
]);
assert.equal(normalized.length, 2);
assert.equal(playlist.playlistTracksMatch(normalized[0], { ...normalized[0], pageUrl: `${normalized[0].pageUrl}?from=test` }), true);

assert.equal(safeBandcampReleaseUrl("http://artist.bandcamp.com/track/nope"), "");
assert.ok(contrast(hexColor("#000000"), hexColor("#ffffff")) >= 21);
const scrubberPalette = accessibleScrubberPalette(hexColor("#777777"), hexColor("#ffffff"));
assert.equal(scrubberPalette.remaining.a, 1, "Unplayed waveform bars must use a fully opaque colour");
assert.ok(contrast(scrubberPalette.remaining, scrubberPalette.surface) >= 2,
  "Unplayed waveform bars must retain useful contrast against their surface");
assert.ok(waveformPathData("fixture", 320).pathData.length > 100);
assert.deepEqual(waveformAmplitudes("fixture", 32), waveformAmplitudes("fixture", 32),
  "Fallback waveform samples must be deterministic");
assert.equal(waveformAmplitudes("fixture", 32).length, 32);
assert.equal(portableCartItem({ title: "Test", url: "https://artist.bandcamp.com/album/test" }).title, "Test");
assert.throws(() => parseCartBackup("{}"), /not a supported Bandkit cart backup/);

console.log("Module boundaries and shared contracts checks passed.");
