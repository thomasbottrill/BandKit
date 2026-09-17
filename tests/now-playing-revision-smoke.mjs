import assert from "node:assert/strict";
import { nowPlayingQueueSignature } from "../src/shared/now-playing-session.js";

const queue = {
  playlistMode: "browse",
  playlistShuffleEnabled: false,
  playlistShuffleOrder: [],
  playlist: [
    { playlistItemId: "track-2", id: "2", title: "Two", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/two", bpm: null },
    { playlistItemId: "track-4", id: "4", title: "Four", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/four", bpm: null }
  ]
};
const analyzed = structuredClone(queue);
analyzed.playlist[0].bpm = 175.9;
analyzed.playlist[0].key = { shortName: "D min" };
assert.equal(nowPlayingQueueSignature(analyzed), nowPlayingQueueSignature(queue),
  "late BPM/key analysis must not turn an older queue into a newer queue revision");
const reordered = structuredClone(queue);
reordered.playlist.reverse();
assert.notEqual(nowPlayingQueueSignature(reordered), nowPlayingQueueSignature(queue),
  "track identity and order must continue to define queue revisions");

console.log("Now Playing revision identity checks passed.");
