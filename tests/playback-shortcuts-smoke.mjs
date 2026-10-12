import assert from "node:assert/strict";
import { createPlaybackShortcuts, setupPlaybackShortcuts, PLAYBACK_SHORTCUTS, SHORTCUTS_DISCLOSURE } from "../src/content/runtime/playback-shortcuts.js";
import { isSettingsDisclosureOpen } from "../src/content/settings-drawer.js";
import { updateRuntimeSaveState, updateRuntimeState } from "../src/content/runtime/context.js";

let enabled = true, loaded = true;
const calls = [];
const shortcut = createPlaybackShortcuts({
  isEnabled: () => enabled, hasTrack: () => loaded,
  playPause: () => calls.push("playPause"), changeTrack: (step) => calls.push(["track", step]),
  seekBy: (seconds) => calls.push(["seek", seconds]), seekToFraction: (fraction) => calls.push(["jump", fraction]),
  showHelp: () => calls.push("help")
});
const press = (key, extra = {}) => {
  let prevented = false;
  shortcut({ key, composedPath: () => [], preventDefault() { prevented = true; }, ...extra });
  return prevented;
};
const take = () => calls.splice(0);

for (const key of ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", " ", "0", "7"]) assert.equal(press(key), true, key);
assert.equal(press("ArrowRight", { shiftKey: true }), true);
assert.equal(press("ArrowLeft", { shiftKey: true }), true);
assert.equal(press("?", { shiftKey: true }), true);
assert.deepEqual(take(), [["track", 1], ["track", -1], ["seek", 10], ["seek", -10], "playPause", ["jump", 0], ["jump", 0.7], ["seek", 30], ["seek", -30], "help"],
  "Down/up change track, left/right skip 10 s (30 s with Shift), Space plays or pauses, digits jump and ? shows the keys");

assert.equal(press("ArrowDown", { repeat: true }), true, "A held key must not scroll the page under the music");
assert.equal(press(" ", { repeat: true }), true);
press("ArrowRight", { repeat: true });
assert.deepEqual(take(), [["seek", 10]], "Holding left or right keeps scanning; other held keys act once");

for (const [key, extra] of [["ArrowDown", { shiftKey: true }], [" ", { shiftKey: true }], ["5", { shiftKey: true }], ["ArrowDown", { altKey: true }],
  ["ArrowRight", { ctrlKey: true }], ["?", { metaKey: true }], ["ArrowDown", { isComposing: true }], ["ArrowDown", { defaultPrevented: true }],
  ["3", { composedPath: () => [{ isContentEditable: true }] }], ["ArrowDown", { composedPath: () => [{ matches: (selector) => selector.includes("[role='slider']") }] }]]) {
  assert.equal(press(key, extra), false, `${JSON.stringify(key)} stays with ${JSON.stringify(Object.keys(extra))}`);
}
const focusedButton = { composedPath: () => [{ matches: (selector) => selector.split(", ").includes("button") }] };
assert.equal(press(" ", focusedButton), false, "Space presses a focused button rather than toggling playback");
assert.equal(press("ArrowDown", focusedButton), true, "Arrows still work from a focused button");
assert.equal(press("a"), false, "Unrelated keys are left alone");
take();

loaded = false;
assert.equal(press("ArrowDown"), false, "With nothing loaded, the keys scroll the page as usual");
assert.equal(press("?", { shiftKey: true }), true, "The key list is available before anything plays");
enabled = false;
assert.equal(press("?", { shiftKey: true }), false);
assert.equal(press(" "), false, "The Features switch turns every shortcut off");
assert.deepEqual(take(), ["help"]);
assert.ok(PLAYBACK_SHORTCUTS.some(([, keys]) => keys === "?"), "Help lists the key that opens it");

// Seeks go to the bar's own scrub path with an exact time, and quick presses
// build on the seek still in flight instead of the playback state it trails.
const element = () => ({ textContent: "", value: "0", clicks: 0, click() { this.clicks++; } });
const previous = element(), next = element(), play = element();
const finished = [];
let listener = null, renders = 0, openState = null;
globalThis.document = { addEventListener: (type, fn) => { listener = fn; }, removeEventListener() {} };
const state = { keyboardShortcutsEnabled: true, open: false };
updateRuntimeState(state);
updateRuntimeSaveState(() => {});
const r = {
  $app: { registerCleanup() {} },
  $player: { classList: { contains: () => false }, querySelector: (selector) => selector === ".hub-next-button" ? next : previous },
  $playButton: play,
  $scrubDuration: 300, $scrubCurrentTime: 100, $scrubRevision: 0,
  $scrubSlider: element(), $currentTimeLabel: element(), $durationLabel: element(),
  $beginScrub() { this.$scrubRevision += 1; }, $syncScrubVisual() {},
  $finishScrub(time) { return new Promise((resolve) => finished.push({ time, resolve })); },
  $saveLayoutState() {}, $render() { renders += 1; }, $setOpen(open) { openState = open; }
};
setupPlaybackShortcuts(r);
const key = (name, extra = {}) => listener({ key: name, composedPath: () => [], preventDefault() {}, ...extra });
const settle = async () => { for (const seek of finished.splice(0)) seek.resolve(); await new Promise((resolve) => setTimeout(resolve)); };
key("ArrowRight"); key("ArrowRight"); key("ArrowLeft", { shiftKey: true });
assert.deepEqual(finished.map((seek) => seek.time), [110, 120, 90]);
assert.equal(r.$scrubSlider.value, String(Math.round((90 / 300) * 1000)));
assert.equal(r.$currentTimeLabel.textContent, "1:30");
assert.equal(r.$durationLabel.textContent, "−3:30");
await settle();
key("5");
assert.equal(finished.at(-1).time, 150, "5 jumps halfway through the track");
await settle();
r.$scrubCurrentTime = 295;
key("ArrowRight");
assert.equal(finished.at(-1).time, 300, "Skipping past the end stops at the end");
await settle();
r.$scrubCurrentTime = 4;
key("ArrowLeft");
assert.equal(finished.at(-1).time, 0, "Skipping before the start stops at the start");
key("ArrowDown"); key("ArrowUp"); key(" ");
assert.deepEqual([next.clicks, previous.clicks, play.clicks], [1, 1, 1]);
key("?", { shiftKey: true });
assert.deepEqual([state.open, state.activeTab, state.settingsView, state.settingsSubView, renders], [true, "settings", "onboarding", "index", 1], "? opens Settings › Help");
assert.equal(isSettingsDisclosureOpen(SHORTCUTS_DISCLOSURE), true, "with the shortcuts drawer already open");
key("?", { shiftKey: true });
assert.equal(openState, false, "? again closes it");
state.keyboardShortcutsEnabled = false;
key("ArrowDown");
assert.equal(next.clicks, 1, "The Features switch turns the shortcuts off");

console.log("Playback shortcuts: track, seek, 30 s, digit, Space and ? keys, held keys, focus, editing, modifiers, clamping and the setting passed.");
