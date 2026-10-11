import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readHubStyles } from "./support/source.mjs";

// Discover leaves its own control reading "Pause" for a track it has already
// handed to Bandkit. Everything that reads that label has to know the preview
// went silent, or the handed-off row keeps the pause glyph and the music bar
// treats the track as pending, which pins its readout to zero.

const handoffSource = fs.readFileSync(new URL("../src/content/runtime/player-handoffs.js", import.meta.url), "utf8");
const audibleStart = handoffSource.indexOf("function audibleNativeDiscover(");
assert.ok(audibleStart > 0, "player-handoffs owns the shared audible-preview test");
const audibleContext = vm.createContext({ runtimeSeamless: { enabled: false, track: null } });
vm.runInContext(handoffSource.slice(audibleStart, handoffSource.indexOf("function pauseNativeDiscover(")), audibleContext);
const { audibleNativeDiscover } = audibleContext;

const nativeState = (label) => ({ track: { id: "native", title: "Handed off" }, control: { getAttribute: () => label } });
const paused = nativeState("Pause");

assert.equal(audibleNativeDiscover({}, nativeState("Play")), null,
  "A stopped native preview is never the audible source");
assert.equal(audibleNativeDiscover({}, paused), paused,
  "Before the media bridge reports, the native label still stands in for audibility");
assert.equal(audibleNativeDiscover({ $discoverTrackPlaybackActive: true }, paused), null,
  "A tracklist row owning playback silences the native preview whatever its label says");
assert.equal(audibleNativeDiscover({ $bridgedMedia: { src: "https://t4.bcbits.com/one", paused: false, ended: false } }, paused), paused,
  "Bandcamp's own audio still playing keeps the native preview audible");
assert.equal(audibleNativeDiscover({ $bridgedMedia: { src: "https://t4.bcbits.com/one", paused: true, ended: false } }, paused), null,
  "A handed-off preview whose audio was silenced is not audible, however its control reads");
assert.equal(audibleNativeDiscover({ $bridgedMedia: { src: "https://t4.bcbits.com/one", paused: false, ended: true } }, paused), null,
  "A finished preview is not audible");
assert.equal(audibleNativeDiscover({ $getDiscoverPlayerState: () => null }), null,
  "Pages without a Discover player have no audible preview");

console.log("Discover audible-preview ownership checks passed.");

// The generated Discover tracklist must follow the same answer: the row Bandkit
// is really playing outranks whichever row Discover's stale control names.
const uiSource = fs.readFileSync(new URL("../src/content/runtime/page-player-ui.js", import.meta.url), "utf8");
const syncStart = uiSource.indexOf("function syncDiscoverTracklistPlaybackUi(");
assert.ok(syncStart > 0, "page-player-ui owns the Discover tracklist playback sync");

class Row {
  constructor(title, id) {
    this.dataset = { bandkitDiscoverTrackId: id };
    this.title = title;
    this.status = { classes: new Set(), attrs: {} };
    this.status.classList = { toggle: (name, on) => { if (on) this.status.classes.add(name); else this.status.classes.delete(name); } };
    this.status.setAttribute = (key, value) => { this.status.attrs[key] = value; };
    this.status.removeAttribute = (key) => { delete this.status.attrs[key]; };
    this.status.closest = () => null;
    this.classes = new Set();
    this.classList = { toggle: (name, on) => { if (on) this.classes.add(name); else this.classes.delete(name); } };
  }
  querySelector(selector) {
    if (selector === ".track-title") return { textContent: this.title };
    if (selector === ".play_status") return this.status;
    return null;
  }
  get state() {
    return { current: this.classes.has("bandcamp-hub-current"), playing: this.status.classes.has("playing") };
  }
}

function runSync({ rows, native, seamless, pending = null, trackPlaybackActive = false, bridgedMedia = null }) {
  const context = vm.createContext({
    runtimeSeamless: seamless,
    document: { querySelectorAll: () => rows }
  });
  vm.runInContext(uiSource.slice(syncStart, uiSource.indexOf("function syncFeedTracklistPlaybackUi(")), context);
  const r = {
    $discoverPendingTrack: pending,
    $discoverTrackPlaybackActive: trackPlaybackActive,
    $bridgedMedia: bridgedMedia,
    $getDiscoverPlayerState: () => native,
    $normalizedTrackTitle: (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase(),
    $audibleNativeDiscover: (state) => audibleNativeDiscover(r, state)
  };
  context.syncDiscoverTracklistPlaybackUi(r);
  return rows.map((row) => row.state);
}

const listRows = () => [new Row("Kill For The Steel", "1"), new Row("Uqt", "2"), new Row("Level 5", "3")];
const stalePause = {
  track: { id: "1", title: "Kill For The Steel" },
  control: { getAttribute: () => "Pause" },
  isPlaying: true
};

assert.deepEqual(
  runSync({
    rows: listRows(),
    native: stalePause,
    seamless: { enabled: true, isPlaying: true, track: { id: "2", title: "Uqt" } },
    trackPlaybackActive: true
  }),
  [{ current: false, playing: false }, { current: true, playing: true }, { current: false, playing: false }],
  "Playing a different row clears the pause glyph Discover left on the handed-off row"
);

assert.deepEqual(
  runSync({
    rows: listRows(),
    native: stalePause,
    seamless: { enabled: true, isPlaying: false, track: { id: "1", title: "Kill For The Steel" } },
    bridgedMedia: { src: "https://t4.bcbits.com/one", paused: true, ended: false }
  }),
  [{ current: true, playing: false }, { current: false, playing: false }, { current: false, playing: false }],
  "A handed-off row follows Bandkit's own paused state rather than Discover's stale label"
);

assert.deepEqual(
  runSync({
    rows: listRows(),
    native: stalePause,
    seamless: { enabled: false, isPlaying: false, track: null },
    bridgedMedia: { src: "https://t4.bcbits.com/one", paused: false, ended: false }
  }),
  [{ current: true, playing: true }, { current: false, playing: false }, { current: false, playing: false }],
  "An audible native preview still owns its row, covering another tab holding the shared player"
);

assert.deepEqual(
  runSync({
    rows: listRows(),
    native: { track: { id: "3", title: "Level 5" }, control: { getAttribute: () => "Play" }, isPlaying: false },
    seamless: { enabled: false, isPlaying: false, track: null }
  }),
  [{ current: false, playing: false }, { current: false, playing: false }, { current: true, playing: false }],
  "A silent native selection still marks its row without claiming playback"
);

console.log("Discover tracklist playback ownership checks passed.");

// Compact panel cards declare a fixed height, so the transparent border they
// inherit from .hub-card must not eat into it and crop the structural artwork.
const hubStyles = readHubStyles();
assert.match(hubStyles, /\.hub-panel-card\.hub-compact-media-card\s*\{[^}]*border-width:\s*0/,
  "Compact panel cards drop the inherited border so 64px of card holds 64px of artwork");
assert.match(hubStyles, /\.is-reordering > \.hub-playlist-track:not\(\.is-dragging\)\s*\{[^}]*transition:\s*transform/,
  "While dragging, the other tracks slide aside instead of relying on a drop outline");
assert.doesNotMatch(hubStyles, /\.hub-playlist-track\.is-drag-target\s*\{[^}]*border-color/,
  "Nothing reintroduces a border the compact card no longer reserves space for");

console.log("Compact panel card artwork height checks passed.");
