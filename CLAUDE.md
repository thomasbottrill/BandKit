@AGENTS.md

# Working on Bandkit with Claude Code

- This is a Manifest V3 Chrome extension for Bandcamp. Edit source under `src/`, not generated files in `dist/`.
- Before changing code, inspect `git status` and preserve unrelated work; this checkout may contain unfinished changes.
- Install dependencies with `npm ci`. Run `npm test` for source checks, lint, build, and smoke tests. Use `npm run test:clean-install` for the disposable-profile browser check.
- For changes to the extension's UI or behavior on Bandcamp, follow the real-site verification requirements in `AGENTS.md`: build, reload the unpacked extension from `dist/unpacked` in `chrome://extensions`, refresh the actual Bandcamp page, and test the affected interaction there. A fixture or the clean-profile test alone is not final verification.
- Do not change the user's regular Chrome extension data, sign-in, or browser profile without a task-specific reason. Ask for the minimal manual step if live-page access or extension reload is unavailable.
