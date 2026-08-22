import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const archive = process.argv[2];
assert.ok(archive, "Usage: node scripts/verify-release.mjs <release.zip>");
assert.ok(fs.existsSync(archive), `Release archive does not exist: ${archive}`);

const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const files = new Set(entries);
const allowedRuntimeFiles = new Set([
  "manifest.json",
  "THIRD_PARTY_NOTICES.md",
  "background.js",
  "cart-autosave.js",
  "collection-playlists.css",
  "content.js",
  "feed-redirect.js",
  "hub.css",
  "modern-pages-bootstrap.js",
  "modern-release.css",
  "offscreen.html",
  "offscreen.js",
  "page-media-bridge.js",
  "popup.css",
  "popup.html",
  "popup.js"
]);

assert.ok(files.has("manifest.json"), "Release is missing manifest.json");
assert.ok(!entries.some((entry) => entry.startsWith("tests/")), "Release must not include tests");
assert.ok(!entries.some((entry) => /^assets\/art-/.test(entry)), "Release must not include fixture artwork");
assert.ok(!entries.some((entry) => entry.startsWith("dist/") || entry.startsWith(".git/")), "Release contains development output");
assert.ok(!entries.some((entry) => entry.endsWith(".map")), "Release must not contain source maps");
for (const entry of entries) {
  assert.ok(allowedRuntimeFiles.has(entry) || /^assets\/(?:extension-icon-\d+\.png|icon-[a-z0-9-]+\.svg)$/.test(entry),
    `Unexpected release file: ${entry}`);
}

const manifest = JSON.parse(execFileSync("unzip", ["-p", archive, "manifest.json"], { encoding: "utf8" }));
const required = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {})
].filter(Boolean));

if (files.has("offscreen.html")) required.add("offscreen.js");
for (const file of required) assert.ok(files.has(file), `Release is missing manifest/runtime file: ${file}`);

assert.ok(manifest.icons?.["128"], "Manifest must declare a 128px store icon");
for (const [declaredSize, iconPath] of Object.entries(manifest.icons || {})) {
  const png = execFileSync("unzip", ["-p", archive, iconPath]);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", `${iconPath} must be a PNG file`);
  assert.equal(png.readUInt32BE(16), Number(declaredSize), `${iconPath} width must match its manifest size`);
  assert.equal(png.readUInt32BE(20), Number(declaredSize), `${iconPath} height must match its manifest size`);
}

const textEntries = entries.filter((entry) => /\.(?:css|html|js|json)$/.test(entry));
const packagedText = textEntries
  .map((entry) => execFileSync("unzip", ["-p", archive, entry], { encoding: "utf8" }))
  .join("\n");
assert.doesNotMatch(packagedText, /\beval\s*\(|\bnew\s+Function\s*\(/, "Release contains dynamic code evaluation");
assert.doesNotMatch(packagedText, /<(?:script|link)\b[^>]+(?:src|href)=["']https?:\/\//i,
  "Release contains a remote executable resource");
assert.doesNotMatch(packagedText, /\bimport\s*\(\s*["']https?:\/\//, "Release imports remote code");
assert.doesNotMatch(packagedText, /(?:tests\/fixtures|fixture marker|dummy data|art-[a-z0-9-]+\.png)/i,
  "Release contains fixture or dummy-data markers");

const referencedAssets = new Set([
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...[...packagedText.matchAll(/assets\/(?:extension-icon-\d+\.png|icon-[a-z0-9-]+\.svg)/g)].map((match) => match[0]),
  ...[...packagedText.matchAll(/(?<![a-z0-9/-])(icon-[a-z0-9-]+\.svg)/g)].map((match) => `assets/${match[1]}`)
]);
for (const entry of entries.filter((name) => name.startsWith("assets/"))) {
  assert.ok(referencedAssets.has(entry), `Release contains unreferenced asset: ${entry}`);
}
for (const entry of referencedAssets) assert.ok(files.has(entry), `Release is missing referenced asset: ${entry}`);

const sourceVersion = JSON.parse(fs.readFileSync(path.resolve("manifest.json"), "utf8")).version;
assert.equal(manifest.version, sourceVersion, "Archive and source manifest versions differ");
const uncompressedBytes = entries.reduce((total, entry) => total + execFileSync("unzip", ["-p", archive, entry]).length, 0);
const compressedBytes = fs.statSync(archive).size;
const entrySizes = entries
  .map((entry) => [entry, execFileSync("unzip", ["-p", archive, entry]).length])
  .sort((left, right) => right[1] - left[1]);
console.log(entrySizes.map(([entry, bytes]) => `${String(bytes).padStart(8)}  ${entry}`).join("\n"));
console.log(`Verified ${archive}: ${entries.length} production files, version ${manifest.version}, ${uncompressedBytes} bytes unpacked, ${compressedBytes} bytes zipped`);
