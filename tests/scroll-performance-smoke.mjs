import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readContentSource, readHubStyles } from "./support/source.mjs";

const content = readContentSource();
const styles = readHubStyles();

const renderPlayer = content.match(/function renderPlayer\(\) \{([\s\S]*?)\n  \}\n\n  function/)?.[1] || "";
assert.doesNotMatch(renderPlayer, /panel\.getBoundingClientRect\(/,
  "Playback progress updates must not force layout of a long Feed or Discover page");
assert.match(content, /function schedulePlayerSectionGeometry\(\)/,
  "Panel geometry must be measured only through the layout-change scheduler");
assert.doesNotMatch(content, /panel\.addEventListener\("pointermove"[\s\S]{0,500}panel\.getBoundingClientRect\(/,
  "Moving the pointer through Bandkit must not force document layout");
assert.doesNotMatch(styles, /is-hover-resize-[xy]/,
  "Resize feedback must rely on the edge handles without panel-wide pointer tracking");

assert.match(content, /injectPlaylistButtons\(\{ incremental = false \} = \{\}\)/,
  "Dynamic page actions must support incremental injection");
assert.match(content, /data-bandkit-feed-action-scanned/,
  "Feed action scans must mark previously inspected controls");
assert.match(content, /injectPlaylistButtons\(\{ incremental: true \}\)/,
  "Mutation-driven scans must process only new Feed controls");
assert.match(content, /trackRenderSignature !== playerTrackRenderSignature/,
  "Playback ticks must not rebuild unchanged player metadata");
assert.match(content, /lastPageScrollAt = Date\.now\(\)/,
  "Scrolling must mark the active scroll window without running maintenance from the event handler");
assert.match(content, /previous\.paused !== bridgedMedia\.paused/,
  "Playback state transitions must still trigger an immediate player sync");

console.log("Cross-page scroll performance regression checks passed.");
