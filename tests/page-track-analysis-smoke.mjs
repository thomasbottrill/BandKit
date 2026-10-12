import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readContentSource, readModernStyles, readPageStyles } from "./support/source.mjs";

const [source, state, contracts, background, offscreen, releaseCss, hubCss, playerCss, deepAnalysis] = await Promise.all([
  Promise.resolve(`${readContentSource()}\n${readPageStyles()}`),
  readFile(new URL("../src/content/state.js", import.meta.url), "utf8"),
  readFile(new URL("../src/shared/contracts.js", import.meta.url), "utf8"),
  readFile(new URL("../src/background/index.js", import.meta.url), "utf8"),
  Promise.all(["progressive.js", "analysis-cache.js", "analysis.js", "analysis-worker.js", "analysis-worker-client.js", "utils.js", "state.js", "events.js", "index.js"]
    .map((filename) => readFile(new URL(`../src/offscreen/${filename}`, import.meta.url), "utf8"))).then((parts) => parts.join("\n")),
  Promise.resolve(readModernStyles()),
  Promise.all(["settings.css", "settings-controls.css", "settings-actions.css"].map((file) => (
    readFile(new URL(`../src/styles/hub/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n")),
  Promise.all(["player.css", "player-track.css", "player-interactions.css"].map((file) => (
    readFile(new URL(`../src/styles/hub/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n")),
  readFile(new URL("../src/content/runtime/deep-analysis.js", import.meta.url), "utf8")
]);

assert.match(state, /autoAnalyzeTracks:\s*true/, "page track analysis must default to automatic");
assert.match(state, /showTrackKeys:\s*true/, "musical keys must remain visible by default");
assert.match(state, /showCamelotNotation:\s*false/, "Camelot notation must default to hidden");
assert.doesNotMatch(state, /pageActionLabels/, "the removed page icon-label preference must not remain in default state");
assert.match(contracts, /ANALYZE_TRACKS:\s*"BANDCAMP_HUB_ANALYZE_TRACKS"/);
assert.match(background, /message\.type === MESSAGES\.ANALYZE_TRACKS[\s\S]*?OFFSCREEN_ANALYZE_TRACKS/,
  "the background must sanitize and forward page analysis requests");
assert.match(offscreen, /async function analyzeTrack\(track, force = false, deep = false\)[\s\S]*?analysisWorker\.analyze/,
  "batch analysis must delegate decoding and analysis to the worker");
assert.match(offscreen, /estimateKeyCooperatively\(decoded[\s\S]*?estimateBpmDetailsCooperatively\(decoded/,
  "the analysis worker must calculate both BPM and musical key");
assert.match(offscreen, /sampleBytes\s*=\s*524_288[\s\S]*?fallbackBytes\s*=\s*1_048_576[\s\S]*?Range:\s*`bytes=\$\{startByte\}-\$\{startByte \+ requestedBytes - 1\}`/,
  "page analysis must use bounded, independently decodable windows across each track");
assert.match(offscreen, /downloaded\.byteLength > requestedBytes \? downloaded\.slice\(0, requestedBytes\)[\s\S]*?downloaded\.byteLength > requestedBytes/,
  "page analysis must bound cached full HTTP responses to the same deterministic sample as range responses");
assert.match(offscreen, /TRACK_ANALYSIS_CONCURRENCY\s*=\s*1[\s\S]*?Math\.min\(TRACK_ANALYSIS_CONCURRENCY, source\.length\)/,
  "page analysis must serialize CPU-heavy key work so playback stays responsive");
assert.match(source, /PAGE_TRACK_ANALYSIS_CONCURRENCY\s*=\s*3[\s\S]*?Math\.min\(PAGE_TRACK_ANALYSIS_CONCURRENCY, tracks\.length\)[\s\S]*?Array\.from\(\{ length: concurrency \}, worker\)/,
  "page analysis must progressively coordinate three track workers");
assert.match(offscreen, /function prioritizePlayback\(\)[\s\S]*?controller\.abort\(\)[\s\S]*?status === "loading"[\s\S]*?PLAYBACK_PRIORITY/,
  "playback must preempt in-flight page analysis and let it resume after the stream starts");
assert.match(offscreen, /estimateKeyCooperatively[\s\S]*?processedFrames % 2 === 0[\s\S]*?await yieldControl\(\)/,
  "key FFT work must yield frequently enough for playback commands to preempt it");
assert.match(offscreen, /estimateBpmDetailsCooperatively[\s\S]*?for \(const buffer of buffers\)[\s\S]*?await yieldControl\(\)/,
  "tempo tracking must yield between sampled windows so playback commands can preempt it");
assert.match(offscreen, /function interruptedPlay[\s\S]*?async function playForMediaRequest[\s\S]*?attempt < 3[\s\S]*?async function seekToTime[\s\S]*?playForMediaRequest/,
  "rapid startup seeks must retry interrupted play promises without exposing Chrome's raw play() error");
assert.match(offscreen, /async function loadTrack[\s\S]*?audio\.src = track\.url[\s\S]*?audio\.load\(\)[\s\S]*?playForMediaRequest/,
  "track switches must use Chromium's single-request native media loader");
assert.doesNotMatch(offscreen, /async function loadTrack[\s\S]*?startProgressiveMp3Stream/,
  "track switches must not retry the same Bandcamp stream through MediaSource");
assert.match(offscreen, /compensatedHandoffTime\(currentTime, handoffStartedAt, autoplayRequested\)/,
  "native-to-offscreen handoffs must compensate for startup time without replaying audio");
assert.match(offscreen, /if \(status === "loading"\) \{[\s\S]*?sendState\(true\);[\s\S]*?return stateSnapshot\(\);[\s\S]*?async function loadTrack[\s\S]*?pendingSeekRevision !== handoffSeekRevision[\s\S]*?latestSeekTime/,
  "a startup seek must update playback intent without cancelling the in-flight media request");
assert.match(offscreen, /PLAYBACK_ANALYSIS_HEADROOM_SECONDS\s*=\s*15[\s\S]*?PLAYBACK_ANALYSIS_DELAY_MS\s*=\s*8_000[\s\S]*?analysisNotBefore[\s\S]*?bufferedPlaybackHeadroom\(\) >= PLAYBACK_ANALYSIS_HEADROOM_SECONDS/,
  "automatic track analysis must yield through startup, then resume after eight seconds with safe buffer headroom");
assert.match(offscreen, /audio\.crossOrigin = "anonymous"/,
  "remote Bandcamp seek streams must stay audible through the Web Audio graph");
assert.match(source, /function syncFeedPagePlaybackUi\(\)[\s\S]*?data-bandkit-feed-playback[\s\S]*?seamless\.isPlaying \? "playing" : "paused"/,
  "feed artwork controls must retain the remote Bandkit playback state after native audio handoff");
assert.match(source, /function syncFeedPagePlaybackUi\(\)[\s\S]*?pendingFeedTrackId[\s\S]*?data-bandkit-feed-playback", "loading"[\s\S]*?aria-busy", "true"[\s\S]*?Loading /,
  "a clicked Feed artwork control must immediately expose its pending playback state");
assert.match(source, /const collectionControl = event\.target\.closest\('[^']*#wishlist-items \.collection-grid\[data-iswish="true"\][^']*\.track_play_auxiliary'\)/,
  "wishlist artwork controls must use the reliable collection playback handoff");
assert.match(source, /const collectionGrids = \[\.\.\.document\.querySelectorAll\('[^']*#wishlist-items \.collection-grid\[data-iswish="true"\][^']*'\)\]/,
  "wishlist cards must be included in collection action injection");
assert.match(source, /const isWishlistItem = Boolean\(card\.closest\('#wishlist-items \.collection-grid\[data-iswish="true"\]'\)\)[\s\S]*?\(!isWishlistItem && !downloadSource\)/,
  "wishlist cards must receive collection actions without requiring an owned-item download link");
assert.match(source, /function itemFromNode\(node\)[\s\S]*?"\.heading"[\s\S]*?"\.subhead"/,
  "Bandcamp track search results must expose their title and artist to Add-control injection");
assert.match(source, /const titleNode = node\.querySelector\("[^"]*\.heading"\)/,
  "track search Add controls must attach beside the native search-result heading");
assert.match(source, /fallbackIsSearchRelease[\s\S]*?node\.matches\("\.searchresult"\)[\s\S]*?\^\(\?:album\|track\)\$/,
  "search Add controls must cover album and track results without appearing on artist results");
assert.match(source, /classList\.toggle\("is-search-add-to", node\.matches\("\.searchresult"\)\)/,
  "search Add controls must receive their dedicated component style");
assert.match(source, /\.searchresult \.bandcamp-hub-page-playlist\.is-search-add-to\{[^}]*border:1px solid transparent!important;[^}]*border-radius:7px!important;[^}]*height:30px!important;[^}]*width:30px!important/,
  "search Add controls must use a smaller borderless-at-rest rounded-square style");
assert.match(source, /\.searchresult \.art\{position:relative\}[\s\S]*?\.bandkit-search-play[\s\S]*?opacity:0[\s\S]*?\.art:is\(:hover,:focus-within\)>\.bandkit-search-play/,
  "search artwork must reveal a consistent play control on hover and keyboard focus");
assert.match(source, /function playSearchResult[\s\S]*?addTracksToPlaylist\(\[track\], \{ quiet: true, syncQueue: false \}\)[\s\S]*?playPlaylistAt\(index, \{ forceRefresh: true, revealPanel \}\)/,
  "search artwork playback must add the result and use the established hydrated queue path");
assert.match(source, /function syncSearchPlaybackUi[\s\S]*?icon-pause\.svg[\s\S]*?aria-pressed/,
  "search artwork playback controls must follow seamless play and pause state");
assert.match(source, /syncSearchPlaybackUi\?\.\(\)/,
  "seamless playback updates must refresh search artwork controls");
assert.match(source, /requestedPlaylistItemId[\s\S]*?\^\(\?:track-\)\?\\d\+\$/,
  "queue matching must prefer playlist identity and ignore display-title fallback IDs");
assert.match(source, /canonical release URL is a stronger identity[\s\S]*?return pageMatch \|\| null/,
  "same-titled search results on different release URLs must not toggle one another");
assert.match(source, /playlistButton\.classList\.add\("is-collection-action"\);[\s\S]*?playlistButton\.classList\.toggle\("is-feed-compact-action", !modernActions\)[\s\S]*?playlistButton\.classList\.toggle\("bandkit-collection-overlay-action", modernActions\)/,
  "wishlist and owned collection add buttons must use artwork overlays in modern mode and the compact action row in classic mode");
assert.match(source, /function finishFeedAudioHandoff[\s\S]*?addEventListener\("playing"[\s\S]*?window\.setTimeout\(finish, 500\)[\s\S]*?async function handoffFeedPlayer[\s\S]*?finishFeedAudioHandoff/,
  "feed playback must let Bandcamp's native play promise settle before pausing its muted handoff audio");
assert.match(source, /const isMutedHandoffAudio = currentAudio === mutedFeedAudio[\s\S]{0,240}?isMutedHandoffAudio[\s\S]{0,120}?currentTrackId/,
  "direct Feed playback must also restore the old native player's mute state after handoff");
assert.match(source, /sameSeamlessFeedTrack[\s\S]*?!pendingFeedTrackId && !candidate\.paused[\s\S]*?if \(pendingFeedTrackId\) return;/,
  "feed maintenance must not pause Bandcamp's native player while its handoff play promise is settling");
assert.match(source, /pendingFeedSeekTime[\s\S]*?handoffCurrentTime = pendingFeedSeekTime === null \? feed\.currentTime : pendingFeedSeekTime[\s\S]*?pendingFeedSeekRevision !== handoffSeekRevision[\s\S]*?SEAMLESS_SEEK/,
  "a feed seek made during handoff must be applied to the incoming track after playback starts");
assert.match(source, /isPlaying: seededFromPendingClick[\s\S]*?seededFromPendingClick \? feedStreamUrl\(trackId\)/,
  "feed playback must start from clicked story metadata before Bandcamp's native audio finishes loading");
assert.match(source, /function feedStreamUrl\(trackId\)[\s\S]{0,260}?refreshFeedStreams\(\)[\s\S]{0,160}?known\?\.resolvedUrl \|\| known\?\.url/,
  "a feed story must play the resolved media URL when one is cached and the signed redirect otherwise");
assert.match(source, /function prefetchFeedStream[\s\S]*?RESOLVE_FEED_STREAMS[\s\S]*?resolvedUrl \}\)/,
  "hovering or focusing a feed story must resolve its signed redirect before the click");
assert.match(source, /function handoffFeedPlayer[\s\S]*?trustProvidedStreams = isReusableStreamUrl\(feed\.track\.url\)[\s\S]*?prepareExternalNowPlaying\(feed\.track, \[\], \{ trustProvidedStreams \}\)/,
  "a feed story carrying Bandcamp's signed stream must start without refetching its release page");
assert.match(source, /function feedHandoffInFlight[\s\S]*?feedHandoffStartedAt > 8000[\s\S]*?async function handoffFeedPlayer[\s\S]*?requested === feedHandoffInFlight\(\)[\s\S]*?feedHandoffRequest/,
  "a stalled feed handoff must be superseded rather than blocking every later story click");
assert.match(source, /function scrubTarget\([^)]*\)[\s\S]*?pendingFeedTrackId \? getFeedPlayerState\(pendingFeedTrackId\)[\s\S]*?async function seekToScrubTarget[\s\S]*?if \(pendingFeedTrackId\)[\s\S]*?pendingFeedSeekRevision \+= 1[\s\S]*?if \(seamless\.enabled\)/,
  "an immediate feed scrub must target the incoming feed track before any previously active seamless track");
assert.match(source, /function scrubTarget\([^)]*\)[\s\S]*?const fraction = [^;]*Math\.max[\s\S]*?pendingFeedSeekFraction = target\.fraction[\s\S]*?pendingFeedSeekTime = target\.duration \? target\.currentTime : null[\s\S]*?if \(!target\.duration\) return/,
  "a Feed seek fraction must survive while the incoming track duration is still unknown");
assert.match(source, /function commitPageScrub\(control, fraction\)[\s\S]*?pendingFeedTrackId[\s\S]*?pendingFeedSeekRevision \+= 1[\s\S]*?SEAMLESS_SEEK/,
  "feed page scrubbers must retain a seek while a track handoff is still pending");
assert.match(source, /function queueClassicPageSeek\(fraction\)[\s\S]*?classicPageHandoffTrackKey[\s\S]*?classicPagePendingSeekFraction[\s\S]*?classicPagePendingSeekRevision \+= 1/,
  "classic page seeks must bind to the row handoff that is still loading");
assert.match(source, /function handoffPageAudio[\s\S]*?pendingSeekAtSend[\s\S]*?handoffCurrentTime[\s\S]*?SEAMLESS_ENABLE[\s\S]*?pendingSeekAfterResponse[\s\S]*?SEAMLESS_SEEK/,
  "classic page handoff must apply an immediate seek before load or reconcile a later seek after load");
assert.match(source, /function seekToScrubTarget[\s\S]*?queueClassicPageSeek\?\.\(target\.fraction\)/,
  "the bottom music bar must retain a midpoint seek made during a classic page handoff");
assert.match(source, /function commitPageScrub[\s\S]*?queueClassicPageSeek\?\.\(fraction\)/,
  "the inline page scrubber must retain a midpoint seek made during a classic page handoff");
assert.match(source, /const pendingClassicLoading = Boolean\([\s\S]*?pendingClassicSeek[\s\S]*?classicPagePendingSeekFraction[\s\S]*?scrubSlider\.value[\s\S]*?is-pending-seek/,
  "a classic handoff must keep its selected track and pending playhead visible while metadata loads");
// Pending-handoff state is computed in pendingPlayerState() and consumed by the render pass,
// so each behaviour is asserted separately rather than as one contiguous block.
assert.match(source, /const pendingFeedLoading = Boolean\(pendingFeedTrackId\)/,
  "a Feed handoff is pending whenever a Feed track id is queued");
assert.match(source, /const pendingFeedSeek = Boolean\([\s\S]*?pendingFeedSeekTime !== null \|\| pendingFeedSeekFraction !== null[\s\S]*?pendingFeedSeekTrackId === pendingFeedTrackId/,
  "a pending Feed seek must belong to the track actually being handed off");
assert.match(source, /const currentTime = [\s\S]*?pendingFeedLoading[\s\S]*?pendingFeedSeek \? pendingFeedSeekTime !== null/,
  "loading state updates must keep the Feed playhead pinned to the listener's pending seek");
assert.match(source, /classList\.toggle\("is-pending-seek", pendingFeedSeek \|\| pendingClassicSeek\)/,
  "the scrubber must show a pending seek from either a Feed or a classic handoff");
assert.match(source, /setAttribute\("aria-busy", String\(playbackLoading\)\)/,
  "the scrubber must expose its loading state assistively");
assert.match(source, /function refreshScrubWaveform[\s\S]*?const pendingTrackId = String\(pendingFeedTrackId[\s\S]*?pendingTrackId[\s\S]*?live\.title/,
  "a clicked Feed track must replace the previous track's waveform identity immediately");
assert.match(source, /const pendingFeedSeekQueued = pendingFeedSeekTrackId === String\(pendingFeedTrackId[\s\S]*?const pendingFeedSeekHasTime = pendingFeedSeekTime !== null[\s\S]*?const seekConfirmed = pendingFeedSeekHasTime[\s\S]*?const seekFailed = !pendingFeedSeekQueued/,
  "stale state from the previous Feed track must not clear a queued fraction-only seek");
assert.match(source, /const feedControl = onFeedPage \? event\.target\.closest\("\.track_play_auxiliary"\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopImmediatePropagation\(\);[\s\S]*?pendingFeedTrackId = clickedTrackId;[\s\S]*?scheduleFeedHandoff\(clickedTrackId\)/,
  "Feed play clicks must start Bandkit directly instead of launching a duplicate native stream");
assert.match(source, /pendingFeedTrackId = clickedTrackId;[\s\S]*?getFeedPlayerState\(clickedTrackId\)[\s\S]*?updateRuntimeLive\([\s\S]*?hasPlaybackStarted: true[\s\S]*?syncFeedPagePlaybackUi\(\);[\s\S]*?renderPlayer\(\);[\s\S]*?scheduleFeedHandoff\(clickedTrackId\)/,
  "Feed clicks must populate the bottom player and card feedback before stream resolution begins");
assert.match(source, /const pendingFeedState = pendingFeedLoading \? getFeedPlayerState\(pendingFeedTrackId\)[\s\S]*?const candidateTrack = pendingDiscoverTrack \|\| pendingFeedState\?\.track \|\| pendingClassicTrack \|\| live[\s\S]*?const displayTrack = presentation\.track \|\| candidateTrack[\s\S]*?Loading \$\{displayTrack\.title[\s\S]*?renderPlayerTrack\(r, displayTrack, hasCurrentTrack\)/,
  "incoming Feed metadata must stay pinned in the bottom player over stale playback messages");
assert.match(source, /function renderPlayerTrack[\s\S]*?playerTitle\.textContent = hasCurrentTrack \? displayTrack\.title/,
  "the pinned Feed track must supply the rendered player title");
assert.match(source, /Anything the page world could not[\s\S]*?prepareExternalNowPlaying\(feed\.track, \[\], \{ trustProvidedStreams \}\)/,
  "a feed story the page world cannot describe must still resolve its media URL from the release page");
assert.match(source, /const preparedDuration = Number\(prepared\.queue\[prepared\.index\]\?\.duration\)[\s\S]*?pendingFeedSeekFraction \* preparedDuration[\s\S]*?const handoffCurrentTime/,
  "Feed handoff must translate an early seek fraction after resolved metadata supplies the duration");
assert.match(playerCss, /@keyframes hub-pending-seek-pulse[\s\S]*?\.hub-scrub-control\.is-pending-seek \.hub-scrub-playhead[\s\S]*?animation: hub-pending-seek-pulse/,
  "a pinned startup seek must expose a visible processing state");
assert.match(playerCss, /@keyframes hub-playback-loading-spin[\s\S]*?\.hub-play-button\.is-loading::after[\s\S]*?animation: hub-playback-loading-spin/,
  "the bottom playback control must visibly acknowledge a pending Feed click");
assert.match(source, /data-bandkit-feed-playback=\\?"playing\\?"[\s\S]*?linear-gradient\(90deg,currentColor 0 35%,transparent 35% 65%,currentColor 65% 100%\)[\s\S]*?height:24px[\s\S]*?width:18px/,
  "the active feed card must use the same centered pause-bar geometry as the main album player");
assert.match(releaseCss, /\.inline_player \.playbutton\.playing::before\s*\{[\s\S]*?linear-gradient\(90deg, currentColor 0 35%, transparent 35% 65%, currentColor 65% 100%\)[\s\S]*?height:\s*24px[\s\S]*?width:\s*18px/,
  "the feed pause geometry must remain paired with the main album-player pause treatment");
assert.match(offscreen, /ttlMs\s*=\s*12 \* 60 \* 60 \* 1000[\s\S]*?OFFSCREEN_SET_ANALYSIS_STORAGE/,
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
assert.match(source, /option\(analyzing \? "Re-analysing BPM & key…" : "Re-analyse BPM & key for all tracks"/,
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
assert.match(source, /autoAnalyzeTracks === false[\s\S]*?Re-analysing BPM & key…[\s\S]*?analyzePageTracks\(\{ manual: true, force: true \}\)/,
  "manual analysis must remain available from the release overflow menu");
assert.doesNotMatch(source, /bandkit-page-analyze-symbol|symbol\.textContent = "↻"/,
  "manual analysis must not use an underlined text glyph as its icon");
assert.match(source, /bandcamp-hub-page-tools\{[^}]*flex-wrap:nowrap[^}]*min-width:0[^}]*width:100%/,
  "page actions must fill one line beneath the player so navigation can align to the waveform edge");
assert.match(source, /bandkit-page-transport-row\{[^}]*margin-left:auto[^}]*margin-right:-8px/,
  "page navigation must finish at the waveform's right edge");
assert.match(source, /@media\(max-width:380px\)\{\.bandcamp-hub-page-tools\{[^}]*column-gap:6px!important;[^}]*flex-wrap:wrap!important\}/,
  "very narrow release players must wrap page actions instead of widening the document");
assert.match(source, /function ensureClassicTransportRow[\s\S]*?setPageActionLabel\(proxy, ""\)/,
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
assert.match(source, /`\$\{formatted\} \$\{code\}\$\{minimum \? " \+" : ""\}`/,
  "compact purchase prices must show the currency before a clear trailing minimum-price plus");
assert.match(source, /\.buyItem\.digital \.buyItemExtra\.secondaryText:not\(\.buyItemNyp\)/,
  "purchase prices must prefer the currency Bandcamp visibly presents for the release");
assert.match(source, /script\[data-band-currency\][\s\S]*?getAttribute\("data-band-currency"\)/,
  "album prices must use Bandcamp's release currency before an unrelated checkout-cart currency");
assert.match(source, /status: "name-your-price", label: "Name your price"/,
  "name-your-price releases must not present Bandcamp's internal suggested value as a payable minimum");
assert.match(source, /const minimumPrice = Number\(current\?\.minimum_price\);[\s\S]*?minimumPrice > 0[\s\S]*?status: "priced"[\s\S]*?digitalOffer\.querySelector\("\.buyItemNyp"\)/,
  "a positive Bandcamp minimum must take precedence over its generic name-your-price markup");
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
assert.match(source, /modernActions && !isFreeDownload[\s\S]*?child\.nodeType === 3[\s\S]*?buy track[\s\S]*?child\.textContent = "Buy"/,
  "modern track purchase controls must use the compact Buy label without replacing their stable click target");
assert.match(source, /isFreeDownload\s*=\s*Boolean\(downloadTrack\s*&&\s*!nativeBuyTrack\)/,
  "a native download without a native purchase control must be treated as a free track download");
assert.match(source, /setPageActionLabel\(buyTrack, isFreeDownload \? "Download" : "Buy"\)[\s\S]*?icon-downloads\.svg[\s\S]*?icon-cart\.svg/,
  "free track actions must replace the cart treatment with a labeled download icon");
assert.match(releaseCss, /\.bandcamp-hub-page-buy\.is-download-action\s*\{[^}]*font-size:\s*0\s*!important;[^}]*width:\s*24px\s*!important/s,
  "Modern free-track downloads must suppress Bandcamp's duplicate text and use the compact action size");
assert.match(source, /bandcamp-hub-page-cart-price\{[^}]*font-size:15px[^}]*font-weight:800/,
  "the price must be more prominent without changing the fixed purchase-button height");
assert.match(source, /Track analysis[\s\S]*?hub-auto-analyze-toggle[\s\S]*?controls: "hub-analysis-options"/,
  "settings must expose track analysis as the primary analysis switch");
assert.match(source, /hub-analysis-options[\s\S]*?options\.hidden = !enabled[\s\S]*?Save to playlists[\s\S]*?Musical key[\s\S]*?Camelot notation[\s\S]*?createMusicBarAnalysisSetting/,
  "analysis-specific settings must remain hidden until track analysis is enabled");
assert.match(source, /bandkit-has-track-analysis[\s\S]*?grid-template-columns:minmax\(0,1fr\) 52px 160px/,
  "modern track rows must use stable title, duration, and analysis columns");
assert.match(source, /if \(!text\) \{[\s\S]*?label\?\.remove\(\);[\s\S]*?analysisLayout\?\.classList\.add\("bandkit-has-track-analysis"\);[\s\S]*?continue;/,
  "tracks without an analyzable source must still reserve the duration and analysis columns");
assert.match(releaseCss, /\.title\.bandkit-has-track-analysis\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 52px 160px\s*!important;/s,
  "desktop track rows must keep one fixed duration start whether or not a rescan control exists");
assert.match(releaseCss, /data-bandkit-show-track-keys="true"\]\[data-bandkit-show-camelot="false"\][^{]*\.title\.bandkit-has-track-analysis\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 52px 126px\s*!important;/s,
  "key-only track rows must reserve the same compact analysis width for unavailable tracks");
assert.match(releaseCss, /@media \(max-width:\s*700px\)[\s\S]*?\.title\.bandkit-has-track-analysis\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 48px 142px\s*!important;/s,
  "narrow track rows must retain fixed duration and analysis columns");
assert.match(source, /bandkit-has-track-analysis>a\{[^}]*min-width:0[^}]*overflow:hidden[^}]*width:100%/,
  "track links must yield space to metadata without wrapping onto another line");
assert.match(source, /bandkit-has-track-analysis \.track-title\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/,
  "track names must stay on one line and use ellipsis only when space is exhausted");
assert.match(source, /bandkit-track-analysis-bpm[\s\S]*?bandkit-track-analysis-camelot[\s\S]*?bandkit-track-analysis-key/,
  "BPM and both key formats must render as independently aligned values");
assert.match(source, /createDeepAnalysisButton\(track\)/,
  "each track must expose its BPM and key readout as a per-track rescan action");
assert.match(deepAnalysis, /Re-analyse BPM & key \(deep scan\)/,
  "the per-track deep scan must clearly describe both values it recalculates");
assert.match(deepAnalysis, /if \(!track\?\.url \|\| r\.\$deepAnalysisRequest\) return r\.\$deepAnalysisRequest/,
  "a second deep scan must be ignored while the first request is still running");
assert.match(deepAnalysis, /const running = locked && button === r\.\$deepAnalysisButton[\s\S]*?button\.disabled = locked/,
  "only the clicked metadata action must animate while every rescan control is disabled");
assert.match(deepAnalysis, /DEEP_ANALYSIS_FEEDBACK_MS = 900[\s\S]*?remainingFeedback[\s\S]*?setTimeout\(resolve, remainingFeedback\)/,
  "even a fast deep scan must display its progress dots long enough to be understood");
assert.match(source, /ownsDeepAnalysis && deepAnalysisRequest[\s\S]*?updateDeepAnalysisButton\(deepAnalysisButton, track\)[\s\S]*?return/,
  "track analysis refreshes must preserve the active spinner node instead of restarting its animation");
assert.match(deepAnalysis, /bandkit-deep-analysis-label[\s\S]*?Rescan[\s\S]*?bandkit-deep-analysis-progress[\s\S]*?dot\.textContent = "·"/,
  "the metadata affordance must use a concise Rescan label and three progress dots");
assert.match(deepAnalysis, /analysisOwner\?\.matches\(":hover"\)[\s\S]*?deepAnalysisResultLocks\.add\(key\)/,
  "a completed scan must lock its result while the pointer remains over metadata");
assert.match(deepAnalysis, /owner\.addEventListener\("pointerleave"[\s\S]*?releaseResultLock\(trackKey, owner, button\)/,
  "a completed scan must hold its result until the pointer leaves before allowing Rescan to reappear");
assert.match(deepAnalysis, /window\.addEventListener\("pointermove"[\s\S]*?owner\.getBoundingClientRect\(\)[\s\S]*?if \(outside\) releaseResultLock/,
  "result holds must reliably release when the pointer moves outside metadata after the action becomes non-interactive");
assert.match(deepAnalysis, /r\.\$root\?\.querySelectorAll\("\.bandkit-deep-analysis"\)[\s\S]*?r\.\$playerDeepAnalysis/,
  "deep-analysis state changes must update page, player, and drawer controls across the shadow boundary");
assert.match(source, /@keyframes bandkit-deep-analysis-dot[\s\S]*?bandkit-deep-analysis-progress i:nth-child\(3\)[^}]*animation-delay:240ms[\s\S]*?is-analyzing \.bandkit-deep-analysis-progress\{display:inline-flex\}/,
  "deep analysis must animate a staggered ellipsis instead of spinning an icon");
assert.doesNotMatch(deepAnalysis, /Deep scan queued/,
  "deep analysis must not emit a redundant queued toast before its completion result");
assert.match(offscreen, /if \(!deep\) \{[\s\S]*?detectedBpm = null[\s\S]*?detectedKey = null[\s\S]*?waveform = \[\][\s\S]*?if \(!deep\) \{[\s\S]*?sendState\(true\)/,
  "a deep rescan must retain the current BPM, key, and waveform until replacement results are ready");
assert.match(source, /bandkit-track-analysis:is\(:hover,:focus-within,.is-deep-analyzing\) \.bandkit-deep-analysis[\s\S]*?opacity:1!important;pointer-events:auto!important/,
  "only hovering or focusing the BPM and key readout must reveal its rescan action");
assert.match(source, /bandkit-track-analysis \.bandkit-deep-analysis:is\(:hover,:focus-visible,.is-analyzing\)\{background:transparent!important;background-color:transparent!important;box-shadow:none!important\}/,
  "page rescan controls must not paint a theme-dependent block over the track row");
assert.match(source, /bandkit-track-analysis\.is-deep-analysis-result>:not\(\.bandkit-deep-analysis\)\{opacity:1!important\}[\s\S]*?is-deep-analysis-result \.bandkit-deep-analysis\{opacity:0!important;pointer-events:none!important\}/,
  "track lists must display the new BPM and key while waiting for pointer re-entry");
assert.match(deepAnalysis, /hub-player-deep-analysis[\s\S]*?playerAnalysis\.append\(r\.\$playerDeepAnalysis\)/,
  "the music bar must expose the same deep analysis control next to track analysis");
assert.match(deepAnalysis, /Possible alternative:[\s\S]*?key\.alternative\.name/,
  "uncertain key tooltips must expose the runner-up key candidate");
assert.match(offscreen, /segmentCount: deep \? 7 : 3/,
  "deep analysis must sample more track sections than normal analysis");
assert.match(offscreen, /deep \? \{ targetFrameCount: 72 \} : \{\}/,
  "deep analysis must sample more tonal frames than normal analysis");
assert.match(offscreen, /if \(yieldControl\) await yieldControl\(\);[\s\S]*?buffers\.push/,
  "deep sample fetching must yield to playback between sections");
assert.match(source, /bandkit-track-analysis-bpm,\.bandkit-track-analysis-camelot,\.bandkit-track-analysis-key\{text-align:left\}/,
  "BPM and key values must share consistent left-aligned column starts");
assert.doesNotMatch(source, /bandkit-track-analysis-bpm\{text-align:right\}/,
  "BPM values must not be right-aligned within their reserved column");
assert.match(source, /bpm:\s*hasBpm\s*\?[\s\S]*?:\s*"BPM\?"/,
  "tracks without a confident BPM must retain an explicit BPM-column marker");
assert.match(source, /key:\s*String\(result\.key\?\.shortName \? `\$\{result\.key\.shortName\}\$\{keyUncertain \? "\?" : ""\}` : \(hasKey \? "" : "Key\?"\)\)/,
  "tracks without a confident key must retain an explicit key-column marker");
assert.match(source, /keyUncertain = hasKey && result\.key\?\.uncertain === true/,
  "low-confidence key guesses must retain an independent uncertainty state");
assert.match(source, /Musical key could not be detected confidently/,
  "an uncertain key marker must explain why no key was shown");
assert.match(source, /BPM could not be detected confidently/,
  "an unavailable BPM marker must explain the failed reading");
assert.match(source, /result\?\.error/,
  "an unavailable BPM marker must preserve the decoder failure reason");
assert.match(source, /bandkit-track-analysis>:is\(\.is-uncertain,\.is-unavailable\)/,
  "uncertain analysis markers must be subdued independently of confident values");
assert.match(source, /createPageAnalysisBadge\("bpm", parts\.bpm, parts\.bpmUncertain, parts\.bpmUnavailable\)/,
  "BPM must pass its independent confidence state into the shared badge");
assert.match(source, /createPageAnalysisBadge\("camelot", parts\.camelot, parts\.keyUncertain, parts\.keyUnavailable\)[\s\S]*?createPageAnalysisBadge\("key", parts\.key, parts\.keyUncertain, parts\.keyUnavailable\)/,
  "Camelot and musical-key badges must share their independent key confidence state");
assert.doesNotMatch(source, /bandkit-track-analysis:is\([^)]*\.is-unavailable[^)]*\)\{[^}]*opacity/,
  "an unavailable field must not mute the entire analysis row");
assert.doesNotMatch(source, /Page icon labels|hub-page-action-labels-toggle|data-bandkit-page-action-labels/,
  "the page icon-label setting and its document mode must be removed");
assert.match(source, /data-bandkit-modern-styling="false"[^}]*\[data-bandkit-label\]>\.bandkit-page-action-label\{display:none!important\}/,
  "classic pages must suppress modern action labels instead of resizing Bandcamp's native action columns");
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
assert.doesNotMatch(releaseCss, /data-bandkit-page-action-labels/,
  "release styles must not retain the removed page icon-label mode");
assert.match(releaseCss, /body\.tralbum-page :is\(\*:not\(\.ui-dialog\):not\(\.ui-dialog \*\)\)[\s\S]*?box-sizing:\s*border-box/,
  "modern release box sizing must exclude Bandcamp's native purchase dialog");
assert.doesNotMatch(releaseCss, /\.ui-dialog\.nu-dialog :is\(input, select, textarea\)/,
  "modern release styles must not manually restyle native purchase-dialog fields");
assert.doesNotMatch(source, /#buyItemModal, \.buyItemModal, \.buy-item-modal, \.purchase-modal, \.purchase-dialog/,
  "page-theme styles must not inject legacy purchase-dialog field overrides");
assert.match(source, /function createPageCartButton[\s\S]*?setOpen\(false\)[\s\S]*?_bandkitPurchaseControl\.click\(\)/,
  "the page Buy control must close Bandkit before opening Bandcamp's purchase dialog");
assert.doesNotMatch(source, /function createPageCartButton[\s\S]{0,900}?openBandKitCart\(\)/,
  "the page Buy control must not open Bandkit's cart panel over the purchase dialog");
assert.match(source, /function visibleNativePurchaseDialog[\s\S]*?\.ui-dialog\.nu-dialog[\s\S]*?function closePanelForNativePurchaseDialog[\s\S]*?setOpen\(false\)/,
  "a newly inserted native purchase dialog must close any panel that was still open");
assert.match(source, /purchaseControl = event\.target\.closest\("\.buy-link, \.bandcamp-hub-page-buy"\)[\s\S]*?setOpen\(false\)/,
  "native Bandcamp Buy controls must close an open Bandkit panel before the dialog appears");
assert.match(source, /:is\(a,[^}]+\):not\(\.ui-dialog\):not\(\.ui-dialog \*\)[^{]*\{ color: var\(--bandkit-page-accent\)/,
  "page-theme link and button colours must exclude the native purchase dialog");
assert.match(source, /:is\(input, select, textarea,[^}]+\):not\(\.ui-dialog\):not\(\.ui-dialog \*\) \{ border-color:/,
  "page-theme form-control styling must exclude the native purchase dialog");
assert.match(source, /button:not\([^}]+:not\(\.ui-dialog \*\)[^{]*\{ background-color:/,
  "page-theme button styling must exclude native purchase-dialog buttons");
assert.match(source, /\.ui-dialog\.nu-dialog \{ color-scheme: light; \}/,
  "the native purchase dialog must retain its normal light form-control scheme under dark page themes");
assert.match(hubCss, /\.hub-settings-copy \.hub-settings-version\s*\{[\s\S]*?background:\s*var\(--hub-control-bg\);[\s\S]*?color:\s*var\(--hub-control-fg\);/,
  "the release chip must use a contrast-safe foreground and background pair");
assert.match(hubCss, /\.hub-settings-segment\.is-active\s*\{[\s\S]*?background:\s*color-mix\(in srgb, var\(--hub-accent\) 12%, var\(--hub-panel\)\);[\s\S]*?color:\s*var\(--hub-accent\);/,
  "the active page-colour segment must use an accent indicator over the panel surface");
assert.match(hubCss, /\.hub-settings-segment\s*\{[\s\S]*?background:\s*var\(--hub-panel\);[\s\S]*?color:\s*var\(--hub-ink\);/,
  "inactive page-colour segments must use the panel surface rather than the content-card colour");
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
