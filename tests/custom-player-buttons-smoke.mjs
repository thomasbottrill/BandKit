import assert from "node:assert/strict";
import { PLAYER_BUTTONS, normalizeCustomPlayerButtons, applyPlayerButtonArtwork, syncCustomPlayerButtons } from "../src/content/custom-player-buttons.js";
import { defaultState } from "../src/content/state.js";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=";
assert.equal(PLAYER_BUTTONS.length, 5);
assert.deepEqual(defaultState.customPlayerButtons, {});
assert.deepEqual(normalizeCustomPlayerButtons(null), {});
const state = normalizeCustomPlayerButtons({ play: { enabled: true, artwork: { name: "play.png", png } }, bad: { enabled: true } });
assert.equal(state.play.retainColors, true);
assert.equal(state.bad, undefined);
function icon() {
  const classes = new Set(), props = new Map();
  return { classes, props, dataset: {}, classList: { toggle: (key, value) => value ? classes.add(key) : classes.delete(key) },
    style: { setProperty: (key, value) => props.set(key, value), removeProperty: key => props.delete(key) } };
}
const glyph = icon();
applyPlayerButtonArtwork(glyph, state.play);
assert.ok(glyph.classes.has("hub-custom-player-icon"));
assert.equal(glyph.props.get("--hub-custom-button-mask"), "none");
assert.ok(glyph.props.get("--hub-custom-button-image").includes(png));
applyPlayerButtonArtwork(glyph, { ...state.play, retainColors: false });
assert.equal(glyph.props.get("--hub-custom-button-image"), "none");
assert.ok(glyph.props.get("--hub-custom-button-mask").includes(png));
applyPlayerButtonArtwork(glyph, { ...state.play, enabled: false });
assert.equal(glyph.classes.has("hub-custom-player-icon"), false);
assert.equal(glyph.props.size, 0);
const icons = Object.fromEntries(["play", "previous", "next", "chevron"].map(key => [key, icon()]));
const r = { $playButton: { querySelector: () => icons.play }, $player: { querySelector: selector => icons[selector.includes("previous") ? "previous" : selector.includes("next") ? "next" : "chevron"] } };
syncCustomPlayerButtons(r, { customPlayerButtons: state }, false);
assert.ok(icons.play.classes.has("hub-custom-player-icon"));
syncCustomPlayerButtons(r, { customPlayerButtons: state }, true);
assert.equal(icons.play.classes.has("hub-custom-player-icon"), false, "Missing pause artwork keeps the default pause state");
assert.equal(state.play.artwork.png, png, "Switching states never discards the upload");
console.log("Custom playback icons: normalization, original/theme colours, defaults and play/pause switching passed");
