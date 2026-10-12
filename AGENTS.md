# Repository instructions

## Design direction

- Always reuse the existing components, interaction patterns, and design-system tokens before creating a custom solution. Check for an established component or pattern first, extend it when necessary, and introduce one-off UI only when the design system genuinely cannot support the requirement.
- Keep the interface as visually simple and quiet as possible. Show only the information and controls needed to understand the current state or perform the most likely next action.
- Treat progressive disclosure as a core design principle. Reveal secondary controls, labels, metadata, and finer detail when the user shows intent by hovering or focusing an item, opening a menu, expanding a card, or drilling into a dedicated view.
- Apply this principle consistently across the product: keep the music bar minimal until it is hovered or focused; group and collapse advanced settings; use concise summary cards for carts and playlists that open into complete views; prefer recognizable icon-only actions at rest and reveal their labels or related actions on interaction; and expose item-specific interactions only when that item is active, hovered, or focused.
- Progressive disclosure should reduce visual noise without hiding essential state or blocking use. Primary actions and critical information must remain apparent, and anything revealed on hover must also be reachable by keyboard focus and on touch devices. Icon-only controls must retain accessible names and should reveal a tooltip or visible label without causing disruptive layout shifts.
- When deciding whether something belongs in the default view, start with the least information and fewest controls that still make the interface understandable. Add persistent detail only when hiding it would harm clarity, discoverability, accessibility, or confidence.

## Real-site extension verification

- For every UI or behavior change that affects pages modified by this extension, the final verification must be performed on the real target website with the actual unpacked extension enabled. A fixture, mock page, screenshot comparison, or static regression test is supplementary and is never sufficient as the final verification.
- After rebuilding extension files, reload the unpacked extension in `chrome://extensions` whenever necessary, then refresh the real target page before testing. Do not assume a page refresh alone has loaded changed extension code.
- Agents are explicitly authorized to use the Computer Use skill to operate Chrome's `chrome://extensions` page and reload the existing unpacked Bandkit extension whenever verification requires it. This is the preferred fallback when browser automation cannot access Chrome-internal pages; do not ask the user to perform the reload merely because the browser-control API cannot reach that page.
- Verify the relevant interaction and visual state on the live page, including computed layout or DOM measurements when alignment, sizing, wrapping, or responsive behavior is involved. Check the page for runtime or console errors appropriate to the change.
- If browser automation cannot reload the extension or access the required real page, ask the user to perform the minimal required reload or access step. Do not report the work as complete until the live extension has been verified on the real site.
- Keep fixtures and automated tests as regression coverage, but do not use them as a substitute for live-site testing.

## Chrome Web Store releases

- Whenever you are asked to package Bandkit for the Chrome Web Store, bump the version in `manifest.json`, `package.json`, `package-lock.json`, `README.md` and `STORE_SUBMISSION.md`, run `npm test`, then `npm run package`.
- In the same task, add a row for the new version to the public **Release Notes** database in the Lantana Softworks Notion workspace (Bandkit page › Release notes, https://app.notion.com/p/b2343291e09849ceaf9a383a698a1645, data source `collection://567e49dc-a9af-4a86-afae-726a06554076`). Set **Version**, **Released** (the packaging date) and a one-line **Summary**, and in the row's page list user-facing changes in plain language under **New**, **Fixed** and **Changed** headings. Base it on the commits and changes since the previous release; leave out internal-only changes.
- If the release adds user-facing features, add a new entry at the top of `WHATS_NEW_RELEASES` in `src/content/whats-new.js` in the same task, keeping the earlier entries (Settings › Help lists every release): set `version` to the new version, write a one-line `summary`, and give each feature a step that opens the part of the UI where it lives, with a demo panel and, where a setting fits, the control itself (`control`). Leave out bug fixes and UI polish. Add no entry for fix-only releases so nobody sees the same tour again. Verify the tour on the live site from Settings › Help & onboarding › See What’s New.
- Settings › About links to that database's public view through `RELEASE_NOTES_URL` in `src/content/state.js`. It must stay published to the web so the link works for everyone.
- Do not report the package as done until the release notes entry has been added.
