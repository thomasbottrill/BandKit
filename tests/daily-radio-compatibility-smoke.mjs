import assert from "node:assert/strict";
import fs from "node:fs";
import { dailyPlayerQueue, parseDailyPlayerInfos } from "../src/content/daily-player-model.js";
import { radioShowTracklistKey } from "../src/content/radio-player-model.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const contentScripts = manifest.content_scripts.filter((entry) => entry.js?.some((file) => ["modern-pages-bootstrap.js", "page-media-bridge.js", "content.js"].includes(file)));
assert.equal(contentScripts.length, 3);
for (const script of contentScripts) {
  assert.ok(script.matches.includes("https://*.bandcamp.com/*"));
  assert.ok(!script.exclude_matches?.includes("https://daily.bandcamp.com/*"), "Daily must receive the complete Bandkit runtime and media bridge");
}

const playerInfos = parseDailyPlayerInfos(JSON.stringify([{
  player_id: "a123",
  featured_track_number: 2,
  title: "Daily Fixture Album",
  band_name: "Daily Fixture Artist",
  band_url: "https://fixture.bandcamp.com",
  tralbum_url: "https://fixture.bandcamp.com/album/daily-fixture",
  art_id: 12345,
  tracklist: [
    { track_id: 11, track_title: "First Daily Track", audio_track_duration: 120, audio_url: { "mp3-128": "https://t4.bcbits.com/stream/first/mp3-128/11" } },
    { track_id: 22, track_title: "Second Daily Track", artist: "Guest Artist", art_id: 67890, audio_track_duration: 180, audio_url: { "mp3-128": "https://t4.bcbits.com/stream/second/mp3-128/22" } }
  ]
}]));
assert.equal(playerInfos.length, 1);
const queue = dailyPlayerQueue(playerInfos[0]);
assert.deepEqual(queue.map((track) => track.title), ["First Daily Track", "Second Daily Track"]);
assert.equal(queue[1].artist, "Guest Artist");
assert.equal(queue[1].art, "https://f4.bcbits.com/img/a67890_5.jpg");
assert.equal(queue[1].pageUrl, "https://fixture.bandcamp.com/album/daily-fixture");
assert.equal(queue[1].url, "https://t4.bcbits.com/stream/second/mp3-128/22");
assert.deepEqual(parseDailyPlayerInfos("not-json"), []);

assert.equal(radioShowTracklistKey({ cardId: "show-987" }), "radio:987");
assert.equal(radioShowTracklistKey({ showHref: "/radio?show=992&from=radio_franchise" }), "radio:992");
assert.equal(radioShowTracklistKey({ showHref: "/radio/bandcamp-selects" }), "");

const liveScanning = fs.readFileSync(new URL("../src/content/runtime/live-scanning.js", import.meta.url), "utf8");
assert.match(liveScanning, /\.radio-card \.play-pause-button[\s\S]*?radioShowTracklistKey[\s\S]*?href\*='show='[\s\S]*?SEAMLESS_DISABLE[\s\S]*?scheduleModernHandoff\(requestedKey, null, 14\)/,
  "Radio show switching must wait for the clicked show's player key instead of handing the previous show back off");
assert.doesNotMatch(liveScanning, /radioControl\.click\(\)/,
  "Radio must preserve Bandcamp's trusted user click instead of replaying it asynchronously");
assert.match(liveScanning, /radioHandoffReady[\s\S]*?modern\?\.key === r\.\$radioHandoffKey[\s\S]*?radioHandoffKey = requestedKey/,
  "Radio's requested show must stay locked while Bandcamp replaces stale player state after a tab or card switch");
assert.doesNotMatch(liveScanning, /scheduleModernHandoff\(requestedKey, null\);\s*r\.\$scanLivePlayer\(\);/,
  "Radio must not immediately rescan stale native state and supersede the clicked show's handoff");
assert.match(liveScanning, /\.mplayer \.mpbutton, \.mplayer \.trtrack, article-playbutton icon/,
  "Daily's main, track-row, and article play controls must all route into Bandkit");

const dailyPlayback = fs.readFileSync(new URL("../src/content/runtime/daily-playback.js", import.meta.url), "utf8");
assert.match(dailyPlayback, /getDailyPlayerState[\s\S]*?data-player-infos[\s\S]*?featured_track_number/,
  "Daily playback must resolve its complete embedded queue and featured track");

const djHandoff = fs.readFileSync(new URL("../src/content/runtime/dj-handoff.js", import.meta.url), "utf8");
assert.match(djHandoff, /getDailyPlayerState\(control\)[\s\S]*?handoffPageAudio\(null, requestedTrack, daily\?\.queue\)/,
  "Daily controls must hand off the queue belonging to the clicked embed, not the first player on the page");
assert.match(djHandoff, /requestedPageQueue\(requestedQueue, r\.\$buildSeamlessQueue\)/,
  "Classic handoff must prefer the explicitly requested Daily queue");

console.log("Daily and Radio compatibility smoke test passed");
