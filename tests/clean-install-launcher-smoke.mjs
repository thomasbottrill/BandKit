import assert from "node:assert/strict";
import fs from "node:fs";

const launcher = fs.readFileSync(new URL("../scripts/launch-clean-test.sh", import.meta.url), "utf8");

assert.match(launcher, /mktemp -d/, "clean-install testing must use a fresh temporary profile");
assert.match(launcher, /--user-data-dir=/, "the temporary profile must stay separate from normal Chrome data");
assert.match(launcher, /--disable-extensions-except=/, "the clean profile should load only Bandkit");
assert.match(launcher, /--load-extension=/, "the real unpacked extension must be loaded for testing");
assert.match(launcher, /https:\/\/bandcamp\.com\/discover/, "the launcher should open a real Bandcamp page");

console.log("isolated clean-install launcher checks passed");
