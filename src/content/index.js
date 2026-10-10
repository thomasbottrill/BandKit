import { setupDiscoverToolbar } from "./runtime/discover-toolbar.js";
import { setupDiscoverLayout } from "./runtime/discover-layout.js";
import { registerDiscoverTracks, setupDiscoverTracks } from "./runtime/discover-tracks.js";
import { registerFeedTracks, setupFeedTracks } from "./runtime/feed-tracks.js";
import { STORAGE_KEYS } from "../shared/contracts.js";
import { registerRuntimeShell, setupRuntimeShell } from "./runtime/runtime-shell.js";
import { registerPersistencePlayback, setupPersistencePlayback } from "./runtime/persistence-playback.js";
import { registerPlaylistIo } from "./runtime/playlist-io.js";
import { registerAppearance, setupAppearance } from "./runtime/appearance.js";
import { registerModernLayout } from "./runtime/modern-layout.js";
import { registerLayoutCart } from "./runtime/layout-cart.js";
import { registerOnboarding, setupOnboarding } from "./runtime/onboarding.js";
import { registerNowPlayingActions } from "./runtime/now-playing-actions.js";
import { registerDjPlayback } from "./runtime/dj-playback.js";
import { registerDjPageTools } from "./runtime/dj-page-tools.js";
import { registerCollectionViews } from "./runtime/collection-views.js";
import { registerReleasePreview } from "./runtime/release-preview.js";
import { registerCollectionPlaylistIntegration, setupCollectionPlaylistIntegration } from "./runtime/collection-playlist-integration.js";
import { registerActivitySettings } from "./runtime/activity-settings.js";
import { registerPlayerShell } from "./runtime/player-shell.js";
import { registerPagePlayerUi } from "./runtime/page-player-ui.js";
import { registerPageCommerceAnalysis } from "./runtime/page-commerce-analysis.js";
import { registerDeepAnalysisRuntime, setupDeepAnalysisRuntime } from "./runtime/deep-analysis.js";
import { registerPageActions, setupPageActions } from "./runtime/page-actions.js";
import { registerHomeSalesActions } from "./runtime/home-sales-actions.js";
import { registerOverflowTooltips, setupOverflowTooltips } from "./runtime/overflow-tooltips.js";
import { registerLiveScanning, setupLiveScanning } from "./runtime/live-scanning.js";
import { registerLifecycle, setupLifecycle } from "./runtime/lifecycle.js";
import { registerDailyPlaybackRuntime } from "./runtime/daily-playback.js";
import { setupSearchResults } from "./runtime/search-results.js";
import { setupCollectionPreview } from "./runtime/collection-preview.js";

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
  // Search enhancement is independent of the Bandkit panel runtime and should
  // remain available even if an unrelated page integration cannot initialize.
  setupSearchResults();

  const r = {};
  for (const install of registerRuntimeShell) install(r);
  for (const install of registerPersistencePlayback) install(r);
  for (const install of registerPlaylistIo) install(r);
  for (const install of registerAppearance) install(r);
  for (const install of registerModernLayout) install(r);
  for (const install of registerOnboarding) install(r);
  for (const install of registerLayoutCart) install(r);
  for (const install of registerNowPlayingActions) install(r);
  for (const install of registerDjPlayback) install(r);
  for (const install of registerDjPageTools) install(r);
  registerReleasePreview(r);
  for (const install of registerCollectionViews) install(r);
  for (const install of registerCollectionPlaylistIntegration) install(r);
  for (const install of registerActivitySettings) install(r);
  for (const install of registerDailyPlaybackRuntime) install(r);
  for (const install of registerPlayerShell) install(r);
  for (const install of registerPagePlayerUi) install(r);
  for (const install of registerPageCommerceAnalysis) install(r);
  for (const install of registerDeepAnalysisRuntime) install(r);
  for (const install of registerHomeSalesActions) install(r);
  for (const install of registerPageActions) install(r);
  for (const install of registerOverflowTooltips) install(r);
  for (const install of registerLiveScanning) install(r);
  registerDiscoverTracks(r);
  registerFeedTracks(r);
  for (const install of registerLifecycle) install(r);
  for (const install of setupRuntimeShell) install(r);
  for (const install of setupDeepAnalysisRuntime) install(r);
  for (const install of setupOnboarding) install(r);
  for (const install of setupPersistencePlayback) install(r);
  for (const install of setupAppearance) install(r);
  for (const install of setupCollectionPlaylistIntegration) install(r);
  for (const install of setupPageActions) install(r);
  for (const install of setupOverflowTooltips) install(r);
  setupDiscoverToolbar(r);
  setupDiscoverLayout();
  setupDiscoverTracks(r);
  setupCollectionPreview(r);
  setupFeedTracks(r);
  for (const install of setupLiveScanning) install(r);
  for (const install of setupLifecycle) install(r);
})().catch((error) => {
  console.error("Bandkit failed to initialize its content runtime.", error);
});
