import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lucideIcons = path.join(root, "node_modules", "lucide-static", "icons");
const assets = path.join(root, "assets");

const iconMap = {
  "icon-activity.svg": "activity.svg",
  "icon-add-all.svg": "list-plus.svg",
  "icon-blend-burn.svg": "flame.svg",
  "icon-blend-colour.svg": "paintbrush.svg",
  "icon-blend-darken.svg": "moon.svg",
  "icon-blend-difference.svg": "contrast.svg",
  "icon-blend-dodge.svg": "sparkles.svg",
  "icon-blend-exclusion.svg": "focus.svg",
  "icon-blend-hard-light.svg": "zap.svg",
  "icon-blend-hue.svg": "palette.svg",
  "icon-blend-layers.svg": "layers.svg",
  "icon-blend-lighten.svg": "sun.svg",
  "icon-blend-luminosity.svg": "sun.svg",
  "icon-blend-multiply.svg": "x.svg",
  "icon-blend-overlay.svg": "blend.svg",
  "icon-blend-plus.svg": "circle-plus.svg",
  "icon-blend-saturation.svg": "droplet.svg",
  "icon-blend-screen.svg": "sun.svg",
  "icon-blend-soft-light.svg": "cloud-sun.svg",
  "icon-back.svg": "chevron-left.svg",
  "icon-bpm.svg": "gauge.svg",
  "icon-cart.svg": "shopping-cart.svg",
  "icon-chevron.svg": "chevron-down.svg",
  "icon-clear.svg": "list-x.svg",
  "icon-close.svg": "x.svg",
  "icon-dj.svg": "disc-3.svg",
  "icon-dock.svg": "panel-right.svg",
  "icon-download-all.svg": "download.svg",
  "icon-downloads.svg": "download.svg",
  "icon-edit.svg": "pencil.svg",
  "icon-floating.svg": "copy.svg",
  "icon-gift.svg": "gift.svg",
  "icon-hear-more.svg": "headphones.svg",
  "icon-import.svg": "file-input.svg",
  "icon-more.svg": "ellipsis.svg",
  "icon-now-playing.svg": "circle-play.svg",
  "icon-open.svg": "arrow-right.svg",
  "icon-playlist.svg": "list-music.svg",
  "icon-plus.svg": "plus.svg",
  "icon-preorder.svg": "clock-3.svg",
  "icon-queue.svg": "list-end.svg",
  "icon-reset.svg": "rotate-ccw.svg",
  "icon-restore.svg": "history.svg",
  "icon-save.svg": "save.svg",
  "icon-saved-cart.svg": "shopping-basket.svg",
  "icon-settings.svg": "settings.svg",
  "icon-filter.svg": "funnel.svg",
  "icon-settings-about.svg": "info.svg",
  "icon-settings-analysis.svg": "scan-line.svg",
  "icon-settings-appearance.svg": "palette.svg",
  "icon-settings-browsing.svg": "compass.svg",
  "icon-settings-controls.svg": "sliders-horizontal.svg",
  "icon-settings-effects.svg": "sparkles.svg",
  "icon-settings-finish.svg": "paintbrush.svg",
  "icon-settings-help.svg": "circle-help.svg",
  "icon-settings-page.svg": "layout-panel-top.svg",
  "icon-settings-player.svg": "circle-play.svg",
  "icon-settings-privacy.svg": "shield-check.svg",
  "icon-settings-tools.svg": "wrench.svg",
  "icon-surface-glass.svg": "blend.svg",
  "icon-surface-solid.svg": "square.svg",
  "icon-surface-paper.svg": "file-text.svg",
  "icon-style-dock.svg": "panel-bottom.svg",
  "icon-style-float.svg": "rectangle-horizontal.svg",
  "icon-style-fade.svg": "cloud-fog.svg",
  "icon-corners-custom.svg": "radius.svg",
  "icon-corners-rounded.svg": "square-round-corner.svg",
  "icon-corners-square.svg": "square.svg",
  "icon-theme-curated.svg": "swatch-book.svg",
  "icon-theme-custom.svg": "paintbrush.svg",
  "icon-theme-dynamic.svg": "wand-sparkles.svg",
  "icon-share.svg": "share.svg",
  "icon-trash.svg": "trash-2.svg",
  "icon-wishlist.svg": "heart.svg"
};

// Filled derivatives preserve Lucide's geometry while giving primary playback
// controls the stronger, solid treatment used throughout Bandkit.
const filledPlaybackIcons = {
  "icon-play.svg": `<!-- @license lucide-static v1.31.0 - ISC -->
<svg class="lucide lucide-play" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#9CA3AF" stroke="none">
  <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
</svg>
`,
  "icon-pause.svg": `<!-- @license lucide-static v1.31.0 - ISC -->
<svg class="lucide lucide-pause" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#9CA3AF" stroke="none">
  <rect x="14" y="3" width="5" height="18" rx="1" />
  <rect x="5" y="3" width="5" height="18" rx="1" />
</svg>
`,
  "icon-skip.svg": `<!-- @license lucide-static v1.31.0 - ISC -->
<svg class="lucide lucide-skip-forward" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#9CA3AF" stroke="none">
  <path d="M4 5.35a1.75 1.75 0 0 1 2.65-1.5l10.5 6.65a1.75 1.75 0 0 1 0 3L6.65 20.15A1.75 1.75 0 0 1 4 18.65z" />
  <rect x="19" y="4" width="2" height="16" rx="1" />
</svg>
`
};

for (const [targetName, lucideName] of Object.entries(iconMap)) {
  const source = path.join(lucideIcons, lucideName);
  const target = path.join(assets, targetName);
  const svg = fs.readFileSync(source, "utf8").replaceAll("currentColor", "#9CA3AF");
  fs.writeFileSync(target, svg);
}

for (const [targetName, svg] of Object.entries(filledPlaybackIcons)) {
  fs.writeFileSync(path.join(assets, targetName), svg);
}

console.log(`Synced ${Object.keys(iconMap).length + Object.keys(filledPlaybackIcons).length} Lucide icons.`);
