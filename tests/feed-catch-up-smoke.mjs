import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/content/runtime/feed-catch-up.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../src/content/index.js", import.meta.url), "utf8");
const feedCss = fs.readFileSync(new URL("../src/styles/modern/feed.css", import.meta.url), "utf8");

assert.match(indexSource, /registerFeedCatchUp\(r\)/,
  "The release filter must register with the content runtime");
assert.match(indexSource, /setupFeedCatchUp\(r\)/,
  "The release filter must mount after the feed integration");
assert.match(source, /createPanelViewTabs\(\{[\s\S]*?Feed[\s\S]*?New releases/,
  "The feed must reuse the established view-tab component");
assert.match(source, /!story\.classList\.contains\("nr"\)/,
  "New releases must use Bandcamp's native release-story marker");
assert.match(source, /story\.toggleAttribute\("inert", filtered\)/,
  "Filtered fan activity must leave the keyboard navigation order");
assert.match(source, /observer\.observe\(stories, \{ childList: true, subtree: true \}\)/,
  "Infinite-scroll stories must inherit the active filter");
assert.match(source, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/,
  "The feed tabs must support standard keyboard navigation");
assert.match(source, /const selectionScrollY = window\.scrollY[\s\S]*?window\.scrollTo\(\{ top, behavior: "auto" \}\)/,
  "Switching Feed views must preserve the reader's current scroll position");
assert.doesNotMatch(source, /scrollIntoView/,
  "New releases must not force the page back to the feed heading");
assert.doesNotMatch(source, /new-releases-vm|SEAMLESS_ENABLE|Play all|createPageControlButton/,
  "The filter must not replace the feed with the compact release grid or add playback UI");
assert.doesNotMatch(source, /chrome\.storage|runtimeSaveState/,
  "The view filter must not add persistent state");
assert.match(feedCss, /\.bandkit-feed-filter\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*min-height:\s*52px;[^}]*padding:\s*0 12px 0 88px;/s,
  "The feed tabs must sit directly on the page, aligned with feed cards and without a backing surface or divider");
assert.match(feedCss, /\.bandkit-feed-filter-tab:first-child\s*\{\s*padding-left:\s*0;/,
  "The first feed tab label and underline must share the feed-card edge");
assert.match(feedCss, /@media \(max-width: 720px\)[\s\S]*?\.bandkit-feed-filter\s*\{\s*padding-left:\s*72px;/,
  "Feed tabs must follow the narrower feed-card offset on small screens");
assert.match(feedCss, /@media \(max-width: 480px\)[\s\S]*?\.bandkit-feed-filter\s*\{\s*padding-left:\s*0;/,
  "Feed tabs must align with full-width feed cards on phones");
assert.match(feedCss, /\.bandkit-feed-filter-tab:not\(\.is-active\):is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*transparent\s*!important;/s,
  "Feed tab hover must keep the navigation surface transparent");
assert.match(feedCss, /\.bandkit-feed-filter-tab::after\s*\{[^}]*bottom:\s*8px;[^}]*height:\s*3px;[^}]*left:\s*18px;[^}]*right:\s*18px;/s,
  "Feed tab underlines must match the label width and sit close to the text");
assert.match(feedCss, /\.bandkit-feed-filter-tab\.is-active::after\s*\{\s*opacity:\s*1;/,
  "The selected feed tab must show its label-width underline");
assert.doesNotMatch(feedCss, /\.bandkit-feed-filter-tab[^\{]*:hover[^\{]*::after\s*\{[^}]*opacity:\s*1;/,
  "Hovering an inactive feed tab must not add an underline");
assert.match(feedCss, /\[data-bandkit-feed-catch-up\] body\.feed #stories-vm \.story:not\(\.nr\)\s*\{\s*display:\s*none\s*!important;/,
  "New releases must only hide non-release feed stories");
assert.doesNotMatch(feedCss, /\[data-bandkit-feed-catch-up\][\s\S]{0,160}#sidebar\s*\{/,
  "Filtering must not turn the release sidebar into a separate grid view");

console.log("Feed release-filter smoke checks passed.");
