import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readContentSource, readModernStyles } from "./support/source.mjs";

const [source, state, contracts, background, offscreen, releaseCss, hubCss] = await Promise.all([
  Promise.resolve(readContentSource()),
  readFile(new URL("../src/content/state.js", import.meta.url), "utf8"),
  readFile(new URL("../src/shared/contracts.js", import.meta.url), "utf8"),
  readFile(new URL("../src/background/index.js", import.meta.url), "utf8"),
  Promise.all(["progressive.js", "analysis.js", "utils.js", "state.js", "events.js", "index.js"]
    .map((filename) => readFile(new URL(`../src/offscreen/${filename}`, import.meta.url), "utf8"))).then((parts) => parts.join("\n")),
  Promise.resolve(readModernStyles()),
  readFile(new URL("../src/styles/hub/settings.css", import.meta.url), "utf8")
]);

assert.match(state, /autoAnalyzeTracks:\s*true/, "page track analysis must default to automatic");
assert.match(state, /showTrackKeys:\s*true/, "musical keys must remain visible by default");
assert.match(state, /pageActionLabels:\s*false/, "page icon labels must default to compact/off");
assert.match(contracts, /ANALYZE_TRACKS:\s*"BANDCAMP_HUB_ANALYZE_TRACKS"/);
assert.match(background, /message\.type === MESSAGES\.ANALYZE_TRACKS[\s\S]*?OFFSCREEN_ANALYZE_TRACKS/,
  "the background must sanitize and forward page analysis requests");
assert.match(offscreen, /async function analyzeTrack\(track, force = false\)[\s\S]*?estimateBpm[\s\S]*?estimateKey/,
  "batch analysis must calculate both BPM and musical key");
assert.match(offscreen, /sampleBytes\s*=\s*524_288[\s\S]*?fallbackBytes\s*=\s*1_048_576[\s\S]*?Range:\s*`bytes=0-\$\{requestedBytes - 1\}`/,
  "page analysis must retain its full analysis window and larger decode fallback");
assert.match(offscreen, /downloaded\.byteLength > requestedBytes \? downloaded\.slice\(0, requestedBytes\)[\s\S]*?downloaded\.byteLength > requestedBytes/,
  "page analysis must bound cached full HTTP responses to the same deterministic sample as range responses");
assert.match(offscreen, /TRACK_ANALYSIS_CONCURRENCY\s*=\s*3[\s\S]*?Math\.min\(TRACK_ANALYSIS_CONCURRENCY, source\.length\)/,
  "page analysis must keep a fast but playback-friendly three-track worker pool");
assert.match(source, /PAGE_TRACK_ANALYSIS_CONCURRENCY\s*=\s*3[\s\S]*?Math\.min\(PAGE_TRACK_ANALYSIS_CONCURRENCY, tracks\.length\)[\s\S]*?Array\.from\(\{ length: concurrency \}, worker\)/,
  "page analysis must progressively coordinate three track workers");
assert.match(offscreen, /function prioritizePlayback\(\)[\s\S]*?controller\.abort\(\)[\s\S]*?status === "loading"[\s\S]*?PLAYBACK_PRIORITY/,
  "playback must preempt in-flight page analysis and let it resume after the stream starts");
assert.match(offscreen, /function interruptedPlay[\s\S]*?async function playForMediaRequest[\s\S]*?attempt < 3[\s\S]*?async function seekToTime[\s\S]*?playForMediaRequest/,
  "rapid startup seeks must retry interrupted play promises without exposing Chrome's raw play() error");
assert.match(offscreen, /async function loadTrack[\s\S]*?audio\.src = track\.url[\s\S]*?audio\.load\(\)[\s\S]*?playForMediaRequest/,
  "track switches must use Chromium's single-request native media loader");
assert.doesNotMatch(offscreen, /async function loadTrack[\s\S]*?startProgressiveMp3Stream/,
  "track switches must not retry the same Bandcamp stream through MediaSource");
assert.match(offscreen, /compensatedHandoffTime\(currentTime, handoffStartedAt, autoplayRequested\)/,
  "native-to-offscreen handoffs must compensate for startup time without replaying audio");
assert.match(offscreen, /audio\.crossOrigin = "anonymous"/,
  "remote Bandcamp seek streams must stay audible through the Web Audio graph");
assert.match(source, /function syncFeedPagePlaybackUi\(\)[\s\S]*?data-bandkit-feed-playback[\s\S]*?seamless\.isPlaying \? "playing" : "paused"/,
  "feed artwork controls must retain the remote Bandkit playback state after native audio handoff");
assert.match(source, /const collectionControl = event\.target\.closest\('[^']*#wishlist-items \.collection-grid\[data-iswish="true"\][^']*\.track_play_auxiliary'\)/,
  "wishlist artwork controls must use the reliable collection playback handoff");
assert.match(source, /const collectionGrids = \[\.\.\.document\.querySelectorAll\('[^']*#wishlist-items \.collection-grid\[data-iswish="true"\][^']*'\)\]/,
  "wishlist cards must be included in collection action injection");
assert.match(source, /const isWishlistItem = Boolean\(card\.closest\('#wishlist-items \.collection-grid\[data-iswish="true"\]'\)\)[\s\S]*?\(!isWishlistItem && !downloadSource\)/,
  "wishlist cards must receive collection actions without requiring an owned-item download link");
assert.match(source, /playlistButton\.classList\.add\("is-feed-compact-action", "is-collection-action"\)/,
  "wishlist and owned collection add buttons must share the same compact collection component");
assert.match(source, /function finishFeedAudioHandoff[\s\S]*?addEventListener\("playing"[\s\S]*?window\.setTimeout\(finish, 500\)[\s\S]*?async function handoffFeedPlayer[\s\S]*?finishFeedAudioHandoff/,
  "feed playback must let Bandcamp's native play promise settle before pausing its muted handoff audio");
assert.match(source, /sameSeamlessFeedTrack[\s\S]*?!pendingFeedTrackId && !candidate\.paused[\s\S]*?if \(pendingFeedTrackId\) return;/,
  "feed maintenance must not pause Bandcamp's native player while its handoff play promise is settling");
assert.match(source, /pendingFeedSeekTime[\s\S]*?handoffCurrentTime = pendingFeedSeekTime === null \? feed\.currentTime : pendingFeedSeekTime[\s\S]*?pendingFeedSeekRevision !== handoffSeekRevision[\s\S]*?SEAMLESS_SEEK/,
  "a feed seek made during handoff must be applied to the incoming track after playback starts");
assert.match(source, /function scrubTarget\(\)[\s\S]*?pendingFeedTrackId \? getFeedPlayerState\(pendingFeedTrackId\)[\s\S]*?async function seekToScrubTarget[\s\S]*?if \(pendingFeedTrackId\)[\s\S]*?pendingFeedSeekRevision \+= 1[\s\S]*?if \(seamless\.enabled\)/,
  "an immediate feed scrub must target the incoming feed track before any previously active seamless track");
assert.match(source, /data-bandkit-feed-playback=\\?"playing\\?"[\s\S]*?linear-gradient\(90deg,currentColor 0 35%,transparent 35% 65%,currentColor 65% 100%\)[\s\S]*?height:24px[\s\S]*?width:18px/,
  "the active feed card must use the same centered pause-bar geometry as the main album player");
assert.match(releaseCss, /\.inline_player \.playbutton\.playing::before\s*\{[\s\S]*?linear-gradient\(90deg, var\(--bandkit-release-ink\) 0 35%, transparent 35% 65%, var\(--bandkit-release-ink\) 65% 100%\)[\s\S]*?height:\s*24px[\s\S]*?width:\s*18px/,
  "the feed pause geometry must remain paired with the main album-player pause treatment");
assert.match(offscreen, /ANALYSIS_CACHE_TTL_MS\s*=\s*12 \* 60 \* 60 \* 1000[\s\S]*?OFFSCREEN_SET_ANALYSIS_STORAGE/,
  "BPM and key results must use a bounded twelve-hour cache through the offscreen storage bridge");
assert.match(background, /OFFSCREEN_SET_ANALYSIS_STORAGE[\s\S]*?STORAGE_KEYS\.TRACK_ANALYSIS_CACHE[\s\S]*?chrome\.storage\.session\.set/,
  "the service worker must persist offscreen analysis results in browser-session storage");
assert.match(offscreen, /audioContext \|\|= new AudioContextClass\(\)[\s\S]*?audioContext\.decodeAudioData/,
  "page analysis must reuse one decode context instead of creating a context per track");
assert.match(offscreen, /timeoutMs\s*=\s*10_000[\s\S]*?controller\.abort\(\)/,
  "page analysis stream requests must time out instead of hanging indefinitely");
assert.match(source, /tracks:\s*\[track\][\s\S]*?pageTrackAnalysis\.set\([\s\S]*?syncPageTrackAnalysisUi\(\)/,
  "page analysis must render each track result progressively");
assert.match(source, /function syncActivePageTrackAnalysis[\s\S]*?seamless\.detectedBpm[\s\S]*?pageTrackAnalysis\.set\([\s\S]*?syncPageTrackAnalysisUi\(\)/,
  "active DJ re-analysis and manual BPM corrections must update the matching page label");
assert.match(source, /applySeamlessState[\s\S]*?syncActivePageTrackAnalysis\?\.\(\)/,
  "every incoming playback analysis state must be offered to the matching page label");
assert.match(source, /option\(analyzing \? "Analyzing tracks…" : "Analyze tracks"/,
  "manual analysis must remain available without adding a fifth release-row button");
assert.match(source, /let priceLabel = button\.querySelector\(":scope > \.bandcamp-hub-page-cart-price"\)/,
  "cart refreshes must preserve a stable price hit target instead of replacing button children");
assert.doesNotMatch(source, /function updatePageCartButton[\s\S]{0,900}?button\.replaceChildren\(\)/,
  "cart refreshes must not discard a pointer target between pointer-down and click");
assert.match(source, /\.bandcamp-hub-page-cart>\*\{pointer-events:none\}/,
  "cart labels and prices must route their complete hit area through the button");
assert.match(source, /\.bandkit-page-action-label\{[^}]*pointer-events:none!important/,
  "page-action labels must route clicks through their stable parent control");
assert.doesNotMatch(source, /function updatePagePlaylistButton[\s\S]{0,850}?button\.textContent\s*=/,
  "live Add-button refreshes must not replace their child hit targets");
assert.match(source, /autoAnalyzeTracks === false[\s\S]*?Analyzing tracks…[\s\S]*?analyzePageTracks\(\{ manual: true, force: true \}\)/,
  "manual analysis must remain available from the release overflow menu");
assert.doesNotMatch(source, /bandkit-page-analyze-symbol|symbol\.textContent = "↻"/,
  "manual analysis must not use an underlined text glyph as its icon");
assert.match(source, /bandcamp-hub-page-tools\{[^}]*flex-wrap:nowrap[^}]*min-width:0[^}]*width:100%/,
  "page actions must fill one line beneath the player so navigation can align to the waveform edge");
assert.match(source, /bandkit-page-transport-row\{[^}]*margin-left:auto[^}]*margin-right:-8px/,
  "page navigation must finish at the waveform's right edge");
assert.match(source, /function ensureClassicTransportRow[\s\S]*?setPageActionLabel\(control, ""\)/,
  "Previous and Next controls must remain icon-only when page action labels are enabled");
assert.match(source, /cartButton\.nextElementSibling !== playlistButton[\s\S]*?playlistButton\.nextElementSibling !== button[\s\S]*?button\.nextElementSibling !== overflowButton/,
  "release controls must retain the Buy, Add, DJ, More order during live scans");
assert.match(source, /duration\.after\(label\)/,
  "track analysis must render beside the duration");
assert.match(background, /minimumPrice:\s*Number\.isFinite\(minimumPrice\)[\s\S]*?minimumPrice >= 0/,
  "background metadata must preserve a zero minimum track price");
assert.match(source, /resolveTrackPrice\(button, track\)[\s\S]*?bandcamp-hub-page-cart-price/,
  "the page cart control must resolve and expose the current track price");
assert.match(source, /minimumFractionDigits:\s*Number\.isInteger\(amount\) \? 0 : 2/,
  "whole purchase prices must remain compact enough for the cart icon");
assert.match(source, /`\$\{formatted\}\$\{minimum \? "\+" : ""\} \$\{code\}`/,
  "compact purchase prices must preserve exact versus minimum-price semantics");
assert.match(source, /\.buyItem\.digital \.buyItemExtra\.secondaryText:not\(\.buyItemNyp\)/,
  "purchase prices must prefer the currency Bandcamp visibly presents for the release");
assert.match(source, /script\[data-band-currency\][\s\S]*?getAttribute\("data-band-currency"\)/,
  "album prices must use Bandcamp's release currency before an unrelated checkout-cart currency");
assert.match(source, /status: "name-your-price", label: "Name your price"/,
  "name-your-price releases must not present Bandcamp's internal suggested value as a payable minimum");
assert.match(source, /free\s*=\s*\/free\\s\+download[\s\S]*?download_pref[\s\S]*?status: "free", label: "Free"/,
  "true free downloads must override misleading positive internal price metadata");
assert.match(source, /status: "album-only", label: "Album only"/,
  "tracks that cannot be purchased individually must direct users to the full album");
assert.match(source, /status: "unavailable", label: "Unavailable"[\s\S]*?disabled: true/,
  "purchase controls without a valid Bandcamp action must remain explicit and disabled");
assert.match(background, /bandCurrency[\s\S]*?purchaseStatus[\s\S]*?priceIsMinimum/,
  "remote track metadata must preserve currency, purchase state, and exact-price semantics");
assert.match(source, /pageCurrent\?\.type === "track" \? currentInlinePlaylistTrack\(\) : null/,
  "album player purchase buttons must use the album offer rather than the currently playing track price");
assert.match(source, /setPageActionLabel\(button, purchase\?\.actionLabel \|\| ""\)/,
  "the primary purchase action must use the resolved Buy, Pre-order, or Download label rather than Cart");
assert.match(source, /cartButton\.nextElementSibling !== playlistButton[\s\S]*?cartButton\.after\(playlistButton\)/,
  "the primary Add action must appear directly after Buy");
assert.match(source, /buyTrack\.after\(button\)/,
  "each track purchase action must appear before its add-to-playlist action");
assert.match(source, /classList\.contains\("bandcamp-hub-page-buy"\)[\s\S]*?\^buy\(\?: track\)\?\$\/i/,
  "track-row refreshes must reuse a Buy control whose native Buy Track label was already shortened");
assert.match(source, /node\.nodeType === 3[\s\S]*?buy track[\s\S]*?node\.textContent = "Buy"/,
  "track purchase controls must use the compact Buy label without replacing their stable click target");
assert.match(source, /isFreeDownload\s*=\s*Boolean\(downloadTrack\s*&&\s*!nativeBuyTrack\)/,
  "a native download without a native purchase control must be treated as a free track download");
assert.match(source, /setPageActionLabel\(buyTrack, isFreeDownload \? "Download" : "Buy"\)[\s\S]*?icon-downloads\.svg[\s\S]*?icon-cart\.svg/,
  "free track actions must replace the cart treatment with a labeled download icon");
assert.match(releaseCss, /\.bandcamp-hub-page-buy\.is-download-action\s*\{[^}]*font-size:\s*0\s*!important;[^}]*width:\s*24px\s*!important/s,
  "Modern free-track downloads must suppress Bandcamp's duplicate text and use the compact action size");
assert.match(source, /bandcamp-hub-page-cart-price\{[^}]*font-size:15px[^}]*font-weight:800/,
  "the price must be more prominent without changing the fixed purchase-button height");
assert.match(source, /Auto-analyze tracks[\s\S]*?hub-auto-analyze-toggle/,
  "settings must include an auto-analysis switch");
assert.match(source, /Show track keys[\s\S]*?hub-show-track-keys-toggle/,
  "settings must let users hide Camelot and musical key columns independently of BPM");
assert.match(source, /bandkit-has-track-analysis[\s\S]*?grid-template-columns:minmax\(0,1fr\) 52px 160px/,
  "modern track rows must use stable title, duration, and analysis columns");
assert.match(source, /bandkit-has-track-analysis>a\{[^}]*min-width:0[^}]*overflow:hidden[^}]*width:100%/,
  "track links must yield space to metadata without wrapping onto another line");
assert.match(source, /bandkit-has-track-analysis \.track-title\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/,
  "track names must stay on one line and use ellipsis only when space is exhausted");
assert.match(source, /bandkit-track-analysis-bpm[\s\S]*?bandkit-track-analysis-camelot[\s\S]*?bandkit-track-analysis-key/,
  "BPM and both key formats must render as independently aligned values");
assert.match(source, /bpm:\s*hasBpm\s*\?[\s\S]*?:\s*"— BPM"/,
  "tracks without a confident BPM must retain an explicit BPM-column marker");
assert.match(source, /BPM could not be detected for this track/,
  "an unavailable BPM marker must explain the failed reading");
assert.match(source, /result\?\.error/,
  "an unavailable BPM marker must preserve the decoder failure reason");
assert.match(source, /bandkit-track-analysis:is\(\.is-analyzing,\.is-unavailable\)/,
  "unavailable BPM markers must use the subdued analysis state");
assert.match(source, /Page icon labels[\s\S]*?hub-page-action-labels-toggle/,
  "settings must include an opt-in page icon label switch");
assert.match(source, /data-bandkit-page-action-labels="true"[\s\S]*?bandkit-page-action-label/,
  "page labels must expand only when the opt-in document mode is active");
assert.match(source, /data-bandkit-modern-release="false"[^}]*data-bandkit-page-action-labels="true"[^}]*\.download-col\{[^}]*min-width:136px!important;[^}]*width:136px!important[^}]*\}[\s\S]*?\.download-col \.dl_link\{[^}]*display:flex!important;[^}]*flex-wrap:nowrap!important;[^}]*justify-content:flex-end!important/s,
  "legacy release Add and Buy labels must share one non-wrapping action row");
assert.match(source, /data-bandkit-modern-release="false"[^}]*data-bandkit-page-action-labels="true"[^}]*\.download-col \.bandcamp-hub-page-buy\{[^}]*min-width:max-content!important;[^}]*overflow:visible!important;[^}]*width:auto!important/s,
  "legacy labeled Buy actions must not retain their clipped icon-only width");
assert.match(source, /bandcamp-hub-page-cart\.has-price[\s\S]*?width:auto/,
  "priced cart controls must retain their compact icon-and-price width when labels are off");
assert.match(releaseCss, /\.inline_player\s*\{[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?padding:\s*0\s*!important;/,
  "the modern release player must not use an inset card surface");
assert.match(releaseCss, /\.bandkit-modern-release-primary\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
  "modern releases must split the player and tracklist evenly from artwork and release notes");
assert.match(source, /const featuredVideo = \[\.\.\.\(artworkColumn\?\.children \|\| \[\]\)\][\s\S]*?releasePrimary\.before\(videoSection\)/,
  "featured release videos must move into a dedicated section above the two-column release controls");
assert.match(releaseCss, /\.bandkit-modern-video-section\s*\{[^}]*width:\s*100%/s,
  "featured release videos must span the full release width");
assert.match(releaseCss, /\.bandkit-modern-video-section \.video-wrapper\s*\{[^}]*aspect-ratio:\s*16 \/ 9[^}]*width:\s*100%\s*!important/s,
  "featured release videos must retain a responsive widescreen ratio without overflowing their section");
assert.match(releaseCss, /\.download-col \.dl_link\s*\{[^}]*justify-content:\s*flex-end;[^}]*width:\s*100%\s*!important/s,
  "track action buttons must align with the right edge of row dividers");
assert.match(source, /function createPageReleaseOverflowButton\(\)[\s\S]*?setPageActionLabel\(button, "More"\)/,
  "the horizontal-ellipsis action must retain an accessible label in labeled mode");
assert.match(releaseCss, /data-bandkit-page-action-labels="true"[^}]*\.download-col \.bandcamp-hub-page-playlist\.is-track-action\s*\{[^}]*max-width:\s*none\s*!important;[^}]*min-width:\s*max-content\s*!important;[^}]*width:\s*auto\s*!important/s,
  "labeled per-track Add actions must not remain constrained to icon-only width");
assert.match(releaseCss, /data-bandkit-page-action-labels="true"[^}]*\.download-col \.bandcamp-hub-page-buy\s*\{[^}]*font-size:\s*0\s*!important;[^}]*width:\s*auto\s*!important/s,
  "labeled per-track Buy actions must suppress Bandcamp's native text and fit the generated label");
assert.match(releaseCss, /data-bandkit-page-action-labels="true"[^}]*\.download-col \.bandcamp-hub-page-buy::before\s*\{[^}]*content:\s*""\s*!important;[^}]*display:\s*block\s*!important/s,
  "labeled per-track Buy actions must restore their cart icon");
assert.match(releaseCss, /body\.tralbum-page :is\(\*:not\(\.ui-dialog\):not\(\.ui-dialog \*\)\)[\s\S]*?box-sizing:\s*border-box/,
  "modern release box sizing must exclude Bandcamp's native purchase dialog");
assert.doesNotMatch(releaseCss, /\.ui-dialog\.nu-dialog :is\(input, select, textarea\)/,
  "modern release styles must not manually restyle native purchase-dialog fields");
assert.doesNotMatch(source, /#buyItemModal, \.buyItemModal, \.buy-item-modal, \.purchase-modal, \.purchase-dialog/,
  "page-theme styles must not inject legacy purchase-dialog field overrides");
assert.match(source, /:is\(a,[^}]+\):not\(\.ui-dialog\):not\(\.ui-dialog \*\) \{ color: var\(--bandkit-page-accent\)/,
  "page-theme link and button colours must exclude the native purchase dialog");
assert.match(source, /:is\(input, select, textarea,[^}]+\):not\(\.ui-dialog\):not\(\.ui-dialog \*\) \{ border-color:/,
  "page-theme form-control styling must exclude the native purchase dialog");
assert.match(source, /button:not\([^}]+:not\(\.ui-dialog \*\) \{ background-color:/,
  "page-theme button styling must exclude native purchase-dialog buttons");
assert.match(source, /\.ui-dialog\.nu-dialog \{ color-scheme: light; \}/,
  "the native purchase dialog must retain its normal light form-control scheme under dark page themes");
assert.match(hubCss, /\.hub-settings-copy \.hub-settings-version\s*\{[\s\S]*?background:\s*var\(--hub-control-bg\);[\s\S]*?color:\s*var\(--hub-control-fg\);/,
  "the release chip must use a contrast-safe foreground and background pair");
assert.match(hubCss, /\.hub-settings-segment\.is-active\s*\{[\s\S]*?background:\s*var\(--hub-control-bg\);[\s\S]*?color:\s*var\(--hub-control-fg\);/,
  "the active page-colour segment must use a contrast-safe foreground and background pair");
assert.match(hubCss, /\.hub-settings-segment\s*\{[\s\S]*?color:\s*var\(--hub-card-ink\);/,
  "inactive page-colour segments must use readable text on their card surface");
assert.match(releaseCss, /\.inline_player \.play_cell > a\s*\{[^}]*height:\s*72px\s*!important;[^}]*width:\s*72px\s*!important/s,
  "the page-player play control must span the title, metadata, and scrubber block");
assert.match(releaseCss, /\.inline_player \.track_info\s*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-columns:\s*max-content max-content minmax\(0, 1fr\)/s,
  "the page-player title and metadata must use stable aligned rows");
assert.match(releaseCss, /\.inline_player \.title,[\s\S]*?\.inline_player \.title_link\s*\{[^}]*font-size:\s*16px\s*!important;[^}]*line-height:\s*20px\s*!important;/s,
  "the page-player title line must leave enough height for letter descenders");
assert.match(releaseCss, /\.inline_player \.track_info > \.time\s*\{[^}]*grid-column:\s*1;[^}]*margin-left:\s*0\s*!important/s,
  "page-player time must align with the title's left edge");
assert.match(releaseCss, /@media \(max-width:\s*680px\)[\s\S]*?\.inline_player table\s*\{[^}]*max-width:\s*100%\s*!important[\s\S]*?\.inline_player :is\(\.track_cell, \.progbar_cell\)\s*\{[^}]*min-width:\s*0\s*!important;[^}]*width:\s*auto\s*!important/s,
  "phone release players must override Bandcamp's legacy minimum cell widths instead of widening the document");
assert.match(releaseCss, /@media \(max-width:\s*380px\)[\s\S]*?\.inline_player \.track_info\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important[\s\S]*?\.bandkit-track-analysis\.is-inline\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*3/s,
  "very narrow release players must move analysis metadata onto its own row");
assert.match(source, /bandcamp-hub-page-tools\{[^}]*margin:12px 0 0/,
  "page-player actions must retain a slightly larger gap below the scrubber");

console.log("Page track analysis and player alignment checks passed.");
