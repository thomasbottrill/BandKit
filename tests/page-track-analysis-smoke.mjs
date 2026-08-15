import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, state, contracts, background, offscreen, releaseCss] = await Promise.all([
  readFile(new URL("../src/content/index.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/state.js", import.meta.url), "utf8"),
  readFile(new URL("../src/shared/contracts.js", import.meta.url), "utf8"),
  readFile(new URL("../src/background/index.js", import.meta.url), "utf8"),
  readFile(new URL("../src/offscreen/index.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/modern/release.css", import.meta.url), "utf8")
]);

assert.match(state, /autoAnalyzeTracks:\s*true/, "page track analysis must default to automatic");
assert.match(state, /showTrackKeys:\s*true/, "musical keys must remain visible by default");
assert.match(state, /pageActionLabels:\s*false/, "page icon labels must default to compact/off");
assert.match(contracts, /ANALYZE_TRACKS:\s*"BANDCAMP_HUB_ANALYZE_TRACKS"/);
assert.match(background, /message\.type === MESSAGES\.ANALYZE_TRACKS[\s\S]*?OFFSCREEN_ANALYZE_TRACKS/,
  "the background must sanitize and forward page analysis requests");
assert.match(offscreen, /async function analyzeTrack\(track, force = false\)[\s\S]*?estimateBpm[\s\S]*?estimateKey/,
  "batch analysis must calculate both BPM and musical key");
assert.match(offscreen, /TRACK_ANALYSIS_SAMPLE_BYTES\s*=\s*524_288[\s\S]*?TRACK_ANALYSIS_FALLBACK_BYTES\s*=\s*1_048_576[\s\S]*?Range:\s*`bytes=0-\$\{sampleBytes - 1\}`/,
  "page analysis must retain its full analysis window and larger decode fallback");
assert.match(offscreen, /TRACK_ANALYSIS_CONCURRENCY\s*=\s*6[\s\S]*?Math\.min\(TRACK_ANALYSIS_CONCURRENCY, source\.length\)/,
  "page analysis must overlap six bounded track fetches when an album is large enough");
assert.match(source, /PAGE_TRACK_ANALYSIS_CONCURRENCY\s*=\s*6[\s\S]*?Math\.min\(PAGE_TRACK_ANALYSIS_CONCURRENCY, tracks\.length\)[\s\S]*?Array\.from\(\{ length: concurrency \}, worker\)/,
  "page analysis must progressively coordinate six track workers");
assert.match(offscreen, /trackAnalysisAudioContext \|\|= new AudioContextClass\(\)[\s\S]*?trackAnalysisAudioContext\.decodeAudioData/,
  "page analysis must reuse one decode context instead of creating a context per track");
assert.match(offscreen, /TRACK_ANALYSIS_FETCH_TIMEOUT_MS\s*=\s*10_000[\s\S]*?controller\.abort\(\)/,
  "page analysis stream requests must time out instead of hanging indefinitely");
assert.match(source, /tracks:\s*\[track\][\s\S]*?pageTrackAnalysis\.set\([\s\S]*?syncPageTrackAnalysisUi\(\)/,
  "page analysis must render each track result progressively");
assert.match(source, /button\.after\(analyzeButton\)/,
  "manual analysis must appear directly after the page DJ button");
assert.match(source, /--hub-analyze-icon[\s\S]*?icon-reset\.svg/,
  "manual analysis must use the same centered masked-icon treatment as page actions");
assert.match(source, /bandcamp-hub-page-analyze::before[\s\S]*?transform-origin:50% 50%[\s\S]*?bandcamp-hub-page-analyze\.is-analyzing::before/,
  "manual analysis must rotate its icon around a stable center point");
assert.doesNotMatch(source, /bandkit-page-analyze-symbol|symbol\.textContent = "↻"/,
  "manual analysis must not use an underlined text glyph as its icon");
assert.match(source, /bandcamp-hub-page-tools\{[^}]*flex-wrap:nowrap[^}]*min-width:0[^}]*width:100%/,
  "page actions must fill one line beneath the player so navigation can align to the waveform edge");
assert.match(source, /bandkit-page-transport-row\{[^}]*margin-left:auto[^}]*margin-right:-8px/,
  "page navigation must finish at the waveform's right edge");
assert.match(source, /function ensureClassicTransportRow[\s\S]*?setPageActionLabel\(control, ""\)/,
  "Previous and Next controls must remain icon-only when page action labels are enabled");
assert.match(source, /playerTools\.append\(addAllButton\)[\s\S]*?\(analyzeButton \|\| button\)\.after\(addAllButton\)/,
  "album Add all must live in the player action row after DJ or manual analysis");
assert.match(source, /duration\.after\(label\)/,
  "track analysis must render beside the duration");
assert.match(background, /minimumPrice:\s*Number\.isFinite\(minimumPrice\)[\s\S]*?minimumPrice >= 0/,
  "background metadata must preserve a zero minimum track price");
assert.match(source, /resolveTrackPrice\(button, track\)[\s\S]*?bandcamp-hub-page-cart-price/,
  "the page cart control must resolve and expose the current track price");
assert.match(source, /minimumFractionDigits:\s*Number\.isInteger\(amount\) \? 0 : 2/,
  "whole name-your-price values must remain compact enough for the cart icon");
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
assert.match(releaseCss, /\.bandkit-modern-release-primary\s*\{[^}]*grid-template-columns:\s*minmax\(0, 5fr\) minmax\(320px, 4fr\)/s,
  "modern releases must give the track column more room than artwork and notes");
assert.match(releaseCss, /\.download-col \.dl_link\s*\{[^}]*justify-content:\s*flex-end;[^}]*width:\s*100%\s*!important/s,
  "track action buttons must align with the right edge of row dividers");
assert.match(releaseCss, /data-bandkit-page-action-labels="true"[^}]*\.is-album-add-all\s*\{[^}]*min-width:\s*max-content\s*!important;[^}]*width:\s*auto\s*!important/s,
  "the labeled Add all action must expand to fit its icon and label");
assert.match(releaseCss, /data-bandkit-page-action-labels="true"[^}]*\.download-col \.bandcamp-hub-page-playlist\.is-track-action\s*\{[^}]*max-width:\s*none\s*!important;[^}]*min-width:\s*max-content\s*!important;[^}]*width:\s*auto\s*!important/s,
  "labeled per-track Add actions must not remain constrained to icon-only width");
assert.match(releaseCss, /data-bandkit-page-action-labels="true"[^}]*\.download-col \.bandcamp-hub-page-buy\s*\{[^}]*font-size:\s*0\s*!important;[^}]*width:\s*auto\s*!important/s,
  "labeled per-track Buy actions must suppress Bandcamp's native text and fit the generated label");
assert.match(releaseCss, /data-bandkit-page-action-labels="true"[^}]*\.download-col \.bandcamp-hub-page-buy::before\s*\{[^}]*content:\s*""\s*!important;[^}]*display:\s*block\s*!important/s,
  "labeled per-track Buy actions must restore their cart icon");
assert.match(releaseCss, /\.inline_player \.play_cell > a\s*\{[^}]*height:\s*72px\s*!important;[^}]*width:\s*72px\s*!important/s,
  "the page-player play control must span the title, metadata, and scrubber block");
assert.match(releaseCss, /\.inline_player \.track_info\s*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-columns:\s*max-content max-content minmax\(0, 1fr\)/s,
  "the page-player title and metadata must use stable aligned rows");
assert.match(releaseCss, /\.inline_player \.title,[\s\S]*?\.inline_player \.title_link\s*\{[^}]*font-size:\s*16px\s*!important;[^}]*line-height:\s*20px\s*!important;/s,
  "the page-player title line must leave enough height for letter descenders");
assert.match(releaseCss, /\.inline_player \.track_info > \.time\s*\{[^}]*grid-column:\s*1;[^}]*margin-left:\s*0\s*!important/s,
  "page-player time must align with the title's left edge");
assert.match(source, /bandcamp-hub-page-tools\{[^}]*margin:12px 0 0/,
  "page-player actions must retain a slightly larger gap below the scrubber");

console.log("Page track analysis and player alignment checks passed.");
