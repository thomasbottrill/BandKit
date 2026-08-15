import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readContentSource } from "./support/source.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = readContentSource();

assert.match(source, /const DEFAULT_DATA_PARENT = "documents";/,
  "the data-home parent should default to the operating system Documents folder");
assert.match(source, /const DEFAULT_DATA_FOLDER = "Bandkit";/,
  "the default data directory should be named Bandkit");
assert.match(source, /showDirectoryPicker\(\{[\s\S]*?startIn: DEFAULT_DATA_PARENT/,
  "the data-home picker should open in Documents on macOS and Windows");
assert.match(source, /getDirectoryHandle\(DEFAULT_DATA_FOLDER, \{ create: true \}\)/,
  "Bandkit should be created automatically after Documents access is approved");
assert.match(source, /`Location: \$\{state\.dataFolderName\}`/,
  "the selected data-folder location should remain visible in settings");
assert.match(source, /\? `Documents\/\$\{DEFAULT_DATA_FOLDER\}`/,
  "selecting the default Bandkit directory should display Documents/Bandkit");
assert.match(source, /state\.dataFolderName = `Documents\/\$\{DEFAULT_DATA_FOLDER\}`;[\s\S]*?saveState\(\);/,
  "existing Bandkit-only labels should migrate to Documents/Bandkit");
assert.match(source, /`Not set · default: Documents\/\$\{DEFAULT_DATA_FOLDER\}`/,
  "the unconfigured state should show the intended default without claiming it already exists");
for (const folder of ["Playlists", "Carts", "Activity", "Settings"]) {
  assert.match(source, new RegExp(`getDirectoryHandle\\(\\"${folder}\\"`),
    `the portable data home should contain a ${folder} directory`);
}
assert.match(source, /Portable copies in your data folder will not be deleted\./,
  "browser-data deletion should explain that user-owned copies remain");
assert.doesNotMatch(source, /The data folder is a readable, portable copy organized into/,
  "the data-home settings UI should stay concise");
assert.doesNotMatch(source, /Stored on this device/,
  "the data-home settings UI should not include a second explanatory row");
assert.match(source, /playlistIndex\[index\]\.file/,
  "saved playlists should use their collision-safe indexed filenames");
assert.match(source, /cartIndex\[index\]\.file/,
  "saved carts should use their collision-safe indexed filenames");

console.log("organized data home smoke test passed");
