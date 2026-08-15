import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();

const scan = source.match(/function scanLivePlayer\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
assert.match(scan, /if \(pageActionsDirty\) injectPlaylistButtons\(\{ incremental: true \}\)/,
  "Periodic player sync must not rescan every Discover result when the DOM is unchanged");

const candidates = source.match(/const candidates = \[([\s\S]*?)\n    \];/)?.[1] || "";
assert.doesNotMatch(candidates, /results-grid-item/,
  "Discover cards must be handled once by the dedicated Discover pass, not again by the generic action pass");

assert.match(source, /measuredDiscoverButtonLayouts = discoverButtonLayouts\.map/,
  "Discover control geometry must be measured as a batch before positions are written");
assert.match(source, /headerObserver\.observe\(document\.body, \{ childList: true \}\)/,
  "Header mounting must not observe the entire Discover subtree");
assert.match(source, /pageActionsObserver\.observe\(document\.body, \{ childList: true, subtree: true \}\)/,
  "Dynamic Discover results must mark action injection dirty");
assert.doesNotMatch(source, /setInterval\(scanLivePlayer,\s*1200\)/,
  "Discover must not run a full player and action scan on a fixed 1.2 second cadence");
assert.match(source, /requestIdleCallback\(run, \{ timeout: 1800 \}\)/,
  "Fallback player maintenance must run during browser idle time");
assert.match(source, /Date\.now\(\) - lastPageScrollAt < 450/,
  "Fallback maintenance must yield while the user is actively scrolling");
assert.match(source, /dataset\.bandkitDiscoverActionScanned !== "true"/,
  "Incremental Discover scans must skip cards that were already processed");
assert.match(source, /const discoverBatchSize = incremental \? 12/,
  "New Discover cards must be processed in bounded batches instead of one blocking pass");
assert.match(source, /let pageActionThemeCache = null/,
  "Page action theming must share one computed theme snapshot across a Discover batch");

console.log("Discover performance regression checks passed.");
