import assert from "node:assert/strict";
import fs from "node:fs";
import { CONCURRENT_SETTING_KEYS, mergeCollectionChanges, mergeConcurrentState, mergeObjectChanges } from "../src/shared/state-merge.js";
import { repairDuplicatedCartActivity } from "../src/content/activity-model.js";

const runtimeShell = ["runtime-shell.js", "runtime-dom-shell.js"].map((file) => (
  fs.readFileSync(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
)).join("\n");
const lifecycle = fs.readFileSync(new URL("../src/content/runtime/lifecycle.js", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../src/content/runtime/persistence-playback.js", import.meta.url), "utf8");
const playerShell = ["player-shell.js", "player-handoffs.js"].map((file) => (
  fs.readFileSync(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
)).join("\n");
assert.match(runtimeShell, /storageGet\(STORAGE_KEYS\.STATE\)[\s\S]*?mergeConcurrentState[\s\S]*?persistLocal/,
  "every full state save must rebase shared data onto the freshest Chrome copy");
assert.match(runtimeShell, /sharedStateSnapshot[\s\S]*?settingsDrawers:\s*structuredClone\(value\?\.settingsDrawers \|\| \{\}\)/,
  "drawer persistence must retain a shared baseline so stale tabs cannot reverse a toggle");
assert.doesNotMatch(runtimeShell, /persistLocal\(\{ \[STORAGE_KEYS\.STATE\]: runtimeState \}\)/,
  "a tab must never write its whole potentially stale runtime snapshot directly");
assert.match(runtimeShell, /const snapshot = structuredClone\(runtimeState\);\s*r\.\$restoreVisualThemeForSave\?\.\(snapshot\);/,
  "background saves must strip temporary theme previews without dropping unrelated updates");
assert.ok(CONCURRENT_SETTING_KEYS.includes("musicBarStyle") && CONCURRENT_SETTING_KEYS.includes("musicBarWidth"),
  "music-bar layout settings must participate in cross-tab conflict resolution");
assert.ok(CONCURRENT_SETTING_KEYS.includes("musicBarBottomOffset"),
  "player height must participate in cross-tab conflict resolution");
assert.ok(CONCURRENT_SETTING_KEYS.includes("musicBarBlendMode"),
  "player-surface blending must participate in cross-tab conflict resolution");
assert.ok(CONCURRENT_SETTING_KEYS.includes("scrubberHandleShape"),
  "scrub-handle shape changes must participate in cross-tab conflict resolution");
assert.ok(CONCURRENT_SETTING_KEYS.includes("musicBarVisualizer") && CONCURRENT_SETTING_KEYS.includes("musicBarVisualizerType") && CONCURRENT_SETTING_KEYS.includes("musicBarVisualizerOpacity"),
  "visualizer visibility, type and opacity must participate in cross-tab conflict resolution");
assert.ok(CONCURRENT_SETTING_KEYS.includes("musicBarVisualizerWidth") && CONCURRENT_SETTING_KEYS.includes("musicBarVisualizerHeight") && CONCURRENT_SETTING_KEYS.includes("musicBarVisualizerBlendMode"),
  "visualizer sizing and blending must participate in cross-tab conflict resolution");
assert.match(lifecycle, /musicBarVisualizerType:\s*normalizeVisualizerType\(incoming.musicBarVisualizerType, incoming.musicBarVisualizer\)/,
  "cross-tab state normalization must share the style migration used on startup, including retired Ribbons");
assert.match(persistence, /musicBarVisualizer:\s*value\.musicBarVisualizer,[\s\S]*?musicBarVisualizerType:\s*value\.musicBarVisualizerType,[\s\S]*?musicBarVisualizerOpacity:\s*value\.musicBarVisualizerOpacity/,
  "portable settings must retain the visualizer type alongside visibility and opacity");
assert.match(persistence, /musicBarCustomWidth:\s*value\.musicBarCustomWidth,[\s\S]*?musicBarBottomOffset:\s*value\.musicBarBottomOffset/,
  "portable settings must retain the player's configured height above the page edge");
assert.match(lifecycle, /musicBarBottomOffset:\s*Math\.round\(Math\.max\(0, Math\.min\(160, Number\(incoming\.musicBarBottomOffset\) \|\| 0\)\)\)/,
  "restored player height must be bounded before it reaches layout CSS");
assert.match(persistence, /musicBarDynamicColor:\s*value\.musicBarDynamicColor !== false,[\s\S]*?musicBarPlayerDynamicColor:\s*value\.musicBarPlayerDynamicColor !== false,[\s\S]*?musicBarPanelDynamicColor:\s*value\.musicBarPanelDynamicColor !== false,[\s\S]*?musicBarBlendMode:\s*value\.musicBarBlendMode/,
  "portable settings must retain the master and independently controlled player and panel dynamic colours");
assert.ok(CONCURRENT_SETTING_KEYS.includes("musicBarDynamicColor") && CONCURRENT_SETTING_KEYS.includes("musicBarPlayerDynamicColor") && CONCURRENT_SETTING_KEYS.includes("musicBarPanelDynamicColor"),
  "all dynamic-colour switches must participate in cross-tab conflict resolution");
assert.ok(["musicBarTimelineColor", "musicBarHandleColor", "musicBarControlsColor", "musicBarPlayerColor"].every((key) => CONCURRENT_SETTING_KEYS.includes(key)),
  "all player colour overrides must participate in cross-tab conflict resolution");
assert.match(persistence, /musicBarTimelineColor:\s*value\.musicBarTimelineColor,[\s\S]*?musicBarHandleColor:\s*value\.musicBarHandleColor,[\s\S]*?musicBarControlsColor:\s*value\.musicBarControlsColor,[\s\S]*?musicBarPlayerColor:\s*value\.musicBarPlayerColor/,
  "portable settings must retain every player colour override");
assert.match(lifecycle, /musicBarPlayerDynamicColor:\s*incoming\.musicBarPlayerDynamicColor !== false,[\s\S]*?musicBarPanelDynamicColor:\s*incoming\.musicBarPanelDynamicColor !== false/,
  "cross-tab normalization must preserve independent dynamic-colour settings and default older installs on");
assert.match(lifecycle, /musicBarBlendMode:\s*PLAYER_BLEND_MODES\.includes\(incoming\.musicBarBlendMode\)[\s\S]*?:\s*"normal"/,
  "cross-tab state normalization must validate player blend modes and safely fall back to Normal");
assert.match(persistence, /scrubberStyle:\s*value\.scrubberStyle,[\s\S]*?scrubberHandleShape:\s*value\.scrubberHandleShape,[\s\S]*?musicBarScrubberWidth:\s*value\.musicBarScrubberWidth/,
  "portable settings must retain the selected scrub-handle shape");
assert.match(lifecycle, /scrubberHandleShape:\s*SCRUBBER_HANDLE_SHAPES\.includes\(incoming\.scrubberHandleShape\)[\s\S]*?:\s*"pill"/,
  "cross-tab state normalization must validate scrub-handle shapes and safely fall back to Pill");
assert.match(lifecycle, /storage\.onChanged[\s\S]*?normalizedCrossTabSettings\(incoming, runtimeState\)[\s\S]*?Object\.assign\(runtimeState, syncedSettings\)/,
  "every open tab must adopt normalized settings received through Chrome storage");
assert.match(lifecycle, /storage\.onChanged[\s\S]*?incomingCartIsNewer[\s\S]*?runtimeState\.cart = cart/,
  "every open tab must adopt the newest authoritative native-cart snapshot");
assert.match(lifecycle, /activityCartEventsRepaired[\s\S]*?repairDuplicatedCartActivity[\s\S]*?runtimeSaveState\(\)/,
  "existing installations must persist the one-time cart activity repair");
assert.match(persistence, /savedLayoutState[\s\S]*?activeTab:[\s\S]*?playlistView:[\s\S]*?cartView:[\s\S]*?djOpen:[\s\S]*?pageDjOpen:/,
  "the revisioned cross-tab layout snapshot must include every primary visible panel state");
assert.match(persistence, /applyPersistedLayout[\s\S]*?runtimeState\.activeTab[\s\S]*?runtimeState\.playlistView[\s\S]*?runtimeState\.cartView[\s\S]*?runtimeState\.dj\.open/,
  "every tab must apply the latest visible panel state from the shared layout snapshot");
assert.match(playerShell, /toggleDjTools[\s\S]*?runtimeState\.dj\.open[\s\S]*?saveLayoutState\(\)/,
  "opening the DJ drawer must publish that visible state to the other tabs");
assert.doesNotMatch(lifecycle, /finalPanelRect[\s\S]*?saveLayoutState\(\)/,
  "a passive tab closing or navigating away must not overwrite the last intentional UI state");
assert.match(lifecycle, /incomingLayout[\s\S]*?< r\.\$layoutRevision[\s\S]*?previousLayout\.revision = 0[\s\S]*?nextLayout\.revision = 0/,
  "same-millisecond UI writes must converge in storage event order without redundant renders");

const repairedCartActivity = repairDuplicatedCartActivity([
  { id: "best", action: "added-to-cart", title: "Schematic", artist: "Detox Unit", art: "cover.jpg", url: "https://detoxunit.bandcamp.com/album/schematic", createdAt: "2026-08-25T11:46:02.000Z" },
  { id: "generic-art", action: "added-to-cart", title: "Schematic", artist: "Bandcamp", art: "cover.jpg", url: "https://detoxunit.bandcamp.com/album/schematic", createdAt: "2026-08-25T11:46:01.000Z" },
  { id: "generic", action: "added-to-cart", title: "Schematic, digital album", artist: "Bandcamp", url: "https://bandcamp.com/", createdAt: "2026-08-25T11:46:00.000Z" },
  { id: "listen", action: "listened", title: "Schematic", artist: "Detox Unit", createdAt: "2026-08-25T11:45:59.000Z" },
  { id: "later", action: "added-to-cart", title: "Schematic", artist: "Detox Unit", art: "cover.jpg", url: "https://detoxunit.bandcamp.com/album/schematic", createdAt: "2026-08-25T11:50:02.000Z" }
]);
assert.deepEqual(repairedCartActivity.map((item) => item.id), ["best", "listen", "later"],
  "the migration must collapse only the close metadata-enrichment burst and preserve unrelated or later events");

const playlistA = { id: "playlist-a", name: "Restored A", modifiedAt: "2026-08-24T01:00:00.000Z", items: [] };
const playlistB = { id: "playlist-b", name: "Restored B", modifiedAt: "2026-08-24T02:00:00.000Z", items: [] };
const remotePlaylist = { id: "playlist-remote", name: "Created elsewhere", modifiedAt: "2026-08-24T03:00:00.000Z", items: [] };
const cart = { id: "cart-a", name: "Restored cart", modifiedAt: "2026-08-24T01:00:00.000Z", items: [] };
const localActivity = { id: "activity-local", action: "listened", createdAt: "2026-08-24T02:00:00.000Z" };
const remoteActivity = { id: "activity-remote", action: "backed-up", createdAt: "2026-08-24T03:00:00.000Z" };

const savedAt = "2026-08-24T05:00:00.000Z";
const rebasedState = mergeConcurrentState(
  {
    activity: [], savedPlaylists: [], savedCarts: [], backupIntroSeen: false, backupReminderDays: 7,
    backupReminderSnoozedAt: null, lastBackupAt: null
  },
  {
    activity: [localActivity], savedPlaylists: [], savedCarts: [], musicBarSize: "compact", backupIntroSeen: false,
    backupReminderDays: 7, backupReminderSnoozedAt: null, lastBackupAt: null
  },
  {
    activity: [remoteActivity], savedPlaylists: [playlistA, playlistB], savedCarts: [cart], musicBarSize: "standard",
    backupIntroSeen: true, backupReminderDays: 7, backupReminderSnoozedAt: null, lastBackupAt: savedAt
  }
);
assert.deepEqual(rebasedState.savedPlaylists, [playlistA, playlistB]);
assert.deepEqual(rebasedState.savedCarts, [cart]);
assert.deepEqual(rebasedState.activity, [localActivity, remoteActivity],
  "activity recorded in separate Bandcamp tabs must merge instead of replacing another tab's events");
assert.equal(rebasedState.musicBarSize, "compact",
  "the stale tab's intended setting change must save without replacing the restored libraries");
assert.equal(rebasedState.backupIntroSeen, true);
assert.equal(rebasedState.lastBackupAt, savedAt,
  "a stale tab save must not make a completed backup immediately due again");

const onboardingRebase = mergeConcurrentState(
  { onboardingCompletedVersion: 1, onboardingStep: 0 },
  { onboardingCompletedVersion: 1, onboardingStep: 0, musicBarSize: "compact" },
  { onboardingCompletedVersion: 0, onboardingStep: 4, musicBarSize: "standard" }
);
assert.equal(onboardingRebase.onboardingCompletedVersion, 1,
  "a stale tab must never reactivate onboarding after it has been completed or skipped");
assert.equal(onboardingRebase.onboardingStep, 0,
  "completed onboarding must not retain a stale in-progress step");

const cartOne = { id: "bandcamp-a-1", title: "One" };
const cartTwo = { id: "bandcamp-a-2", title: "Two" };
const cartThree = { id: "bandcamp-a-3", title: "Three" };
const cartRebase = mergeConcurrentState(
  { cart: [cartOne, cartTwo], cartSavedAt: 1, cartSummary: null },
  { cart: [cartOne, cartTwo], cartSavedAt: 1, cartSummary: null, musicBarSize: "compact" },
  { cart: [cartThree, cartOne, cartTwo], cartSavedAt: 2, cartSummary: { subtotal: 30, currency: "USD" }, musicBarSize: "standard" }
);
assert.deepEqual(cartRebase.cart, [cartThree, cartOne, cartTwo],
  "an unrelated save from a stale tab must preserve the newest authoritative native-cart snapshot");
assert.equal(cartRebase.cartSavedAt, 2);
assert.deepEqual(cartRebase.cartSummary, { subtotal: 30, currency: "USD" });

const cartRemovalRebase = mergeConcurrentState(
  { cart: [cartOne, cartTwo], cartSavedAt: 2, cartSummary: null },
  { cart: [cartOne], cartSavedAt: 4, cartSummary: { total: 10, currency: "USD" } },
  { cart: [cartOne, cartTwo, cartThree], cartSavedAt: 3, cartSummary: { total: 30, currency: "USD" } }
);
assert.deepEqual(cartRemovalRebase.cart, [cartOne],
  "a deliberate newer removal must not be undone by union-merging an older tab snapshot");

const snoozedAt = "2026-08-24T06:00:00.000Z";
const reminderRebase = mergeConcurrentState(
  { backupIntroSeen: true, backupReminderDays: 7, backupReminderSnoozedAt: null, lastBackupAt: savedAt },
  { backupIntroSeen: true, backupReminderDays: 14, backupReminderSnoozedAt: null, lastBackupAt: savedAt },
  { backupIntroSeen: true, backupReminderDays: 7, backupReminderSnoozedAt: snoozedAt, lastBackupAt: savedAt }
);
assert.equal(reminderRebase.backupReminderDays, 14,
  "a deliberate reminder-frequency change must still win locally");
assert.equal(reminderRebase.backupReminderSnoozedAt, snoozedAt,
  "an untouched local reminder must retain another tab's snooze time");

const musicBarRebase = mergeConcurrentState(
  { musicBarStyle: "docked", musicBarWidth: "default", musicBarCustomWidth: 900, scrubberStyle: "waveform" },
  { musicBarStyle: "docked", musicBarWidth: "default", musicBarCustomWidth: 900, scrubberStyle: "traditional" },
  { musicBarStyle: "floating", musicBarWidth: "wide", musicBarCustomWidth: 1120, scrubberStyle: "waveform" }
);
assert.equal(musicBarRebase.musicBarStyle, "floating",
  "an unrelated save from a stale tab must retain the newest music-bar style");
assert.equal(musicBarRebase.musicBarWidth, "wide",
  "an unrelated save from a stale tab must retain the newest music-bar width preset");
assert.equal(musicBarRebase.musicBarCustomWidth, 1120,
  "an unrelated save from a stale tab must retain the newest custom width");
assert.equal(musicBarRebase.scrubberStyle, "traditional",
  "the stale tab's deliberate setting change must still win locally");

const drawerRebase = mergeConcurrentState(
  { settingsDrawers: { playback: false, appearance: false } },
  { settingsDrawers: { playback: false, appearance: false } },
  { settingsDrawers: { playback: true, appearance: false } }
);
assert.deepEqual(drawerRebase.settingsDrawers, { playback: true, appearance: false },
  "an unrelated stale-tab save must not reverse a newer settings drawer toggle");
const drawerCloseRebase = mergeConcurrentState(
  { settingsDrawers: { playback: true } },
  { settingsDrawers: { playback: false } },
  { settingsDrawers: { playback: true } }
);
assert.deepEqual(drawerCloseRebase.settingsDrawers, { playback: false },
  "a deliberate local drawer close must remain closed");

assert.deepEqual(
  mergeObjectChanges(
    { preset: "studio", frostedGlass: false, glassTransparency: 35, glassBlur: 18 },
    { preset: "studio", frostedGlass: false, glassTransparency: 35, glassBlur: 18 },
    { preset: "studio", frostedGlass: true, glassTransparency: 55, glassBlur: 24 }
  ),
  { preset: "studio", frostedGlass: true, glassTransparency: 55, glassBlur: 24 },
  "an unrelated save must retain frosted-glass settings changed in another tab"
);

assert.deepEqual(
  mergeObjectChanges(
    { preset: "studio", frostedGlass: false, glassTransparency: 35, glassBlur: 18 },
    { preset: "midnight", frostedGlass: false, glassTransparency: 35, glassBlur: 18 },
    { preset: "studio", frostedGlass: true, glassTransparency: 55, glassBlur: 24 }
  ),
  { preset: "midnight", frostedGlass: true, glassTransparency: 55, glassBlur: 24 },
  "separate appearance changes made in two tabs must merge field by field"
);

assert.deepEqual(
  mergeCollectionChanges([], [], [playlistA, playlistB]),
  [playlistA, playlistB],
  "an unrelated save from a stale tab must retain playlists restored by another tab"
);

assert.deepEqual(
  mergeCollectionChanges([playlistA, playlistB], [playlistB], [remotePlaylist, playlistA, playlistB]),
  [playlistB, remotePlaylist],
  "a deliberate local deletion must be applied without deleting an item created in another tab"
);

const renamedPlaylist = { ...playlistA, name: "Renamed locally", modifiedAt: "2026-08-24T04:00:00.000Z" };
assert.deepEqual(
  mergeCollectionChanges([playlistA], [renamedPlaylist], [remotePlaylist, playlistA]),
  [renamedPlaylist, remotePlaylist],
  "a deliberate local edit must win for its item while retaining other tabs' items"
);

assert.deepEqual(mergeCollectionChanges([], [], [cart]), [cart],
  "the same stale-write protection must cover restored carts");

console.log("merge-safe multi-tab state persistence smoke test passed");
