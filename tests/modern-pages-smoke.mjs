import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource, readModernStyles } from "./support/source.mjs";

const source = readContentSource();
const css = readModernStyles();
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

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
assert.match(css, /\.story \.collection-item-tags\s*\{[^}]*font-size:\s*0\s*!important;[^}]*gap:\s*6px/s, "Feed tag labels and comma separators must collapse around the chip links");
assert.match(css, /\.story \.collection-item-tags a\s*\{[^}]*border-radius:\s*999px;[^}]*padding:\s*7px 10px\s*!important/s, "Feed tag links must use the release-page chip shape");
assert.match(css, /\.story \.collection-item-tags a:hover,[\s\S]*?\.story \.collection-item-tags a:focus-visible\s*\{[^}]*transform:\s*translateY\(-1px\)/s, "Feed tag chips must expose hover and keyboard-focus feedback");
assert.match(css, /grid-template-columns:\s*72px minmax\(0, 1fr\)/, "Feed identity rail must have a dedicated column");
assert.match(css, /\.story-sidebar\s*\{[^}]*align-items:\s*center;[^}]*flex-direction:\s*column/s, "Feed avatars and follow badges must share a centred rail");
assert.match(css, /\.story-sidebar \.follow-band\s*\{[^}]*border-radius:\s*999px\s*!important;[^}]*display:\s*inline-flex\s*!important/s, "Feed follow states must render as compact badges");
assert.match(css, /\.follow-band :is\(\.following-msg, \.unfollow-msg\)/, "Following and unfollow labels must share the badge treatment");
assert.match(css, /\.story a:not\(\.follow-band\)/, "Feed link accents must not override follow badge text contrast");
assert.doesNotMatch(source, /addToLabel\.textContent = "add to\.\.\."/, "Modern release tracklists must not add a redundant add-to label");
assert.match(source, /is-album-add-all[\s\S]*?Add all album tracks to Now Playing or a playlist/, "Modern release tracklists should expose a unique accessible Add all control");
assert.match(source, /isBatch \? "＋ Add all to Now Playing"/, "Album Add all should offer the full Now Playing destination");
assert.match(source, /isBatch \? "＋ Add all to Cart…" : "＋ Add to Cart…"/, "Add-to menus should offer cart destinations for single tracks and batches");
assert.match(source, /Current Bandcamp cart/, "Panel add-to menus should offer the current Bandcamp cart");
assert.match(source, /function createEmptySavedPlaylist\(\)/, "Saved playlists should support empty creation");
assert.match(source, /function createEmptySavedCart\(\)/, "Saved carts should support empty creation");
assert.match(source, /is-album-add-all[\s\S]*?icon-add-all\.svg/, "Album Add all should use its plus-and-list icon");
assert.match(css, /\.bandcamp-hub-page-tools \.bandcamp-hub-page-playlist\.is-album-add-all\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border-radius:\s*4px\s*!important;[^}]*height:\s*32px;[^}]*width:\s*32px;/s, "Album Add all should match and join the top page-action buttons");
assert.match(css, /\.bandcamp-hub-page-tools \.bandcamp-hub-page-playlist\.is-album-add-all\s*\{[^}]*color:\s*var\(--bandkit-release-ink\)\s*!important;/s,
  "Modern release Add all must use the normal page foreground rather than the extension accent");
assert.match(css, /\.bandcamp-hub-page-tools :is\([^)]*\.bandcamp-hub-page-playlist,[^)]*\.bandcamp-hub-page-cart,[^)]*\.bandcamp-hub-page-dj,[^)]*\.bandcamp-hub-page-analyze[^)]*\)\s*\{[^}]*color:\s*var\(--bandkit-release-ink\)\s*!important;/s,
  "Modern release page actions must keep the same normal foreground colour as classic release controls");
assert.match(source, /applyPageActionTheme\(button\);\s*applyPageActionTheme\(buyTrack\);/, "Per-track add and buy actions should inherit the shared page-action palette");
assert.match(source, /function applyPageActionTheme\(control\)[\s\S]*?"--hub-card"/, "Dynamically inserted page actions must inherit the matched Bandcamp card background");
assert.match(source, /function updatePagePlaylistButton\(button, track\)[\s\S]*?applyPageActionTheme\(button\);/, "Every refreshed Add button must reapply the current Match Bandcamp palette");
assert.match(css, /#track_table \.download-col :is\(\.bandcamp-hub-page-playlist\.is-track-action, \.bandcamp-hub-page-buy\)\s*\{[^}]*border:\s*1px solid var\(--hub-line,[^}]*color:\s*var\(--hub-accent,/s, "Per-track actions should use the same border and accent variables as the page controls");
assert.match(source, /function bindPageScrubDrag\(control\)[\s\S]*?pointerdown[\s\S]*?pointermove[\s\S]*?pointerup/, "Page scrubbers should support continuous pointer dragging");
assert.match(source, /previewPageScrub[\s\S]*?--bandkit-page-scrub-progress/, "Page scrubbers should preview the playhead position while dragging");
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

console.log("Modern Bandcamp page routing checks passed.");
