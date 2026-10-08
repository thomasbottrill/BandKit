import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { resolveDiscoverRelease } from "../src/background/discover-release.js";
import { startPreparedPageTrack } from "../src/content/runtime/page-track-playback.js";

const originalFetch = globalThis.fetch;
let fetches = 0;
const metadata = {
  artist: "Fixture artist", current: { title: "Fixture album" },
  trackinfo: [
    { track_id: 101, title: "First", duration: 120, title_link: "/track/first", file: { "mp3-128": "https://t4.bcbits.com/stream/first" } },
    { track_id: 102, title: "Unavailable", duration: 180, title_link: "/track/unavailable", file: null },
    { track_id: 103, title: "Third", artist: "Guest artist", title_link: "/track/third", file: { "mp3-128": "https://t4.bcbits.com/stream/third" } }
  ]
};
globalThis.fetch = async () => {
  fetches++;
  return { ok: true, text: async () => `<script data-tralbum="${JSON.stringify(metadata).replaceAll('"', '&quot;')}"></script>` };
};
try {
  const [a, b] = await Promise.all([
    resolveDiscoverRelease("https://fixture.bandcamp.com/album/discover?from=discover"),
    resolveDiscoverRelease("https://fixture.bandcamp.com/album/discover")
  ]);
  assert.equal(fetches, 1, "Concurrent and repeated selection shares metadata requests");
  assert.deepEqual(a, b);
  assert.equal(a.tracks.length, 3, "Unavailable tracks stay in the displayed track list");
  assert.equal(a.tracks[1].url, "");
  assert.equal(a.tracks[2].artist, "Guest artist");
  assert.equal(a.tracks[0].pageUrl, "https://fixture.bandcamp.com/track/first");
  assert.equal(a.tracks[0].releaseUrl, "https://fixture.bandcamp.com/album/discover");
  await assert.rejects(resolveDiscoverRelease("https://example.com/album/test"));
  await assert.rejects(resolveDiscoverRelease("https://fixture.bandcamp.com/settings"));
  let attempts = 0;
  globalThis.fetch = async () => { attempts++; if (attempts === 1) throw new Error("Offline"); return { ok: true, text: async () => `<script data-tralbum='${JSON.stringify(metadata)}'></script>` }; };
  await assert.rejects(resolveDiscoverRelease("https://fixture.bandcamp.com/album/retry"));
  assert.equal((await resolveDiscoverRelease("https://fixture.bandcamp.com/album/retry")).tracks.length, 3, "Failures are retryable");
} finally { globalThis.fetch = originalFetch; }

// Exercise lazy selection and racing responses independently of Bandcamp's DOM.
const source = fs.readFileSync(new URL("../src/content/runtime/discover-tracks.js", import.meta.url), "utf8");
let focusedUrl = "https://fixture.bandcamp.com/album/a";
const elements = [];
class Element {
  constructor() { this.isConnected = true; this.attrs = {}; this.children = []; this.dataset = {}; }
  setAttribute(key, value) { this.attrs[key] = value; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  remove() { this.isConnected = false; }
  addEventListener() {}
}
const focused = { append() {}, querySelector: (selector) => selector === ".tralbum-purchase-options-browser" ? { append() {} } : { href: focusedUrl } };
const app = {};
const listeners = {};
const timers = [];
let mutation;
const requests = [];
const analyzed = [];
const r = {
  $pageTrackAnalysisRequest: 0,
  $runtimeMessage: (message) => new Promise((resolve) => requests.push({ message, resolve })),
  $isReusableStreamUrl: (url) => Boolean(url),
  $ensurePageStyles() {},
  $applyPageActionTheme() {},
  $maybeAnalyzePageTracks() { analyzed.push(r.$discoverReleaseTracks.map((track) => track.id)); },
  $syncPagePlayerUi() {}
};
const context = vm.createContext({
  URL, Date, Map, MESSAGES: { RESOLVE_DISCOVER_RELEASE: "resolve" },
  safeBandcampReleaseUrl: (url) => url || "",
  createElement: () => { const node = new Element(); elements.push(node); return node; },
  createTrackList: (release) => release,
  location: { hostname: "bandcamp.com", pathname: "/discover" },
  document: {
    querySelector: (selector) => selector === "#DiscoverApp" ? app : focused,
    querySelectorAll: () => [],
    addEventListener: (type, callback) => { listeners[type] = callback; }
  },
  window: { setTimeout: (callback) => timers.push(callback) },
  MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} }
});
vm.runInContext(source.slice(source.indexOf("function releaseUrl"), source.indexOf("export function registerDiscoverTracks"))
  + source.slice(source.indexOf("export function setupDiscoverTracks")).replace("export ", ""), context);
context.setupDiscoverTracks(r);
const flush = async () => { while (timers.length) timers.shift()(); await Promise.resolve(); await Promise.resolve(); };
await flush();
assert.equal(requests.length, 1, "The initially displayed album loads without an artwork click");
assert.equal(requests[0].message.pageUrl, focusedUrl);
mutation([{ type: "childList", target: {} }]); await flush();
assert.equal(requests.length, 1, "Hover and unrelated DOM changes do not duplicate the initial request");
function select(url) {
  focusedUrl = url;
  const art = { closest: () => ({ querySelector: () => ({ href: url }) }) };
  listeners.click({ target: { closest: (selector) => selector === ".results-grid-item .image-container" ? art : null } });
}
const release = (id) => ({ ok: true, release: { album: id, tracks: [{ id, url: "stream" }, { id: "locked", url: "" }] } });
select(focusedUrl); await flush();
assert.equal(requests.length, 1);
select("https://fixture.bandcamp.com/album/b"); await flush();
assert.equal(requests.length, 2);
requests[0].resolve(release("a")); await flush();
assert.equal(analyzed.length, 0, "An old response cannot analyze or render over the selected album");
requests[1].resolve(release("b")); await flush();
assert.deepEqual(analyzed, [["b"]], "Only streamable tracks from the clicked album enter automatic analysis");
assert.equal(elements.filter((node) => node.isConnected && node.attrs["aria-label"] === "Album tracks").length, 1);
select("https://fixture.bandcamp.com/album/a"); await flush();
assert.equal(requests.length, 2, "Returning to an album reuses cached metadata");
assert.deepEqual(analyzed.at(-1), ["a"]);
console.log("Discover tracks: lazy loading, caching, unavailable tracks, retries and stale-response checks passed.");

// The artwork play button must load a newly selected album even while native
// right-panel links still describe the previous album.
const playArt = { closest: () => ({ querySelector: () => ({ href: "https://fixture.bandcamp.com/album/play-button" }) }) };
listeners.click({ target: { closest: (selector) => {
  if (selector === ".results-grid-item .image-container") return playArt;
  if (selector === ".play-pause-button, .play-button" || selector === "button, a") return {};
  return null;
} } });
await flush();
assert.equal(requests.at(-1).message.pageUrl, "https://fixture.bandcamp.com/album/play-button");
assert.equal(requests.length, 3, "Native artwork play also loads the track list despite stale native links");
requests.at(-1).resolve(release("play-button")); await flush();
assert.deepEqual(analyzed.at(-1), ["play-button"]);

const playback = { enabled: false };
const applied = [];
const pending = [];
const commands = [];
const playbackRuntime = {
  $playlistPlayRequest: 0,
  $silenceNativePagePlayback() {},
  $prepareExternalNowPlaying(track, queue) {
    assert.equal(this.$discoverTrackPlaybackActive, true, "Claim playback before any asynchronous preparation");
    const request = ++this.$playlistPlayRequest;
    return new Promise((resolve) => pending.push(() => resolve({ request, queue, index: queue.indexOf(track) })));
  },
  async $runtimeMessage(message) { commands.push(message); return { ok: true, state: { track: message.queue[message.index] } }; },
  $applySeamlessState(state) { applied.push(state.track.id); },
  $showToast(message) { assert.fail(message); }
};
const playContext = vm.createContext({ startPreparedPageTrack, MESSAGES: { SEAMLESS_ENABLE: "enable" }, runtimeSeamless: playback, runtimeState: { dj: {} } });
vm.runInContext(source.slice(source.indexOf("export function registerDiscoverTracks"), source.indexOf("function createTrackList")).replace("export ", ""), playContext);
playContext.registerDiscoverTracks(playbackRuntime);
playbackRuntime.$discoverReleaseTracks = [{ id: "first" }, { id: "second" }, { id: "third" }];
const firstPlay = playbackRuntime.$playDiscoverReleaseTrack(playbackRuntime.$discoverReleaseTracks[0]);
assert.equal(playbackRuntime.$discoverPendingTrack.id, "first", "The requested title and loading state are available before preparation resolves");
const secondPlay = playbackRuntime.$playDiscoverReleaseTrack(playbackRuntime.$discoverReleaseTracks[1]);
assert.equal(playbackRuntime.$discoverPendingTrack.id, "second", "A new click immediately replaces the pending presentation");
pending[1](); await secondPlay;
pending[0](); await firstPlay;
assert.equal(playbackRuntime.$discoverPendingTrack, null, "Settled requests release the pending indicator");
assert.deepEqual(applied, ["second"], "An earlier track request cannot overwrite a later click");
assert.equal(commands[0].index, 1, "The requested track, not the first track, is sent to playback");
console.log("Discover native-play selection and competing playback request checks passed.");

// Native preview audio can already be playing while persistence waits. Its
// metadata and loading state must be rendered before that asynchronous work.
const handoffSource = fs.readFileSync(new URL("../src/content/runtime/player-handoffs.js", import.meta.url), "utf8");
const handoffBody = handoffSource.slice(handoffSource.indexOf("r.$handoffDiscoverPlayer ="), handoffSource.indexOf("\n}\n\nfunction registerPlayerHandoffs3"));
let finishPreparation;
const nativeTrack = { id: "native", title: "Already audible", url: "https://t4.bcbits.com/native" };
const handoffRenders = [];
const handoffRuntime = {
  $getDiscoverPlayerState: () => ({ track: nativeTrack }),
  $isReusableStreamUrl: () => true,
  $playlistTrackKey: (track) => track.id,
  $renderPlayer() { handoffRenders.push(this.$discoverPendingTrack); },
  $prepareExternalNowPlaying: () => new Promise((resolve) => { finishPreparation = resolve; })
};
vm.runInNewContext(handoffBody, { r: handoffRuntime, runtimeState: { dj: {} }, MESSAGES: {}, window: { setTimeout() {} } });
const handoff = handoffRuntime.$handoffDiscoverPlayer();
assert.equal(handoffRenders[0], nativeTrack, "Native title and loading indicator render before queue preparation settles");
finishPreparation({ index: -1 });
await handoff;
assert.equal(handoffRuntime.$discoverPendingTrack, null, "Unsuccessful handoff releases its loading state");
console.log("Discover native handoff displays track metadata before async preparation.");

// Pausing audible native audio must cancel queue preparation before touching the
// page control, whether the pause comes from the music bar or the matching row.
const pauseContext = vm.createContext({ window: { setTimeout() {} } });
const pauseRuntime = {
  $playlistPlayRequest: 7,
  $discoverPendingTrack: nativeTrack,
  $getDiscoverPlayerState: () => ({ track: nativeTrack, control: {
    getAttribute: () => "Pause",
    click() { assert.equal(pauseRuntime.$playlistPlayRequest, 8); }
  } }),
  $matchingPagePlaybackTrack: (queue, track) => queue.find((item) => item.id === track.id)
};
pauseContext.r = pauseRuntime;
vm.runInContext(handoffSource.slice(handoffSource.indexOf('function pauseNativeDiscover('), handoffSource.indexOf('function registerPlayerHandoffs2')), pauseContext);
vm.runInContext(handoffSource.slice(handoffSource.indexOf('r.$pauseNativeDiscover ='), handoffSource.indexOf('r.$handoffDiscoverPlayer =')), pauseContext);
assert.equal(pauseRuntime.$pauseNativeDiscover({ id: 'another-track' }), false);
assert.equal(pauseRuntime.$playlistPlayRequest, 7);
assert.equal(pauseRuntime.$pauseNativeDiscover(nativeTrack), true);
assert.equal(pauseRuntime.$discoverPendingTrack, null);
console.log('Discover native pause cancels pending handoff and targets the playing row.');

// A different album can become native-current while the background enable
// response is in flight. The old response must never pause that newer preview.
let activeNative = nativeTrack;
let finishEnable;
let nativePauses = 0;
let staleApplies = 0;
const racingRuntime = {
  $playlistPlayRequest: 1,
  $getDiscoverPlayerState: () => ({ track: activeNative, isPlaying: true }),
  $isReusableStreamUrl: () => true,
  $playlistTrackKey: (track) => track.id,
  $prepareExternalNowPlaying: async () => ({ index: 0, request: 1, queue: [nativeTrack] }),
  $runtimeMessage: () => new Promise(resolve => { finishEnable = resolve; }),
  $pageMediaCommand: () => { nativePauses++; },
  $applySeamlessState: () => { staleApplies++; }
};
vm.runInNewContext(handoffBody, { r: racingRuntime, runtimeState: { dj: {} }, MESSAGES: {}, window: { setTimeout() {} } });
const racingHandoff = racingRuntime.$handoffDiscoverPlayer();
await new Promise(resolve => setImmediate(resolve));
activeNative = { ...nativeTrack, id: 'newer-album' };
finishEnable({ ok: true, state: {} });
assert.equal(await racingHandoff, false);
assert.equal(nativePauses, 0, 'Late completion must leave the newer native preview playing');
assert.equal(staleApplies, 0, 'Late completion must not replace the newer player presentation');
assert.equal(racingRuntime.$discoverHandoffBusy, false);
console.log('Discover rapid album switching rejects stale handoff completion.');

// Discover rows carry the album page's own per-track controls, and the focused
// release's control covers the whole release rather than its featured track.
const listContext = vm.createContext({
  document: { createElement: () => new Element() },
  formatDuration: (value) => String(value || 0),
  createElement: (tag, className, text) => {
    const node = new Element();
    node.className = className || "";
    node.textContent = text || "";
    return node;
  }
});
vm.runInContext(source.slice(source.indexOf("function createTrackList"), source.indexOf("export function setupDiscoverTracks")), listContext);
const listAdds = [];
const listRuntime = {
  $createPagePlaylistButton() {
    const button = new Element();
    button.className = "bandcamp-hub-page-playlist";
    button.classList = { add: (name) => { button.className += ` ${name}`; } };
    listAdds.push(button);
    return button;
  },
  $updatePagePlaylistButton(button, track) { button._bandkitTrack = track; }
};
const listed = listContext.createTrackList(listRuntime, {
  album: "Fixture album",
  tracks: [
    { id: "one", number: 1, title: "First", duration: 120, url: "stream", pageUrl: "https://fixture.bandcamp.com/track/first" },
    { id: "two", number: 2, title: "Locked", duration: 90, url: "", pageUrl: "https://fixture.bandcamp.com/track/locked" }
  ]
});
assert.ok(listed, "The generated table is returned for rendering");
assert.equal(listAdds.length, 2, "Every Discover row, playable or not, gets its own Add control");
assert.ok(listAdds.every((button) => button.className.includes("is-track-action")),
  "Discover row Add controls reuse the album page's track action styling");
assert.deepEqual(listAdds.map((button) => button._bandkitTrack.id), ["one", "two"],
  "Each row's Add control carries that row's own track");

const pageActions = fs.readFileSync(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8");
assert.match(pageActions, /applyDiscoverReleaseAddButton\(button, fallbackTrack\) \{[\s\S]*?const releaseTracks = r\.\$discoverRelease\?\.tracks \|\| \[\];[\s\S]*?button\._bandkitRelease = releaseTracks\.length > 0;[\s\S]*?button\._bandkitTracks = releaseTracks\.length \? releaseTracks : null;/,
  "the focused Discover release's Add control must offer the whole release, not its featured track");
assert.match(pageActions, /syncDiscoverReleaseAddControl\(fallbackTrack\) \{[\s\S]*?const releaseActions = document\.querySelector\("\.focused-result \.release-buttons, \.discover-detail \.release-buttons"\);[\s\S]*?button = r\.\$createPagePlaylistButton\(\);/,
  "the release Add control must sit beside Buy and Wishlist whenever a release is open");
assert.match(pageActions, /button\._bandkitRelease = false;\s*button\._bandkitTracks = null;[\s\S]*?button\._bandkitReleaseTrack = cardTrack;[\s\S]*?r\.\$updatePagePlaylistButton\(button, cardTrack\);\s*button\.setAttribute\("aria-label", `Add \$\{cardTrack\.title\}/,
  "the Discover grid cards must keep their single featured track until a click resolves the release");
assert.match(source, /r\.\$discoverRelease = release;/,
  "the resolved release must be published for the release-level Add control");
assert.match(source, /if \(event\.target\.closest\("\.bandkit-discover-track-actions"\)\) return;/,
  "row playback must ignore clicks on the row's own Buy and Add controls");
assert.match(source, /const refreshReleaseActions = \(\) => \{\s*r\.\$syncDiscoverReleaseAddControl\?\.\(\);\s*for \(const delay of \[0, 80, 240\]\)/,
  "the resolved release must sync its Add control directly, not wait for a sweep to land after Discover's rebuild");
console.log("Discover per-track Add controls and release-wide Add selection checks passed.");
