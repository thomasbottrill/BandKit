import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();

function extractFunction(name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find ${name} in content.js`);
  const start = match.index;
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}`);
}

const context = vm.createContext({ URL });
vm.runInContext([
  extractFunction("safeBandcampUrl"),
  extractFunction("safeBandcampReleaseUrl"),
  extractFunction("portableBandcampUrl"),
  extractFunction("portablePlaylistItem"),
  extractFunction("portableCartRestore"),
  extractFunction("portableCartItem"),
  "globalThis.portablePlaylist = portablePlaylistItem;",
  "globalThis.portableCart = portableCartItem;"
].join("\n"), context);

const playlist = context.portablePlaylist({
  id: "track-1",
  title: "Fixture Track",
  pageUrl: "https://artist.bandcamp.com/track/fixture-track?from=fan#lyrics",
  url: "https://t4.bcbits.com/stream/private-expiring-url",
  restoreError: "old failure"
});
assert.equal(playlist.url, undefined, "playlist exports must not expose direct stream URLs");
assert.equal(playlist.restoreError, undefined, "playlist exports must not expose internal errors");
assert.equal(playlist.pageUrl, "https://artist.bandcamp.com/track/fixture-track");

const cartSource = {
  id: "cart-1",
  title: "Fixture Album",
  artist: "Fixture Artist",
  price: 9,
  currency: "AUD",
  url: "https://artist.bandcamp.com/album/fixture-album",
  restore: {
    item_type: "a",
    item_id: 101,
    band_id: 202,
    unit_price: 9,
    currency: "AUD",
    quantity: 1,
    url: "https://artist.bandcamp.com/album/fixture-album",
    purchase_note: "private gift note",
    notify_me: true,
    local_id: "internal-cart-id",
    releases: [{ title: "internal release payload" }]
  }
};
const privateBackup = context.portableCart(cartSource);
assert.equal(privateBackup.restore.item_id, 101);
assert.equal(privateBackup.restore.purchase_note, undefined);
assert.equal(privateBackup.restore.notify_me, undefined);
assert.equal(privateBackup.restore.local_id, undefined);
assert.equal(privateBackup.restore.releases, undefined);

const publicShare = context.portableCart(cartSource, { includeRestore: false });
assert.equal(publicShare.restore, undefined, "shared cart documents must not contain restoration metadata");

assert.match(source, /createCartDocument\(items, cartName, summary, \{ includeRestore: false \}\)/);
assert.match(source, /embeddedPayload: includeRestore \? serializedPayload : ""/);
assert.doesNotMatch(source.match(/const cartFields = \[[\s\S]*?\];/)?.[0] || "", /purchase_note|notify_me/);

console.log("data export minimization smoke test passed");
