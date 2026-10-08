import assert from "node:assert/strict";
import fs from "node:fs";

const toolbar = fs.readFileSync(new URL("../src/content/runtime/discover-toolbar.js", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../src/content/runtime/modern-layout.js", import.meta.url), "utf8");
const player = fs.readFileSync(new URL("../src/content/runtime/player-shell.js", import.meta.url), "utf8");
const tracks = fs.readFileSync(new URL("../src/styles/modern/discover-tracks.css", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/modern/discover-toolbar.css", import.meta.url), "utf8");

assert.doesNotMatch(layout, /discoverGenrePalette/, "Discover genre must not replace the active page-aware theme");
assert.doesNotMatch(player, /discoverGenrePalette/, "Discover genre must not recolour the music bar");
assert.doesNotMatch(tracks, /data-bandkit-discover-genre/, "Discover genre must not recolour the generated track list");
assert.doesNotMatch(toolbar, /--bandkit-discover-(?:surface|ink|muted|line|accent)/,
  "The filter toolbar must not publish a second palette for page content");

assert.match(css, /filters-banner:has\(> \.bandkit-discover-toolbar\)\s*\{[\s\S]*?background:\s*color-mix\(in srgb, var\(--bandkit-page-surface/,
  "The sticky filter surface must continue to use the active page theme");
assert.doesNotMatch(css, /filters-banner:has\(> \.bandkit-discover-toolbar\)\[data-bandkit-genre-colours\][^{]*\{[^}]*background:\s*var\(--bandkit-genre-gradient\)/s,
  "Genre colour must not replace the whole filter banner");
assert.match(css, /\.bandkit-discover-chip-row\s*\{[\s\S]*?grid-row:\s*2;/,
  "The genre strip must occupy one stable row below the primary controls");
assert.match(css, /\.bandkit-discover-chip-row\s*\{[\s\S]*?margin-top:\s*8px;/,
  "The selected genre strip must keep breathing room below the primary controls");
assert.match(css, /data-bandkit-filter-panel="tags"\] > :is\(\.tag-search-wrapper, \.genre-filter\)/,
  "Opening Add filter must reveal both search and the main genre choices");
assert.match(css, /data-bandkit-filter-panel="tags"\] > \.bandkit-discover-chip-row\s*\{\s*display:\s*none\s*!important;/,
  "The contextual subgenre strip must yield to the main genre choices while Add filter is open");
assert.match(toolbar, /chipRow\.hidden = mode === "tags" \|\| !hasChipContent\(chips\)/,
  "Opening Add filter must swap rather than stack the contextual genre strip");
assert.match(css, /\.bandkit-discover-selected-chips > \.selected-tag[\s\S]*?background:\s*var\(--bandkit-genre-primary\)\s*!important;/,
  "Only the selected genre chip should receive the genre primary colour");
assert.match(toolbar, /if \(selectedChips\.length\) \{[\s\S]*?createElement\("div", "bandkit-discover-selected-chips"\)[\s\S]*?selectedGroup\.append\(\.\.\.selectedChips\)[\s\S]*?chips\.append\(selectedGroup\)/,
  "Closed filters must group only the selected chips inside the coloured backing");
assert.match(toolbar, /const genres = selected\.length \? \[\] : \[\.\.\.banner\.querySelectorAll\('\.genre-filter \.genres \[role="option"\]'\)\]/,
  "The default Discover state must source its top-level genre choices");
assert.match(toolbar, /selected\.length[\s\S]*?copySubgenreOptions[\s\S]*?: copyGenreOptions\(banner, schedule\)/,
  "The closed genre row must swap top-level genres for contextual subgenres after selection");
assert.match(toolbar, /option\.classList\.remove\("active"\)/,
  "The cloned default genre row must not falsely highlight Bandcamp's focused option");
assert.match(toolbar, /function hasChipContent\(chips\) \{[\s\S]*?Boolean\(chips\?\.querySelector\('\.selected-tag, \[role="option"\]'\)\)/,
  "Empty wrappers must not keep a blank genre row visible");
assert.match(css, /:is\(\.bandkit-discover-native-genres, \.bandkit-discover-native-subgenres\) ul[^{]*\{[^}]*display:\s*flex;/,
  "Top-level genres and subgenres must share the horizontal chip-list layout");
assert.match(css, /data-bandkit-genre-colours\] \.bandkit-discover-selected-chips\s*\{[\s\S]*?background:\s*var\(--bandkit-genre-secondary\)\s*!important;[\s\S]*?border-radius:/,
  "The closed selected-chip group must share the open panel's compact genre backing");
assert.match(css, /data-bandkit-genre-colours\] \.bandkit-discover-chip-row\s*\{\s*background:\s*transparent;/,
  "The closed genre row must not colour the unselected suggestion space");
assert.match(toolbar, /toolbar\.append\(add, formats, filters, clear, results, follow\);[\s\S]*?banner\.append\(toolbar, chipRow\);/,
  "The genre strip must be a sibling so filter panels can open above it");
assert.match(toolbar, /pending\.set\(title, \{ name, started: Date\.now\(\) \}\);[\s\S]*?schedule\(\);/,
  "Subgenre selection must schedule an optimistic selected state immediately");
assert.match(toolbar, /bandkit-discover-pending-chip/, "Optimistic selections must render as selected chips");
assert.match(toolbar, /selected-tag sm icon-right bandkit-discover-pending-chip/,
  "Optimistic selections must use the settled native chip size and icon layout");
assert.match(toolbar, /chip\.setAttribute\("aria-busy", "true"\)/, "Optimistic selections must expose their loading state");
assert.match(toolbar, /bandkit-discover-chip-remove/, "Optimistic selections must expose their close affordance while results load");
assert.match(toolbar, /chips\.insertBefore\(pendingChip,[\s\S]*?native\.click\(\)/, "The optimistic chip must render before Bandcamp starts its slower filter update");
assert.match(toolbar, /if \(pending\.has\(title\)\) \{ option\.remove\(\); continue; \}/,
  "A pending selection must replace, not duplicate, its suggestion chip");
assert.doesNotMatch(css, /\[role="option"\]:is\(\.active, \[aria-selected="true"\]\)/,
  "Keyboard focus alone must not make an unselected genre look selected");
assert.match(css, /data-bandkit-filter-panel="tags"\]\[data-bandkit-genre-colours\][\s\S]*?\.selected-tags > \.selected-tag[\s\S]*?background:\s*var\(--bandkit-genre-primary\)\s*!important;/,
  "Open and closed selected genre chips must share the same genre colour treatment");
assert.match(css, /\.genre-filter \.selected-tags\s*\{[\s\S]*?border-radius:\s*calc\(8px \+ var\(--bandkit-genre-chip-gap, 6px\)\)\s*!important;/,
  "The selected-genre backing must retain all four rounded corners in the open panel");
assert.match(toolbar, /button\("Refine",[\s\S]*?setText\(filters, `Refine\$\{count/, "Secondary filter controls should use the distinct Refine label");
assert.doesNotMatch(toolbar, /button\("Filters"|setText\(filters, `Filters/, "The toolbar should not repeat the word filter across adjacent controls");
assert.match(toolbar, /bandkit-filter-leading-icon[\s\S]*?bandkit-filter-chevron/,
  "Disclosure controls must distinguish their hidden leading icon from the retained chevron");
assert.match(css, /\.bandkit-filter-leading-icon\s*\{\s*display:\s*none\s*!important;/,
  "Primary filter controls should be text and chevron only at rest");
assert.match(css, /button:is\(:hover, :focus-visible, \[aria-expanded="true"\]\)[\s\S]*?background:\s*color-mix/,
  "Filter button backing should appear on hover, focus, and while open");
assert.match(css, /\[aria-expanded="true"\] > \.bandkit-filter-chevron\s*\{\s*transform:\s*rotate\(180deg\);/,
  "The open control's chevron must flip to communicate its expanded state");

console.log("Discover toolbar polish regression checks passed.");
