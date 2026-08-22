# Bandkit

Current unpacked build: **0.7.9**

Bandkit is a Manifest V3 Chrome extension that places a movable, theme-aware listening panel on Bandcamp. Bandkit can sample each page’s background, text, and link colours, use a saved light, dark, or custom palette, and optionally apply that palette across Bandcamp itself.

## What works

- A consistent bottom Now Playing bar with previous, play/pause, next, elapsed time, duration, and full scrubbing.
- A single **Queue and playlists** screen combines **Now Playing** with a persistent queue. When no custom queue exists it shows the current Bandcamp page queue; queued tracks persist across navigation and can be reordered by dragging, removed, cleared, or filled from the whole visible page.
- Every track `+` opens a destination menu: add it to **Now Playing**, create a new playlist, or add it to an existing playlist. Playlist cards open into full track lists and provide compact icon actions for play, replace, append, rename, delete, and download. Playback refreshes saved tracks from their Bandcamp release pages where possible instead of depending solely on old stream URLs.
- Automatic playback handoff on streamable album pages. The extension-owned offscreen player keeps the track, position, queue, tempo, and pitch mode alive across ordinary Bandcamp navigation.
- Native Bandcamp player controls and Bandkit controls operate the same playback state after handoff. This includes the newer shared player used by Home, Discover, and Search, the signed-in Feed player, and the classic album/track player. Discover's in-memory audio and Feed's redirect streams are handed into Bandkit so scrubbing, filters/EQ, waveform, automatic BPM, and key detection work there too. Compatible album players also get the same circular DJ icon button as the footer; it expands the complete control surface directly beneath the page player and remembers its open state across navigation.
- Queued tracks include compact Wishlist and split Cart actions, including album-backed queue entries whose individual track URL must be resolved by title. Wishlist actions run in a temporary inactive Bandcamp tab, return an active heart state to Bandkit, and close the helper tab after Bandcamp responds. The footer ellipsis exposes the same actions beside DJ Tools. Cart defaults to the exact digital track, with an **Add album** alternative in its small menu; both resolve explicit Bandcamp product metadata before using the connected Bandcamp cart.
- The bottom DJ-icon button opens a compact, flat CDJ-style control surface upward from the player. It includes a seekable waveform, automatic BPM and musical-key analysis, per-track BPM correction and tap tempo, vertical tempo and gain faders, a cycling ±6/±10/±16/Wide range button, Master Tempo, vertically stacked low/mid/high EQ, a separate larger low-pass/high-pass filter, and a two-axis jog wheel that coasts after a flick for temporary scratch-style speed bends. Small Jog Adjust and Vinyl Speed dials independently control platter resistance and touch/release braking. A compact stepper below the jog wheel selects 1/16-, 1/8-, 1/4-, 1/2-, 1-, 2-, 4-, or 8-beat loops. Knobs support configurable drag directions, faders reset on double-click, and EQ, gain, and tempo reset controls appear together when the control surface is hovered or focused.
- Streamable artist-page track lists are analyzed locally for BPM and musical key by default, with duration, BPM, Camelot key, and musical key held in aligned columns. Settings can hide both key columns while retaining BPM, or switch analysis to an on-demand refresh button beside the page DJ control. The adjacent album cart control also includes the visible digital-album price when Bandcamp publishes one. Page action icons stay compact by default, with an optional setting that adds short labels across release, Discover, Feed, collection, and recommendation controls; priced carts remain an icon plus price in compact mode.
- A durable cart snapshot in `chrome.storage.local`. An empty or cache-wiped Bandcamp cart does not erase the last captured Bandkit cart.
- The current cart is also maintained as one rolling **Auto-saved cart** in the **Saved** view. It updates in place, ignores empty carts, and is promoted instead of duplicated when you give it a name, so cart changes do not create piles of ghost snapshots.
- **Save Cart** promotes the current recovery copy into a named local snapshot. The in-app Cart screen lists the current cart and saved carts with links back to each Bandcamp page.
- **Restore** feeds a saved cart back through Bandcamp's own cart flow. Newly captured carts preserve exact digital and merch options; older snapshots can recover identifiable digital albums and tracks from their Bandcamp pages.
- The in-app Cart screen has dedicated **Cart** and **Saved** views. Saved-cart summary cards can restore immediately or open into a full item-by-item view.
- Mixed-currency carts show both the symbol and currency code on every card, retain each item's original currency, and use Bandcamp's converted live subtotal instead of adding unlike currencies as though they were all USD.
- **Download** creates a normal HTML cart backup containing track/release names and clickable Bandcamp links. Private backup files keep only the Bandcamp product fields needed for restore; public share files omit restore details. No JSON knowledge is required.
- Activity has its own **Download** action for a readable HTML listening log with timestamps and clickable track and artist links.
- Activity contains only events recorded locally after installation. Artwork, track names, and artist names link directly to their Bandcamp pages.
- The combined queue stays empty until playback begins or tracks are added; once connected, its artwork-backed entries, cart, popup cart history, and Activity use linked titles and artists instead of separate **Open page** buttons.
- The bottom player keeps linked artwork and track information with centered transport controls and a full-width timeline. Compact mode preserves the same typography, controls, and default content width while arranging transport, track details, timeline, and track actions on one line. A separate width setting offers tight, default, centred wide, full-width, and exact custom pixel layouts for either player size.
- Floating mode moves from the panel header and resizes from enlarged handles along every edge. Docked mode slides Bandkit over the page from either edge, with the right side used by default, and resizes only from its exposed content-facing edge. Docked width is saved independently from the floating layout. The circular launcher appears only while Bandkit is closed, regardless of mode. In docked mode the Reset slot becomes an edge-facing close chevron; once closed, the launcher returns so Bandkit can be reopened. Floating mode retains the compact Reset and Dock controls beside Close, and the independently draggable launcher remembers its viewport position.
- A final **Settings** tab includes an opt-in option to open Bandcamp’s homepage directly on the signed-in fan’s `/{username}/feed` page, floating/docked panel mode, left/right dock side, a **Match Bandcamp** switch, built-in light and dark palettes, and locally saved custom themes. **Match Bandcamp** is enabled by default, while the separate **Theme Bandcamp pages** switch is off by default. Selecting a theme changes Bandkit’s palette without automatically recolouring the site; users can later enable page theming to apply that selected palette consistently across artist pages, Discover, feeds, collections, and players. Custom themes separately control the accent, track scrub, Bandkit panel and content surfaces, Bandcamp page background and content surface, artist navigation strip, plus primary and secondary text. Any selected theme can be downloaded as a portable Bandkit JSON file, then imported on another installation to save and select it locally. Across matched, built-in, imported, and custom themes, automatic per-surface correction keeps primary text at 7:1, secondary text and links at 4.5:1, and interface boundaries at 3:1 across Bandkit panels, cards, page content, navigation, and footers. Settings also include selectable vertical, horizontal, combined, or radial knob gestures, the keyboard shortcut, the installed Bandkit version, a local-data disclosure, manual portable Save and Restore controls with configurable reminders, a delete-all-data control, and an optional **Support Bandkit** link to a Stripe-hosted one-off payment page. Combined vertical/horizontal knob dragging is the default.
- **Modern Bandcamp pages** is enabled by default and gives legacy Feed and artist Music, Merch, Community, album, and track pages a consistent responsive, wide-screen layout without replacing Bandcamp's controls or visual identity. Native artist text and accent colours remain the source—including deliberate secondary colours—while a safety layer repairs near-invisible neutral text and interface boundaries. Enabling **Theme Bandcamp pages** instead applies the selected theme's strict per-surface contrast targets. Home, Discover, and fan Collection retain their existing modern layouts. On release pages, artwork, native playback, wishlist, share/embed, digital purchase, gifts, physical editions and galleries, track purchases, notes, credits, license, tags, supporters, artist profile, follow controls, discography, and recommendations remain accessible. Switching it off restores each original release-page node to its exact position.

The former Downloads and Recent Purchases prototype tabs were removed because they did not have trustworthy live data.

## Install or update

1. Run `npm ci`, then `npm run build` from this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `dist/unpacked`, or press **Reload** on an existing Bandkit installation.
5. Reload every Bandcamp tab that was already open.
6. Confirm the extension card says **0.7.9**.

Open a streamable album page and press its normal Bandcamp play button. The audio should hand off to Bandkit automatically; the toolbar popup provides a single control to activate or deactivate the Bandkit panel on the current Bandcamp tab.

## Known limitations

Bandcamp does not expose a fan-account API for this product shape. Cart and playback support therefore use isolated page adapters and can require updates when Bandcamp changes its markup.

Seamless playback is available when a page exposes a reusable HTTPS `bcbits.com` stream. On unsupported Bandcamp surfaces, the native player remains the fallback. The current implementation preserves audio across page navigation but does not promise sample-accurate gapless transitions between tracks. Stream URLs may expire and Bandcamp’s normal playback limits still apply.

Automatic analysis prepares Bandcamp streams inside the extension’s offscreen player and decodes them locally to estimate tempo, musical key, and waveform peaks. The same local media source powers the filter, three-band EQ, and gain controls, and no audio is uploaded to another service. Some ambient, beatless, highly syncopated, harmonically ambiguous, or access-limited tracks may not analyze reliably; playback continues normally, and BPM can be corrected manually or by tapping.

## Privacy and scope

- Playlists, saved playlists, cart snapshots, saved carts, panel/launcher layout, preferences, and activity stay in local extension storage. Current playback state uses session storage.
- No credentials or cookies are copied into extension storage.
- Chrome storage is Bandkit's automatic live working copy and survives normal cache, cookie, and browsing-history clearing. Users can manually save one portable `BandKit Backup.json` file containing all playlists, carts, current state, and deletion history, then restore from that file when needed. Restore merges saved playlists and carts into the current Chrome copy rather than replacing the whole local library. Bandkit can show an optional periodic reminder to save a fresh file.
- Playback requests are accepted only from Bandcamp pages, and stream URLs are restricted to HTTPS `bcbits.com` hosts.
- Portable playlist exports omit temporary audio stream URLs. Public cart shares omit private cart-restore fields.
- Bandkit has no developer-operated server, analytics or advertising. See [PRIVACY.md](PRIVACY.md) for the full data policy and deletion details.
- The optional **Support Bandkit** link opens Stripe's hosted payment page. Bandkit never receives or stores payment details.
- Custom-domain artist sites are outside the current in-page interface scope.

## Verification

Run the deterministic build, lint, and smoke-test sequence:

```sh
npm ci
npm test
npm run test:clean-install
```

`npm run test:clean-install` opens a disposable Chrome profile with the real unpacked extension on Bandcamp. It does not alter the normal Chrome profile or its saved Bandkit data.

For Chrome Web Store release preparation, follow [STORE_SUBMISSION.md](STORE_SUBMISSION.md). Build and verify a minified production-only ZIP with `npm run package`. `dist/unpacked` is the only unpacked-extension directory; load that directory in `chrome://extensions` and edit only source files under `src`.

`tests/fixture.html` covers the classic album player and `tests/modern-player-fixture.html` covers the shared Home/Discover/Search player adapter.
