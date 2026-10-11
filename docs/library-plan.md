# Bandkit Library

## Product contract

A private, local catalogue of the signed-in fan's collection and wishlist. Collection and Wishlist each get search, collapsed filters and a Crates action above the existing Bandcamp grid. The native tabs select the search scope. Filters live in a disclosure; notes and personal tags live in a release detail view. Smart crates save queries, not copies of results. The in-page tools remain available. Following the subsequent user request, a separate **Collection** panel destination sits after Playlists and switches between Collection and Wishlist. It reuses playlist cards, artwork play controls, hover/focus defocusing and collapsed filters. Reuse page design tokens and existing queue, playlists, and downloads. Crates can be applied to either native tab, using that tab’s scope.

## Build sequence

1. Add a versioned library model and deterministic search/filter rules. Identify purchases by Bandcamp item type and ID, never album URL alone. Treat unknown metadata as unknown, and apply BPM and key constraints to the same track.
2. Add an explicit Refresh operation using the owner's page and paginated collection/wishlist endpoints. Commit membership only after both lists finish successfully; preserve notes, crates, and known metadata. Keep account libraries isolated.
3. Add resumable metadata indexing for artist tags, publisher/label when explicitly available, release dates, and track lists. Fetch sequentially with cancellation and progress; retain successful work. Never analyse the whole audio library automatically. Reuse analysis recorded by the player.
4. Build in-page Collection and Wishlist tools, text search, native-tab scope, optional metadata filters, private notes/tags, and saved live queries. Limit rendered search cards and offer Show more. Keep focus stable during playback updates and indexing.
5. Connect filtered results to existing queue, playlist creation, and owned-release downloads. Resolve streams at action time and restrict single-track purchases to that track.
6. Include the library in portable backup/restore and delete-all-data. Document the feature, test pagination failures, identity, search, merges and actions, then rebuild/reload the extension and verify on the real signed-in Bandcamp page.

## Acceptance criteria

- Entire collection and wishlist are searchable without scrolling Bandcamp's grid.
- Search covers titles, artists, fetched track titles, site tags, personal tags, and notes.
- Filters combine scope, site tags, personal tags, artist/publisher, release date, BPM, key, and listening recorded by Bandkit. Missing metadata never silently satisfies a constraint.
- Crate membership updates after refresh, metadata, tag, note, or analysis changes. Save, rename, update rules, and delete are available.
- Normal browsing never starts a catalogue crawl. Refresh and metadata indexing are explicit; interrupted indexing can resume.
- Private notes never modify Bandcamp's public reviews. Backups omit signed download URLs and temporary streams.
- Native Bandcamp layout and existing downloader changes remain intact.

## Verification record

Implemented the catalogue, quiet Library/Crates interface, private annotations, combined filters, live query rules, existing queue/playlist/download actions, sequential metadata indexing, persisted analysis, and portable backup integration.

- `npm test`: source checks, lint, build, and 96/96 smoke tests passed.
- `git diff --check`: passed.
- Public release metadata check: Apophenia returned six tracks, site tags and its release date; Bandcamp publisher metadata is explicitly labelled as label/publisher.
- New deterministic tests cover shared album URLs for individual track purchases, multiple constraints on the same track, unknown metadata, paginated collection and wishlist loading, repeated-token failures, concurrent edits, failed refresh preservation, crate tombstones, analysis reuse/no-op writes, and backup round trips without signed links or stream URLs.
- Live verification completed on the signed-in Bandcamp Collection and Wishlist pages with the actual unpacked extension reloaded after each build. Library is absent from panel destinations.
- Collection search returned Apophenia through indexed metadata. Wishlist search returned Paranova from the previously omitted initial batch; its metadata fetch returned tags, date, publisher and 12 tracks.
- Private Wishlist tags and notes saved, survived page/extension reload, and matched text search. A saved crate reopened with one result, then dropped to zero when its tag was removed. Temporary notes, tags and crates were removed; cleanup persisted after refresh.
- Clearing filters and switching native tabs restored Bandcamp’s original grid. Final toolbar has one search, collapsed Filters, Crates and one menu. Native Wishlist search is hidden only when the enhanced tools are connected. No Library feature was added to the panel.
- Measured page toolbar width and scroll width both 2154px; search artwork remained square. Visual checks performed on both page tabs.
- No feature errors appeared during the initial live checks. Logs later retained two extension-context-invalidated errors from reloading the extension while another collection tab remained open; refreshing the verification page restored its context, with no new errors observed during final interactions.
- Catalogue caveat: 103 owned and 280 available wishlist releases were returned; Bandcamp’s native wishlist badge says 281. The unavailable/mismatched entry has not been identified. No catalogue count is substituted into Bandcamp’s badge.
- Final UI simplifications passed lint and build; the complete test run immediately before them passed 96/96 smoke tests. No package or release was requested.

## Collection panel follow-up

- Compact Collection / Wishlist tabs, pinned search, filter toggle and optional refresh; reuse the persisted catalogue and query model.
- Reuse saved playlist cards and artwork controls, including keyboard focus and touch access. Stream resolution preserves single-track purchases and only runs on playback intent.
- Search results update without rebuilding the focused input. Playback changes update controls in place.
- Live checks: destination order, 103 collection releases, wishlist switching and search, tag match/no-match, release playback from Collection and Wishlist, 64px square artwork, and 418px content width with no horizontal overflow.
- Final live verification: Wishlist playback loaded Paranova’s 12 tracks; artwork Pause returned immediately to Play. Focused card opacity was 1 while siblings settled at 0.45, matching existing defocus styling. Native Chrome screenshot confirmed the compact panel layout. Final runtime error/warning logs were empty; full `npm test` passed 96/96 smoke tests.

## Simplification pass

- One field for search and tags on both surfaces (`components/library-controls.js`). Typing suggests tags; choosing one adds a chip. Discover genres that cover a real share of the library lead, then every other tag by count; a chosen tag only offers tags that narrow further. Personal tags join the same tag list. Bandcamp's location tag is no longer stored as a tag.
- The genre select, artist, label and personal-tag fields are gone; older saved filters migrate (personal tags into tags, artist/label into search). The filter sheet holds sort, release years, BPM, key, "not yet played", and saved filters as chips. Saving under an existing name replaces it.
- Panel: one row with the count and icon toggles for search, wishlist (a filter, not a second tab row), filters and more. Tags scroll on one line.
- Page menu: results actions (Now Playing, playlist) only while filtered, plus Refresh. Download-all was removed; Select works on filtered results, and the collection menu hides while selecting.
- Tags are read once per release by the background worker, two at a time, backing off and retrying on 429. Pages that 404 are marked unreadable. After a refresh, new releases are read automatically once tags have been read before.
- Finished downloads leave the queue (history keeps the downloaded mark), and Downloads only appears while something is queued, running or failed.
