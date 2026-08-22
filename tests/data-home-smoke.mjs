import assert from "node:assert/strict";
import fs from "node:fs";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const backgroundSource = fs.readFileSync(new URL("../src/background/index.js", import.meta.url), "utf8");
const backupFileSource = fs.readFileSync(new URL("../src/shared/backup-file.js", import.meta.url), "utf8");
const contractsSource = fs.readFileSync(new URL("../src/shared/contracts.js", import.meta.url), "utf8");
const offscreenSource = fs.readFileSync(new URL("../src/offscreen/index.js", import.meta.url), "utf8");
const buildSource = fs.readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");

assert.equal(manifest.permissions.includes("downloads"), false,
  "manual backups must not depend on Chrome's global download preference");
assert.equal(fs.existsSync(new URL("../backup.html", import.meta.url)), false,
  "the obsolete extension-owned folder setup page must not be packaged");
assert.doesNotMatch(buildSource, /src\/backup|backup\.html|backup\.css/,
  "the build must not include legacy folder-setup assets");
assert.doesNotMatch(`${backgroundSource}\n${offscreenSource}\n${contractsSource}`, /DATA_HOME|dataDirectoryHandle|backup-file connection/,
  "background and offscreen contexts must not retain the unused continuous-folder protocol");
assert.match(backupFileSource, /BACKUP_FILENAME\s*=\s*"BandKit Backup\.json"/);
assert.match(backupFileSource, /deletions:[\s\S]*?playlists:[\s\S]*?carts:/,
  "the one backup file must retain deletion history");
assert.doesNotMatch(backupFileSource, /indexedDB|directory|README_FILENAME|syncLibrary|bandkit-index/,
  "the manual backup helper must not retain folder handles or split-backup migration code");
assert.match(source, /showSaveFilePicker\([\s\S]*?suggestedName:\s*BACKUP_FILENAME[\s\S]*?startIn:\s*"downloads"/,
  "Save backup must open Finder directly with one suggested JSON filename");
assert.match(source, /showOpenFilePicker\([\s\S]*?restoreBackupFile/,
  "Settings must provide a direct one-file restore flow");
assert.match(source, /Your playlists and carts stay in Chrome/,
  "first use must clearly explain where the live copy is stored");
assert.match(source, /Ready for another backup\?/,
  "a due reminder must use calm, optional backup language");
assert.match(source, /Save backup[\s\S]*?"Later"[\s\S]*?Remind me in/,
  "the reminder card must have one primary action and one deferral action");
assert.match(source, /const backupPrompt = renderBackupReminder\(\);[\s\S]*?if \(heading\) heading\.after\(backupPrompt\)/,
  "the reminder card must appear directly beneath the active panel header");
assert.match(source, /\[\["7", "Every week"\], \["14", "Every 2 weeks"\], \["30", "Every month"\], \["0", "Off"\]\]/,
  "Settings must retain its reminder frequencies");
assert.match(source, /Saved in Chrome · last file backup/,
  "Settings must show the last successful portable backup time");
assert.doesNotMatch(source, /showDirectoryPicker|Backup paused|Resume backup|Restore access|Change backup location|requireDataHome|dataFolderSetup|dataFolderName/,
  "content code must not retain the obsolete connected-folder model or its no-op gates");
assert.match(source, /chrome\.storage\.onChanged[\s\S]*?backupIntroSeen[\s\S]*?backupReminderDays[\s\S]*?backupReminderSnoozedAt[\s\S]*?lastBackupAt/,
  "backup status and reminder metadata must stay synchronized across open Bandcamp tabs");
assert.match(source, /showOpenFilePicker[\s\S]*?storageGet\(STORAGE_KEYS\.STATE\)[\s\S]*?restoreBackupFile\(handle, latestState\)/,
  "restore must merge into the freshest Chrome copy instead of a stale tab snapshot");
assert.match(source, /showSaveFilePicker[\s\S]*?storageGet\(STORAGE_KEYS\.STATE\)[\s\S]*?portableDataBackup\(latestState\)/,
  "manual save must export the freshest Chrome copy when several Bandcamp tabs are open");

class FakeFileHandle {
  constructor(name) {
    this.kind = "file";
    this.name = name;
    this.content = "";
  }
  async queryPermission() { return "granted"; }
  async createWritable() {
    return {
      write: async (value) => { this.content = String(value); },
      close: async () => {}
    };
  }
  async getFile() {
    return { text: async () => this.content };
  }
}

const { BACKUP_FILENAME, restoreBackupFile, saveBackupFile } = await import(`../src/shared/backup-file.js?smoke=${Date.now()}`);
const backupFile = new FakeFileHandle(BACKUP_FILENAME);
const fixture = {
  format: "bandkit-data-home",
  version: 2,
  exportedAt: "2026-08-21T01:00:00.000Z",
  playlists: {
    nowPlaying: [{ title: "Playing" }],
    saved: [{ id: "playlist-one", name: "Playlist One", savedAt: "2026-08-21T00:00:00.000Z", modifiedAt: "2026-08-21T01:00:00.000Z", items: [{ title: "Track One" }] }]
  },
  carts: {
    current: [{ title: "Current Cart" }],
    saved: [{ id: "cart-one", name: "Cart One", savedAt: "2026-08-21T00:00:00.000Z", modifiedAt: "2026-08-21T01:00:00.000Z", items: [{ title: "Release One" }] }]
  }
};

let result = await saveBackupFile(backupFile, fixture);
assert.equal(result.ok, true);
let saved = JSON.parse(backupFile.content);
assert.equal(saved.format, "bandkit-backup");
assert.equal(saved.version, 3);
assert.equal(saved.playlists.saved[0].name, "Playlist One");
assert.equal(saved.carts.saved[0].name, "Cart One");
assert.deepEqual(Object.keys(saved).sort(), ["activity", "carts", "deletions", "exportedAt", "format", "notice", "playlists", "settings", "version"].sort(),
  "all restore data must live in one self-contained JSON document");

const sourceContent = backupFile.content;
result = await restoreBackupFile(backupFile, { savedPlaylists: [], savedCarts: [] });
assert.equal(result.restoredPlaylists, 1);
assert.equal(result.restoredCarts, 1);
assert.equal(result.state.playlist[0].title, "Playing");
assert.equal(result.state.cart[0].title, "Current Cart");
assert.equal(backupFile.content, sourceContent,
  "restore must read and merge a backup without silently rewriting the chosen file");

const localState = {
  savedPlaylists: [{ id: "local-playlist", name: "Local Playlist", modifiedAt: "2026-08-21T04:00:00.000Z", items: [] }],
  savedCarts: [{ id: "local-cart", name: "Local Cart", modifiedAt: "2026-08-21T04:00:00.000Z", items: [] }]
};
result = await restoreBackupFile(backupFile, localState);
assert.deepEqual(new Set(result.state.savedPlaylists.map((item) => item.id)), new Set(["local-playlist", "playlist-one"]));
assert.deepEqual(new Set(result.state.savedCarts.map((item) => item.id)), new Set(["local-cart", "cart-one"]));

await saveBackupFile(backupFile, {
  ...fixture,
  exportedAt: "2026-08-21T02:00:00.000Z",
  playlists: { ...fixture.playlists, saved: [] }
});
saved = JSON.parse(backupFile.content);
assert.equal(saved.playlists.saved.length, 0);
assert.equal(saved.deletions.playlists[0].id, "playlist-one");
result = await restoreBackupFile(backupFile, { savedPlaylists: [], savedCarts: fixture.carts.saved });
assert.equal(result.restoredPlaylists, 0, "a deliberately deleted playlist must not be resurrected");

console.log("manual single-file backup, merge, and deletion smoke test passed");
