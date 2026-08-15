#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname -- "$script_dir")
cd "$project_dir"

version=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version")
output=${1:-"dist/bandkit-${version}.zip"}

case "$output" in
  /*) ;;
  *) output="$project_dir/$output" ;;
esac

if [ -e "$output" ]; then
  echo "Refusing to overwrite existing release: $output" >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
node scripts/build.mjs --release

file_list=$(mktemp "${TMPDIR:-/tmp}/bandkit-release.XXXXXX")
trap 'rm -f "$file_list"' EXIT HUP INT TERM

cd dist/unpacked
find . -type f -print | sed 's#^\./##' | LC_ALL=C sort > "$file_list"
zip -q -X "$output" -@ < "$file_list"
cd "$project_dir"
node scripts/verify-release.mjs "$output"
echo "Created $output"
