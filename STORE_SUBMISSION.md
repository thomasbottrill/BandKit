# Chrome Web Store submission guide

This is the launch checklist and source of truth for Bandkit 0.7.7. Keep the listing, Privacy practices answers, privacy policy and extension behavior consistent.

## Submission blockers

- Capture at least one 1280×800 store screenshot (up to five) and create the required 440×280 small promotional tile. The supplied Bandkit icon is included in the manifest and toolbar action at Chrome's required raster sizes.
- Enter the live privacy policy URL, `https://thomasbottrill.github.io/BandKit/`, in the Developer Dashboard.
- Confirm the public support contact and developer identity work for users. Do not list the current GitHub Issues URL unless the repository is made publicly accessible; it presently returns 404.
- Complete live regression checks on signed-in and signed-out Bandcamp pages before uploading.
- Run `npm ci && npm test`, then create the production ZIP with `npm run package`; do not ZIP the repository or upload fixtures/tests.

Google's current listing policy rejects items missing required listing imagery. Use square-corner, full-bleed screenshots that show the real extension UI; do not upload the local files labelled as test fixtures.

## Single purpose

Use this in the dashboard's single-purpose field:

> Enhance a user's Bandcamp browsing and listening session with one integrated local companion for playback control, queues and playlists, cart recovery, listening activity and optional DJ tools.

All features operate on the same Bandcamp session and content. Do not market unrelated browser utilities.

## Suggested listing copy

Short description:

> A Bandcamp companion for continuous playback, queues, playlists, cart backups, listening activity and DJ controls.

Long-description opening:

> Bandkit adds an integrated companion panel to Bandcamp. Control supported Bandcamp playback across navigation, build reusable queues and playlists, keep local cart recovery copies, review a local listening log, and use optional tempo, loop, EQ and filter controls. Bandkit works only on supported Bandcamp pages, stores its data locally in Chrome, contains no ads or analytics, and is not affiliated with Bandcamp.

The long description must also prominently disclose, before the feature list:

> Data disclosure: Bandkit reads the Bandcamp pages you visit, track/release/artist metadata, Bandcamp-provided playback URLs, cart item details and your interactions with Bandkit to provide its visible player, playlists, cart recovery, activity and DJ features. Settings and saved content are stored locally in Chrome. Bandkit has no developer-operated data server, analytics or advertising. Its optional feedback link opens a public Notion form; feedback is sent only when the user submits that external form and is published in the public feedback list. Its optional support link opens a Stripe-hosted payment page; Bandkit never receives or stores payment credentials. See the privacy policy for full details and deletion instructions.

Do not claim gapless playback, unrestricted playback, audio downloading, account syncing, Bandcamp endorsement or guaranteed compatibility with every page.

## Privacy practices answers

Answer that Bandkit handles user data even though it stays local. Google's policy treats local processing and storage as data handling.

For **Remote code**, select:

> No, I am not using remote code.

Bandkit loads Bandcamp data and media but does not download or execute JavaScript, WebAssembly or other program logic from a remote source.

For **Data usage**, do not select “I do not collect user data.” Select every category below that appears in the dashboard, using the dashboard's closest current label:

Disclose the categories that cover:

- Website content: page type, track/release/artist metadata, artwork and cart content.
- Web browsing activity: supported Bandcamp URLs and interactions needed for visible features.
- User activity: playback actions and the locally stored listening activity log.
- Personally identifiable information: a public Bandcamp username/feed URL may be read for the optional feed-homepage setting.
- Financial and payment information: cart items, prices, currency and product options are handled for backup/restore. The optional support link opens Stripe's external checkout; Bandkit never handles card numbers, billing details or payment credentials.
- User-generated content: locally named playlists, cart backups and custom themes.
- Optional public feedback: a project, bug/feature classification, description and attachment are sent to Notion only when the user deliberately submits the external feedback form.

Certify that data is:

- Used only for Bandkit's disclosed single purpose and visible features.
- Not sold or transferred for advertising, credit, data-broker or unrelated purposes.
- Not used for personalized advertising.
- Local extension data is not made available for human reading by the developer. Voluntarily submitted feedback is intentionally public and may be read by the developer and other visitors.
- Transmitted over HTTPS to Bandcamp/Bandcamp media hosts when needed for a requested feature, or to Notion when the user chooses to open and submit the public feedback form.
- Sent directly to Stripe, not Bandkit, only when the user chooses to open the external support page and enter information there.

If the dashboard's wording or categories change, map the behavior above conservatively rather than selecting “does not collect data.”

Select every Limited Use certification checkbox. The policy and implementation support the certifications: Bandkit uses the data only for its disclosed user-facing purpose, does not sell it or use it for advertising or credit decisions, and does not make locally stored extension data available for human reading. The separately submitted public feedback form is user-initiated and prominently disclosed.

For **Privacy policy**, enter:

> https://thomasbottrill.github.io/BandKit/

The page is served over enforced HTTPS from the repository's dedicated `gh-pages` branch and opens without a login. When this policy changes, update both `PRIVACY.md` and `privacy/index.html`, then publish the updated HTML to `gh-pages` before submitting the extension update.

## Permission justifications

`storage`

> Stores the user's Bandkit settings, layouts, locally saved playlists, cart recovery copies, listening activity and current playback session. The Settings panel provides a delete-all control.

`offscreen`

> Keeps user-initiated Bandcamp audio playing and controllable while the user navigates between Bandcamp pages. The offscreen document is used only for audio playback and local audio analysis.

`scripting`

> Lets the user activate Bandkit from the toolbar or keyboard shortcut on an already-open supported Bandcamp tab when the normal installed content script is not yet present, such as immediately after installation or an extension update. Only packaged Bandkit scripts are injected.

Host access to `bandcamp.com` and `*.bandcamp.com`

> Required to show the Bandkit interface and read the visible Bandcamp track, player and cart data used by its features across Bandcamp's central pages and artist subdomains. Automatic content-script injection excludes Bandcamp Daily, blog, help, corporate and legal pages.

Host access to `*.bcbits.com`

> Required to play and locally analyze the Bandcamp-provided HTTPS audio streams selected by the user. Bandkit accepts no arbitrary third-party stream hosts.

The removed `activeTab` permission must not be re-added unless a real current feature cannot work without it.

## Reviewer instructions

1. Open a public, streamable Bandcamp album or track page.
2. Click Bandkit's toolbar button and choose **Activate**, or press Alt+Shift+B.
3. Start playback from Bandcamp or Bandkit. The Bandkit music bar should reflect the current track; on supported pages playback can continue to another Bandcamp page.
4. Add a track to Now Playing, save it as a playlist, reload the page and confirm the saved playlist remains.
5. Open Settings to verify homepage redirect, modern page restyling, native-player hiding and cart hiding are off by default.
6. Open **Settings → Privacy and data** to see the local-data disclosure and delete-all control.
7. Open **Settings → Feedback** and confirm **Send feedback** opens the public anonymous Notion form and **View feedback** opens the public read-only list. Do not submit personal or sensitive information during review.
8. Open **Settings → Support → Support Bandkit** and confirm it opens the Stripe-hosted one-off support page in a new tab. Payment is optional and Stripe—not Bandkit—handles checkout information. Do not complete a payment during review.
9. If testing cart recovery or Wishlist, use a Bandcamp test account and non-purchase cart content. Bandkit does not place orders or enter payment data. A user-requested Wishlist action may briefly use an inactive Bandcamp helper tab and close it after Bandcamp responds.
10. Public share/download files contain readable Bandcamp links. Public cart shares omit private restore fields, and playlist exports omit temporary audio stream URLs.

Explain in review notes that Bandkit does not download audio, bypass Bandcamp access controls, bypass payments or replace Bandcamp authentication. Playback is limited to streams already exposed by Bandcamp to the current page and remains subject to Bandcamp's availability and limits.

## Final dashboard and account checks

- Developer account has 2-Step Verification enabled.
- Developer email and support URL are monitored.
- Category, language, regions and mature-content answers are accurate.
- Privacy policy URL is `https://thomasbottrill.github.io/BandKit/`, is public without login and matches the submitted version.
- Store icon, screenshots and any promotional images accurately show this build.
- Bandcamp non-affiliation appears in the listing and privacy policy.
- ZIP verification reports its compressed and unpacked byte size, contains only production files, and its version matches the dashboard version.
- Save copies of the submitted ZIP, listing text, privacy answers and review notes for the release record.

## Live regression matrix

Run this matrix with the final `dist/unpacked` release build. Do not treat the automated fixture suite as a substitute for these account- and profile-dependent checks.

- Fresh Chrome profile, signed out: activation, classic and modern release playback, queue ordering, floating/docked layout, themes, contrast and DJ controls.
- Fresh Chrome profile, signed in: Home, Discover, Search, Feed and Collection handoff; Wishlist; cart autosave, restore and removal.
- Upgraded profile containing existing Bandkit data, signed out: saved playlists, imports/exports, activity, theme and layout preservation.
- Upgraded profile containing existing Bandkit data, signed in: the complete playback handoff and cart/Wishlist flows, plus delete-all-data using a disposable backup.
- In every run, check the extension-origin console for warnings or errors and confirm the manifest permission list has not changed.

## Official policy references

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)
- [User data and minimum-permission FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [July 2026 privacy and platform-integrity update](https://developer.chrome.com/blog/cws-policy-updates-2026)
