import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();
const backgroundSource = fs.readFileSync(new URL("../src/background/index.js", import.meta.url), "utf8");

assert.match(backgroundSource, /async function clearOffscreenPlayback\(operation\)[\s\S]*?1500[\s\S]*?Promise\.race\([\s\S]*?OFFSCREEN_DISABLE[\s\S]*?operation !== playbackOperationVersion[\s\S]*?chrome\.offscreen\.closeDocument\(\)[\s\S]*?chrome\.storage\.session\.set/s,
  "clearing playback must recover from an unresponsive offscreen document after an extension reload");
assert.match(backgroundSource, /message\.type === MESSAGES\.CLEAR_PLAYBACK[\s\S]*?clearOffscreenPlayback\(operation\)[\s\S]*?broadcastPlaybackCleared\(\)/,
  "playlist resets must use the bounded offscreen recovery path before broadcasting the clear state");
assert.match(backgroundSource, /message\.type === MESSAGES\.CLEAR_PLAYBACK[\s\S]*?operation = \+\+playbackOperationVersion[\s\S]*?operation !== playbackOperationVersion[\s\S]*?broadcastPlaybackCleared\(\)/,
  "a delayed clear must not broadcast after a newer playback operation has started");
assert.match(backgroundSource, /message\.type === MESSAGES\.SEAMLESS_ENABLE[\s\S]*?\+\+playbackOperationVersion/,
  "starting replacement playback must supersede any pending clear operation");

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find ${name} in content source`);
  const start = match.index;
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (["\"", "'", "`"].includes(character)) { quote = character; continue; }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name} from content source`);
}

assert.match(extractFunction("createSavedPlaylistActions"), /playSavedPlaylist\(snapshot\)[\s\S]*?playSavedPlaylist\(snapshot, \{ shuffle: true \}\)/,
  "saved-playlist Play and Shuffle Play actions must use the atomic replace-and-reload path");
assert.match(extractFunction("renderSavedPlaylists"), /hub-saved-playlist-art-action[\s\S]*?savedPlaylistMatchesCurrentQueue\(snapshot\)[\s\S]*?playSavedPlaylist\(snapshot\)/,
  "the saved-playlist artwork control must use the atomic replace-and-reload path");
assert.doesNotMatch(extractFunction("playSavedPlaylist"), /clearNowPlayingPlayback/,
  "saved-playlist replay must not broadcast an empty intermediate queue before replacing it");
assert.match(source, /PLAYBACK_CLEARED[\s\S]*?!savedPlaylistReplacementRequest[\s\S]*?Date\.now\(\) >= savedPlaylistReplacementGuardUntil/,
  "a delayed cross-tab clear must not erase a saved playlist while its replacement is still loading");
assert.match(extractFunction("playSavedPlaylist"), /savedPlaylistReplacementGuardUntil = Date\.now\(\) \+ 120000[\s\S]*?savedPlaylistReplacementGuardUntil = Date\.now\(\) \+ 30000/,
  "saved-playlist replacement should retain a short grace period for late clear broadcasts");
assert.match(extractFunction("clearNowPlayingPlayback"), /savedPlaylistPlayRequest \+= 1;[\s\S]*?savedPlaylistReplacementRequest = 0;[\s\S]*?savedPlaylistReplacementGuardUntil = 0;/,
  "an explicit user clear must cancel any saved-playlist replacement guard");

const context = vm.createContext({
  savedPlaylistPlayRequest: 0,
  savedPlaylistPlaybackReset: Promise.resolve(),
  state: { playlist: [] },
  actions: [],
  normalizePlaylist(items) { return Array.isArray(items) ? items.map((item) => ({ ...item })) : []; },
  mergeHydratedPlaylist(items, hydrated) {
    const byId = new Map(hydrated.map((item) => [item.playlistItemId, item]));
    return items.map((item) => ({ ...item, ...(byId.get(item.playlistItemId) || {}) }));
  },
  showToast(message) { context.actions.push(`toast:${message}`); },
  restoreSavedPlaylist(snapshot) {
    context.state.playlist = snapshot.items.map((item) => ({ ...item }));
    context.actions.push(`restore:${snapshot.name}`);
  },
  enablePlaylistShuffle() { context.actions.push("shuffle"); return true; },
  saveState() { context.actions.push("save"); },
  render() { context.actions.push("render"); },
  async playPlaylistAt(index, options) {
    context.actions.push(`play:${index}:${options.forceRefresh}`);
    if (context.truncateDuringPlay) context.state.playlist = context.state.playlist.slice(-1);
    return true;
  }
});
vm.runInContext(`${extractFunction("playSavedPlaylist")}\nglobalThis.testPlaySavedPlaylist = playSavedPlaylist;`, context);
const snapshot = { name: "Replay fixture", items: [{ playlistItemId: "one", title: "One" }, { playlistItemId: "two", title: "Two" }] };

assert.equal(await context.testPlaySavedPlaylist(snapshot, { shuffle: true }), true);
assert.deepEqual(Array.from(context.actions), ["restore:Replay fixture", "shuffle", "save", "render", "play:0:true"]);

context.actions.length = 0;
assert.equal(await context.testPlaySavedPlaylist(snapshot, { startIndex: 1 }), true);
assert.deepEqual(Array.from(context.state.playlist, (item) => item.playlistItemId), ["two"],
  "an individual saved-playlist track must play only that selected track");
assert.deepEqual(Array.from(context.actions), ["restore:Replay fixture", "play:0:true"]);

context.actions.length = 0;
context.truncateDuringPlay = true;
assert.equal(await context.testPlaySavedPlaylist(snapshot), true);
assert.equal(context.state.playlist.length, 2,
  "saved-playlist replay must reconcile the complete intended list after transient playback startup state");
assert.deepEqual(Array.from(context.actions), ["restore:Replay fixture", "play:0:true", "save", "render"]);
context.truncateDuringPlay = false;

context.actions.length = 0;
context.savedPlaylistPlayRequest = 0;
const playResolvers = [];
context.playPlaylistAt = (index, options) => {
  context.actions.push(`play:${index}:${options.forceRefresh}`);
  return new Promise((resolve) => playResolvers.push(resolve));
};
const firstReplay = context.testPlaySavedPlaylist({ ...snapshot, name: "First request" });
const secondReplay = context.testPlaySavedPlaylist({ ...snapshot, name: "Second request" });
assert.deepEqual(Array.from(context.actions), ["restore:First request", "play:0:true", "restore:Second request", "play:0:true"],
  "a newer replay should atomically replace the prior request without an empty intermediate state");
playResolvers.shift()(true);
playResolvers.shift()(true);
assert.deepEqual(await Promise.all([firstReplay, secondReplay]), [false, true]);
assert.deepEqual(Array.from(context.actions), ["restore:First request", "play:0:true", "restore:Second request", "play:0:true"],
  "a superseded replay must never reconcile over the most recent request");

console.log("saved playlist replay smoke test passed");
