import fs from "node:fs";

const contentModules = [
  "../../src/shared/contracts.js",
  "../../src/content/state.js",
  "../../src/content/core.js",
  "../../src/content/color.js",
  "../../src/content/waveform.js",
  "../../src/content/playlist-model.js",
  "../../src/content/cart-model.js",
  "../../src/content/index.js"
];

export function readContentSource() {
  return contentModules
    .map((relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"))
    .join("\n");
}

function readStyleDirectory(name, filenames) {
  const directory = new URL(`../../src/styles/${name}/`, import.meta.url);
  return filenames
    .map((filename) => fs.readFileSync(new URL(filename, directory), "utf8"))
    .join("\n");
}

export const readHubStyles = () => readStyleDirectory("hub", [
  "base.css", "dj.css", "collections.css", "settings.css", "player.css", "responsive.css"
]);
export const readModernStyles = () => readStyleDirectory("modern", [
  "base.css", "artist-shell.css", "catalogue.css", "merch-video-community.css", "feed.css", "release.css", "responsive.css"
]);
