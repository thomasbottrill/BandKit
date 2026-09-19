import assert from "node:assert/strict";
import { resolvedCartItemPageUrl } from "../src/content/core.js";

const albumTrack = {
  title: "Black Cat",
  pageUrl: "https://ladytron.bandcamp.com/track/black-cat-2",
  releaseUrl: "https://ladytron.bandcamp.com/album/velocifero"
};
globalThis.location = { href: albumTrack.releaseUrl };

assert.equal(resolvedCartItemPageUrl(albumTrack, "t"), albumTrack.pageUrl);
assert.equal(resolvedCartItemPageUrl(albumTrack, "a"), albumTrack.releaseUrl);
assert.equal(resolvedCartItemPageUrl({ pageUrl: albumTrack.releaseUrl }, "a"), albumTrack.releaseUrl);
assert.equal(resolvedCartItemPageUrl({ pageUrl: albumTrack.pageUrl }, "a"), "");

console.log("Release cart URL resolution keeps album and track purchases distinct.");
