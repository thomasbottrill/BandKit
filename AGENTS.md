# Repository instructions

## Real-site extension verification

- For every UI or behavior change that affects pages modified by this extension, the final verification must be performed on the real target website with the actual unpacked extension enabled. A fixture, mock page, screenshot comparison, or static regression test is supplementary and is never sufficient as the final verification.
- After rebuilding extension files, reload the unpacked extension in `chrome://extensions` whenever necessary, then refresh the real target page before testing. Do not assume a page refresh alone has loaded changed extension code.
- Agents are explicitly authorized to use the Computer Use skill to operate Chrome's `chrome://extensions` page and reload the existing unpacked Bandkit extension whenever verification requires it. This is the preferred fallback when browser automation cannot access Chrome-internal pages; do not ask the user to perform the reload merely because the browser-control API cannot reach that page.
- Verify the relevant interaction and visual state on the live page, including computed layout or DOM measurements when alignment, sizing, wrapping, or responsive behavior is involved. Check the page for runtime or console errors appropriate to the change.
- If browser automation cannot reload the extension or access the required real page, ask the user to perform the minimal required reload or access step. Do not report the work as complete until the live extension has been verified on the real site.
- Keep fixtures and automated tests as regression coverage, but do not use them as a substitute for live-site testing.
