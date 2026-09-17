import assert from "node:assert/strict";
import {
  autocompleteResultMetadata,
  instantArtworkUrl,
  normalizeSearchText,
  scoreSearchMetadata,
  searchSimilarity,
  usefulJoinedAutocompleteResults
} from "../src/content/runtime/search-results.js";

assert.equal(normalizeSearchText("Trick Pony"), "trickpony");
assert.equal(normalizeSearchText("TRICK-PONY"), "trickpony");
assert.equal(normalizeSearchText("Beyoncé"), "beyonce");

const trickponyArtist = scoreSearchMetadata({
  title: "Pillow Talk", artist: "trickpony", tags: "trip hop", text: "Pillow Talk by trickpony", type: "a"
}, "Trick Pony");
const incidentalTitle = scoreSearchMetadata({
  title: "One Trick Pony", artist: "Alfred", tags: "", text: "One Trick Pony by Alfred", type: "a"
}, "Trick Pony");
assert.equal(trickponyArtist.reason, "Artist match");
assert.ok(trickponyArtist.score > incidentalTitle.score, "joined artist names must outrank longer incidental titles");

assert.equal(scoreSearchMetadata({
  title: "Drukqs", artist: "Aphex Twin", tags: "Electronic", text: "Drukqs by Aphex Twin", type: "a"
}, "Drukqs").reason, "Exact album match");
assert.equal(scoreSearchMetadata({
  title: "Aphex Twin", artist: "", tags: "Electronic", text: "Aphex Twin", type: "b"
}, "Aphex Twin").reason, "Exact artist match");
assert.ok(searchSimilarity("Aphex Twim", "Aphex Twin") > .8);

const instantResults = usefulJoinedAutocompleteResults([
  { type: "b", name: "Trigon", item_url_root: "https://trigon.bandcamp.com" },
  { type: "a", name: "Pillow Talk", band_name: "trickpony", item_url_path: "https://stepballchain.bandcamp.com/album/pillow-talk" },
  { type: "a", name: "24/7 Heaven", band_name: "trickpony", item_url_path: "https://stepballchain.bandcamp.com/album/24-7-heaven" }
], "Trig Pony");
assert.equal(instantResults[0].result.name, "Pillow Talk", "a near-exact joined artist must lead the header autocomplete results");
assert.equal(instantResults[1].result.name, "24/7 Heaven");
assert.deepEqual(autocompleteResultMetadata(instantResults[0].result), {
  title: "Pillow Talk", artist: "trickpony", tags: "", text: "Pillow Talk trickpony", type: "a"
});
assert.equal(
  instantArtworkUrl({ type: "a", img: "https://f4.bcbits.com/img/3730841408_3.jpg" }),
  "https://f4.bcbits.com/img/a3730841408_3.jpg",
  "album artwork returned by joined autocomplete must use Bandcamp's loadable artwork URL"
);
assert.equal(
  instantArtworkUrl({ type: "t", img: "https://f4.bcbits.com/img/3730841408_3.jpg" }),
  "https://f4.bcbits.com/img/a3730841408_3.jpg"
);
assert.equal(
  instantArtworkUrl({ type: "b", img: "https://f4.bcbits.com/img/2803373100_23.jpg" }),
  "https://f4.bcbits.com/img/2803373100_23.jpg",
  "artist avatars must retain their native profile-image URL"
);

console.log("Search ranking, joined-name normalization, and fuzzy matching checks passed.");
