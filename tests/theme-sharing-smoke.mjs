import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();

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

const toastMessages = [];
const context = vm.createContext({
  THEME_COLOR_KEYS: ["accent", "surface", "card", "background", "pageSurface", "navbar", "text", "secondaryText"],
  MAX_SAVED_THEMES: 12,
  state: { appearance: { savedThemes: [] } },
  toastMessages,
  showToast(message) { toastMessages.push(message); }
});
vm.runInContext([
  extractFunction("validThemeHex"),
  extractFunction("parseThemeBackup"),
  extractFunction("hasSavedThemeCapacity"),
  "globalThis.parse = parseThemeBackup; globalThis.hasCapacity = hasSavedThemeCapacity;"
].join("\n"), context);

const validPayload = JSON.parse(fs.readFileSync(new URL("./shared-theme-fixture.json", import.meta.url), "utf8"));
validPayload.theme.accent = "#8B7CFF";

const parsed = context.parse(JSON.stringify(validPayload));
assert.equal(parsed.label, "Shared Night");
assert.equal(parsed.accent, "#8b7cff", "Imported colours should be normalized");
assert.equal(parsed.scrubAccent, "#8b7cff", "Older themes should default the scrub colour to the accent");
assert.equal(parsed.secondaryText, "#cbd5e1");

validPayload.theme.scrubAccent = "#FF4D8D";
assert.equal(context.parse(JSON.stringify(validPayload)).scrubAccent, "#ff4d8d", "Imported scrub colours should be normalized");

assert.throws(() => context.parse("not json"), /not valid JSON/);
assert.throws(() => context.parse(JSON.stringify({ ...validPayload, version: 2 })), /not a supported Bandkit theme/);
assert.throws(() => context.parse(JSON.stringify({
  ...validPayload,
  theme: { ...validPayload.theme, accent: "red" }
})), /invalid accent colour/);
assert.throws(() => context.parse(JSON.stringify({
  ...validPayload,
  theme: { ...validPayload.theme, scrubAccent: "pink" }
})), /invalid scrubAccent colour/);

context.state.appearance.savedThemes = Array.from({ length: 11 }, (_, index) => ({ id: `saved-${index}` }));
assert.equal(context.hasCapacity(), true, "A twelfth saved theme should be allowed");
context.state.appearance.savedThemes.push({ id: "saved-11" });
assert.equal(context.hasCapacity(), false, "A thirteenth saved theme should be rejected without eviction");
assert.match(context.toastMessages.at(-1), /save up to 12 themes.*Delete one/i);

assert.match(source, /Downloaded theme/);
assert.match(source, /Imported and saved theme/);
assert.doesNotMatch(extractFunction("importAppearanceTheme"), /slice\(-12\)/, "Theme import must not silently evict an older saved theme");
assert.doesNotMatch(extractFunction("appendCustomThemeSettings"), /slice\(-12\)/, "Theme saving must not silently evict an older saved theme");
assert.match(source, /appendSavedThemeSettings[\s\S]*?Rename saved[\s\S]*?Delete saved/, "Saved themes should expose rename and delete controls");
assert.match(source, /preset = "custom";[\s\S]*?Deleted theme/, "Deleting the active saved theme should preserve its colours as Custom");
assert.match(source, /importThemeInput\.accept = "\.json,application\/json"/);
assert.match(source, /customScrubAccent: null/, "Track scrub colours should follow the accent by default");
assert.match(source, /"Use accent"/, "The custom scrub colour should be resettable to the accent");
assert.match(source, /customPanelLinked: true/, "Bandkit panel colours should follow Bandkit content by default");
assert.match(source, /customContentLinked: true/, "Bandkit content colours should follow Page content by default");
assert.match(source, /"Use page"/, "A separately edited Bandkit content colour should be resettable to Page content");
assert.match(source, /"Use content"/, "A separately edited Bandkit panel colour should be resettable to Bandkit content");
assert.match(extractFunction("appendCustomThemeSettings"), /\["customPageSurface", "Page content"\],[\s\S]*?\["customCard", "Bandkit content"\],[\s\S]*?\["customSurface", "Bandkit panel"\]/,
  "Bandkit panel colour must sit directly below its linked Bandkit content control");
assert.match(source, /accessibleScrubberPalette\(accessible\.preferredScrubAccent, card\)/, "The scrub override should feed the player palette");
assert.match(source, /function elementText\(root, selectors\) \{\s*if \(!root\) return "";/, "Page analysis should tolerate pages without an inline player");

console.log("Theme sharing checks passed.");
