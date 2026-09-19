# Shared interface components

The first componentisation stage covers the Bandkit panel. Components build DOM;
view modules supply state and callbacks. Keep persistence, playback, commerce and
page-specific decisions in the views. No framework or new runtime dependency is
needed.

| Shared component module | Responsibility | Used by |
| --- | --- | --- |
| `panel-shell.js` | Panel header, sections container and resize handles | Runtime DOM setup |
| `settings.js` | Label/copy, rows, switches, text action groups and action rows | Player, controls, tools, browsing, appearance, data and about settings |
| `collections.js` | View tabs, media-card shell, saved collection summary and empty state | Now Playing, playlists, cart and activity |
| `actions.js` | Icon buttons, toolbar buttons, menu actions and overflow menu focus | Collection toolbars and saved-item actions |

Existing specialised components remain reusable in `settings-drawer.js`,
`settings-picker.js`, `settings-popover.js`, `music-bar-settings.js`,
`player-button-settings.js`, `player-colour-overrides.js`, `timeline-picker.js`
and `scrub-handle-picker.js`. `core.js` supplies shared artwork, icons, back
buttons, carets and section headings. Extend these components instead of copying
their DOM into another view.

Preserve CSS classes, DOM nesting, accessible names, focus behavior, disclosure
state and event order when migrating a caller. Components must not infer page
type or read runtime state. Pass variant options or content from the caller.
Keep artist/release/feed/collection page adapters and the music-bar shell outside
this stage. The saved-theme management row is the intentional layout change:
label on the left, Rename and Delete on the right. Delete inherits the same theme
colors as other actions and retains its confirmation dialog.

Run `node tests/panel-components-smoke.mjs` for component and saved-theme behavior
checks. After rebuilding, reload the unpacked extension and verify affected
views on real Bandcamp pages, including computed layout and keyboard use.

## Music-bar componentisation

The next stage extends the component boundary to the music-bar shell:

- `music-bar.js` creates the player, its artwork/metadata, analysis tools,
  timeline, transport controls, visualizer canvas and section container. It
  returns the detached DJ drawer separately so the runtime can mount it beside
  the player, preserving the existing glass and stacking behavior.
- `section-navigation.js` creates the compact player button, panel tabs,
  panel destinations and music-bar shortcuts. Their common destination-button
  setup owns labels and identifiers; callers retain navigation and persistence.
- Runtime setup attaches these nodes and wires existing controllers. Onboarding
  and fullscreen continue to use the same live player instance. Page adapters,
  audio routing, rendering and production CSS are unchanged by this extraction.
- `tests/player-layout-fixture.html` imports the production music-bar and
  shortcut components instead of maintaining a second copy of their markup.

Verification includes exact DOM equivalence against the original constructor,
independent component instances, the detached drawer, and live Bandcamp layout
comparisons for Dock, Fade and Float at desktop and 390px widths. Live playback,
seeking, next-track navigation, native previous/restart, overflow toggling and
all four panel destinations are exercised with the actual unpacked extension.
All 12 empty/populated layout states match the baseline after normalizing the
initial panel destination. Source validation, lint and build pass. This stage's
full smoke audit passes 66 checks; the remaining Settings-preview assertion also
fails in the pre-extraction baseline and is outside this music-bar change.

## Bandcamp page controls

The page-control stage extracts presentation while retaining the existing page
adapters and their state, callbacks, insertion rules and theme application:

| Component module | Responsibility |
| --- | --- |
| `page-actions.js` | Add, purchase, release overflow, DJ and search-play controls; destination menu and its options |
| `page-playback.js` | Waveform SVG, playhead and native previous/next proxy buttons |
| `page-analysis.js` | BPM, key and Camelot badges with independent confidence states |

Release, collection, wishlist, Feed, Discover and recommendation adapters keep
using the same runtime helpers, which now delegate DOM construction to these
components. Native anchor variants, ownership restrictions, batch selections,
menu navigation and native purchase callbacks remain with their callers.
Production CSS is unchanged by this extraction.

Verification on 6 September 2026 used the actual unpacked extension on Bandcamp.
Eight before/after album and track states (modern/classic, 1200px/390px) matched
in control text, accessible labels, computed styles, dimensions and menu options.
Signed-in collection, wishlist and Feed menus retained their contextual options
without overflow or logged errors. Discover menus, search-play control labels,
release overflow, playlist submenu/back navigation and DJ toggling were also
checked on live pages. Component tests cover literal destination names, click
propagation, independent instances, native anchors, SVG namespaces and confidence
flags. The stale Settings-preview checks now follow the shared preview component.

Source validation, lint and build passed for this stage. Its remaining visualizer
catalogue assertion was resolved in the card-component follow-up below.

## Card and artwork follow-up

The audit found that collection, wishlist, Feed and Discover artwork/title/artist
cards mostly belong to Bandcamp. Their page adapters enhance existing DOM rather
than constructing interchangeable Bandkit cards. Keep those native nodes and
page-specific placement rules; do not recreate them to force a common template.

The reusable Bandkit-owned pieces now live in:

- `playlist-artwork.js`: shared safe-URL resolution, deduplication and artwork
  construction. The panel retains its four-image mosaic, eager images and queue
  placeholder. Collection pages retain five vertical slices, lazy images and
  the playlist placeholder.
- `page-cards.js`: the saved-playlist fallback card, its copy/footer/origin badge,
  collection action-row construction and shared Feed row presentation. Applying
  row styles preserves the native children and listeners. Native playlist-card
  cloning, date/duration formatting, identity and navigation remain in the adapter.

The hidden reference now includes these production playlist cards and artwork
variants, with an artwork-count selector for empty, single and multiple images.
It uses production collection-playlist styles and the existing theme, width,
disabled and reset controls. Sample clicks remain local to the reference.

After rebuilding and reloading the actual unpacked extension, seven signed-in
collection playlist cards matched their baseline text, artwork markup and
dimensions. Collection rows also matched their baseline, and collection,
wishlist and Feed menus retained their contextual options without overflow or
logged errors. A native saved card opened the correct panel detail. Six panel
card states (zero/one/five source images at 1200px and 390px) matched the immutable
pre-extraction build on a real Bandcamp release page.

Reference checks cover 12 artwork-count/theme/width combinations, plus dark-theme
empty artwork, keyboard activation, disabled controls and reset. There were no
runtime or network errors during the reference matrix. Behavioral tests cover
unsafe/duplicate artwork, variant limits/loading, placeholders, native listener
preservation and literal titles. The visualizer test now checks catalogue
uniqueness and includes Rorschach in its geometry checks, with Bézier support in
the canvas harness. The full `npm test` command passes.

## Design system follow-up

The five follow-up stages live on `codex/panel-design-system`:

1. `settings-actions.css` owns base action variants, `settings-backup.css` owns
   backup UI, and `settings-detail.css` owns the shared quiet detail layout.
   `player-foundation.css` contains the player surface/effects formerly mixed
   into action styles. Import order deliberately preserves the cascade.
2. `base.css` declares `--hub-settings-*` dimensional and motion tokens. Their
   defaults match the previous literal values; compact/nested exceptions remain
   explicit. Existing theme, icon and surface tokens retain their owners.
3. `colour-field.js` builds labelled colour inputs and optional source/reset
   controls. Callers resolve inherited colours and own all update/save effects.
   `artwork-upload.js` owns file selection, pending/cleanup and error dispatch;
   each caller still imports, validates, stores and previews its artwork.
4. `createSettingsRowCopy` creates accessible tooltip labels immediately.
   `prepareSettingsDetail` now only prepares the section container. Shared
   actions are created with `createSettingsAction`; button/link/type variants
   are explicit and retain each caller's callbacks.
5. `src/component-reference/` builds an isolated reference using these actual
   components and the production `hub.css`. It imports no runtime controllers,
   reads no saved state and never persists its sample interactions.

### Hidden component reference

After rebuilding/reloading the extension, open **Settings → Help** and type
`components` (with no modifier keys, outside text fields). Keep pauses between
letters under two seconds. The reference opens in a new tab; Help has no visible
reference item. Leaving Help or starting the guided tour disables the command.

You can also open
`chrome-extension://<your-extension-id>/component-reference.html` in Chrome.
Find the extension ID on Bandkit's card at `chrome://extensions` with Developer
mode enabled. Bookmark the address for direct access. There is intentionally no
visible entry in the panel, popup, menus or normal navigation. The extension ID is local
to the unpacked installation; it is not a shared website address.

Use the theme selector for the production palettes, width selector for layout,
Tab/hover for labels and focus, menus/disclosure for expanded states, and the
checkbox for disabled controls. Reset samples clears only the reference page's
temporary state. Rename/Delete demonstrate confirmation against sample content.

Regression commands: `node tests/panel-components-smoke.mjs`,
`node tests/panel-controls-smoke.mjs`, `node tests/settings-cards-smoke.mjs`,
`node tests/theme-sharing-smoke.mjs`, then the standard build/lint/smoke checks.
Live verification must still use the actual extension on Bandcamp, not this
reference page alone.

### Verification recorded 6 September 2026

Compared an immutable pre-refactor build with the rebuilt unpacked extension on
`https://ohsees.bandcamp.com/album/floating-coffin` in isolated Chrome profiles.
The 11 initial settings views, 21 expanded light/dark/custom states and three
390px viewport theme states had identical DOM text, accessible labels, computed
styles and dimensions. A separate dynamic-colour narrow-panel comparison also
matched, with no runtime exceptions or extension console errors.

Live interactions verified all three SVG upload callers, invalid-upload recovery,
player timeline/handle/control overrides and resets, linked content/panel/timeline/
visualizer colour resets, and Cancel/Confirm saved-theme deletion. The hidden
reference was checked in light/dark themes, across all 42 palette choices, and
with width, disabled, reset, disclosure and picker keyboard interactions.

The follow-up maintenance pass resolves the five baseline smoke failures by
updating assertions for the current appearance, handle, music-bar, date-picker
and three-source theme designs. Browser-specific colour-swatch rules are checked
individually. The full `npm test` command now passes source validation, lint,
build and every smoke test.

Onboarding now separates tour lifecycle, sample content and navigation in
`runtime/onboarding.js` from its appearance pickers and controls in
`runtime/onboarding-controls.js`. Both remain below 1,000 lines and the module
graph is acyclic. The concurrent Settings selector-preview work is preserved.
Live Bandcamp checks cover all 11 steps, picker opening/closing, completion and
reload persistence, replay/Skip, and removal of temporary sample data.
The visual pass also corrected inherited no-wrap text and grid overflow in the
onboarding card. After rebuilding, the actual extension was checked at 1200px
and 390px: all controls fit, theme previews restore on close, and no runtime
exceptions were recorded.
