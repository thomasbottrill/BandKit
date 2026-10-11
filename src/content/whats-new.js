// The What's new tour for the latest feature release. Replace this whole
// definition when a release adds features; leave it untouched for releases
// that only fix bugs or polish the UI, so nobody sees the same tour twice.
//
// `version` is the release that introduced these features. Bandkit shows the
// tour once to anyone who finished the welcome tour before that release, and
// Settings › Help & onboarding lists it under Tour so it can be replayed.
//
// Steps use the welcome tour's fields (see runtime/onboarding.js). Two more
// are available here: `demo` can also be "collection", "bandcamp-playlists"
// or "downloads", and `control` puts the matching setting inside the card
// ("download-format" or "scale") so the feature can be tried on the spot.
// A step that only shows on certain pages names them in `page`: when the
// current page is not one, Next opens `page.url` and the tour continues there.
export const WHATS_NEW = Object.freeze({
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
});
