// What's new tours, newest first. When a release adds features, add an entry
// at the top; keep the earlier ones, because Settings › Help & onboarding
// lists every release so people can come back to them. Releases that only fix
// bugs or polish the UI add nothing, so nobody sees the same tour twice.
//
// `version` is the release that introduced the features. Bandkit shows the
// newest tour once to anyone who finished the welcome tour before it, and
// each tour's last card links to the release before it.
//
// Steps use the welcome tour's fields (see runtime/onboarding.js). Two more
// are available here: `demo` can also be "collection", "bandcamp-playlists"
// or "downloads", and `control` puts the matching setting inside the card
// ("download-format", "scale" or "keyboard-shortcuts") so the feature can be
// tried on the spot. `disclosure` opens that Settings drawer for the step.
// A step that only shows on certain pages names them in `page`: when the
// current page is not one, Next opens `page.url` and the tour continues there.
export const WHATS_NEW_RELEASES = Object.freeze([
  Object.freeze({
    version: "1.3.0",
    summary: "Keyboard shortcuts for the music bar.",
    steps: Object.freeze([
      { eyebrow: "New in Bandkit 1.3", title: "Control playback from the keyboard", copy: "Space plays or pauses, the arrow keys change track or skip through it, and 0–9 jump along the track. Press ? on any page to see every key.", panel: "settings", settingsView: "onboarding", disclosure: "keyboard-shortcuts", target: "panel", placement: "left", control: "keyboard-shortcuts" }
    ])
  }),
  Object.freeze({
    version: "1.2.0",
    summary: "Collection, Bandcamp playlists, bulk downloads and scaling.",
    steps: Object.freeze([
      { eyebrow: "What’s new", title: "New in Bandkit 1.2", copy: "A quick look at what this update adds. Each step shows where the feature lives.", target: "player", placement: "top" },
      { eyebrow: "Collection", title: "Your whole collection, one search away", copy: "Collection sits beside Playlists. Search purchases and your wishlist by title, artist, track or tag, filter by year, BPM or key, and play any release from its artwork.", panel: "playlist", demo: "collection", target: "panel", placement: "left" },
      { eyebrow: "Bandcamp playlists", title: "Playlists you made on Bandcamp", copy: "Playlists from your Bandcamp profile now appear beside Bandkit’s own, ready to play from the panel.", panel: "playlist", demo: "bandcamp-playlists", target: "panel", placement: "left" },
      { eyebrow: "Bulk downloads", title: "Download releases in bulk", copy: "On your collection page, choose Select, pick releases or everything not yet downloaded, then Download. Progress appears in Downloads.", panel: "downloads", demo: "downloads", target: "panel", placement: "left", control: "download-format" },
      { eyebrow: "Scale", title: "Size Bandcamp and Bandkit separately", copy: "Make this page or the Bandkit player and panels larger or smaller. Fine-tune each type of page in Settings › Appearance.", target: "player", placement: "top", control: "scale",
        page: { kind: "scaled", url: "https://osmura.bandcamp.com/album/patterns-in-balance" } }
    ])
  })
]);

// The newest release: the one shown automatically after an update.
export const WHATS_NEW = WHATS_NEW_RELEASES[0];

export const whatsNewTourId = (version) => `whats-new:${version}`;
// "1.3.0" reads as "1.3" in the interface.
export const shortVersion = (version) => String(version).replace(/\.0$/, "");
