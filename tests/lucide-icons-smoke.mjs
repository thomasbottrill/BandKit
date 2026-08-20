import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");
const iconNames = fs.readdirSync(assets).filter((name) => /^icon-.*\.svg$/.test(name));

assert.ok(iconNames.includes("icon-bandkit.svg"), "The Bandkit logo must remain available");

for (const name of iconNames) {
  const svg = fs.readFileSync(path.join(assets, name), "utf8");
  if (name === "icon-bandkit.svg") {
    assert.doesNotMatch(svg, /class="lucide /, "The Bandkit logo must remain bespoke");
    continue;
  }

  assert.match(svg, /@license lucide-static/, `${name} must come from Lucide`);
  assert.match(svg, /class="lucide lucide-/, `${name} must retain its Lucide identity`);
  assert.match(svg, /viewBox="0 0 24 24"/, `${name} must use Lucide's standard geometry`);

  if (name === "icon-play.svg" || name === "icon-pause.svg") {
    assert.match(svg, /fill="#9CA3AF"/, `${name} must use a solid fill`);
    assert.match(svg, /stroke="none"/, `${name} must not retain an outline stroke`);
  }
}

console.log(`Lucide icon smoke test passed (${iconNames.length - 1} UI icons, 1 bespoke logo).`);
