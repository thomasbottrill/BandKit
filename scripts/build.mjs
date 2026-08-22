import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { minify as minifyCss } from "csso";
import { optimize as optimizeSvg } from "svgo";
import { minify } from "terser";

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
  "collection-playlists": "src/styles/modern/collection-playlists.css",
  "modern-release": "src/styles/modern/index.css",
  popup: "src/styles/popup.css"
};
const staticFiles = ["manifest.json", "offscreen.html", "popup.html", "THIRD_PARTY_NOTICES.md"];
const extensionIcons = [
  "extension-icon-16.png",
  "extension-icon-32.png",
  "extension-icon-48.png",
  "extension-icon-128.png"
];

async function runtimeIconNames() {
  const sourcePaths = (await walk(outputDirectory))
    .filter((file) => /\.(?:css|html|js|json)$/.test(file));
  const names = new Set();
  for (const sourcePath of sourcePaths) {
    const source = await fs.readFile(sourcePath, "utf8").catch(() => "");
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
  mangleProps: release ? /^\$/ : undefined,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning"
});
if (release) {
  for (const filename of Object.keys(scriptEntries).map((name) => `${name}.js`)) {
    const outputPath = path.join(outputDirectory, filename);
    const source = await fs.readFile(outputPath, "utf8");
    const compact = await minify(source, {
      compress: {
        booleans_as_integers: false,
        hoist_props: true,
        keep_fargs: false,
        passes: 5,
        pure_getters: true,
        unsafe: true,
        unsafe_arrows: true
      },
      ecma: 2022,
      format: { comments: false },
      mangle: { toplevel: true },
      toplevel: true
    });
    assert.ok(compact.code, `Release minification produced no output for ${filename}`);
    await fs.writeFile(outputPath, compact.code);
  }
}
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
if (release) {
  for (const filename of Object.keys(styleEntries).map((name) => `${name}.css`)) {
    const outputPath = path.join(outputDirectory, filename);
    const source = await fs.readFile(outputPath, "utf8");
    await fs.writeFile(outputPath, minifyCss(source, { restructure: true }).css);
  }
}

for (const filename of staticFiles) {
  await fs.copyFile(path.join(projectDirectory, filename), path.join(outputDirectory, filename));
}
if (release) {
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(JSON.parse(await fs.readFile(manifestPath, "utf8"))));
  for (const filename of ["offscreen.html", "popup.html"]) {
    const outputPath = path.join(outputDirectory, filename);
    const html = await fs.readFile(outputPath, "utf8");
    await fs.writeFile(outputPath, html.replace(/<!--[^]*?-->/g, "").replace(/>\s+</g, "><").trim());
  }
}

const assetNames = [...new Set([...extensionIcons, ...await runtimeIconNames()])].sort();
for (const filename of assetNames) {
  const source = path.join(projectDirectory, "assets", filename);
  assert.ok(await fs.stat(source).then(() => true, () => false), `Missing referenced asset: assets/${filename}`);
  const destination = path.join(outputDirectory, "assets", filename);
  if (filename.endsWith(".svg")) {
    const svg = await fs.readFile(source, "utf8");
    const compact = release
      ? optimizeSvg(svg, {
        multipass: true,
        path: filename,
        plugins: ["preset-default", { name: "removeAttrs", params: { attrs: "class" } }]
      }).data
      : svg;
    await fs.writeFile(destination, compact);
  } else {
    await fs.copyFile(source, destination);
  }
}

const manifest = JSON.parse(await fs.readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
assert.equal(manifest.version, JSON.parse(await fs.readFile(path.join(projectDirectory, "package.json"), "utf8")).version,
  "package.json and manifest.json versions must match");
if (release) {
  const reproducibleTimestamp = new Date("2000-01-01T00:00:00.000Z");
  for (const filename of await walk(outputDirectory)) {
    await fs.utimes(filename, reproducibleTimestamp, reproducibleTimestamp);
  }
}

const mode = release ? "release" : "development";
console.log(`Built ${mode} extension at ${path.relative(projectDirectory, outputDirectory)} (${assetNames.length} assets)`);
