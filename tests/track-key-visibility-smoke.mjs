import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const state = read("../src/content/state.js");
const settings = read("../src/content/runtime/activity-settings.js");
const appearance = read("../src/content/runtime/appearance.js");
const pageAnalysis = read("../src/content/runtime/page-commerce-analysis.js");
const player = read("../src/content/runtime/player-shell.js");
const dj = read("../src/content/runtime/dj-playback.js");
const playlists = read("../src/content/runtime/collection-views.js");
const persistence = read("../src/content/runtime/persistence-playback.js");
const lifecycle = read("../src/content/runtime/lifecycle.js");
const pagePlayer = read("../src/content/runtime/page-player-ui.js");

assert.match(state, /showTrackKeys:\s*true[\s\S]*?showCamelotNotation:\s*false/,
  "musical key must default on while Camelot notation defaults off");
assert.match(settings, /Musical key[\s\S]*?hub-show-track-keys-toggle[\s\S]*?Camelot notation[\s\S]*?hub-show-camelot-toggle/,
  "settings must expose independent musical-key and Camelot switches");
assert.match(persistence, /showTrackKeys:[^\n]*[\s\S]*?showCamelotNotation:/,
  "both visibility preferences must be included in portable settings");
assert.match(lifecycle, /showTrackKeys:\s*incoming\.showTrackKeys !== false,[\s\S]*?showCamelotNotation:\s*incoming\.showCamelotNotation === true[\s\S]*?Object\.assign\(runtimeState, syncedSettings\)/,
  "both visibility preferences must synchronize between open Bandcamp tabs");
assert.match(appearance, /dataset\.bandkitShowTrackKeys[\s\S]*?dataset\.bandkitShowCamelot/,
  "page layouts must receive both visibility modes");
assert.match(pageAnalysis, /showCamelotNotation[^\n]*\? \[parts\.camelot\][\s\S]*?showTrackKeys[^\n]*\? \[parts\.key\]/,
  "album-page analysis labels must filter Camelot and musical key independently");
assert.match(player, /showCamelotNotation[^\n]*detectedKey\?\.camelot[\s\S]*?showTrackKeys[^\n]*detectedKey\?\.shortName/,
  "the music bar must filter Camelot and musical key independently");
assert.match(dj, /const showMusicalKey =[\s\S]*?const showCamelot =[\s\S]*?hub-dj-key-name[\s\S]*?showMusicalKey[\s\S]*?hub-dj-key-camelot[\s\S]*?showCamelot/,
  "DJ key readouts must respect both preferences");
assert.match(playlists, /const showMusicalKey =[\s\S]*?const showCamelot =[\s\S]*?showCamelot && key\.camelot[\s\S]*?showMusicalKey && key\.shortName/,
  "playlist analysis chips must respect both preferences");
assert.match(pageAnalysis, /hasKey \? "" : "Key\?"[\s\S]*?key uncertain/,
  "album rows must label a withheld low-confidence key instead of leaving an empty column");
assert.match(player, /keyUncertain[\s\S]*?"Key\?"[\s\S]*?Musical key could not be detected confidently/,
  "the music bar must explain a withheld low-confidence key");
assert.match(dj, /bpmUncertain[\s\S]*?Track BPM uncertain[\s\S]*?keyUncertain[\s\S]*?"Key\?"/,
  "DJ tools must mark uncertain BPM and key readings explicitly");
assert.match(pageAnalysis, /\$\{bpmUncertain \? "\?" : ""\} BPM/,
  "album rows must retain a numeric best-effort BPM with an uncertainty marker");
assert.match(player, /detectedBpm[\s\S]*?bpmUncertain \? "\?"[\s\S]*?Best-effort BPM estimate/,
  "the music bar must distinguish a numeric BPM estimate from a missing BPM");
assert.match(dj, /setManualBpm[\s\S]*?autoTempo = false[\s\S]*?SEAMLESS_SET_BPM/,
  "manual BPM entry must remain available without changing playback tempo");
assert.match(playlists, /bpmUncertain[\s\S]*?"BPM\?"[\s\S]*?keyUncertain[\s\S]*?"Key\?"/,
  "playlist analysis metadata must preserve uncertainty markers from page analysis");
assert.match(pagePlayer, /data-bandkit-show-track-keys=\"false\"\]\[data-bandkit-show-camelot=\"true\"[\s\S]*?data-bandkit-show-track-keys=\"true\"\]\[data-bandkit-show-camelot=\"false\"/,
  "album-page analysis columns must compact correctly for either independent setting");

console.log("Independent musical-key and Camelot visibility checks passed.");
