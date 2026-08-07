import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content.js", import.meta.url), "utf8");

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
assert.equal(parsed.secondaryText, "#cbd5e1");

assert.throws(() => context.parse("not json"), /not valid JSON/);
assert.throws(() => context.parse(JSON.stringify({ ...validPayload, version: 2 })), /not a supported BandKit theme/);
assert.throws(() => context.parse(JSON.stringify({
  ...validPayload,
  theme: { ...validPayload.theme, accent: "red" }
})), /invalid accent colour/);

assert.match(source, /Downloaded theme/);
assert.match(source, /Imported and saved theme/);
assert.match(source, /importThemeInput\.accept = "\.json,application\/json"/);

console.log("Theme sharing checks passed.");
