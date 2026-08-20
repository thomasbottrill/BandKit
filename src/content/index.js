import { STORAGE_KEYS } from "../shared/contracts.js";
import { registerRuntimeShell, setupRuntimeShell } from "./runtime/runtime-shell.js";
import { registerPersistencePlayback, setupPersistencePlayback } from "./runtime/persistence-playback.js";
import { registerPlaylistIo, setupPlaylistIo } from "./runtime/playlist-io.js";
import { registerAppearance, setupAppearance } from "./runtime/appearance.js";
import { registerModernLayout, setupModernLayout } from "./runtime/modern-layout.js";
import { registerLayoutCart, setupLayoutCart } from "./runtime/layout-cart.js";
import { registerDjPlayback, setupDjPlayback } from "./runtime/dj-playback.js";
import { registerCollectionViews, setupCollectionViews } from "./runtime/collection-views.js";
import { registerActivitySettings, setupActivitySettings } from "./runtime/activity-settings.js";
import { registerPlayerShell, setupPlayerShell } from "./runtime/player-shell.js";
import { registerPagePlayerUi, setupPagePlayerUi } from "./runtime/page-player-ui.js";
import { registerPageCommerceAnalysis, setupPageCommerceAnalysis } from "./runtime/page-commerce-analysis.js";
import { registerPageActions, setupPageActions } from "./runtime/page-actions.js";
import { registerLiveScanning, setupLiveScanning } from "./runtime/live-scanning.js";
import { registerLifecycle, setupLifecycle } from "./runtime/lifecycle.js";

(async () => {
  if (window.top !== window || document.getElementById("bandcamp-hub-extension-root")) {
  return;
  }
  const activation = await new Promise((resolve) => {
  chrome.storage.local.get(STORAGE_KEYS.ENABLED, (stored) => {
  resolve(stored?.[STORAGE_KEYS.ENABLED] !== false);
  });
  });
  if (!activation) return;

  const r = {};
  for (const install of registerRuntimeShell) install(r);
  for (const install of registerPersistencePlayback) install(r);
  for (const install of registerPlaylistIo) install(r);
  for (const install of registerAppearance) install(r);
  for (const install of registerModernLayout) install(r);
  for (const install of registerLayoutCart) install(r);
  for (const install of registerDjPlayback) install(r);
  for (const install of registerCollectionViews) install(r);
  for (const install of registerActivitySettings) install(r);
  for (const install of registerPlayerShell) install(r);
  for (const install of registerPagePlayerUi) install(r);
  for (const install of registerPageCommerceAnalysis) install(r);
  for (const install of registerPageActions) install(r);
  for (const install of registerLiveScanning) install(r);
  for (const install of registerLifecycle) install(r);
  for (const install of setupRuntimeShell) install(r);
  for (const install of setupPersistencePlayback) install(r);
  for (const install of setupPlaylistIo) install(r);
  for (const install of setupAppearance) install(r);
  for (const install of setupModernLayout) install(r);
  for (const install of setupLayoutCart) install(r);
  for (const install of setupDjPlayback) install(r);
  for (const install of setupCollectionViews) install(r);
  for (const install of setupActivitySettings) install(r);
  for (const install of setupPlayerShell) install(r);
  for (const install of setupPagePlayerUi) install(r);
  for (const install of setupPageCommerceAnalysis) install(r);
  for (const install of setupPageActions) install(r);
  for (const install of setupLiveScanning) install(r);
  for (const install of setupLifecycle) install(r);
})().catch((error) => {
  console.error("Bandkit failed to initialize its content runtime.", error);
});
