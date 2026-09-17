import { hexColor, parseColor } from "./color.js";

function tokenColour(value) {
  const css = String(value || "").trim();
  const short = css.match(/^#([\da-f])([\da-f])([\da-f])$/i);
  return parseColor(css) || hexColor(short ? `#${short[1].repeat(2)}${short[2].repeat(2)}${short[3].repeat(2)}` : css, null);
}

// Read Bandcamp's genre tokens, which change without a page navigation.
export function discoverGenrePalette() {
  const banner = document.querySelector("#DiscoverApp .filters-banner.genre-theme");
  const genre = banner?.getAttribute("style")?.match(/var\(--genre-(.+?)-secondary-color\)/)?.[1];
  if (!genre) return null;
  const style = getComputedStyle(banner);
  const gradient = style.getPropertyValue(`--genre-${genre}-gradient`);
  const background = tokenColour(gradient.match(/#[\da-f]{6}/i)?.[0] || "");
  const text = tokenColour(style.getPropertyValue("--page-text-color"));
  const accent = tokenColour(style.getPropertyValue(`--genre-${genre}-primary-color`));
  return background && text && accent ? { background, text, accent } : null;
}
