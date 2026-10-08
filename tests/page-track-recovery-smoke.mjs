import assert from "node:assert/strict";
import { startPreparedPageTrack } from "../src/content/runtime/page-track-playback.js";
import { startMediaPlayback } from "../src/offscreen/progressive.js";
import { MESSAGES } from "../src/shared/contracts.js";

const track = { id: "42", title: "Selected", pageUrl: "https://artist.bandcamp.com/track/selected", url: "https://t4.bcbits.com/expired" };
const next = { ...track, id: "43", title: "Next" };
const prepared = { queue: [track, next], index: 0, request: 1 };
const fresh = { ...track, url: "https://t4.bcbits.com/fresh" };
const playing = { status: "playing", track: fresh };
const failure = { ok: true, state: { status: "error", error: "Expired stream" } };
function runtime(respond) {
  const messages = [];
  const r = {
    $playlistPlayRequest: 1,
    $isReusableStreamUrl: (url) => Boolean(url?.startsWith("https://t4.bcbits.com/")),
    $runtimeMessage: async (message) => { messages.push(message); return respond(message, messages.length, r); }
  };
  return { r, messages };
}

const recovery = runtime((message, count) => count === 1 ? failure
  : message.type === MESSAGES.RESOLVE_PLAYLIST_ITEMS ? { ok: true, items: [fresh] }
    : { ok: true, state: playing });
assert.equal(await startPreparedPageTrack(recovery.r, prepared, { rate: 1.2 }), playing);
assert.equal(recovery.messages[1].items[0].url, "", "refresh must not retain a failed URL as an offline fallback");
assert.equal(recovery.messages[2].queue[0].url, fresh.url);
assert.equal(recovery.messages[2].queue[1], next, "retry preserves the rest of the queue");
assert.equal(recovery.messages[2].rate, 1.2);

const superseded = runtime((_message, _count, r) => {
  r.$playlistPlayRequest += 1;
  return failure;
});
assert.equal(await startPreparedPageTrack(superseded.r, prepared, {}), null);
assert.equal(superseded.messages.length, 1, "old failures must not retry after another track is chosen");

const supersededRefresh = runtime((message, _count, r) => {
  if (message.type === MESSAGES.RESOLVE_PLAYLIST_ITEMS) {
    r.$playlistPlayRequest += 1;
    return { ok: true, items: [fresh] };
  }
  return failure;
});
assert.equal(await startPreparedPageTrack(supersededRefresh.r, prepared, {}), null);
assert.equal(supersededRefresh.messages.length, 2, "a late refresh cannot restart the old selection");

const broken = runtime((message) => message.type === MESSAGES.RESOLVE_PLAYLIST_ITEMS ? { ok: true, items: [fresh] } : failure);
await assert.rejects(startPreparedPageTrack(broken.r, prepared, {}), /Expired stream/);
assert.equal(broken.messages.length, 3, "permanently broken streams get only one retry");

globalThis.window = globalThis;
await startMediaPlayback({ play: () => Promise.resolve() }, 10);
await assert.rejects(startMediaPlayback({ play: () => new Promise(() => {}) }, 10), /too long/);
await assert.rejects(startMediaPlayback({ play: () => Promise.reject(new Error("Media failed")) }, 10), /Media failed/);
console.log("Page playback recovery: failed starts refresh once, new selections win, hung playback times out.");
