import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource, readHubStyles, readModernStyles } from "./support/source.mjs";

const source = readContentSource();
const css = readModernStyles();
const hubCss = readHubStyles();
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const lifecycleSource = fs.readFileSync(new URL("../src/content/runtime/lifecycle.js", import.meta.url), "utf8");
const pageActionsSource = fs.readFileSync(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8");
const collectionPlaylistsSource = fs.readFileSync(new URL("../src/content/runtime/collection-playlist-integration.js", import.meta.url), "utf8");

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

function pageType({ hostname = "artist.bandcamp.com", pathname = "/", bodyClasses = [], selectors = [] } = {}) {
  const available = new Set(selectors);
  const context = vm.createContext({
    location: { hostname, pathname },
    document: {
      body: { classList: { contains: (name) => bodyClasses.includes(name) } },
      querySelector(selector) {
        return selector.split(",").some((part) => available.has(part.trim())) ? {} : null;
      }
    }
  });
  vm.runInContext([
    extractFunction("isClassicReleasePage"),
    extractFunction("modernBandcampPageType"),
    "globalThis.result = modernBandcampPageType();"
  ].join("\n"), context);
  return context.result;
}

assert.equal(pageType({ hostname: "bandcamp.com", pathname: "/" }), "", "Home must remain untouched");
assert.equal(pageType({ hostname: "bandcamp.com", pathname: "/discover", selectors: ["#DiscoverApp"] }), "", "Discover must remain untouched");
assert.equal(pageType({ hostname: "bandcamp.com", pathname: "/bandcamp-fan", selectors: ["#fan-container"] }), "", "Collection must remain untouched");
assert.equal(pageType({ hostname: "bandcamp.com", pathname: "/fan/feed", bodyClasses: ["feed"] }), "feed");
assert.equal(pageType({ pathname: "/music", selectors: ["#music-grid"] }), "music");
assert.equal(pageType({ pathname: "/artists", selectors: [".artists-grid"] }), "music");
assert.equal(pageType({ pathname: "/merch", selectors: ["#merch-grid"] }), "merch");
assert.equal(pageType({ pathname: "/video", selectors: [".video-list"] }), "video");
assert.equal(pageType({ pathname: "/community", selectors: ["#community"] }), "community");
assert.equal(pageType({ pathname: "/album/release", bodyClasses: ["tralbum-page"], selectors: ["#trackInfo", "#tralbumArt", ".trackView"] }), "release");

assert.match(source, /Modern Bandcamp pages/);
assert.match(source, /Use modern Bandcamp pages/);
const bootstrapScript = manifest.content_scripts.find((entry) => entry.js?.includes("modern-pages-bootstrap.js"));
assert.ok(bootstrapScript, "Modern pages need an early bootstrap content script");
assert.equal(bootstrapScript.run_at, "document_start");
assert.ok(bootstrapScript.css?.includes("modern-release.css"), "Modern page CSS must be available before first paint");
assert.match(css, /data-bandkit-modern-pending="true"\]\s+body\s*\{[^}]*opacity:\s*0\s*!important/s, "Pending modern pages must not paint the legacy layout");
assert.match(css, /bandkit-modern-page-reveal 140ms ease-out/, "Ready modern pages must reveal smoothly");
assert.match(source, /earlyModernPageBootstrap\.finish\?\.\(\)/, "Content initialization must release the paint gate");
for (const type of ["feed", "music", "merch", "video", "community"]) {
  assert.match(css, new RegExp(`data-bandkit-modern-page-type=["']${type}["']`), `Missing ${type} layout styles`);
}
assert.match(css, /max-width:\s*1480px\s*!important/, "Artist tabs must use the album-page maximum width");
assert.match(css, /community-default-column:first-child/, "Community must target its message column independently");
assert.match(css, /community-default-column:nth-child\(2\)/, "Community must target its sidebar independently");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid/, "Merch must have its own card grid");
assert.match(css, /data-bandkit-modern-page-type="video"\]\s+\.video-list/, "Video must have its own media-card layout");
assert.match(css, /data-bandkit-modern-page-type="video"\]\s+\.video-list > \.video-wrapper\s*\{[^}]*aspect-ratio:\s*16 \/ 9/s, "Video players must keep a responsive widescreen ratio");
assert.match(css, /html\[data-bandkit-modern-page="true"\]\s+#band-navbar\s*\{[^}]*height:\s*48px\s*!important/s, "All artist tabs must share the album-page navigation height");
assert.match(css, /html\[data-bandkit-modern-page="true"\]\s+#band-navbar a\.active::after\s*\{[^}]*height:\s*2px/s, "All artist tabs must share the album-page active indicator");
assert.doesNotMatch(css, /#band-navbar\s*\{[^}]*height:\s*58px/s, "Legacy artist-tab height must not return");
assert.match(css, /data-bandkit-modern-page-type="music"\]\s+#music-grid \.art\s*\{[^}]*aspect-ratio:\s*1 \/ 1\s*!important/s, "Music artwork frames must be square");
assert.match(css, /#name-section h3\s*\{[^}]*max-width:\s*100%\s*!important;[^}]*width:\s*auto\s*!important/s,
  "Release bylines must override Bandcamp's fixed legacy width on phone layouts");
assert.match(css, /data-bandkit-modern-page-type="music"\]\s+#music-grid \.art img\s*\{[^}]*position:\s*absolute\s*!important/s, "Music artwork must not stretch its square frame");
assert.match(css, /data-bandkit-modern-page-type="music"\]\s+\.artists-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s, "Artists must use the same modern catalogue width as Music");
assert.match(css, /\.artists-grid \.artists-grid-pic\s*\{[^}]*aspect-ratio:\s*4 \/ 3\s*!important/s, "Artist portraits must use consistent landscape cards");
assert.match(css, /#rightColumn > #contact-help\s*\{[^}]*margin:\s*0 0 10px\s*!important/s, "Contact and help links must stay visually grouped with their heading");
assert.match(css, /#rightColumn a\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--bandkit-release-ink\) 82%, transparent\)\s*!important/s, "Artist and Music sidebars must use the same foreground-derived link colour");
assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?#rightColumn\s*\{[^}]*display:\s*flex\s*!important;[^}]*flex-direction:\s*column/s, "The responsive profile and help sidebar must remain one readable column");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid \.art\s*\{[^}]*aspect-ratio:\s*1 \/ 1\s*!important/s, "Merch artwork frames must be square");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid \.art img\s*\{[^}]*object-fit:\s*contain/s, "Merch product photography must remain uncropped");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid \.art img\s*\{[^}]*position:\s*absolute\s*!important/s, "Merch artwork must not stretch its square frame");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid\s*\{[^}]*align-items:\s*start/s, "Merch cards must not stretch to a shared row height");
assert.match(css, /#merch-grid > \.merch-grid-item > \.price\s*\{[^}]*margin-top:\s*8px\s*!important/s, "Merch prices must follow their card content naturally");
assert.match(css, /--bandkit-feed-card:\s*#ffffff/, "Feed stories must use a white card surface by default");
assert.match(css, /\.story \.story-footer\s*\{[^}]*background:\s*var\(--bandkit-feed-card\)[^}]*border-top:\s*0\s*!important/s, "Feed tag footers must remain part of the undivided card surface");
assert.match(css, /\.story \.collection-item-tags\s*\{[^}]*column-gap:\s*0;[^}]*font-size:\s*0\s*!important;[^}]*row-gap:\s*6px/s, "Feed tags must avoid a phantom leading gap while keeping wrapped rows separated");
assert.match(css, /\.story \.collection-item-tags a\s*\{[^}]*border-radius:\s*999px;[^}]*margin:\s*0 6px 0 0\s*!important;[^}]*padding:\s*7px 10px\s*!important/s, "Feed tag links must own their inter-chip spacing without Bandcamp's inherited alignment offset");
assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.story \.tralbum-wrapper\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.story \.tralbum-wrapper > \.tralbum-wrapper-col2\s*\{[^}]*display:\s*none\s*!important/s, "Restricted feed cards must remove the Supported by column before it collides with release content");
assert.match(css, /\.story \.collection-item-tags a:hover,[\s\S]*?\.story \.collection-item-tags a:focus-visible\s*\{[^}]*background:\s*var\(--bandkit-release-accent-soft\)\s*!important;[^}]*border-color:\s*var\(--bandkit-release-accent\)\s*!important;[^}]*transform:\s*none;/s, "Feed tag chips must expose hover and keyboard-focus feedback without movement");
assert.match(css, /grid-template-columns:\s*72px minmax\(0, 1fr\)/, "Feed identity rail must have a dedicated column");
assert.match(css, /\.story-sidebar\s*\{[^}]*align-items:\s*center;[^}]*flex-direction:\s*column/s, "Feed avatars and follow badges must share a centred rail");
assert.match(css, /\.story-sidebar \.follow-band\s*\{[^}]*border-radius:\s*999px\s*!important;[^}]*display:\s*inline-flex\s*!important/s, "Feed follow states must render as compact badges");
assert.match(css, /\.follow-band :is\(\.following-msg, \.unfollow-msg\)/, "Following and unfollow labels must share the badge treatment");
assert.match(css, /\.story a:not\(\.follow-band\)/, "Feed link accents must not override follow badge text contrast");
assert.doesNotMatch(source, /addToLabel\.textContent = "add to\.\.\."/, "Modern release tracklists must not add a redundant add-to label");
assert.match(source, /function createPageReleaseOverflowButton\(\)[\s\S]*?icon-more\.svg[\s\S]*?More release actions/, "Release pages should expose an accessible horizontal-ellipsis menu");
assert.match(source, /rootView === "release-actions"[\s\S]*?"＋ Add all to Now Playing"/, "The release playlist submenu should preserve the full Now Playing destination");
assert.match(source, /isBatch \? "＋ Add all to Cart…" : "＋ Add to Cart…"/, "Add-to menus should offer cart destinations for single tracks and batches");
assert.match(source, /Current Bandcamp cart/, "Panel add-to menus should offer the current Bandcamp cart");
assert.match(source, /_bandkitOwned = !isWishlistItem/,
  "Collection cards must distinguish purchased items from Wishlist items");
assert.match(source, /type === "bandkit-owned-track"[\s\S]*?if \(!isOwned\) \{[\s\S]*?Add all to Cart/,
  "Purchased Collection items must omit cart destinations while Wishlist items retain them");
assert.match(source, /button\._bandkitOwned[\s\S]*?to Now Playing or a playlist[\s\S]*?to Now Playing, a playlist, or a cart/,
  "Purchased Collection controls must not advertise an unavailable cart action");
assert.match(source, /#collection-items \.collection-grid\[data-ismain="true"\]\[data-iswish="false"\][\s\S]*?playlistTracksMatch\(ownedTrack, track\)/,
  "The music bar must recognize tracks belonging to the purchased Collection grid");
assert.match(source, /createTrackActionControls\(track, \{ labeled: true, playlistsOnly: true, hideCart \}\)/,
  "The music bar must omit its cart action for a currently playing purchased item");
assert.match(source, /result\.error && fallbackTrack && \/cart is not available\/i[\s\S]*?openTrackAction\(fallbackTrack, "cart"\)/,
  "Current-cart actions on Wishlist and Collection pages must fall back to the real Bandcamp purchase flow");
assert.match(source, /#buyTrackLink[\s\S]*?#buyAlbumLink[\s\S]*?\.download-link\.buy-link/,
  "Cart handoffs must prioritize Bandcamp's concrete track and album purchase controls");
assert.match(source, /function createEmptySavedPlaylist\(\)/, "Saved playlists should support empty creation");
assert.match(source, /function createEmptySavedCart\(\)/, "Saved carts should support empty creation");
assert.match(source, /option\("Gift"[\s\S]*?nativeGiftControl\(\)[\s\S]*?option\("Add all to playlist…"[\s\S]*?option\("Add all to cart…"/, "The release overflow menu should group Gift, playlist, and cart batch actions in order");
assert.match(source, /function prepareModernPurchaseActions\(purchaseList\)[\s\S]*?bandkit-modern-buy-details[\s\S]*?moveModernReleaseNode\(node, details\)/,
  "Modern purchase cards must group price and discount details without replacing Bandcamp's native nodes");
assert.match(source, /rightColumn\.querySelector\(":scope > #bio-container"\)[\s\S]*?artistCard\.after\(purchasePanel\)[\s\S]*?rightColumn\.prepend\(purchasePanel\)/,
  "Buy and collect must retain a stable right-column position before the artist card is relocated");
assert.doesNotMatch(source, /bandkit-modern-purchase-panel", "Buy & collect"/,
  "the right-column purchase cards must not retain a redundant Buy and collect heading");
assert.match(source, /function prepareModernDiscography\(\)[\s\S]*?headingLink\.textContent = "Discography"[\s\S]*?releaseItems\.slice\(3\)[\s\S]*?showMore\?\.classList\.add\("bandkit-modern-discography-more-link"\)[\s\S]*?return discography;/,
  "release Discography must retain its matching heading, three releases, and More link before relocation");
assert.doesNotMatch(source, /createModernReleaseShell\("li", "bandkit-modern-discography-more"\)/,
  "More releases must no longer be converted into a fourth square tile");
assert.match(source, /function prepareModernReleaseProfile\(releaseBody, artistCard, discography\)[\s\S]*?bandkit-modern-artist-column[\s\S]*?bandkit-modern-discography-column[\s\S]*?releaseBody\.append\(section\)/,
  "the Artist Follow card and Discography must share a 50/50 section above Supported by");
assert.match(source, /prepareModernDiscography\(\);[\s\S]*?prepareModernReleaseProfile\(releaseBody, artistCard, discography\);[\s\S]*?prepareModernSupporters\(releaseBody\)[\s\S]*?prepareModernReleaseInfo\(releaseBody, rightColumn\);/,
  "Artist and Discography must precede Supported by while Shows and Contact remain the final paired section");
assert.match(source, /function prepareModernSupporters\(releaseBody\)[\s\S]*?querySelector\(":scope > \.bandkit-modern-profile-section"\)[\s\S]*?profileSection\.after\(supporters\)[\s\S]*?releaseBody\.prepend\(supporters\)/,
  "Supported by must be inserted after Artist and Discography regardless of Bandcamp's original node order");
assert.match(source, /function prepareModernReleaseInfo\(releaseBody, rightColumn\)[\s\S]*?:scope > #showography[\s\S]*?:scope > #contact-help[\s\S]*?bandkit-modern-shows-column[\s\S]*?bandkit-modern-contact-column/,
  "Shows must precede Contact and help in their shared 50/50 section");
assert.match(source, /function prepareModernReleaseInfo\(releaseBody, rightColumn\)[\s\S]*?while \(next\?\.matches\("p"\)\)[\s\S]*?moveModernReleaseNode\(node, contactColumn\)/,
  "Contact and help must retain its related contact, support, policy, redemption, and reporting links");
assert.match(source, /mainAction\.append\(details\)[\s\S]*?moveModernReleaseNode\(node, details\)/,
  "Price and discount details must sit beside, rather than inside, the native Buy control");
assert.match(source, /createTreeWalker\(details, window\.NodeFilter\.SHOW_TEXT\)[\s\S]*?replace\(\/\\bor\\s\+more\\b\/gi, "\+"\)/,
  "Modern purchase prices must replace the verbose or-more suffix with a compact plus sign");
assert.match(source, /current\?\.type === "track"[\s\S]*?is-track-purchase[\s\S]*?setAttribute\("aria-label", "Buy"\)/,
  "Digital Track purchase cards must use the compact accessible Buy label");
assert.match(source, /bandkit-modern-gift-control[\s\S]*?icon-gift\.svg[\s\S]*?aria-label", "Send as gift"/,
  "Modern purchase cards must retain an accessible icon-only native Gift control");
assert.match(source, /purchaseAction\.matches\("a\[href\]"\)[\s\S]*?target\.hash = "bandkit-cart";[\s\S]*?purchaseAction\.href = target\.href;/,
  "Feed purchase icons must carry the native Bandcamp purchase-action handoff");
assert.match(source, /cartButton\.nextElementSibling !== playlistButton[\s\S]*?playlistButton\.nextElementSibling !== button[\s\S]*?button\.nextElementSibling !== overflowButton/, "Release actions must remain ordered Buy, Add, DJ, then More");
assert.match(source, /bandkit-page-skip-control", index \? "is-next" : "is-previous"[\s\S]*?--bandkit-skip-icon[\s\S]*?icon-skip\.svg/,
  "release Previous and Next controls must use the music player's shared Skip icon asset");
assert.match(source, /\.bandkit-page-skip-control::before\{[^}]*background:currentColor;[^}]*height:15px;[^}]*mask:var\(--bandkit-skip-icon\)[^}]*width:15px\}[\s\S]*?\.bandkit-page-skip-control\.is-previous::before\{transform:rotate\(180deg\)\}/,
  "release navigation must render the reduced shared Next icon and rotate the same glyph for Previous");
assert.match(source, /\.bandkit-page-skip-control\{[^}]*border:1px solid transparent!important;[^}]*color:var\(--hub-accent,[^}]*\}[\s\S]*?\.bandkit-page-skip-control:is\(:hover,:focus-visible\)\{[^}]*background:var\(--hub-accent-soft,[^}]*border-color:var\(--hub-accent,[^}]*box-shadow:none!important;[^}]*transform:none!important/,
  "release Previous and Next controls must be borderless at rest and use the shared motionless hover treatment");
assert.match(source, /function ensureClassicTransportRow[\s\S]*?applyPageActionTheme\(tools\)/,
  "release Previous and Next controls must inherit the exact resolved page-action palette");
assert.match(source, /applyPageActionTheme\(inlinePlayer\.querySelector\("\.play_cell > a"\)\)/,
  "the large release Play control must receive the exact resolved page-action palette");
assert.match(source, /function markModernTrackAvailability[\s\S]*?play-col > a[\s\S]*?applyPageActionTheme\(control\)/,
  "each track-list Play control must receive the exact resolved page-action palette");
assert.match(source, /function setThemeVariables[\s\S]*?\.inline_player \.play_cell > a, #track_table \.play-col > a, \.bandkit-page-skip-control/,
  "theme changes must directly update large, track-list, and navigation controls with the shared action palette");
assert.match(source, /function syncPageDjTheme[\s\S]*?--bandkit-release-surface[\s\S]*?--bandkit-page-surface[\s\S]*?--hub-panel[\s\S]*?--hub-scrub-surface/,
  "page DJ tools must derive their panel, controls, and waveform palette from the page rather than the music bar");
assert.match(source, /function renderPageDjTools[\s\S]*?createPageDjToolsCard\(\)/,
  "page DJ tools must use their compact page-only composition");
const pageDjToolsFunction = extractFunction("createPageDjToolsCard");
assert.match(source, /bandcamp-hub-page-dj[\s\S]*?icon-bpm\.svg[\s\S]*?Show BPM and tempo controls on this page/,
  "the on-page compact BPM controls must use a tempo gauge instead of the full DJ tools icon");
assert.match(source, /hub-dj-player-button[\s\S]*?icon-dj\.svg/,
  "the music bar must retain the full DJ tools icon");
assert.match(pageDjToolsFunction, /createDjAnalysis\(bpm\)/,
  "compact page DJ tools must reuse the BPM, Tap, and Auto controls");
assert.match(pageDjToolsFunction, /querySelector\("\.hub-dj-key"\)\?\.remove\(\)/,
  "compact page DJ tools must remove the duplicate key readout");
assert.match(pageDjToolsFunction, /hub-dj-page-tempo-input/,
  "compact page DJ tools must include a horizontal tempo control");
assert.doesNotMatch(pageDjToolsFunction, /hub-dj-page-tempo-output|tempoOutput/,
  "compact page DJ tools must not spend horizontal space on a tempo percentage readout");
assert.doesNotMatch(pageDjToolsFunction, /hub-dj-page-tempo-label/,
  "compact page DJ tools must not spend horizontal space on a visible Tempo label");
assert.match(pageDjToolsFunction, /hub-dj-page-close/,
  "compact page DJ tools must retain BPM, Tap, Auto, horizontal tempo, and an internal hide control");
assert.match(pageDjToolsFunction, /card\.append\(analysisRow, tempo, modes, close\)/,
  "compact page DJ tools must place analysis, tempo, modes, and Close on one ordered row");
assert.match(pageDjToolsFunction, /icon-close\.svg[\s\S]*?hub-dj-page-modes[\s\S]*?hub-dj-mode-button[\s\S]*?hub-dj-master/,
  "compact page DJ tools must use a themed icon close control and retain tempo-range and Master Tempo buttons");
assert.doesNotMatch(pageDjToolsFunction, /createDjWaveform|createDjEqControls|createDjPerformancePanel|createDjFaderPanel/,
  "compact page DJ tools must omit the waveform, EQ, platter, beat-loop, jog, vinyl-speed, and full fader controls");
const djAnalysisFunction = extractFunction("createDjAnalysis");
assert.match(djAnalysisFunction, /hub-dj-key-name[^\n]*detectedKey\?\.shortName[\s\S]*?hub-dj-key-camelot[^\n]*detectedKey\?\.camelot/,
  "DJ key readouts must prioritize the familiar musical key and show Camelot notation secondarily");
assert.match(djAnalysisFunction, /const baseBpm = Number\(seamless\.detectedBpm\) \|\| bpm;[\s\S]*?const targetRate = Math\.max\(0\.35, Math\.min\(2, tappedBpm \/ baseBpm\)\);[\s\S]*?state\.dj\.rate = targetRate;[\s\S]*?SEAMLESS_SET_RATE, \{[\s\S]*?rate: targetRate/,
  "a completed Tap tempo must convert the tapped BPM into a playback-rate change from the track's detected BPM");
assert.doesNotMatch(djAnalysisFunction, /tappedBpm[\s\S]*?SEAMLESS_SET_BPM/,
  "Tap tempo must not rewrite track BPM metadata instead of retiming the audio");
assert.match(djAnalysisFunction, /const restoreAutomaticBpm = !state\.dj\.autoTempo;[\s\S]*?state\.dj\.rate = 1;[\s\S]*?SEAMLESS_SET_RATE[\s\S]*?if \(restoreAutomaticBpm\) return seamlessCommand\(MESSAGES\.SEAMLESS_RESET_BPM\)/,
  "re-enabling Auto must reset tempo and restore the track's analyzed BPM instead of retaining the tapped override");
assert.match(hubCss, /\.hub-dj-card-page :is\(\.hub-dj-compact-action, \.hub-dj-mode-button, \.hub-dj-page-close\):is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*var\(--hub-accent-soft\);[^}]*border-color:\s*var\(--hub-accent\);/s,
  "page DJ actions must use the page-themed action hover treatment instead of a white card fill");
assert.match(hubCss, /\.hub-dj-card-page :is\(\.hub-dj-compact-action, \.hub-dj-mode-button\)\.is-active\s*\{[^}]*background:\s*var\(--hub-accent\);[^}]*border-color:\s*var\(--hub-accent\);[^}]*color:\s*var\(--hub-on-accent\);/s,
  "page DJ Auto and Master Tempo active states must use the page theme's accent palette");
assert.match(hubCss, /\.hub-dj-card-page \.hub-dj-status-button\.is-active \.hub-dj-active-dot\s*\{[^}]*background:\s*var\(--hub-on-accent\);/s,
  "page DJ active indicators must retain contrast against the page-themed active fill");
assert.match(hubCss, /\.hub-dj-card-page\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*auto minmax\(135px, 1fr\) auto 22px;[^}]*position:\s*relative;/s,
  "the page DJ card must keep analysis, tempo, modes, and Close on one compact row");
assert.match(hubCss, /\.hub-dj-card-page \.hub-dj-analysis-row\s*\{[^}]*grid-template-columns:\s*76px 32px 40px;[^}]*justify-content:\s*start;/s,
  "the page DJ analysis group must fit decimal BPM values while reserving only the width needed for Tap and Auto");
assert.match(hubCss, /\.hub-dj-page-tempo\s*\{[^}]*display:\s*block;[^}]*min-width:\s*0;/s,
  "the page tempo slider must use the full width freed by removing its percentage readout");
assert.match(hubCss, /\.hub-dj-page-close\s*\{[^}]*height:\s*22px;[^}]*opacity:\s*0;[^}]*position:\s*static;[^}]*width:\s*22px;/s,
  "the page DJ close control must stay subtle at the row's top-right edge until interaction");
assert.match(hubCss, /\.hub-dj-card-page :is\(\.hub-dj-compact-action, \.hub-dj-mode-button, \.hub-dj-page-close\)\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid transparent;[^}]*border-radius:\s*4px;[^}]*box-shadow:\s*none;[^}]*color:\s*var\(--hub-accent\);/s,
  "all compact page DJ buttons must share the resting page-action button treatment");
assert.match(hubCss, /\.hub-dj-page-tempo-input\s*\{[^}]*var\(--hub-scrub-accent\)[^}]*var\(--hub-scrub-remaining\)[^}]*height:\s*4px;/s,
  "the page tempo rail must use the waveform's solid played and remaining colours");
assert.match(hubCss, /\.hub-dj-page-tempo-input::-webkit-slider-thumb\s*\{[^}]*background:\s*var\(--hub-scrub-accent\);[^}]*border:\s*2px solid var\(--hub-scrub-surface\);[^}]*height:\s*18px;[^}]*width:\s*7px;/s,
  "the page tempo handle must match the waveform playhead geometry and palette");
assert.match(source, /function syncPageDjToolsUi[\s\S]*?button\.hidden = pageDjOpen/,
  "the page DJ launcher must remain hidden while its inline tools are open");
assert.match(source, /:is\(\.collect-item\.wishlisted \.bandkit-feed-wishlist-action,\.bandkit-feed-wishlist-action\.wishlisted\) \.wishlist-msg\.bandkit-feed-wishlist-control\{display:none!important\}/,
  "wishlisted Feed items and sidebar releases must hide the inactive native wishlist half instead of showing a duplicate heart");
assert.match(source, /\.bandkit-feed-wishlist-action \.wishlisted-msg>\.view\{display:none!important\}/,
  "the compact Feed wishlist control must not add Bandcamp's separate wishlist-view arrow");
assert.match(source, /\.bandkit-feed-wishlist-action\{flex:0 0 auto!important;margin-left:4px!important\}/,
  "the compact Feed wishlist control must have extra separation from the preceding pre-order action");
assert.match(source, /\.bandkit-feed-wishlist-action :is\(\.wishlist-msg\.bandkit-feed-wishlist-control,\.wishlisted-msg>\.bandkit-feed-wishlist-control\)\{background:transparent!important;border-color:transparent!important\}/,
  "Feed wishlist controls must remain transparent and borderless in both states");
assert.match(source, /:is\(\.collect-item\.wishlisted \.bandkit-feed-wishlist-action,\.bandkit-feed-wishlist-action\.wishlisted\) \.wishlisted-msg>\.bandkit-feed-wishlist-control\{background:transparent!important;border-color:transparent!important;color:#ff9c00!important\}/,
  "the single visible Feed wishlist heart must use Bandcamp's original orange after it is wishlisted");
assert.match(source, /:is\(\.collect-item\.wishlisted \.bandkit-feed-wishlist-action,\.bandkit-feed-wishlist-action\.wishlisted\) \.wishlisted-msg>\.bandkit-feed-wishlist-control::before\{mask-image:var\(--bandkit-feed-wishlist-filled-icon\)!important;-webkit-mask-image:var\(--bandkit-feed-wishlist-filled-icon\)!important\}/,
  "the visible wishlisted Feed control must swap the outline heart for a filled heart");
assert.match(source, /body\.feed :is\(\.bandkit-feed-action-row,\.bandkit-feed-sidebar-actions\) :is\([^}]+\)\{background:transparent!important;border-color:transparent!important\}/,
  "Feed action buttons must not show backing or borders at rest");
assert.match(source, /body\.feed :is\(\.bandkit-feed-action-row,\.bandkit-feed-sidebar-actions\) :is\([^}]+\):is\(:hover,:focus-visible\)\{background:rgba\(6,135,245,\.1\)!important;border-color:currentColor!important\}/,
  "Feed action buttons must restore their backing on hover or keyboard focus");
assert.match(source, /\.story-innards>\.tralbum-wrapper-collect-controls \.bandkit-feed-action-row\{opacity:0!important;pointer-events:none!important;transition:opacity 120ms ease\}[\s\S]*?\.story-innards:is\(:hover,:focus-within\)>\.tralbum-wrapper-collect-controls \.bandkit-feed-action-row\{opacity:1!important;pointer-events:auto!important\}/,
  "Feed action rows must reveal only when their overall card is hovered or keyboard-focused");
assert.match(source, /\.story-innards:is\(:hover,:focus-within\) \.bandkit-feed-action-row \[data-bandkit-label\]>\.bandkit-page-action-label\{display:inline-block!important/,
  "revealed Feed action buttons must include their labels");
assert.match(source, /\.bandkit-feed-wishlist-action\{flex:0 0 auto!important;margin-left:4px!important\}[\s\S]*?\.bandkit-feed-wishlist-action \.wishlisted-msg\{align-items:center!important;display:none!important;margin:0!important;padding:0!important\}[\s\S]*?:is\(\.collect-item\.wishlisted \.bandkit-feed-wishlist-action,\.bandkit-feed-wishlist-action\.wishlisted\) \.wishlisted-msg\{display:flex!important\}/,
  "the wishlisted and unwishlisted controls must retain the same stable gap from the preceding purchase action");
assert.match(source, /body\.feed :is\(\.collect-item\.wishlisted \.bandkit-feed-wishlist-action,\.bandkit-feed-wishlist-action\.wishlisted\) \.wishlisted-msg>\.bandkit-feed-wishlist-control:is\(:hover,:focus-visible\)\{background:color-mix\(in srgb,#ff9c00 14%,transparent\)!important;border-color:#ff9c00!important\}/,
  "the orange wishlisted heart must regain an orange backing only on hover or keyboard focus");
assert.match(source, /function drawDjWaveform[\s\S]*?--hub-scrub-accent[\s\S]*?--hub-scrub-remaining[\s\S]*?waveformAmplitudes[\s\S]*?roundRect/,
  "DJ tools must share the regular scrubber palette and rounded waveform treatment");
assert.match(source, /\.bandcamp-hub-page-tools :is\([^}]*\):not\(\.is-active\):not\(\.is-added\)\{[^}]*background:transparent!important;[^}]*border-color:transparent!important/,
  "the primary page action row must keep button outlines hidden until interaction");
assert.match(css, /\.bandcamp-hub-page-tools :is\([^)]*\.bandcamp-hub-page-playlist,[^)]*\.bandcamp-hub-page-cart,[^)]*\.bandcamp-hub-page-dj,[^)]*\.bandcamp-hub-page-overflow[^)]*\)\s*\{[^}]*color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;/s,
  "Modern release page actions must share one accent icon colour");
assert.match(css, /\.bandcamp-hub-page-tools :is\([^)]*\.bandcamp-hub-page-playlist,[^)]*\.bandcamp-hub-page-cart,[^)]*\.bandcamp-hub-page-dj,[^)]*\.bandcamp-hub-page-overflow[^)]*\):is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*var\(--hub-accent-soft, var\(--bandkit-release-accent-soft\)\)\s*!important;[^}]*border-color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;/s,
  "Modern release actions must share the same tinted hover and focus treatment");
assert.match(css, /\.bandcamp-hub-page-tools \.bandcamp-hub-page-dj\.is-active\s*\{[^}]*background:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;[^}]*color:\s*var\(--hub-on-accent, var\(--bandkit-release-on-accent\)\)\s*!important;/s,
  "The active DJ button must use the palette's readable on-accent icon colour");
assert.match(css, /\.inline_player \.play_cell > a:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*var\(--hub-accent-soft, var\(--bandkit-release-accent-soft\)\)\s*!important;[^}]*border-color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;[^}]*box-shadow:\s*none;[^}]*color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;/s,
  "the large release play and pause control must expose motionless, glow-free hover feedback");
assert.match(css, /\.inline_player \.play_cell > a\s*\{[^}]*background:\s*transparent\s*!important;[^}]*color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;[^}]*border:\s*1px solid transparent\s*!important;/s,
  "the large release play and pause control must match the borderless page-action resting state");
assert.match(css, /#track_table \.play-col > a:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*var\(--hub-accent-soft, var\(--bandkit-release-accent-soft\)\)\s*!important;[^}]*border-color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;[^}]*box-shadow:\s*none\s*!important;[^}]*color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;[^}]*transform:\s*none\s*!important;/s,
  "track-list play and pause controls must use the same motionless hover treatment");
assert.match(css, /#track_table \.play-col > a\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*1px solid transparent\s*!important;[^}]*color:\s*var\(--hub-accent, var\(--bandkit-release-accent\)\)\s*!important;/s,
  "track-list play and pause controls must match the borderless page-action resting state");
assert.match(css, /#track_table \.play_status\s*\{[^}]*background:\s*none\s*!important;[^}]*color:\s*inherit\s*!important;/s,
  "the native track-list glyph layer must inherit the resolved page-action color");
assert.match(css, /#track_table \.track_row_view:is\(:hover, :focus-within\)\s*\{[^}]*background:\s*color-mix\([^}]*box-shadow:\s*none;/s,
  "each track row must expose a subtle whole-row hover and keyboard-focus tint without a side marker");
assert.match(source, /playCell\.dataset\.bandkitTrackNumber\s*=\s*String\(trackNumber \|\| displayedTrackNumber \|\| index \+ 1\)/,
  "each modern track row must expose its number in the shared number/play slot");
assert.match(css, /#track_table \.track-number-col\s*\{\s*display:\s*none\s*!important;/s,
  "the redundant number column must be removed so track titles gain its width");
assert.match(css, /#track_table \.play-col > a\s*\{[^}]*opacity:\s*0;/s,
  "track play controls must remain hidden in the resting pointer state");
assert.match(css, /\.track_row_view:not\(\.bandkit-modern-track-unplayable\):is\(:hover, :focus-within\) \.play-col > a,[\s\S]*?\.track_row_view\.bandcamp-hub-is-playing \.play-col > a,[\s\S]*?\.track_row_view:has\(\.play_status\.playing\) \.play-col > a\s*\{\s*opacity:\s*1;/,
  "hovered, keyboard-focused, and playing tracks must reveal their play or pause control");
assert.match(css, /\.track_row_view\.bandkit-modern-track-unplayable:is\(:hover, :focus-within\)\s*\{\s*background:\s*var\(--bandkit-release-surface-raised\)\s*!important;/,
  "unavailable pre-release tracks must not receive the interactive row hover tint");
assert.match(css, /\.track_row_view\.bandkit-modern-track-unplayable :is\(\.play-col, \.title-col\)\s*\{\s*opacity:\s*0\.52;/,
  "unavailable pre-release tracks must retain readable but clearly muted metadata");
assert.match(css, /#recommendations_container \.album-art-container > :is\(\.play-button, \.play-pause-button, \.playbutton, \.bandcamp-hub-page-playlist\.is-recommendation-add-to\)\s*\{[^}]*background:\s*color-mix\([^}]*border:\s*1px solid var\(--bandkit-release-accent\)\s*!important;[^}]*border-radius:\s*4px\s*!important;[^}]*height:\s*36px\s*!important;[^}]*width:\s*36px\s*!important;/s,
  "More to explore Play and Add controls must share the same high-contrast square treatment");
assert.match(css, /\.recommended-album:is\(:hover, :focus-within, \.bandkit-recommendation-current\)[^{]*\.playbutton\)\s*\{[^}]*opacity:\s*1\s*!important;/s,
  "More to explore Play controls must reveal with their hovered, focused, or current card");
assert.match(css, /#recommendations_container \.album-art-container > :is\(\.play-button, \.play-pause-button, \.playbutton\)\s*\{[^}]*left:\s*10px\s*!important;/s,
  "the More to explore Play control must keep the first overlay slot");
assert.match(source, /is-recommendation-add-to\{bottom:10px!important;left:52px!important;[^}]*position:absolute!important;top:auto!important;/,
  "the adjacent More to explore Add control must remain positioned beside Play instead of below the artwork");
assert.match(css, /#recommendations_container \.album-art-container > \.bandcamp-hub-page-playlist\.is-recommendation-add-to\s*\{[^}]*left:\s*52px\s*!important;/s,
  "the modern release cascade must preserve the Add control's adjacent position");
assert.match(css, /\.bandcamp-hub-page-playlist\.is-recommendation-add-to\):is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*var\(--bandkit-release-accent-soft\)\s*!important;[^}]*box-shadow:\s*none\s*!important;[^}]*color:\s*var\(--bandkit-release-accent\)\s*!important;[^}]*transform:\s*none\s*!important;/s,
  "More to explore Play and Add controls must share the same hover and focus state");
assert.match(css, /\.bandkit-modern-purchase-actions\s*\{[^}]*display:\s*flex;[^}]*gap:\s*8px;/s,
  "Buy and Gift must share a compact purchase action row");
assert.match(css, /\.bandkit-modern-purchase-panel\s*\{[^}]*margin:\s*0 0 14px\s*!important;[^}]*max-width:\s*340px\s*!important;[^}]*width:\s*min\(100%, 340px\)\s*!important;/s,
  "Buy and collect must remain an unboxed page-level section capped to the original sidebar width");
assert.match(css, /\.bandkit-modern-purchase-list > \.buyItem\s*\{[^}]*background:\s*var\(--bandkit-release-surface-raised\)\s*!important;[^}]*border:\s*1px solid transparent\s*!important;[^}]*border-radius:\s*8px;[^}]*padding:\s*20px\s*!important;/s,
  "each purchase option must reserve a stable but invisible resting outline");
assert.match(css, /\.bandkit-modern-purchase-list > \.buyItem:is\(:hover, :focus-within\)\s*\{[^}]*background:\s*var\(--bandkit-release-surface-raised\)\s*!important;[^}]*border-color:\s*var\(--bandkit-release-line\)\s*!important;[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/s,
  "purchase-card hover and keyboard focus must reveal only the neutral divider-colour outline");
assert.match(css, /\.bandkit-modern-purchase-list > \.buyItem\s*\{[^}]*max-width:\s*100%\s*!important;[^}]*min-width:\s*0\s*!important;[^}]*overflow:\s*hidden;/s,
  "wide purchase content must not expand an individual card beyond the purchase column");
assert.match(css, /\.bandkit-modern-artist-column > #bio-container\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;[^}]*margin:\s*0\s*!important;/s,
  "the relocated Artist details must sit directly in its section without an outer card outline");
assert.match(css, /#bio-container \.artists-bio-pic\s*\{[^}]*grid-row:\s*2;[^}]*width:\s*112px\s*!important;[\s\S]*?#bio-container \.artists-bio-pic img\s*\{[^}]*height:\s*112px\s*!important;[^}]*width:\s*112px\s*!important;/s,
  "the Artist image must be enlarged and stacked below the name and location");
assert.match(css, /#bio-container \.following-actions-wrapper\s*\{[^}]*grid-row:\s*3;[^}]*justify-self:\s*start;[\s\S]*?\.following-actions-wrapper \.follow-unfollow\s*\{[^}]*max-width:\s*112px\s*!important;[^}]*min-width:\s*112px\s*!important;[^}]*width:\s*112px\s*!important;/s,
  "the Follow or Following control must sit below and exactly match the 112px Artist image width");
assert.match(css, /\.bandkit-modern-buy-control,[\s\S]*?\.following-actions-wrapper \.follow-unfollow\s*\{[^}]*background:\s*var\(--bandkit-release-accent\)\s*!important;[^}]*border:\s*1px solid var\(--bandkit-release-accent\)\s*!important;[^}]*color:\s*var\(--bandkit-release-on-accent\)\s*!important;/s,
  "Artist Follow states must share the primary Buy button treatment");
assert.match(css, /\.bandkit-modern-buy-control:is\(:hover, :focus-visible\),[\s\S]*?\.follow-unfollow:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--bandkit-release-on-accent\) 10%, var\(--bandkit-release-accent\)\)\s*!important;[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/s,
  "Artist Follow states must share the primary Buy button's calculated, stationary, glow-free hover fill");
assert.match(css, /\.bandkit-modern-discography-column > #discography\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;[^}]*padding:\s*0\s*!important;[^}]*width:\s*100%\s*!important;/s,
  "Discography must sit unboxed inside its half-width profile column");
assert.match(css, /\.bandkit-modern-release-body\s*\{[^}]*gap:\s*0;[^}]*padding-top:\s*0;/s,
  "Release-body spacing must come from its sections rather than an extra container inset");
assert.match(css, /\.bandkit-modern-release-body > :first-child\s*\{[^}]*border-top:\s*0\s*!important;/s,
  "the first release-body section must not stack a second border over the shared divider");
assert.match(css, /\.collected-by\s*\{[^}]*border-bottom:\s*0\s*!important;[^}]*padding:\s*28px 0\s*!important;/s,
  "Supported by must share the standard 28px top and bottom section padding");
assert.match(css, /\.collected-by \.message\s*\{[^}]*margin:\s*0 0 18px\s*!important;[\s\S]*?\.collected-by \.more-thumbs\s*\{[^}]*margin-top:\s*18px\s*!important;/s,
  "Supported by must leave matching breathing room below its heading and avatar grid");
assert.match(css, /\.bandkit-modern-tags-panel\s*\{[^}]*padding-top:\s*28px;/s,
  "Tags must use the same divider-to-heading spacing as Supported by and Discography");
assert.match(css, /\.bandkit-modern-tags-panel\s*\{[^}]*padding-bottom:\s*28px;[^}]*padding-top:\s*28px;/s,
  "Tags must retain comfortable space below its final row of chips");
assert.match(css, /\.bandkit-modern-tags-panel\s*\{[^}]*border-top:\s*1px solid var\(--bandkit-release-line\);/s,
  "Tags must retain a single divider when it follows Discography");
assert.match(css, /#discography > \.bandkit-modern-section-title\s*\{[^}]*font-size:\s*20px\s*!important;[^}]*font-weight:\s*600\s*!important;[^}]*margin:\s*0 0 14px\s*!important;/s,
  "Discography must match the Tags section-heading typography");
assert.match(css, /#discography ul\s*\{[^}]*grid-auto-columns:\s*120px;[^}]*grid-auto-flow:\s*column;[^}]*overflow-x:\s*auto;[^}]*padding:\s*3px 2px 8px\s*!important;/s,
  "Discography releases must use artwork-width columns with enough inset to prevent hover clipping");
assert.match(css, /#discography li\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*120px\s*!important;/s,
  "Discography hover surfaces must hug the same 120px content width as their artwork");
assert.match(css, /\.bandkit-modern-discography-extra\s*\{[^}]*display:\s*none\s*!important;/s,
  "Discography must show no more than three release covers");
assert.match(css, /#discography > \.bandkit-modern-discography-more-link\s*\{[^}]*margin:\s*28px 2px 0\s*!important;[^}]*width:\s*auto\s*!important;/s,
  "More releases must sit as a normally aligned link below the three cards with standard spacing");
assert.match(css, /#discography > \.bandkit-modern-discography-more-link a:hover\s*\{[^}]*text-decoration:\s*underline\s*!important;/s,
  "More releases must use a conventional link hover instead of a card outline");
assert.match(css, /#discography li:is\(:hover, :focus-within\)\s*\{[^}]*background:\s*var\(--bandkit-release-accent-soft\)\s*!important;[^}]*box-shadow:\s*none;[^}]*transform:\s*none;/s,
  "each clickable Discography card must expose a clear hover state without lifting or glowing");
assert.match(css, /:is\(\.bandkit-modern-profile-section, \.bandkit-modern-info-section\)\s*\{[^}]*padding:\s*28px 0;[^}]*width:\s*100%;/s,
  "both paired release sections must retain matching vertical spacing");
assert.match(css, /\.bandkit-modern-profile-section\s*\{[^}]*gap:\s*32px;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
  "Artist and Discography must use an even 50/50 split");
assert.match(css, /\.collected-by \.deets\s*\{[^}]*gap:\s*36px;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
  "Supported by comments and supporter grid must use an even 50/50 split");
assert.match(css, /\.bandkit-modern-supporter-reviews:empty\s*\{[^}]*display:\s*none\s*!important;[^}]*\}[\s\S]*?\.deets:has\(> \.bandkit-modern-supporter-reviews:empty\)[^{]*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*\}[\s\S]*?\.bandkit-modern-supporter-grid\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*1;/s,
  "Supported by must give its grid the full width when no comments exist");
assert.match(css, /\.bandkit-modern-info-section\s*\{[^}]*gap:\s*32px;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
  "Shows and Contact and help must retain their even 50/50 split");
assert.match(css, /\.bandkit-modern-shows-column #showography ul\s*\{[^}]*gap:\s*18px 24px;[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(145px, 1fr\)\);/s,
  "individual show listings must retain readable horizontal and vertical spacing");
assert.match(css, /\.bandkit-modern-shows-column #showography \.showMore\s*\{[^}]*margin:\s*20px 0 0\s*!important;/s,
  "the More shows link must remain separated from the event grid");
assert.match(css, /@media \(max-width:\s*680px\)[\s\S]*?:is\(\.bandkit-modern-profile-section, \.bandkit-modern-info-section\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
  "both paired release sections must stack on narrow screens");
assert.match(css, /\.bandkit-modern-purchase-actions\s*\{[^}]*flex-wrap:\s*nowrap;/s,
  "Buy, price, discount, and Gift must remain on one purchase row");
assert.match(css, /\.bandkit-modern-buy-details\s*\{[^}]*display:\s*inline-flex;[^}]*flex-wrap:\s*nowrap;[^}]*font-size:\s*13px;[^}]*font-weight:\s*700;[^}]*gap:\s*2px 4px;[^}]*white-space:\s*nowrap;/s,
  "Purchase prices must remain in one compact, readable group outside the Buy button");
assert.match(css, /\.bandkit-modern-buy-details \.buyItemExtra\s*\{[^}]*font-size:\s*11px;[^}]*font-weight:\s*600;/s,
  "secondary purchase qualifiers must remain visually subordinate to the enlarged price");
assert.match(css, /\.bandkit-modern-buy-control,[\s\S]*?\.following-actions-wrapper \.follow-unfollow\s*\{[^}]*background:\s*var\(--bandkit-release-accent\)\s*!important;[^}]*border:\s*1px solid var\(--bandkit-release-accent\)\s*!important;[^}]*border-radius:\s*5px\s*!important;[^}]*color:\s*var\(--bandkit-release-on-accent\)\s*!important;/s,
  "every native Buy or Pre-order control must retain the same boxed primary-button treatment");
assert.match(css, /\.bandkit-modern-buy-control:is\(:hover, :focus-visible\),[\s\S]*?\.follow-unfollow:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--bandkit-release-on-accent\) 10%, var\(--bandkit-release-accent\)\)\s*!important;[^}]*border-color:\s*color-mix\([^}]*box-shadow:\s*none;[^}]*transform:\s*none;/s,
  "primary Buy, Pre-order, and Follow controls must expose a subtle calculated fill without lifting or glowing");
assert.match(css, /\.bandkit-modern-buy-card\.is-track-purchase \.bandkit-modern-buy-label::after\s*\{[^}]*content:\s*"Buy";/s,
  "Track purchase cards must render the shorter Buy copy");
assert.match(css, /\.send-as-gift \.bandkit-modern-gift-control\s*\{[^}]*font-size:\s*0\s*!important;[^}]*height:\s*42px;[^}]*width:\s*42px;/s,
  "Gift must render as a square icon button alongside Buy");
assert.match(css, /\.send-as-gift \.bandkit-modern-gift-control\s*\{[^}]*border-color:\s*transparent\s*!important;/s,
  "Gift must remain visually borderless until hover or keyboard focus");
assert.match(css, /\.send-as-gift \.bandkit-modern-gift-control\s*\{[^}]*color:\s*var\(--bandkit-release-ink\)\s*!important;/s,
  "Gift icons must use the same restrained foreground as the player action icons at rest");
assert.match(css, /\.bandkit-modern-gift-action\s*\{[^}]*margin:\s*0 0 0 auto\s*!important;/s,
  "Gift must stay aligned to the far right of every purchase row");
assert.match(css, /\.bandkit-modern-gift-control:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*var\(--bandkit-release-accent-soft\)\s*!important;[^}]*border-color:\s*var\(--bandkit-release-accent\)\s*!important;/s,
  "Gift must expose the same accent hover and keyboard-focus feedback as adjacent controls");
assert.match(css, /body\.tralbum-page \.ui-dialog\.nu-dialog\s*\{[^}]*color-scheme:\s*light;/s,
  "Bandcamp purchase dialogs must retain light native fields and checkboxes on dark matched palettes");
assert.doesNotMatch(source, /createPageGiftButton|is-album-add-all/, "Gift and album-wide actions must not remain as standalone release buttons");
assert.match(source, /if \(buyTrack\)[\s\S]*?applyPageActionTheme\(buyTrack\);[\s\S]*?applyPageActionTheme\(button\);/, "Per-track add and buy actions should inherit the shared page-action palette when those controls exist");
assert.match(source, /function applyPageActionTheme\(control\)[\s\S]*?"--hub-card"/, "Dynamically inserted page actions must inherit the matched Bandcamp card background");
assert.match(source, /function openPagePlaylistMenu\(anchor, selection, view = "destinations"\)[\s\S]*?applyPageActionTheme\(pagePlaylistMenu\)/,
  "Page Add and ellipsis menus must receive the canonical current page or theme palette");
assert.match(source, /\.bandcamp-hub-page-playlist-menu\{[^}]*background:var\(--hub-card,#fff\);[^}]*border:1px solid var\(--hub-line,[^}]*color:var\(--hub-ink,#111\);/s,
  "Page action menus must paint their surface, outline, and text from the applied palette");
assert.match(source, /function updatePagePlaylistButton\(button, track\)[\s\S]*?applyPageActionTheme\(button\);/, "Every refreshed Add button must reapply the current Match Bandcamp palette");
assert.match(source, /dataset\.bandkitModernStyling = String\(modernStyling\)/,
  "the Modern Bandcamp pages preference must expose a separate visual-style gate across page types");
assert.match(source, /button\.classList\.toggle\("is-feed-compact-action", modernActions\)/,
  "Feed Add controls must drop their modern compact class when classic pages are selected");
assert.match(source, /purchaseAction\.classList\.toggle\("bandkit-feed-purchase-action", modernActions\)/,
  "native Feed purchase controls must only receive Bandkit's modern button treatment in modern mode");
assert.match(source, /wishlistItem\?\.classList\.toggle\("bandkit-feed-wishlist-action", modernActions\)/,
  "native Feed wishlist controls must only receive Bandkit's modern heart treatment in modern mode");
assert.match(source, /if \(!modernActions\) \{[\s\S]*?:not\(\.bandcamp-hub-page-playlist\):not\(\.bandcamp-hub-page-dj\)[\s\S]*?playlistButton\.after\(button\)/,
  "classic release pages must retain the injected Add and BPM controls in the page action row");
assert.match(source, /html\[data-bandkit-modern-styling="false"\] :is\(\.bandcamp-hub-page-playlist:not\(\.is-feed-add-to\),\.bandcamp-hub-page-tools>\.bandcamp-hub-page-dj\)\{[^}]*background:transparent!important;[^}]*border:0!important;[^}]*color:inherit!important;[^}]*font:inherit!important;/,
  "classic Add and BPM controls must inherit the surrounding page typography and colour without Bandkit button chrome");
assert.match(source, /html\[data-bandkit-modern-styling="false"\] :is\(\.bandcamp-hub-page-playlist:not\(\.is-feed-add-to\),\.bandcamp-hub-page-tools>\.bandcamp-hub-page-dj\)::before\{[^}]*height:16px!important;[^}]*width:16px!important\}/,
  "icon-only classic Add and BPM controls must remain visible even though their text is visually suppressed");
assert.match(source, /html\[data-bandkit-modern-styling="false"\] \.track_row_view \.bandcamp-hub-page-playlist\.is-track-action\{margin-left:10px!important\}/,
  "classic track rows must leave a readable gap between Bandcamp's Buy link and the Add control");
assert.match(source, /html\[data-bandkit-modern-styling="false"\] \[data-bandkit-label\]>\.bandkit-page-action-label\{display:none!important\}/,
  "modern page-action labels must stay hidden in classic mode");
assert.doesNotMatch(source, /html\[data-bandkit-modern-release="false"\] body\.tralbum-page \.inline_player \.playbutton::before/,
  "classic release pages must retain Bandcamp's native play icons");
assert.match(css, /#track_table \.download-col :is\(\.bandcamp-hub-page-playlist\.is-track-action, \.bandcamp-hub-page-buy\)\s*\{[^}]*border:\s*1px solid var\(--hub-line,[^}]*color:\s*var\(--hub-accent,/s, "Per-track actions should use the same border and accent variables as the page controls");
assert.match(source, /function bindPageScrubDrag\(control\)[\s\S]*?pointerdown[\s\S]*?pointermove[\s\S]*?pointerup/, "Page scrubbers should support continuous pointer dragging");
assert.match(source, /previewPageScrub[\s\S]*?--bandkit-page-scrub-progress/, "Page scrubbers should preview the playhead position while dragging");
assert.match(source, /const fraction = drag\.fraction;[\s\S]*?commitPageScrub\(control, fraction\)/, "Page scrubbers should commit the last stable drag position instead of trusting pointer-up coordinates");
assert.match(source, /containThemeColourPointer[\s\S]*?pointerdown[\s\S]*?stopPropagation/, "Theme colour sliders should not bubble pointer gestures into draggable panel chrome");
assert.match(source, /const maxLeft = Math\.max\(8, window\.innerWidth - dragging\.width - 8\);[\s\S]*?Math\.max\(8, Math\.min\(maxLeft,/, "Panel dragging must clamp to a valid viewport range even when the panel nearly fills the screen");
assert.match(source, /const savedWidth = Number\(state\.layout\.width\) \|\| 420;[\s\S]*?Math\.max\(8, window\.innerWidth - width - 8\)/, "Saved panel geometry must reject invalid values and preserve an on-screen inset");
assert.match(source, /commitPageScrub[\s\S]*?MESSAGES\.SEAMLESS_SEEK/, "Page scrubbers should commit the previewed position on release");
assert.match(css, /body\.feed #stories-vm\s*\{[^}]*grid-column:\s*1/s, "Feed stories must occupy the wide column regardless of DOM order");
assert.match(css, /body\.feed #stories-vm > h2,[\s\S]*?body\.feed #stories > h2\s*\{[^}]*display:\s*none\s*!important/s, "Both live Feed heading locations must remove the redundant Fan Activity divider");
assert.match(css, /body\.feed #story-list\s*\{[^}]*margin-top:\s*0\s*!important/s, "The first Feed card must align with the recommendations column");
assert.match(css, /body\.feed #sidebar\s*\{[^}]*grid-column:\s*2/s, "Feed recommendations must occupy the narrow column regardless of DOM order");
assert.match(css, /body\.feed \.story-innards\s*\{[^}]*border:\s*0\s*!important[^}]*box-shadow:\s*none/s, "Feed cards must use their themed surface without a strong outline");
assert.match(css, /body\.feed #sidebar\s*\{[^}]*background:\s*var\(--bandkit-feed-card\)[^}]*border:\s*0\s*!important[^}]*box-shadow:\s*none/s, "Feed recommendations must use their themed surface without an outer outline");
assert.match(css, /\.story-sidebar \.follow-band\s*\{[^}]*-webkit-text-fill-color:\s*var\(--bandkit-release-on-accent\)\s*!important/s, "Following controls must keep a readable label across inherited Bandcamp colours");
assert.match(css, /#sidebar \.collection-grid\s*\{[^}]*display:\s*grid\s*!important;[^}]*justify-items:\s*stretch\s*!important/s, "The live nested new-releases grid must align every card to the same left edge");
assert.match(css, /#sidebar \.collection-grid > \.collection-item-container\s*\{[^}]*border:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;[^}]*grid-template-columns:\s*88px minmax\(0, 1fr\)/s, "Sidebar releases must use full-width horizontal cards without outlines or dividing lines");
assert.match(css, /#sidebar \.collection-grid > \.collection-item-container:is\(:hover, :focus-within\)\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--bandkit-release-accent\) 5%, var\(--bandkit-release-surface-raised\)\)\s*!important/s, "New-release cards must expose a subtle shared hover and keyboard-focus tint");
assert.match(css, /#sidebar \.collection-grid > \.collection-item-container \.play-icon\s*\{[^}]*height:\s*18px\s*!important;[^}]*margin:\s*9px\s*!important;[^}]*width:\s*18px\s*!important/s, "Sidebar release play icons must fit their compact artwork control without clipping");
assert.match(css, /#sidebar \.collection-grid > \.collection-item-container :is\(\.play-button, \.bandkit-feed-sidebar-actions\)\s*\{[^}]*opacity:\s*0\s*!important;[^}]*pointer-events:\s*none\s*!important/s, "New-release card controls must stay hidden without moving the card layout");
assert.match(css, /\.collection-item-container:is\(:hover, :focus-within\) :is\(\.play-button, \.bandkit-feed-sidebar-actions\)\s*\{[^}]*opacity:\s*1\s*!important;[^}]*pointer-events:\s*auto\s*!important/s, "New-release card controls must reveal only for the hovered or keyboard-focused card");
assert.match(css, /#sidebar \.collection-grid > \.collection-item-container:is\(\[data-bandkit-feed-playback="playing"\], \.playing:not\(\[data-bandkit-feed-playback\]\)\) \.play-icon\s*\{[^}]*margin:\s*9px 11px\s*!important;[^}]*width:\s*14px\s*!important/s, "Sidebar release pause bars must stay centered inside the compact artwork control");
assert.match(css, /#sidebar \.collection-grid > \.collection-item-container \.remove-button\s*\{[^}]*opacity:\s*0;[^}]*position:\s*absolute\s*!important;[^}]*right:\s*8px\s*!important;[^}]*top:\s*8px\s*!important/s, "Sidebar dismiss controls must remain hidden at an equal top-right inset");
assert.match(css, /\.collection-item-container:is\(:hover, :focus-within\) \.remove-button,[\s\S]*?\.remove-button:focus-visible\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto/s, "Sidebar dismiss controls must reveal on hover and keyboard focus");
assert.match(css, /\.story \.story-title \.artist-name\s*\{[^}]*color:\s*var\(--bandkit-release-ink\)\s*!important/s, "Feed activity artist names must use the normal readable card text instead of the accent");
assert.match(css, /data-bandkit-page-theme="true"\][\s\S]*?#sidebar \.bandkit-feed-sidebar-actions[\s\S]*?color:\s*var\(--bandkit-page-card-accent\)\s*!important/s, "Sidebar actions must use the selected theme's card-corrected accent");
assert.match(css, /data-bandkit-page-theme="true"\][\s\S]*?\.story-sidebar \.follow-band \*\s*\{[^}]*background:\s*transparent\s*!important;[^}]*color:\s*inherit\s*!important/s, "Themed follow labels must not repaint the inside of the badge");
assert.match(css, /\.story \.tralbum-wrapper\s*\{[^}]*display:\s*grid/s, "Feed release media must replace the legacy floated wrapper");
assert.match(css, /\.story \.tralbum-wrapper::before,[\s\S]*?\.story \.tralbum-wrapper::after\s*\{[^}]*content:\s*none\s*!important/s, "Feed grid must remove legacy clearfix pseudo-items");
assert.match(css, /data-bandkit-modern-page-type="music"\] \.leftMiddleColumns\s*\{[^}]*padding-top:\s*20px/s, "Music catalogues should not retain the oversized generic content gap below artist navigation");
assert.match(css, /#music-grid > \.music-grid-item\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--bandkit-release-line\) 60%, transparent\)\s*!important/s, "Music cards should use a subtle translucent outline");
assert.match(css, /#merch-grid > \.merch-grid-item\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--bandkit-release-line\) 60%, transparent\)\s*!important/s, "Merch cards should share the subtle catalogue outline");
assert.match(css, /\.tralbum-wrapper > \.tralbum-wrapper-col1\s*\{[^}]*grid-column:\s*1\s*!important;[^}]*grid-row:\s*1\s*!important/s, "Feed artwork and metadata must stay in the primary media column");
assert.match(css, /\.tralbum-wrapper > \.tralbum-wrapper-col2\s*\{[^}]*grid-column:\s*2\s*!important;[^}]*grid-row:\s*1\s*!important/s, "Feed supporter details must stay beside the primary media column");
assert.match(css, /height:\s*280px\s*!important;[^}]*width:\s*280px\s*!important/s, "Feed artwork must render at the larger square size");
assert.match(lifecycleSource, /const leavePageRuntime = \(event\) => \{[\s\S]*?if \(!event\.persisted\) [^;]*cleanup\(\);/,
  "Bandkit must preserve its runtime when Chrome places a page in the back-forward cache");
assert.match(lifecycleSource, /const resumePageRuntime = \(event\) => \{[\s\S]*?injectPageDjToolsLink\(\)[\s\S]*?event\.persisted[\s\S]*?scanLivePlayer\(\)[\s\S]*?scheduleLivePlayerMaintenance\(0\)/,
  "every page-show must validate page controls before cached pages resume live scanning");
assert.match(lifecycleSource, /visibilitychange[\s\S]*?!document\.hidden[\s\S]*?injectPageDjToolsLink\(\)[\s\S]*?scheduleLivePlayerMaintenance\(120\)/,
  "returning to a visible tab must immediately validate the page DJ surface and stylesheet");
assert.match(pageActionsSource, /pageDjNeedsMount =[\s\S]*?!r\.\$pageDjSurface\?\.isConnected[\s\S]*?getRootNode\(\) !== inlineHost\.shadowRoot/,
  "an empty or detached inline DJ surface must be rebuilt instead of leaving a blank shell");
assert.match(pageActionsSource, /inlineHost\.nextElementSibling !== tools\) tools\.before\(inlineHost\)/,
  "the compact DJ and BPM section must sit below the waveform and above the page action and transport row");
assert.match(pageActionsSource, /inlineHost\.classList\.toggle\("is-classic-page-dj", !modernActions\)/,
  "the page DJ host must expose classic mode to its isolated shadow layout");
assert.match(pageActionsSource, /:host\(\.is-classic-page-dj\) \.hub-dj-card-page\{grid-template-columns:minmax\(0,1fr\);row-gap:10px\}[\s\S]*?\.hub-dj-analysis-row\{[^}]*grid-column:1;[^}]*grid-template-columns:minmax\(76px,1fr\)[^}]*width:100%\}[\s\S]*?\.hub-dj-page-tempo\{grid-column:1;width:100%\}[\s\S]*?\.hub-dj-page-modes\{grid-column:1;/,
  "classic release pages must stack analysis, the full-width tempo rail, and tempo mode controls without collisions");
assert.match(pageActionsSource, /container-type:inline-size[\s\S]*?@container\(max-width:280px\)[\s\S]*?grid-template-columns:minmax\(64px,1fr\) 42px 46px/,
  "the classic page DJ controls must adapt again at very narrow player widths");
assert.match(pageActionsSource, /pageDjStyle\.dataset\.bandkitPageDjStyle = "true"[\s\S]*?!r\.\$pageDjStyle\?\.isConnected[\s\S]*?!r\.\$pageDjStyle\.textContent\.trim\(\)[\s\S]*?prepend\(r\.\$pageDjStyle\)/,
  "a missing or emptied page DJ stylesheet must be restored without discarding the live controls");
assert.match(pageActionsSource, /r\.\$pageDjStyle\.textContent !== pageDjCss[\s\S]*?r\.\$pageDjStyle\.textContent = pageDjCss/,
  "an early page DJ mount must replace its stale stylesheet after the full hub CSS loads");
assert.match(collectionPlaylistsSource, /collection-playlists-tab[\s\S]*?host\?\.shadowRoot[\s\S]*?:scope \.results > ul\.card-grid/,
  "saved BandKit playlists must cross Bandcamp's Collection shadow root and mount into its live playlist grid");
assert.match(collectionPlaylistsSource, /chrome\.runtime\.getURL\("collection-playlists\.css"\)[\s\S]*?root\.prepend\(stylesheet\)/,
  "Collection playlist styles must load inside Bandcamp's playlist shadow root");
assert.match(collectionPlaylistsSource, /runtimeState\.playlistView = "saved"[\s\S]*?runtimeState\.selectedSavedPlaylistId = playlist\.id/,
  "Collection playlist cards must open the matching BandKit saved-playlist detail");
assert.match(collectionPlaylistsSource, /bandkit-collection-private-badge[\s\S]*?<span>Private<\/span>[\s\S]*?icon-bandkit\.svg/,
  "BandKit Collection cards must show the private badge followed by the BandKit icon");
assert.match(css, /\.bandkit-collection-playlist-art\s*\{[^}]*aspect-ratio:\s*4 \/ 3;[^}]*display:\s*grid/s,
  "BandKit playlist mosaics must match Bandcamp's four-by-three card artwork");

console.log("Modern Bandcamp page routing checks passed.");
