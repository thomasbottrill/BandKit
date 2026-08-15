import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectDirectory, "dist", "unpacked");
const release = process.argv.includes("--release");

const scriptEntries = {
  background: "src/background/index.js",
  "cart-autosave": "src/content/cart-autosave.js",
  content: "src/content/index.js",
  "feed-redirect": "src/content/feed-redirect.js",
  "modern-pages-bootstrap": "src/content/modern-pages-bootstrap.js",
  offscreen: "src/offscreen/index.js",
  "page-media-bridge": "src/content/page-media-bridge.js",
  popup: "src/popup/index.js"
};
const styleEntries = {
  hub: "src/styles/hub/index.css",
  "modern-release": "src/styles/modern/index.css",
  popup: "popup.css"
};
const staticFiles = ["manifest.json", "offscreen.html", "popup.html"];
const extensionIcons = [
  "extension-icon-16.png",
  "extension-icon-32.png",
  "extension-icon-48.png",
  "extension-icon-128.png"
];

async function sourceIconNames() {
  const sourcePaths = [
    ...Object.values(scriptEntries),
    ...staticFiles,
    ...(await walk(path.join(projectDirectory, "src"))).map((file) => path.relative(projectDirectory, file))
  ];
  const names = new Set();
  for (const sourcePath of sourcePaths) {
    const absolutePath = path.join(projectDirectory, sourcePath);
    const source = await fs.readFile(absolutePath, "utf8").catch(() => "");
    for (const match of source.matchAll(/icon-[a-z0-9-]+\.svg/g)) names.add(match[0]);
  }
  return [...names].sort();
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else files.push(entryPath);
  }
  return files;
}

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(path.join(outputDirectory, "assets"), { recursive: true });

await build({
  absWorkingDir: projectDirectory,
  entryPoints: scriptEntries,
  outdir: outputDirectory,
  bundle: true,
  format: "iife",
  target: "chrome116",
  minify: release,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning"
});
await build({
  absWorkingDir: projectDirectory,
  entryPoints: styleEntries,
  outdir: outputDirectory,
  bundle: true,
  target: "chrome116",
  minify: release,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning"
});

for (const filename of staticFiles) {
  await fs.copyFile(path.join(projectDirectory, filename), path.join(outputDirectory, filename));
}

const assetNames = [...new Set([...extensionIcons, ...await sourceIconNames()])].sort();
for (const filename of assetNames) {
  const source = path.join(projectDirectory, "assets", filename);
  assert.ok(await fs.stat(source).then(() => true, () => false), `Missing referenced asset: assets/${filename}`);
  await fs.copyFile(source, path.join(outputDirectory, "assets", filename));
}

const manifest = JSON.parse(await fs.readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
assert.equal(manifest.version, JSON.parse(await fs.readFile(path.join(projectDirectory, "package.json"), "utf8")).version,
  "package.json and manifest.json versions must match");

// Keep the historical root runtime filenames usable for contributors who already
// have the repository directory loaded unpacked. dist/unpacked remains the
// documented and packaged extension root.
for (const filename of [
  ...Object.keys(scriptEntries).map((name) => `${name}.js`),
  ...Object.keys(styleEntries).map((name) => `${name}.css`)
]) {
  await fs.copyFile(path.join(outputDirectory, filename), path.join(projectDirectory, filename));
}

const mode = release ? "release" : "development";
console.log(`Built ${mode} extension at ${path.relative(projectDirectory, outputDirectory)} (${assetNames.length} assets)`);
