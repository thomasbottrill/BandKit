import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const iconNames = fs.readdirSync(assets).filter((name) => /^icon-.*\.svg$/.test(name));
const bespokeNames = new Set(iconNames.filter((name) => name === "icon-bandkit.svg" || name.startsWith("icon-scrub-")));

assert.ok(iconNames.includes("icon-bandkit.svg"), "The Bandkit logo must remain available");

for (const name of iconNames) {
  const svg = fs.readFileSync(path.join(assets, name), "utf8");
  if (bespokeNames.has(name)) {
    assert.match(svg, /<svg[^>]*viewBox=/, `${name} must expose stable scalable geometry`);
    assert.doesNotMatch(svg, /(?:filter|drop-shadow|box-shadow)/i, `${name} must not embed a glow or shadow`);
    continue;
  }

  assert.match(svg, /@license lucide-static/, `${name} must come from Lucide`);
  assert.match(svg, /class="lucide lucide-/, `${name} must retain its Lucide identity`);
  assert.match(svg, /viewBox="0 0 24 24"/, `${name} must use Lucide's standard geometry`);

  if (["icon-play.svg", "icon-pause.svg", "icon-skip.svg"].includes(name)) {
    assert.match(svg, /fill="#9CA3AF"/, `${name} must use a solid fill`);
    assert.match(svg, /stroke="none"/, `${name} must not retain an outline stroke`);
  }
}

console.log(`Icon smoke test passed (${iconNames.length - bespokeNames.size} Lucide icons, ${bespokeNames.size} bespoke marks).`);
