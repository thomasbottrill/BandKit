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

const context = vm.createContext({
  THEME_COLOR_KEYS: ["accent", "surface", "card", "background", "pageSurface", "navbar", "text", "secondaryText"]
});
vm.runInContext([
  extractFunction("validThemeHex"),
  extractFunction("parseThemeBackup"),
  "globalThis.parse = parseThemeBackup;"
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

assert.match(source, /Downloaded theme/);
assert.match(source, /Imported and saved theme/);
assert.match(source, /importThemeInput\.accept = "\.json,application\/json"/);
assert.match(source, /customScrubAccent: null/, "Track scrub colours should follow the accent by default");
assert.match(source, /"Use accent"/, "The custom scrub colour should be resettable to the accent");
assert.match(source, /accessibleScrubberPalette\(accessible\.preferredScrubAccent, card\)/, "The scrub override should feed the player palette");

console.log("Theme sharing checks passed.");
