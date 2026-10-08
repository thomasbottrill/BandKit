import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/content/runtime/feed-tracks.js", import.meta.url), "utf8");
const discoverSource = fs.readFileSync(new URL("../src/content/runtime/discover-tracks.js", import.meta.url), "utf8");
const playerUi = fs.readFileSync(new URL("../src/content/runtime/page-player-ui.js", import.meta.url), "utf8");
const pageActions = fs.readFileSync(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8");
const commerce = fs.readFileSync(new URL("../src/content/runtime/page-commerce-analysis.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../src/content/index.js", import.meta.url), "utf8");
const releaseCss = fs.readFileSync(new URL("../src/styles/modern/release.css", import.meta.url), "utf8");
const interactionsCss = fs.readFileSync(new URL("../src/styles/modern/tracklist-interactions.css", import.meta.url), "utf8");
const discoverCss = fs.readFileSync(new URL("../src/styles/modern/discover-tracks.css", import.meta.url), "utf8");
const feedCss = fs.readFileSync(new URL("../src/styles/modern/feed.css", import.meta.url), "utf8");

// The feed reuses the Discover list component and row styling rather than
// introducing a second track list design.
assert.match(discoverSource, /r\.\$createDiscoverTrackList = \(release\) => createTrackList\(r, release\)/,
  "Discover must expose its generated track list for the feed to reuse");
assert.match(discoverSource, /closest\("#DiscoverApp \.bandkit-discover-tracks \.track_row_view"\)/,
  "Discover's row click handler must stay scoped so feed rows handle their own playback");
assert.match(discoverSource, /closest\("#DiscoverApp \.bandkit-discover-tracks \.play-col a, \[data-bandkit-discover-select\]"\)/,
  "Discover's keyboard handler must stay scoped to its own rows");
assert.match(releaseCss, /:is\(#DiscoverApp, \.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracks/,
  "Shared track row visuals must cover feed album stories and collection previews");
assert.match(interactionsCss, /:is\(#DiscoverApp, \.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracks/,
  "Shared track number and play reveal rules must cover feed album stories and collection previews");
assert.match(discoverCss, /:is\(#DiscoverApp, \.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracklist/,
  "The compact list layout must cover feed album stories and collection previews");

// Feed album stories mount the list under the featured track and move the
// owners strip beneath it.
assert.match(source, /dataset\.itemtype \|\| story\.dataset\.tralbumtype/,
  "Feed stories must classify albums from Bandcamp's own item type");
assert.match(source, /only a real release URL can be expanded into a track list/,
  "Placeholder feed links must not be expanded into track lists");
assert.ok(source.includes("if (/\\/album\\/|\\/track\\//.test(url)) return { url };"),
  "Any hydrated release link must drive the card layout, including pre-orders");
assert.ok(source.includes('itemType === "t" || itemType === "track"'),
  "Unhydrated track purchases still keep the release card layout");
assert.match(source, /!release\.url \|\| story\.dataset\.bandkitFeedTracklistVisible !== "true"/,
  "Track purchase stories must expand the same generated list");
assert.match(source, /ensureToggle\(story, host, release\.tracks\.length > 1\)/,
  "Single-track releases must not offer a collapse control");
assert.match(source, /aria-label", \/\\\/album\\\/\/\.test\(release\.pageUrl \|\| ""\) \? "Album tracks" : "Track"/,
  "Track purchase stories must label their list as a track");
assert.match(feedCss, /\.story-innards \.tralbum-art-container \.play-button\s*\{\s*opacity:\s*0\s*!important;/,
  "The artwork play control must stay hidden at rest");
assert.match(feedCss, /\.story-innards \.tralbum-art-container:is\(:hover, :focus-within\) \.play-button\s*\{\s*opacity:\s*1\s*!important;/,
  "The artwork play control must reveal only when the artwork is hovered or keyboard-focused");
assert.doesNotMatch(feedCss, /\.story-innards:is\(:hover, :focus-within\) \.tralbum-art-container \.play-button/,
  "Hovering elsewhere on a feed card must not reveal its artwork play control");
assert.match(feedCss, /@media \(hover: none\) \{\s*[\s\S]*?\.story-innards \.tralbum-art-container \.play-button\s*\{\s*opacity:\s*1\s*!important;/,
  "Touch devices must keep the artwork play control visible");
assert.ok(pageActions.includes('getAttribute("href")?.trim()'),
  "An unhydrated feed release link must not resolve to the feed page itself");
assert.ok(pageActions.includes("pageUrl = /\\/album\\/|\\/track\\//.test(resolved)"),
  "Feed story actions must require a real release URL");
assert.match(source, /attributeFilter: \["href"\]/,
  "A late-hydrated release link must retrigger the expansion");
assert.match(source, /details\.append\(host\)/,
  "The track list must start directly under the featured track section");
assert.match(source, /story\.classList\.add\(FEED_ALBUM_CLASS\)/,
  "Album stories must be marked so the shared CSS and layout apply");
assert.match(source, /bandkit-feed-album-side/,
  "Album stories must gather the artwork and owners into one side column");
assert.match(source, /wrapper\.append\(side\)/,
  "The side column must follow the main column in the release grid");
assert.match(source, /if \(controls && controls\.parentElement !== details\) details\.append\(controls\);/,
  "The story's hover actions must move under the release name");
assert.match(source, /restoreLayout\(story\)/,
  "Stories that stop being albums must return to Bandcamp's own layout");
assert.match(source, /bandkit-feed-tracklist-toggle/,
  "Album stories must expose a collapse control");
assert.match(source, /--bandkit-tracklist-chevron[\s\S]*?icon-chevron\.svg/,
  "The collapse control must use the chevron icon");
assert.match(source, /classList\.toggle\("is-collapsed"\)/,
  "The collapse control must fold the generated list");
assert.match(source, /#story-list \.story-innards\.collection-item-container/,
  "Only real feed stories in the story list are expanded");
assert.match(source, /closest\(`\.\$\{FEED_ALBUM_CLASS\} \.bandkit-discover-tracks \.track_row_view`\)/,
  "Feed row clicks must be handled only for feed album lists");
assert.match(source, /closest\(`\.\$\{FEED_ALBUM_CLASS\} \.bandkit-discover-tracks \.play-col a`\)/,
  "Feed rows must support keyboard playback");
assert.match(source, /closest\("\.bandkit-discover-track-actions, \.bandkit-feed-track-analyze"\)/,
  "The per-track analyze control must not start playback when clicked");
assert.match(source, /MAX_CONCURRENT = 3/,
  "Feed album metadata must load with bounded concurrency");
assert.match(feedCss, /\.story-innards\.bandkit-feed-album \.tralbum-wrapper\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 280px;/s,
  "Album stories must keep the list in the main column and the artwork on the right");
assert.match(feedCss, /\.tralbum-wrapper > \.bandkit-feed-album-side\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
  "The artwork and owners must stack in the side column");
assert.match(feedCss, /\.tralbum-details > \.tralbum-wrapper-collect-controls\s*\{[^}]*margin:\s*0 0 14px\s*!important;/s,
  "The hover actions must sit under the release name in the main column");
assert.match(source, /art\.after\(favTrack\)/,
  "The featured track must move underneath the artwork");
assert.match(source, /narrowFeedLayout/,
  "The featured track must return to the details column when the grid collapses");
assert.match(source, /bandkit-feed-chevron-item/,
  "The chevron must join the story's icon row");
assert.match(source, /bandkit-feed-analyze-item/,
  "The analysis control must join the story's icon row");
assert.match(source, /row\.insertBefore\(item, chevronItem\)/,
  "The analysis control must sit with the icons, before the right-aligned chevron");
assert.match(feedCss, /\.bandkit-feed-chevron-item\s*\{[^}]*margin-left:\s*auto\s*!important;/s,
  "The chevron must stay right aligned in the icon row");
assert.match(feedCss, /\.bandkit-feed-action-row\s*\{[^}]*opacity:\s*1\s*!important;[^}]*pointer-events:\s*auto\s*!important;/s,
  "Album action icons must be always visible");
assert.match(feedCss, /\.bandkit-feed-action-row \[data-bandkit-label\] > \.bandkit-page-action-label\s*\{\s*display:\s*none\s*!important;/,
  "Album action icons must stay icon only");
assert.match(feedCss, /\.bandkit-feed-album-side > \.tralbum-wrapper-col2\s*\{[^}]*width:\s*auto\s*!important;/s,
  "The owners strip must match the artwork width");
assert.match(feedCss, /\.story-innards\.bandkit-feed-album \.tralbum-owners \.no-writing\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s,
  "Supporters must become a horizontal strip under the hover actions");
assert.match(feedCss, /\.bandkit-feed-tracklist-toggle\[aria-expanded="true"\]::before\s*\{\s*transform:\s*rotate\(180deg\);/,
  "The chevron must flip when the list is collapsed");
assert.match(discoverCss, /:is\(#DiscoverApp, \.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracklist\.is-collapsed \.bandkit-discover-tracks\s*\{\s*display:\s*none\s*!important;/,
  "Collapsing must hide the generated rows");
assert.match(feedCss, /\.story-innards\.bandkit-feed-album \.bandkit-discover-tracks :is\(tr, td\)\s*\{\s*border-top:\s*0\s*!important;\s*\}/,
  "Feed rows must not inherit Bandcamp's dotted top border");
assert.match(discoverCss, /--bandkit-release-row:\s*color-mix\(in srgb, var\(--bandkit-release-surface\) 94%, var\(--bandkit-release-ink\)\)/,
  "Track rows must derive their surface from the section colour");
assert.match(discoverCss, /--bandkit-release-divider:\s*var\(--bandkit-release-surface\)/,
  "Track dividers must use the section colour");
assert.match(discoverCss, /\.bandkit-discover-tracks \.track_row_view\s*\{[^}]*background:\s*var\(--bandkit-release-row\)\s*!important;[^}]*border-bottom-color:\s*var\(--bandkit-release-divider\)\s*!important;/s,
  "Track rows must paint the derived surface with section-coloured dividers");
assert.match(discoverCss, /\.bandkit-discover-tracks \.track_row_view:is\(:hover, :focus-within\)\s*\{\s*background:\s*color-mix\(in srgb, var\(--bandkit-release-accent\) 6%, var\(--bandkit-release-row\)\)\s*!important;/,
  "Row hover must tint the derived row surface");
assert.match(discoverCss, /\[data-bandkit-modern-page-type="feed"\]\[data-bandkit-page-theme="false"\][^{]*\.bandkit-discover-tracklist\s*\{[^}]*--bandkit-release-row:\s*#f7f7f7;[^}]*--bandkit-release-divider:\s*#ffffff;/s,
  "Dynamic feed track rows must use a fixed light surface that palette updates cannot darken");
assert.match(discoverCss, /\[data-bandkit-page-theme="false"\][^{]*:is\(#DiscoverApp, \.story-innards\.bandkit-feed-album, \.bandkit-collection-preview\) \.bandkit-discover-tracklist/s,
  "Dynamic feed overrides must retain the shared selector's ID-level specificity");
assert.match(discoverCss, /\[data-bandkit-page-theme="false"\][^{]*\.bandkit-discover-tracks \.track_row_view\s*\{[^}]*background:\s*#f7f7f7\s*!important;[^}]*border-bottom-color:\s*#ffffff\s*!important;/s,
  "Dynamic feed rows must directly paint the light surface after shared row styles");
assert.match(discoverCss, /\[data-bandkit-page-theme="false"\][^{]*\.track_row_view:is\(:hover, :focus-within\)\s*\{[^}]*var\(--bandkit-release-accent\) 6%, #f7f7f7/s,
  "Dynamic feed row hover must tint the fixed light surface");
assert.match(feedCss, /\.bandkit-feed-album \.bandkit-feed-action-row\s*\{[^}]*gap:\s*10px\s*!important;/s,
  "Album icon rows must keep a generous fixed gap");
assert.match(feedCss, /\.bandkit-feed-action-row > li\s*\{[^}]*gap:\s*10px\s*!important;/s,
  "Grouped icons must share the same fixed gap");
assert.match(feedCss, /\.bandkit-feed-action-row \[data-bandkit-label\]\s*\{[^}]*max-width:\s*28px\s*!important;[^}]*min-width:\s*28px\s*!important;[^}]*padding:\s*0\s*!important;[^}]*width:\s*28px\s*!important;/s,
  "Revealed icon buttons must stay square instead of widening");
assert.match(playerUi, /function syncFeedTracklistPlaybackUi\(r\)[\s\S]*?\.bandkit-feed-album \.bandkit-discover-tracklist/,
  "Feed rows must follow the shared player's playback state");
assert.match(playerUi, /feedTracklistActiveRows[\s\S]*?applyFeedRowPlaybackState/,
  "Feed row playback state must only touch the active rows");
assert.match(playerUi, /player\.closest\("\.bandkit-feed-album"\)\) continue/,
  "The page-wide player loop must leave feed rows to the feed sync");
assert.match(pageActions, /node\.closest\("\.bandkit-discover-tracks"\)\) continue;/,
  "Generated tracklist rows must be skipped before per-row page action work");
assert.match(source, /host\.dataset\.bandkitAnalysisUiSignature === signature\) continue;/,
  "Feed analysis labels must only re-render when their own analysis changes");
assert.match(source, /new IntersectionObserver\([\s\S]*?rootMargin: "1200px 0px"/,
  "Feed tracklists must only stay mounted near the viewport");
assert.match(source, /if \(!job\.host\.isConnected\) continue;/,
  "Queued tracklist loads for cards that scrolled away must be dropped");
assert.match(source, /jobs\.push\(\{ story, host, url, attempt: 1 \}\);/,
  "A transient release failure must requeue exactly once");
assert.match(source, /const frozen = scrollingFast\(\);/,
  "Feed lists must hold still while the reader flicks through the page");
assert.match(source, /if \(mounted >= MAX_MOUNTS_PER_SYNC\)/,
  "Mounted lists must be batched so one task never rebuilds the whole layout");
assert.match(source, /document\.addEventListener\("scroll", note, \{ capture: true, passive: true \}\)/,
  "Scroll velocity must be sampled without blocking the page");
assert.match(feedCss, /\.tralbum-owners \.no-writing\s*\{[^}]*margin:\s*0\s*!important;/s,
  "The supporters row must align with the side column");
assert.match(source, /if \(!ensureLayout\(story\)\) continue;[\s\S]*?if \(frozen\) continue;\s*if \(!release\.url \|\| story\.dataset\.bandkitFeedTracklistVisible !== "true"\)/,
  "Album cards must keep one layout even while their list is virtualised");
assert.match(source, /story\.dataset\.bandkitFeedTracklistVisible !== "true"\) \{[\s\S]*?existing\?\.remove\(\)/,
  "Distant stories must drop their generated list until they scroll back");
assert.match(pageActions, /\.story-innards \.tralbum-wrapper-collect-controls :is\(a, button\)/,
  "The feed action sweep must only scan story action rows");
assert.match(playerUi, /r\.\$syncFeedPagePlaybackUi\(\);\s*r\.\$syncFeedTracklistPlaybackUi\(\);/,
  "Feed row state must refresh whenever the page player synchronizes");
assert.match(pageActions, /querySelectorAll\("\.bandcamp-hub-page-playlist:not\(\.is-track-action\)"\)/,
  "Story action injection must not adopt or remove generated album row buttons");
assert.doesNotMatch(source, /\$maybeAnalyzePageTracks|\$analyzePageTracks\(/,
  "The feed must never start automatic BPM and key analysis");
assert.match(source, /MESSAGES\.ANALYZE_TRACKS/,
  "Album analysis must reuse the shared track analysis message");
assert.match(source, /bandkit-feed-analyze-tracks/,
  "Album stories must expose a manual analysis control");
assert.match(source, /icon-bpm\.svg/,
  "The analysis control must use the BPM icon");
assert.match(source, /syncFeedTrackAnalysisUi[\s\S]*?\$renderPageAnalysisLabel\(label, result, !result, track\)/,
  "Feed rows must reuse the shared analysis badges and per-track deep scan control");
assert.match(source, /r\.\$analyzeFeedTrack = async \(host, track\)/,
  "Single feed tracks must be analysable on their own");
assert.match(source, /bandkit-feed-track-analyze/,
  "Un-analysed rows must expose their own analyze control");
assert.match(feedCss, /\.title-col \.bandkit-feed-track-analyze\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s,
  "The per-track analyze control must sit in the analysis slot");
assert.match(feedCss, /\.bandkit-feed-track-analyze\s*\{[^}]*border-radius:\s*4px;[^}]*color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;[^}]*height:\s*24px;[^}]*width:\s*24px;/s,
  "The per-track analyze control must share the row Buy and Add control styling");
assert.match(feedCss, /\.track_row_view:is\(:hover, :focus-within\) \.bandkit-feed-track-analyze/,
  "The per-track analyze control must reveal on row intent");
assert.match(feedCss, /\.bandkit-feed-track-analyze\.is-analyzing::after\s*\{[^}]*border-top-color:\s*currentColor;/s,
  "The per-track analyze control must show the progress ring while running");
assert.match(commerce, /r\.\$syncFeedTrackAnalysisUi\?\.\(\);/,
  "Feed analysis labels must refresh with the shared analysis pass");
assert.match(commerce, /if \(row\.closest\("\.bandkit-feed-album"\)\) continue;/,
  "The page-wide analysis pass must leave feed rows to the feed runtime");
assert.match(commerce, /r\.\$feedAlbumTrackForSeamless\?\.\(runtimeSeamless\.track\)/,
  "The playing feed track must feed its analysis into its row");
assert.match(feedCss, /\.bandkit-feed-analyze-tracks\.is-analyzing::before\s*\{\s*display:\s*none\s*!important;/,
  "Analysis must not spin the BPM glyph");
assert.match(feedCss, /\.bandkit-feed-analyze-tracks\.is-analyzing::after\s*\{[^}]*animation:\s*bandkit-feed-analyze-spin[^}]*border:\s*2px solid[^}]*border-top-color:\s*currentColor;/s,
  "Analysis must show the shared progress ring spinner");
assert.match(feedCss, /\.bandkit-feed-tracklist-toggle\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*1px solid transparent\s*!important;/s,
  "The chevron must share the borderless action-button surface");
assert.match(feedCss, /\.bandkit-feed-tracklist-toggle:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*color-mix\([^}]*border-color:\s*transparent\s*!important;/s,
  "The chevron must fill on hover without an outline");
assert.match(feedCss, /\.bandkit-feed-album \.bandkit-feed-action-row \.wishlisted-msg > \.bandkit-feed-wishlist-control\s*\{[^}]*color:\s*#ff9c00\s*!important;/s,
  "Wishlisted feed rows must use the album page amber heart");
assert.match(feedCss, /\.wishlisted-msg > \.bandkit-feed-wishlist-control:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*color-mix\(in srgb, #ff9c00 10%/s,
  "Wishlisted feed hearts must back with amber on hover");
assert.match(playerUi, /body\.feed \.story-innards \.tralbum-wrapper-collect-controls \.bandkit-feed-action-row\{opacity:0/,
  "Non-album stories must still reveal their actions on hover");
assert.match(indexSource, /registerFeedTracks\(r\)/,
  "The feed track list runtime must be registered");
assert.match(indexSource, /setupFeedTracks\(r\)/,
  "The feed track list runtime must be initialized on feed pages");

// Playback must use the expanded album as the queue and ignore stale clicks.
const playback = { enabled: false, track: null, isPlaying: false };
const applied = [];
const pending = [];
const commands = [];
const toggles = [];
const toasts = [];
const feedRuntimeState = { dj: {} };
const playbackRuntime = {
  $playlistPlayRequest: 0,
  $feedHandoffRequest: 0,
  $pendingFeedTrackId: "",
  $feedHandoffTimer: 0,
  $pageTrackAnalysis: new Map(),
  $pageAnalysisTrackKey: (track) => `${track.id}\u0000${track.url}`,
  $PAGE_TRACK_ANALYSIS_CONCURRENCY: 2,
  $silenceNativePagePlayback() {},
  $restoreFeedAudioMute() {},
  $renderPlayer() {},
  $syncFeedTrackAnalysisUi() {},
  $prepareExternalNowPlaying(track, queue) {
    const request = ++this.$playlistPlayRequest;
    return new Promise((resolve) => pending.push(() => resolve({ request, queue, index: queue.indexOf(track) })));
  },
  async $runtimeMessage(message) {
    if (message.type === "analyze") {
      return { ok: true, results: message.tracks.map((track) => ({ id: track.id, url: track.url, bpm: 124, key: { shortName: "Am" } })) };
    }
    commands.push(message);
    return { ok: true, state: { track: message.queue[message.index] } };
  },
  async $seamlessCommand(message) { toggles.push(message); },
  $applySeamlessState(state) { applied.push(state.track.id); },
  $showToast(message) { toasts.push(message); }
};
const playbackContext = vm.createContext({
  MESSAGES: { SEAMLESS_ENABLE: "enable", SEAMLESS_PLAY_PAUSE: "toggle", ANALYZE_TRACKS: "analyze" },
  runtimeSeamless: playback,
  runtimeState: feedRuntimeState,
  clearTimeout() {}
});
vm.runInContext(source.slice(source.indexOf("export function registerFeedTracks"), source.indexOf("export function setupFeedTracks")).replace("export ", ""), playbackContext);
playbackContext.registerFeedTracks(playbackRuntime);
const host = {};
const tracks = [
  { id: "first", title: "First", url: "https://t4.bcbits.com/first" },
  { id: "second", title: "Second", url: "https://t4.bcbits.com/second" },
  { id: "third", title: "Third", url: "https://t4.bcbits.com/third" }
];
playbackRuntime.$feedAlbumQueues.set(host, tracks);
const firstPlay = playbackRuntime.$playFeedAlbumTrack(tracks[0], host);
assert.equal(playbackRuntime.$feedAlbumPendingTrack.id, "first", "The requested row shows its pending state before preparation resolves");
const secondPlay = playbackRuntime.$playFeedAlbumTrack(tracks[1], host);
assert.equal(playbackRuntime.$feedAlbumPendingTrack.id, "second", "A new row click immediately replaces the pending row");
pending[1](); await secondPlay;
pending[0](); await firstPlay;
assert.equal(playbackRuntime.$feedAlbumPendingTrack, null, "Settled requests release the pending row");
assert.deepEqual(applied, ["second"], "An earlier row request cannot overwrite a later click");
assert.equal(commands[0].index, 1, "The clicked track, not the featured track, is sent to playback");
assert.deepEqual(commands[0].queue, tracks, "The whole album becomes the playback queue");
playback.enabled = true;
playback.track = tracks[0];
await playbackRuntime.$playFeedAlbumTrack(tracks[0], host);
assert.deepEqual(toggles, ["toggle"], "Clicking the playing row toggles playback instead of restarting it");
assert.deepEqual(toasts, [], "Playback must not report errors");

// Album analysis is manual and scoped to the expanded album.
const analysisHost = { isConnected: true, dataset: {} };
playbackRuntime.$feedAlbumQueues.set(analysisHost, tracks);
await playbackRuntime.$analyzeFeedAlbumTracks(analysisHost);
assert.equal(analysisHost.dataset.bandkitAnalysisStatus, "ready", "Album analysis must settle into a ready state");
assert.equal(playbackRuntime.$pageTrackAnalysis.size, tracks.length, "Every track in the album receives a result");
assert.equal(playbackRuntime.$pageTrackAnalysis.get(playbackRuntime.$pageAnalysisTrackKey(tracks[1])).bpm, 124, "Results are keyed by the album's own tracks");
assert.match(toasts.at(-1), /Analyzed 3 of 3 tracks/, "Album analysis reports its completion");
feedRuntimeState.djToolsEnabled = false;
playbackRuntime.$pageTrackAnalysis.clear();
const disabledHost = { isConnected: true, dataset: {} };
playbackRuntime.$feedAlbumQueues.set(disabledHost, tracks);
await playbackRuntime.$analyzeFeedAlbumTracks(disabledHost);
assert.equal(playbackRuntime.$pageTrackAnalysis.size, 0, "Analysis must never start when DJ tools are disabled");
await playbackRuntime.$analyzeFeedTrack(disabledHost, tracks[0]);
assert.equal(playbackRuntime.$pageTrackAnalysis.size, 0, "Single-track analysis must respect the DJ tools setting");
feedRuntimeState.djToolsEnabled = true;

// A single row can be analysed without expanding the whole album.
playbackRuntime.$pageTrackAnalysis.clear();
const singleHost = { isConnected: true, dataset: {} };
playbackRuntime.$feedAlbumQueues.set(singleHost, tracks);
await playbackRuntime.$analyzeFeedTrack(singleHost, tracks[2]);
assert.equal(playbackRuntime.$feedTrackAnalysisPending.size, 0, "Single-track analysis must release its pending state");
assert.equal(playbackRuntime.$pageTrackAnalysis.size, 1, "Only the picked track is analysed");
assert.equal(playbackRuntime.$pageTrackAnalysis.get(playbackRuntime.$pageAnalysisTrackKey(tracks[2])).bpm, 124, "The picked track receives its result");

console.log("Feed album track lists keep the release name, always-visible icon row and Discover rows in the main column, with the artwork, featured track and supporters in the side column, and manual per-album or per-track analysis with a progress ring.");
