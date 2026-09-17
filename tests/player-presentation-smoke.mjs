import assert from "node:assert/strict";
import { resolvePlayerPresentation } from "../src/content/player-presentation.js";

const first = { title: "First", duration: 180 };
let result = resolvePlayerPresentation(null, {}, false, false);
assert.equal(result.track, null, "A fresh empty player stays empty");
result = resolvePlayerPresentation(null, first, true, false);
assert.deepEqual(result.track, first);
assert.notEqual(result.track, first, "Presentation is independent of live snapshot mutation");
for (let i = 0; i < 100; i++) {
  result = resolvePlayerPresentation(result.track, {}, false, false);
  assert.equal(result.track.title, "First", "Missing snapshots never expire selected track presentation");
  assert.equal(result.retained, true);
}
result = resolvePlayerPresentation(result.track, { title: "Second" }, true, false);
assert.equal(result.track.title, "Second");
assert.equal(result.retained, false);
result = resolvePlayerPresentation(result.track, first, true, true);
assert.equal(result.track, null, "Explicit clear wins over stale playback metadata");
assert.equal(resolvePlayerPresentation(result.track, {}, false, false).track, null);
console.log("Player presentation: initial empty, long handoffs, replacement and explicit clear passed");
