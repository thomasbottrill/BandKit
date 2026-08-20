import fs from "node:fs";

const contentModules = [
  "../../src/shared/contracts.js",
  "../../src/content/state.js",
  "../../src/content/core.js",
  "../../src/content/color.js",
  "../../src/content/waveform.js",
  "../../src/content/playlist-model.js",
  "../../src/content/cart-model.js",
  "../../src/content/index.js",
  ...[
    "runtime-shell", "persistence-playback", "playlist-io", "appearance", "modern-layout",
    "layout-cart", "dj-playback", "dj-handoff", "collection-views", "activity-settings",
    "player-shell", "page-player-ui", "page-commerce-analysis", "page-actions", "live-scanning",
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
  "base.css", "dj.css", "dj-controls.css", "collections.css", "collections-details.css", "settings.css", "player.css", "responsive.css"
]);
export const readModernStyles = () => readStyleDirectory("modern", [
  "base.css", "artist-shell.css", "catalogue.css", "merch-video-community.css", "feed.css", "release.css", "release-details.css", "responsive.css"
]);
