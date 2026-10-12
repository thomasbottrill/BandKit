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
assert.doesNotMatch(source, /new-releases-vm|SEAMLESS_ENABLE|Play all|createPageControlButton/,
  "The filter must not replace the feed with the compact release grid or add playback UI");
assert.doesNotMatch(source, /chrome\.storage|runtimeSaveState/,
  "The view filter must not add persistent state");
assert.match(feedCss, /\.bandkit-feed-filter\s*\{[^}]*background:[^}]*min-height:\s*52px;[^}]*padding:\s*0 12px;/s,
  "The filter must have the same visible bar treatment as Collection tabs");
assert.match(feedCss, /\.bandkit-feed-filter-tab\.is-active\s*\{[^}]*border-bottom-color:\s*var\(--bandkit-feed-accent\)/s,
  "The selected feed tab must have a clear active underline");
assert.match(feedCss, /\[data-bandkit-feed-catch-up\] body\.feed #stories-vm \.story:not\(\.nr\)\s*\{\s*display:\s*none\s*!important;/,
  "New releases must only hide non-release feed stories");
assert.doesNotMatch(feedCss, /\[data-bandkit-feed-catch-up\][\s\S]{0,160}#sidebar\s*\{/,
  "Filtering must not turn the release sidebar into a separate grid view");

console.log("Feed release-filter smoke checks passed.");
