import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lucideIcons = path.join(root, "node_modules", "lucide-static", "icons");
const assets = path.join(root, "assets");

const iconMap = {
  "icon-activity.svg": "activity.svg",
  "icon-add-all.svg": "list-plus.svg",
  "icon-back.svg": "chevron-left.svg",
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
  "icon-open.svg": "chevron-right.svg",
  "icon-playlist.svg": "list-music.svg",
  "icon-plus.svg": "plus.svg",
  "icon-preorder.svg": "clock-3.svg",
  "icon-queue.svg": "list-end.svg",
  "icon-reset.svg": "rotate-ccw.svg",
  "icon-restore.svg": "history.svg",
  "icon-save.svg": "save.svg",
  "icon-saved-cart.svg": "shopping-basket.svg",
  "icon-settings.svg": "settings.svg",
  "icon-share.svg": "share.svg",
  "icon-skip.svg": "skip-forward.svg",
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
