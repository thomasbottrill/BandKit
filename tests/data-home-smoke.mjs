import assert from "node:assert/strict";
import fs from "node:fs";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();
const dataHomeSource = fs.readFileSync(new URL("../src/shared/data-home.js", import.meta.url), "utf8");
const settingsCss = fs.readFileSync(new URL("../src/styles/hub/settings.css", import.meta.url), "utf8");

assert.match(source, /const DEFAULT_DATA_PARENT = "documents";/,
  "the data-home parent should default to the operating system Documents folder");
assert.match(source, /const DEFAULT_DATA_FOLDER = "Bandkit";/,
  "the default data directory should be named Bandkit");
assert.match(source, /showDirectoryPicker\(\{[\s\S]*?startIn: DEFAULT_DATA_PARENT/,
  "the data-home picker should open in Documents on macOS and Windows");
assert.match(dataHomeSource, /getDirectoryHandle\(DEFAULT_DATA_FOLDER, \{ create: true \}\)/,
  "Bandkit should be created automatically after Documents access is approved");
assert.match(source, /`Location: \$\{state\.dataFolderName\}\$\{localDataHomePermission === "granted"/,
  "the selected data-folder location should remain visible in settings");
assert.match(source, /function renderDataHomeGate\(\)[\s\S]*?Choose where Bandkit saves[\s\S]*?Choose folder/,
  "an unconfigured install should render a blocking in-panel folder setup gate");
assert.doesNotMatch(source, /ONE-TIME SETUP|This is required before you can create or save playlists and carts/,
  "the setup card should omit redundant labels around its primary action");
assert.match(source, /if \(!dataHomeReady\) renderDataHomeGate\(\)/,
  "the setup gate should replace section content until the data folder is ready");
assert.match(source, /function requireDataHome\(\)[\s\S]*?state\.open = true;[\s\S]*?render\(\);/,
  "save actions should bring the setup gate back into view");
assert.doesNotMatch(source, /Reconnect|Connect backup/,
  "playlist, cart, and settings UI should not use the old reconnect language");
assert.match(source, /function renderDataHomePermissionWarning\(\)[\s\S]*?Folder backup paused[\s\S]*?still safe in Chrome[\s\S]*?Restore access/,
  "paused folder access must render a persistent, actionable warning without implying browser data was lost");
assert.match(settingsCss, /\.hub-data-home-warning\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s,
  "the paused-folder warning must remain visible while the user scrolls any Bandkit section");
assert.match(source, /activeTab === "playlist"[\s\S]*?renderDataHomePermissionWarning\(\)[\s\S]*?placeDataHomePermissionWarning/,
  "the folder warning must be added to every configured Bandkit section after its panel content is rendered");
assert.match(source, /function placeDataHomePermissionWarning\(warning\)[\s\S]*?hub-section-heading[\s\S]*?matches\("\.hub-cart-backup"\)[\s\S]*?anchor\.after\(warning\)/,
  "the folder warning must sit below each panel heading and its action-button row");
assert.match(source, /visibilitychange[\s\S]*?refreshPortableDataHomePermission\(\{ notify: true \}\)/,
  "returning to a Bandcamp tab must recheck folder permission and surface a newly paused backup");
assert.doesNotMatch(source, /renderPortableBackupStatus/,
  "playlist and cart views should not render a folder-status row");
assert.match(dataHomeSource, /saveDataDirectoryHandle[\s\S]*?store\.put\(handle, DIRECTORY_KEY\)/,
  "the selected directory handle should be persisted in browser IndexedDB");
assert.match(dataHomeSource, /configured:\s*true[\s\S]*?permission[\s\S]*?handle/,
  "a persisted directory handle should remain configured even when Chrome pauses write permission");
assert.match(source, /dataHomeReady = initialDataHomeStatus\?\.configured === true \|\| savedState\?\.dataFolderSetup === true/,
  "extension reloads should use the durable setup marker instead of reopening first-launch onboarding");
assert.match(source, /localDataHomePermission = initialDataHomeStatus\?\.permission \|\| "missing"/,
  "startup must use the directory handle's real permission state");
assert.doesNotMatch(source, /live-verification override|configured\) localDataHomePermission = "prompt"/,
  "test overrides must never force configured users into the restore state");
assert.match(dataHomeSource, /needsPermission:\s*true/,
  "paused access to a persisted handle should not be misclassified as missing setup");
assert.match(source, /function requireDataHome\(\)\s*\{\s*if \(dataHomeReady\) return true;/,
  "save actions should proceed without reopening onboarding once a folder has been selected");
assert.doesNotMatch(source, /function requireDataHome\(\)[\s\S]{0,400}requestPermission/,
  "routine save actions should not trigger a recurring browser permission prompt");
assert.match(source, /dataDirectoryHandle && localDataHomePermission !== "granted"[\s\S]*?restorePortableDataHomeAccess/,
  "settings should restore the persisted folder handle before offering a replacement picker");
assert.match(source, /access required · folder backup paused/,
  "Privacy and data settings must state clearly when the selected folder is not being updated");
assert.match(source, /Folder backup needs access[\s\S]*?6500/,
  "a newly detected permission loss must remain visible as a long-duration toast as well as a persistent warning");
assert.match(source, /showDirectoryPicker\([\s\S]*?saveDataDirectoryHandle\(dataDirectoryHandle\)/,
  "the in-panel action should open the native picker directly and persist its result");
assert.match(source, /function schedulePortableDataHomeSync\(\)[\s\S]*?setTimeout\([\s\S]*?300\);/,
  "portable backup writes should be automatically debounced after browser state changes");
assert.match(source, /function saveState\(\)[\s\S]*?schedulePortableDataHomeSync\(\);/,
  "every saved state change should schedule an external backup when connected");
assert.match(dataHomeSource, /\? `Documents\/\$\{DEFAULT_DATA_FOLDER\}`/,
  "selecting the default Bandkit directory should display Documents/Bandkit");
assert.match(source, /state\.dataFolderName = `Documents\/\$\{DEFAULT_DATA_FOLDER\}`;[\s\S]*?saveState\(\);/,
  "existing Bandkit-only labels should migrate to Documents/Bandkit");
assert.match(source, /`Not set · default: Documents\/\$\{DEFAULT_DATA_FOLDER\}`/,
  "the unconfigured state should show the intended default without claiming it already exists");
for (const folder of ["Playlists", "Carts", "Activity", "Settings"]) {
  assert.match(dataHomeSource, new RegExp(`getDirectoryHandle\\(\\"${folder}\\"`),
    `the portable data home should contain a ${folder} directory`);
}
assert.match(source, /Portable copies in your data folder will not be deleted\./,
  "browser-data deletion should explain that user-owned copies remain");
assert.doesNotMatch(source, /The data folder is a readable, portable copy organized into/,
  "the data-home settings UI should stay concise");
assert.doesNotMatch(source, /Stored on this device/,
  "the data-home settings UI should not include a second explanatory row");
assert.match(dataHomeSource, /playlistIndex\[index\]\.file/,
  "saved playlists should use their collision-safe indexed filenames");
assert.match(dataHomeSource, /cartIndex\[index\]\.file/,
  "saved carts should use their collision-safe indexed filenames");

console.log("organized data home smoke test passed");
