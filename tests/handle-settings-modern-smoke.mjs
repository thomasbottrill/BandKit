import assert from "node:assert/strict";
import fs from "node:fs";
import { readHubStyles } from "./support/source.mjs";

const pickerSource = fs.readFileSync(new URL("../src/content/scrub-handle-picker.js", import.meta.url), "utf8");
const settingsSource = fs.readFileSync(new URL("../src/content/music-bar-settings.js", import.meta.url), "utf8");
const css = readHubStyles();

assert.match(settingsSource, /export function createScrubbablePercentage/, "The modern chevron-drag numeric control must be reusable by handle settings");
assert.match(pickerSource, /createScrubbablePercentage\(\{[\s\S]*?ariaLabel: "Handle size[\s\S]*?defaultValue: 100[\s\S]*?min: 50[\s\S]*?max: 200[\s\S]*?onInput: update/, "Handle size must use the modern chevron-drag and typeable percentage control");
assert.match(pickerSource, /createPlayerSettingLabel\("Style"[\s\S]*?ariaLabel: "Handle style[\s\S]*?hub-player-setting-label", "Size"[\s\S]*?aria-label", "Handle size"/,
  "Handle controls must use concise visible labels while retaining their full accessible context");
assert.match(pickerSource, /hub-handle-size-preview[\s\S]*?replaceChildren\(createHandlePreview\(shape\)\)[\s\S]*?--hub-handle-size-preview-scale/, "Handle size must include a live preview that follows shape and scale");
assert.match(css, /\.hub-handle-size-controls\s*\{[^}]*justify-self:\s*end;[^}]*margin-right:\s*var\(--hub-settings-compact-control-inset, 8px\);[^}]*width:\s*136px;/s, "The handle-size preview and value must form one compact right-aligned control");
assert.match(css, /\.hub-settings-detail \.hub-settings-picker\.hub-timeline-picker\s*\{[^}]*width:\s*220px;[^}]*\}[\s\S]*?\.hub-settings-picker\.hub-timeline-picker\.has-preview \.hub-settings-combobox\s*\{[^}]*grid-template-columns:\s*76px minmax\(0, 1fr\)/s, "The inline timeline preview must reserve enough space before its label");
assert.match(css, /:host > \.hub-timeline-picker-options\s*\{[^}]*width:\s*min\(360px, calc\(100vw - 16px\)\)[^}]*\}[\s\S]*?\.hub-settings-picker-option\s*\{[^}]*grid-template-columns:\s*112px minmax\(0, 1fr\)/s, "The timeline menu must keep each enlarged preview and name on one line");

console.log("Modern handle and timeline setting controls passed.");
