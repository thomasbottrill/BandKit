import fs from "node:fs/promises";
import path from "node:path";
import { registerLayoutCart } from "../src/content/runtime/layout-cart.js";
import { updateRuntimeState } from "../src/content/runtime/context.js";
import { registerPlaylistIo } from "../src/content/runtime/playlist-io.js";

const outputDirectory = path.resolve(process.argv[2] || "/tmp/bandkit-export-examples");
globalThis.location = new URL("https://bandcamp.com/example/feed");

const art = {
  vibes: "https://f4.bcbits.com/img/a2137179650_10.jpg",
  sadness: "https://f4.bcbits.com/img/a2663947647_5.jpg",
  schematic: "https://f4.bcbits.com/img/a4114862722_5.jpg"
};
const release = {
  vibes: "https://yukumusic.bandcamp.com/album/vibes",
  sadness: "https://sadnessmusic.bandcamp.com/album/that-lasts-forever",
  schematic: "https://detoxunit.bandcamp.com/album/schematic"
};
const timestamp = (daysAgo, hour) => {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  value.setHours(hour, 24, 0, 0);
  return value.toISOString();
};

const playlist = [
  { id: "baigo", title: "Baigo", artist: "NURI", album: "VIBES", pageUrl: "https://yukumusic.bandcamp.com/track/baigo", artistUrl: "https://yukumusic.bandcamp.com/", art: art.vibes, duration: 244, bpm: 129, key: { shortName: "D min" } },
  { id: "pink-sunset", title: "pink sunset", artist: "Sadness", album: "that lasts forever", pageUrl: "https://sadnessmusic.bandcamp.com/track/pink-sunset", artistUrl: "https://sadnessmusic.bandcamp.com/", art: art.sadness, duration: 318, bpm: 104, key: { shortName: "A min" } },
  { id: "schematic", title: "Schematic", artist: "Detox Unit", album: "Schematic", pageUrl: release.schematic, artistUrl: "https://detoxunit.bandcamp.com/", art: art.schematic, duration: 357, bpm: 140, key: { shortName: "F min" } }
];
const cart = [
  { id: "cart-vibes", title: "VIBES", artist: "NURI", album: "VIBES", url: release.vibes, art: art.vibes, kind: "Digital album", price: 8, currency: "USD" },
  { id: "cart-sadness", title: "that lasts forever", artist: "Sadness", album: "that lasts forever", url: release.sadness, art: art.sadness, kind: "Digital album", price: 4, currency: "USD" }
];
const activity = [
  { action: "listened", title: "Baigo", artist: "NURI", url: "https://yukumusic.bandcamp.com/track/baigo", artistUrl: "https://yukumusic.bandcamp.com/", art: art.vibes, createdAt: timestamp(0, 12) },
  { action: "wishlisted", title: "pink sunset", artist: "Sadness", url: "https://sadnessmusic.bandcamp.com/track/pink-sunset", artistUrl: "https://sadnessmusic.bandcamp.com/", art: art.sadness, createdAt: timestamp(0, 10) },
  { action: "added-to-cart", title: "Schematic", artist: "Detox Unit", url: release.schematic, artistUrl: "https://detoxunit.bandcamp.com/", art: art.schematic, createdAt: timestamp(1, 18) },
  { action: "added-to-playlist", title: "pink sunset", artist: "Sadness", url: "https://sadnessmusic.bandcamp.com/track/pink-sunset", artistUrl: "https://sadnessmusic.bandcamp.com/", art: art.sadness, createdAt: timestamp(2, 15), destination: "Late night" }
];

updateRuntimeState({
  activity,
  cart,
  cartSummary: { total: 12, currency: "USD" },
  playlist,
  showCamelotNotation: false,
  showTrackKeys: true
});

const runtime = {
  $artistUrlFromPageUrl(value) {
    try {
      const url = new URL(value);
      return `${url.origin}/`;
    } catch {
      return "";
    }
  },
  $cartItemArt: (item) => item.art || "",
  $cartTotalLabel: (_items, summary) => `$${Number(summary?.total || 0).toFixed(2)} ${summary?.currency || "USD"}`,
  $formatPlaylistBpm: (value) => Number(value) ? `${Math.round(Number(value))} BPM` : "",
  $normalizePlaylist: (items) => Array.isArray(items) ? items : [],
  $portablePlaylistItem: (item) => ({ ...item })
};
for (const register of registerPlaylistIo) register(runtime);
for (const register of registerLayoutCart) register(runtime);

const documents = [
  runtime.$createActivityDocument(activity),
  runtime.$createCartDocument(cart, "Bandkit example cart", { total: 12, currency: "USD" }),
  runtime.$createPlaylistDocument(playlist, "Bandkit example playlist")
];
await fs.mkdir(outputDirectory, { recursive: true });
for (const documentData of documents) {
  await fs.writeFile(path.join(outputDirectory, documentData.filename), documentData.html);
}
console.log(documents.map(({ filename }) => path.join(outputDirectory, filename)).join("\n"));
