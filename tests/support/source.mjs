import fs from "node:fs";

const contentModules = [
  "../../src/shared/contracts.js",
  "../../src/shared/now-playing-session.js",
  "../../src/content/state.js",
  "../../src/content/core.js",
  "../../src/content/components/settings.js",
  "../../src/content/components/colour-field.js",
  "../../src/content/components/artwork-upload.js",
  "../../src/content/components/panel-shell.js",
  "../../src/content/components/music-bar.js",
  "../../src/content/components/page-actions.js",
  "../../src/content/components/page-playback.js",
  "../../src/content/components/page-analysis.js",
  "../../src/content/components/page-cards.js",
  "../../src/content/components/playlist-artwork.js",
  "../../src/content/components/section-navigation.js",
  "../../src/content/components/actions.js",
  "../../src/content/components/collections.js",
  "../../src/content/color.js",
  "../../src/content/waveform.js",
  "../../src/content/playlist-model.js",
  "../../src/content/cart-model.js",
  "../../src/content/music-bar-settings.js",
  "../../src/content/index.js",
  ...[
    "runtime-shell", "runtime-dom-shell", "interaction-guards", "now-playing-session", "persistence-playback", "playlist-io", "appearance-header-theme", "appearance", "modern-layout", "modern-release-layout",
    "layout-cart", "layout-cart-rendering", "now-playing-actions", "dj-playback", "dj-page-tools", "dj-handoff", "collection-views", "collection-playlist-integration", "activity-view", "custom-theme-settings", "activity-settings",
    "discover-tracks", "player-metadata", "player-shell", "player-handoffs", "page-player-ui", "page-commerce-analysis", "page-actions", "search-results", "overflow-tooltips", "live-scanning",
    "lifecycle"
  ].map((filename) => `../../src/content/runtime/${filename}.js`)
];

export function readContentSource() {
  const source = contentModules
    .map((relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"))
    .join("\n");
  // Static source-contract tests predate the runtime-context extraction. Keep
  // their behavior-oriented patterns readable after dependency injection.
  return source.replaceAll("r.$", "")
    .replaceAll("runtimeState", "state")
    .replaceAll("runtimeLive", "live")
    .replaceAll("runtimeSaveState", "saveState")
    .replaceAll("runtimeSeamless", "seamless")
    .replace(/^      /gm, "    ");
}

function readStyleDirectory(name, filenames) {
  const directory = new URL(`../../src/styles/${name}/`, import.meta.url);
  return filenames
    .map((filename) => fs.readFileSync(new URL(filename, directory), "utf8"))
    .join("\n");
}

export const readHubStyles = () => readStyleDirectory("hub", [
  "base.css", "navigation.css", "dj.css", "dj-controls.css", "collections.css", "collections-details.css", "collections-interactions.css", "settings.css", "settings-controls.css", "settings-actions.css", "player-foundation.css", "settings-backup.css", "settings-detail.css", "settings-theme.css", "settings-colours.css", "glass.css", "settings-disclosure.css", "player.css", "player-menu.css", "player-track.css", "player-interactions.css", "compact-panel.css", "onboarding.css", "responsive.css", "links.css", "search-results.css"
]);
export const readModernStyles = () => readStyleDirectory("modern", [
  "base.css", "artist-shell.css", "catalogue.css", "merch-video-community.css", "feed.css", "release.css", "tracklist-interactions.css", "discover-tracks.css", "collection-playlists.css", "release-details.css", "release-actions.css", "responsive.css", "corners.css"
]);
