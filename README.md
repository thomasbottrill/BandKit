# BandKit

Current unpacked build: **0.7.7**

BandKit is a Manifest V3 Chrome extension that places a movable, theme-aware listening panel on Bandcamp. BandKit can sample each page’s background, text, and link colours, use a saved light, dark, or custom palette, and optionally apply that palette across Bandcamp itself.

## What works

- A consistent bottom Now Playing bar with previous, play/pause, next, elapsed time, duration, and full scrubbing.
- A single **Queue and playlists** screen combines **Now Playing** with a persistent queue. When no custom queue exists it shows the current Bandcamp page queue; queued tracks persist across navigation and can be reordered by dragging, removed, cleared, or filled from the whole visible page.
- Every track `+` opens a destination menu: add it to **Now Playing**, create a new playlist, or add it to an existing playlist. Playlist cards open into full track lists and provide compact icon actions for play, replace, append, rename, delete, and download. Playback refreshes saved tracks from their Bandcamp release pages where possible instead of depending solely on old stream URLs.
- Automatic playback handoff on streamable album pages. The extension-owned offscreen player keeps the track, position, queue, tempo, and pitch mode alive across ordinary Bandcamp navigation.
- Native Bandcamp player controls and BandKit controls operate the same playback state after handoff. This includes the newer shared player used by Home, Discover, and Search, the signed-in Feed player, and the classic album/track player. Discover's in-memory audio and Feed's redirect streams are handed into BandKit so scrubbing, filters/EQ, waveform, automatic BPM, and key detection work there too. Compatible album players also get the same circular DJ icon button as the footer; it expands the complete control surface directly beneath the page player and remembers its open state across navigation.
- Queued tracks include compact Wishlist and split Cart actions, including album-backed queue entries whose individual track URL must be resolved by title. Wishlist actions run in a temporary inactive Bandcamp tab, return an active heart state to BandKit, and close the helper tab after Bandcamp responds. The footer ellipsis exposes the same actions beside DJ Tools. Cart defaults to the exact digital track, with an **Add album** alternative in its small menu; both resolve explicit Bandcamp product metadata before using the connected Bandcamp cart.
- The bottom DJ-icon button opens a compact, flat CDJ-style control surface upward from the player. It includes a seekable waveform, automatic BPM and musical-key analysis, per-track BPM correction and tap tempo, vertical tempo and gain faders, a cycling ±6/±10/±16/Wide range button, Master Tempo, vertically stacked low/mid/high EQ, a separate larger low-pass/high-pass filter, and a two-axis jog wheel that coasts after a flick for temporary scratch-style speed bends. Small Jog Adjust and Vinyl Speed dials independently control platter resistance and touch/release braking. A compact stepper below the jog wheel selects 1/16-, 1/8-, 1/4-, 1/2-, 1-, 2-, 4-, or 8-beat loops. Knobs support configurable drag directions, faders reset on double-click, and EQ, gain, and tempo reset controls appear together when the control surface is hovered or focused.
- A durable cart snapshot in `chrome.storage.local`. An empty or cache-wiped Bandcamp cart does not erase the last captured BandKit cart.
- The current cart is also maintained as one rolling **Auto-saved cart** in the **Saved** view. It updates in place, ignores empty carts, and is promoted instead of duplicated when you give it a name, so cart changes do not create piles of ghost snapshots.
- **Save Cart** promotes the current recovery copy into a named local snapshot. The in-app Cart screen lists the current cart and saved carts with links back to each Bandcamp page.
- **Restore** feeds a saved cart back through Bandcamp's own cart flow. Newly captured carts preserve exact digital and merch options; older snapshots can recover identifiable digital albums and tracks from their Bandcamp pages.
- The in-app Cart screen has dedicated **Cart** and **Saved** views. Saved-cart summary cards can restore immediately or open into a full item-by-item view.
- Mixed-currency carts show both the symbol and currency code on every card, retain each item's original currency, and use Bandcamp's converted live subtotal instead of adding unlike currencies as though they were all USD.
- **Download** creates a normal HTML cart backup containing track/release names and clickable Bandcamp links. No JSON knowledge is required.
- Activity has its own **Download** action for a readable HTML listening log with timestamps and clickable track and artist links.
- Activity contains only events recorded locally after installation. Artwork, track names, and artist names link directly to their Bandcamp pages.
- The combined queue stays empty until playback begins or tracks are added; once connected, its artwork-backed entries, cart, popup cart history, and Activity use linked titles and artists instead of separate **Open page** buttons.
- The bottom player stacks linked artwork and track information above centered transport controls.
- Floating mode moves from the panel header and resizes from enlarged handles along every edge. Docked mode slides BandKit over the page from either edge, with the right side used by default, and resizes only from its exposed content-facing edge. Docked width is saved independently from the floating layout. The circular launcher appears only while BandKit is closed, regardless of mode. In docked mode the Reset slot becomes an edge-facing close chevron; once closed, the launcher returns so BandKit can be reopened. Floating mode retains the compact Reset and Dock controls beside Close, and the independently draggable launcher remembers its viewport position.
- A final **Settings** tab includes an enabled-by-default option to open Bandcamp’s homepage directly on the signed-in fan’s `/{username}/feed` page, floating/docked panel mode, left/right dock side, a **Match Bandcamp** switch, built-in light and dark palettes, and locally saved custom themes. Custom themes separately control the accent, BandKit panel and content surfaces, Bandcamp page background and content surface, artist navigation strip, plus primary and secondary text. Any selected theme can be downloaded as a portable BandKit JSON file, then imported on another installation to save and activate it locally. The independent **Theme Bandcamp pages** switch provides an opt-in, persistent full-site restyle (including artist pages, Discover, feeds, and the player), while automatic contrast correction keeps text at 4.5:1 and controls at 3:1 or better on their content surfaces. Settings also include selectable vertical, horizontal, combined, or radial knob gestures, the keyboard shortcut, and the installed BandKit version. Combined vertical/horizontal knob dragging is the default.
- The opt-in **Modern Bandcamp pages** setting gives legacy Feed and artist Music, Merch, Community, album, and track pages a consistent responsive, wide-screen layout without replacing Bandcamp's controls or artist-specific colour theme. Home, Discover, and fan Collection retain their existing modern layouts. On release pages, artwork, native playback, wishlist, share/embed, digital purchase, gifts, physical editions and galleries, track purchases, notes, credits, license, tags, supporters, artist profile, follow controls, discography, and recommendations remain accessible. Switching it off restores each original release-page node to its exact position.

The former Downloads and Recent Purchases prototype tabs were removed because they did not have trustworthy live data.

## Install or update

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder, or press **Reload** on an existing BandKit installation.
4. Reload every Bandcamp tab that was already open.
5. Confirm the extension card says **0.7.7**.

Open a streamable album page and press its normal Bandcamp play button. The audio should hand off to BandKit automatically; the toolbar popup provides a single control to activate or deactivate the BandKit panel on the current Bandcamp tab.

## Limits of the prototype

Bandcamp does not expose a fan-account API for this product shape. Cart and playback support therefore use isolated page adapters and can require updates when Bandcamp changes its markup.

Seamless playback is available when a page exposes a reusable HTTPS `bcbits.com` stream. On unsupported Bandcamp surfaces, the native player remains the fallback. The current implementation preserves audio across page navigation but does not promise sample-accurate gapless transitions between tracks. Stream URLs may expire and Bandcamp’s normal playback limits still apply.

Automatic analysis prepares the already selected Bandcamp stream inside the extension’s offscreen player and decodes it locally to estimate tempo, musical key, and waveform peaks. The same local media source powers the filter, three-band EQ, and gain controls, and no audio is uploaded to another service. Some ambient, beatless, highly syncopated, harmonically ambiguous, or access-limited tracks may not analyze reliably; playback continues normally, and BPM can be corrected manually or by tapping.

## Privacy and scope

- Playlists, saved playlists, cart snapshots, saved carts, panel/launcher layout, preferences, and activity stay in local extension storage.
- No credentials or cookies are copied into extension storage.
- Playback requests are accepted only from Bandcamp pages, and stream URLs are restricted to HTTPS `bcbits.com` hosts.
- Custom-domain artist sites are outside the current prototype scope.

## Verification

Run:

```sh
node tests/background-smoke.mjs
node tests/offscreen-smoke.mjs
```

`tests/fixture.html` covers the classic album player and `tests/modern-player-fixture.html` covers the shared Home/Discover/Search player adapter.
