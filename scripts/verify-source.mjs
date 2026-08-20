import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectDirectory = path.resolve(import.meta.dirname, "..");
const includedRoots = ["src", "scripts", "tests"];
const rootFiles = ["eslint.config.js", "offscreen.html", "popup.html"];
const extensions = new Set([".css", ".html", ".js", ".mjs"]);
const exemptNames = new Set(["THIRD_PARTY_NOTICES.md"]);

function walk(relativeDirectory) {
  const directory = path.join(projectDirectory, relativeDirectory);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) return [];
    return entry.isDirectory() ? walk(relativePath) : [relativePath];
  });
}

const sourceFiles = [...includedRoots.flatMap(walk), ...rootFiles]
  .filter((filename) => extensions.has(path.extname(filename)) && !exemptNames.has(path.basename(filename)))
  .sort();

for (const filename of sourceFiles) {
  const lines = fs.readFileSync(path.join(projectDirectory, filename), "utf8").split(/\r?\n/).length;
  assert.ok(lines <= 1000, `${filename} has ${lines} lines; hand-authored files are limited to 1,000`);
}

const moduleFiles = sourceFiles.filter((filename) => /\.(?:js|mjs)$/.test(filename));
const moduleSet = new Set(moduleFiles);
const graph = new Map();
for (const filename of moduleFiles) {
  const source = fs.readFileSync(path.join(projectDirectory, filename), "utf8");
  const imports = [...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => path.normalize(path.join(path.dirname(filename), specifier)))
    .filter((target) => moduleSet.has(target));
  graph.set(filename, imports);
}

const visiting = new Set();
const visited = new Set();
function visit(filename, ancestry = []) {
  if (visiting.has(filename)) {
    const start = ancestry.indexOf(filename);
    assert.fail(`Circular module dependency: ${[...ancestry.slice(start), filename].join(" -> ")}`);
  }
  if (visited.has(filename)) return;
  visiting.add(filename);
  for (const dependency of graph.get(filename) || []) visit(dependency, [...ancestry, filename]);
  visiting.delete(filename);
  visited.add(filename);
}
for (const filename of moduleFiles) visit(filename);

const entrypoints = new Set([
  "src/background/index.js",
  "src/content/cart-autosave.js",
  "src/content/feed-redirect.js",
  "src/content/index.js",
  "src/content/modern-pages-bootstrap.js",
  "src/content/page-media-bridge.js",
  "src/offscreen/index.js",
  "src/popup/index.js"
]);
for (const entrypoint of entrypoints) {
  for (const dependency of graph.get(entrypoint) || []) {
    assert.ok(!entrypoints.has(dependency), `${entrypoint} must not import entrypoint ${dependency}`);
  }
}

console.log(`Source checks passed: ${sourceFiles.length} files, 1,000 lines maximum, acyclic module graph.`);
