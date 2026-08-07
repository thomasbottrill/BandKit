import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../modern-release.css", import.meta.url), "utf8");
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
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid \.art\s*\{[^}]*aspect-ratio:\s*1 \/ 1\s*!important/s, "Merch artwork frames must be square");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid \.art img\s*\{[^}]*object-fit:\s*contain/s, "Merch product photography must remain uncropped");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid \.art img\s*\{[^}]*position:\s*absolute\s*!important/s, "Merch artwork must not stretch its square frame");
assert.match(css, /data-bandkit-modern-page-type="merch"\]\s+#merch-grid\s*\{[^}]*align-items:\s*start/s, "Merch cards must not stretch to a shared row height");
assert.match(css, /#merch-grid > \.merch-grid-item > \.price\s*\{[^}]*margin-top:\s*8px\s*!important/s, "Merch prices must follow their card content naturally");
assert.match(css, /--bandkit-feed-card:\s*#ffffff/, "Feed stories must use a white card surface by default");
assert.match(css, /grid-template-columns:\s*72px minmax\(0, 1fr\)/, "Feed identity rail must have a dedicated column");
assert.match(css, /\.story-sidebar\s*\{[^}]*align-items:\s*center;[^}]*flex-direction:\s*column/s, "Feed avatars and follow badges must share a centred rail");
assert.match(css, /\.story-sidebar \.follow-band\s*\{[^}]*border-radius:\s*999px;[^}]*display:\s*inline-flex\s*!important/s, "Feed follow states must render as compact badges");
assert.match(css, /\.follow-band :is\(\.following-msg, \.unfollow-msg\)/, "Following and unfollow labels must share the badge treatment");
assert.match(css, /body\.feed #stories-vm\s*\{[^}]*grid-column:\s*1/s, "Feed stories must occupy the wide column regardless of DOM order");
assert.match(css, /body\.feed #story-list\s*\{[^}]*margin-top:\s*20px\s*!important/s, "The first Feed card must clear the Fan Activity divider");
assert.match(css, /body\.feed #sidebar\s*\{[^}]*grid-column:\s*2/s, "Feed recommendations must occupy the narrow column regardless of DOM order");
assert.match(css, /\.story \.tralbum-wrapper\s*\{[^}]*display:\s*grid/s, "Feed release media must replace the legacy floated wrapper");
assert.match(css, /\.story \.tralbum-wrapper::before,[\s\S]*?\.story \.tralbum-wrapper::after\s*\{[^}]*content:\s*none\s*!important/s, "Feed grid must remove legacy clearfix pseudo-items");
assert.match(css, /\.tralbum-wrapper > \.tralbum-wrapper-col1\s*\{[^}]*grid-column:\s*1\s*!important;[^}]*grid-row:\s*1\s*!important/s, "Feed artwork and metadata must stay in the primary media column");
assert.match(css, /\.tralbum-wrapper > \.tralbum-wrapper-col2\s*\{[^}]*grid-column:\s*2\s*!important;[^}]*grid-row:\s*1\s*!important/s, "Feed supporter details must stay beside the primary media column");
assert.match(css, /height:\s*280px\s*!important;[^}]*width:\s*280px\s*!important/s, "Feed artwork must render at the larger square size");

console.log("Modern Bandcamp page routing checks passed.");
