import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../src/component-reference/index.js", import.meta.url), "utf8");
const bundle = fs.readFileSync(new URL("../dist/unpacked/component-reference.js", import.meta.url), "utf8");
for (const component of ["components/settings.js", "components/colour-field.js", "components/artwork-upload.js", "components/actions.js", "components/collections.js", "components/page-cards.js", "components/playlist-artwork.js", "settings-picker.js", "settings-drawer.js"]) {
  assert.ok(source.includes(component), `Reference must use production ${component}`);
}
assert.doesNotMatch(bundle, /chrome\.storage|localStorage|indexedDB|runtime\.sendMessage/,
  "The reference must never read or mutate application data");
assert.match(source, /chrome\.runtime\.getURL\("hub\.css"\)/, "Reference must load production styles");
for (const filename of ["component-reference.html", "component-reference.js", "component-reference.css"]) {
  assert.ok(fs.existsSync(new URL(`../dist/unpacked/${filename}`, import.meta.url)));
}
for (const filename of ["../src/content/components/panel-shell.js", "../src/content/settings-overview.js", "../popup.html"]) {
  assert.doesNotMatch(fs.readFileSync(new URL(filename, import.meta.url), "utf8"), /component-reference/,
    "Reference must stay out of normal navigation");
}
console.log("Hidden component reference: production imports, packaged assets, no navigation entry or persistence passed.");
