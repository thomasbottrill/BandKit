import assert from "node:assert/strict";
import fs from "node:fs";
import { readContentSource, readHubStyles } from "./support/source.mjs";

const source = readContentSource();
const css = readHubStyles();

assert.match(source, /musicBarWidth:\s*"default"/, "Music bar width must default to the standard 800px layout");
assert.match(source, /\["default", "Default \(800 px\)"\]/, "Settings must expose the default music bar width");
assert.match(source, /\["tight", "Tight \(640 px\)"\]/, "Settings must expose a tight music bar width");
assert.match(source, /\["wide", "Wide \(1120 px\)"\]/, "Settings must expose a wide music bar width");
assert.match(source, /\["full", "Full width"\]/, "Settings must expose a full-width music bar option");
assert.match(source, /\["custom", "Custom"\]/, "Settings must expose an exact custom music bar width");
assert.match(source, /customMusicBarWidth\.type = "number"/, "Custom width must use a numeric input");
assert.match(source, /customMusicBarWidth\.min = "480"/, "Custom width must enforce a usable minimum");
assert.match(source, /customMusicBarWidth\.max = "2000"/, "Custom width must cap extreme values");
assert.match(source, /hub-settings-paired-controls[\s\S]*?musicBarSizeField[\s\S]*?musicBarWidthField/, "Music bar size and width must share one compact settings row");
assert.match(source, /player\.dataset\.contentWidth = width/, "Saved width selection must reach the player layout");
assert.doesNotMatch(css, /\.hub-player\.is-compact \.hub-player-content\s*\{[^}]*max-width:\s*none/s, "Compact mode must not override the standard default width");
assert.match(css, /data-content-width="tight"[^}]*max-width:\s*640px/s, "Tight width must cap player content at 640px");
assert.match(css, /data-content-width="wide"[^}]*width:\s*min\(1120px/s, "Wide width must cap player content at 1120px");
assert.match(css, /data-content-width="wide"[^}]*margin-left:\s*auto;[^}]*margin-right:\s*auto/s, "Wide width must remain centred");
assert.match(css, /data-content-width="full"[^}]*width:\s*calc\(100%/s, "Full width must use the available player span");
assert.match(css, /data-content-width="custom"[^}]*var\(--hub-player-custom-width, 900px\)/s, "Custom width must reach the player content rule");
assert.match(css, /\.hub-settings-select\s*\{[^}]*appearance:\s*none;[^}]*background-position:\s*right 18px center, right 13px center/s, "Settings combobox chevrons must sit comfortably inside the right edge");
assert.match(css, /\.hub-settings-paired-controls\s*\{[^}]*display:\s*flex;/s, "The paired music bar controls must remain on one line");
assert.match(css, /\.hub-player\.is-compact \.hub-player-tools\s*\{[^}]*grid-area:\s*tools;[^}]*grid-column:\s*tools;/s,
  "Empty compact players must keep overflow and DJ controls in the named right-side tools column");

console.log("Music bar width layout checks passed.");
