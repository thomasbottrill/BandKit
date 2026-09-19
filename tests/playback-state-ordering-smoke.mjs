import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stalePlaybackState } from "../src/content/runtime/dj-playback.js";

const [offscreen, playback, shell] = await Promise.all([
  readFile(new URL("../src/offscreen/index.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/dj-playback.js", import.meta.url), "utf8"),
  Promise.all(["runtime-shell.js", "runtime-dom-shell.js"].map((file) => (
    readFile(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n"))
]);

assert.match(offscreen, /const playbackSessionStartedAt = Date\.now\(\);[\s\S]*?let playbackStateRevision = 0;/,
  "the offscreen player must identify each playback session and order its snapshots");
assert.match(offscreen, /sessionStartedAt:\s*playbackSessionStartedAt,[\s\S]*?revision:\s*\+\+playbackStateRevision,/,
  "every offscreen state snapshot must carry a monotonically increasing revision");
assert.match(playback, /function stalePlaybackState[\s\S]*?sessionStartedAt < r\.\$playbackSessionStartedAt[\s\S]*?revision <= r\.\$playbackStateRevision[\s\S]*?\)\) return true;/,
  "tabs must reject snapshots from older player sessions and revisions");
assert.match(playback, /function runSeamlessStateSync[\s\S]*?if \(r\.\$seamlessSyncPromise\) return r\.\$seamlessSyncPromise;[\s\S]*?\.finally\([\s\S]*?r\.\$seamlessSyncPromise = null/,
  "periodic playback reconciliation must remain single-flight");
assert.match(shell, /r\.\$playbackSessionStartedAt = 0;[\s\S]*?r\.\$playbackStateRevision = 0;/,
  "each tab must initialize its playback ordering cursor");

const cursor = { $playbackSessionStartedAt: 0, $playbackStateRevision: 0 };
assert.equal(stalePlaybackState(cursor, { sessionStartedAt: 100, revision: 12, track: { id: "current" }, currentTime: 120 }), false);
assert.equal(stalePlaybackState(cursor, { sessionStartedAt: 100, revision: 10, track: { id: "previous" }, currentTime: 90 }), true,
  "a delayed previous-track snapshot must not replace the current post-seek display");
assert.equal(stalePlaybackState(cursor, { sessionStartedAt: 100, revision: 11, track: { id: "current" }, currentTime: 0 }), true,
  "a delayed pre-seek snapshot must not pull the displayed playhead back to the start");
assert.equal(stalePlaybackState(cursor, { sessionStartedAt: 100, revision: 13, track: { id: "current" }, currentTime: 123 }), false,
  "the next current post-seek snapshot must still be accepted");
assert.deepEqual(cursor, { $playbackSessionStartedAt: 100, $playbackStateRevision: 13 });

console.log("Playback state ordering checks passed.");
