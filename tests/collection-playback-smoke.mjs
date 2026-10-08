import assert from "node:assert/strict";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();

// Collection and wishlist cards carry no stream URL, so the first play has to
// read the release page before anything can start. Reading it on hover keeps
// the click immediate, and the resolved URL is reused for the session.
assert.match(source, /function prefetchCollectionStream\(track\)[\s\S]*?RESOLVE_PLAYLIST_ITEMS[\s\S]*?collectionStreams\.set\(key, \{ url, at: Date\.now\(\) \}\)/,
  "hovering a collection card must resolve its stream ahead of the click");
assert.match(source, /function collectionStreamUrl\(track\)[\s\S]*?Date\.now\(\) - cached\.at < COLLECTION_STREAM_TTL_MS/,
  "a cached collection stream must expire rather than serve a stale URL");
assert.match(source, /function playCollectionCard\(card, control\)[\s\S]*?const knownStream = collectionStreamUrl\(track\)[\s\S]*?trustProvidedStreams: Boolean\(knownStream\)/,
  "pressing play must reuse the prefetched stream instead of re-reading the release page");
assert.match(source, /function playCollectionCard[\s\S]*?cacheCollectionStream\(track, prepared\.queue\[prepared\.index\]\)/,
  "a hydrated stream must be cached for the next play of that card");
assert.match(source, /function injectCollectionItemActions[\s\S]*?dataset\.bandkitStreamPrefetch[\s\S]*?prefetchCollectionStream\(collectionTrackFromCard\(card\)\)[\s\S]*?focusin/,
  "collection and wishlist cards must prefetch their stream on hover and focus");
assert.match(source, /collectionStreams = new Map\(\)[\s\S]*?collectionStreamRequests = new Map\(\)/,
  "collection stream caches must exist for the page session");
assert.match(source, /collectionStreamRequests\.delete\(key\)/,
  "a failed prefetch must not block a later retry");

console.log("Collection and wishlist playback: hover prefetch, stream reuse and expiry checks passed.");
