import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectDirectory = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(projectDirectory, "dist", "unpacked");
const sourceManifest = JSON.parse(fs.readFileSync(path.join(projectDirectory, "manifest.json"), "utf8"));
const builtManifest = JSON.parse(fs.readFileSync(path.join(outputDirectory, "manifest.json"), "utf8"));
assert.deepEqual(builtManifest, sourceManifest, "The built manifest must be an exact source-manifest copy");

const runtimeFiles = new Set([
  sourceManifest.background.service_worker,
  sourceManifest.action.default_popup,
  ...sourceManifest.content_scripts.flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
  "offscreen.html",
  "offscreen.js",
  "hub.css",
  "popup.css"
]);
for (const filename of runtimeFiles) {
  assert.ok(fs.existsSync(path.join(outputDirectory, filename)), `Missing built runtime file: ${filename}`);
}

const obsoleteRootRuntimes = [...runtimeFiles].filter((name) => /\.(?:js|css)$/.test(name));
for (const filename of obsoleteRootRuntimes) {
  assert.ok(!fs.existsSync(path.join(projectDirectory, filename)), `Generated runtime must only exist under dist/unpacked: ${filename}`);
}

for (const filename of fs.readdirSync(outputDirectory).filter((name) => name.endsWith(".js"))) {
  const source = fs.readFileSync(path.join(outputDirectory, filename), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m, `${filename} must be a self-contained classic script`);
  assert.doesNotMatch(source, /sourceMappingURL/, `${filename} must not expose a source map`);
}

const packagedAssets = fs.readdirSync(path.join(outputDirectory, "assets")).sort();
function nestedFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? nestedFiles(entryPath) : [entryPath];
  });
}
const builtText = nestedFiles(outputDirectory)
  .filter((filename) => /\.(?:css|html|js|json)$/.test(filename))
  .map((filename) => fs.readFileSync(filename, "utf8"))
  .join("\n");
const referencedAssets = new Set([
  ...Object.values(builtManifest.icons).map((value) => path.basename(value)),
  ...Object.values(builtManifest.action.default_icon).map((value) => path.basename(value)),
  ...[...builtText.matchAll(/icon-[a-z0-9-]+\.svg/g)].map((match) => match[0])
]);
assert.deepEqual(packagedAssets, [...referencedAssets].sort(), "The unpacked build must contain exactly the referenced assets");
assert.ok(!fs.existsSync(path.join(outputDirectory, "src")));
assert.ok(!fs.existsSync(path.join(outputDirectory, "tests")));
assert.ok(fs.existsSync(path.join(outputDirectory, "THIRD_PARTY_NOTICES.md")));

console.log("Built extension composition checks passed.");
