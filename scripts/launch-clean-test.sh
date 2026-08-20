#!/bin/zsh
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
extension_dir="$project_dir/dist/unpacked"
chrome_app="/Applications/Google Chrome.app"

if [[ ! -d "$chrome_app" ]]; then
  print -u2 "Google Chrome was not found at $chrome_app"
  exit 1
fi

for required_file in manifest.json background.js content.js hub.css; do
  if [[ ! -f "$extension_dir/$required_file" ]]; then
    print -u2 "The unpacked extension is missing $required_file. Run npm ci && npm run build first."
    exit 1
  fi
done

profile_dir="$(mktemp -d "${TMPDIR:-/tmp}/bandkit-clean-test.XXXXXX")"

open -na "Google Chrome" --args \
  --user-data-dir="$profile_dir" \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions-except="$extension_dir" \
  --load-extension="$extension_dir" \
  "https://bandcamp.com/discover"

print "Opened Bandkit in a clean, isolated Chrome profile."
print "Your normal Chrome profile and Bandkit data were not changed."
print "Temporary test profile: $profile_dir"
