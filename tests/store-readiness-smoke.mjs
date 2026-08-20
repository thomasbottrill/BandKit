import assert from "node:assert/strict";
import fs from "node:fs";
import { readContentSource } from "./support/source.mjs";

const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const content = readContentSource();
const popup = fs.readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const privacy = fs.readFileSync(new URL("../PRIVACY.md", import.meta.url), "utf8");
const privacyPage = fs.readFileSync(new URL("../privacy/index.html", import.meta.url), "utf8");
const submission = fs.readFileSync(new URL("../STORE_SUBMISSION.md", import.meta.url), "utf8");
const packaging = fs.readFileSync(new URL("../scripts/package-release.sh", import.meta.url), "utf8");
const buildScript = fs.readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");

assert.equal(manifest.manifest_version, 3);
assert.ok(!manifest.permissions.includes("activeTab"), "activeTab is redundant with the narrowly documented host access");
assert.deepEqual(Object.keys(manifest.commands), ["toggle-bandkit"]);
assert.ok(manifest.permissions.includes("storage"));
assert.ok(manifest.permissions.includes("offscreen"));
assert.ok(manifest.permissions.includes("scripting"));
assert.deepEqual(manifest.icons, {
  16: "assets/extension-icon-16.png",
  32: "assets/extension-icon-32.png",
  48: "assets/extension-icon-48.png",
  128: "assets/extension-icon-128.png"
});
assert.deepEqual(manifest.action.default_icon, {
  16: "assets/extension-icon-16.png",
  32: "assets/extension-icon-32.png"
});
for (const iconPath of [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]) {
  assert.ok(fs.existsSync(new URL(`../${iconPath}`, import.meta.url)), `missing extension icon: ${iconPath}`);
}
for (const [declaredSize, iconPath] of Object.entries(manifest.icons)) {
  const png = fs.readFileSync(new URL(`../${iconPath}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", `${iconPath} must be a PNG file`);
  assert.equal(png.readUInt32BE(16), Number(declaredSize), `${iconPath} width must match its manifest size`);
  assert.equal(png.readUInt32BE(20), Number(declaredSize), `${iconPath} height must match its manifest size`);
}
assert.match(popup, /assets\/icon-bandkit\.svg/);
assert.match(content, /launcherIcon\.src = asset\("icon-bandkit\.svg"\)/);
assert.match(content, /aboutIcon\.src = asset\("icon-bandkit\.svg"\)/);
assert.match(content, /`Release v\$\{chrome\.runtime\.getManifest\(\)\.version\}`/);

for (const entry of manifest.content_scripts.filter((item) => item.matches?.includes("https://*.bandcamp.com/*"))) {
  assert.ok(entry.exclude_matches?.includes("https://daily.bandcamp.com/*"), "Broad injections must exclude Bandcamp Daily");
  assert.ok(entry.exclude_matches?.includes("https://help.bandcamp.com/*"), "Broad injections must exclude Bandcamp Help");
  assert.ok(entry.exclude_matches?.includes("https://bandcamp.com/privacy*"), "Broad injections must exclude Bandcamp legal pages");
}

assert.match(content, /openHomeToFeed:\s*false/);
assert.match(content, /modernReleasePages:\s*true/);
assert.match(content, /hidePageCart:\s*true/);
assert.match(content, /hideHeaderCart:\s*true/);
assert.match(content, /hideBandcampPlayer:\s*true/);
assert.match(content, /Delete all Bandkit data/);
assert.match(content, /BANDCAMP_HUB_DELETE_ALL_DATA/);
assert.match(content, /Send feedback/);
assert.match(content, /View feedback/);
assert.match(content, /fir-fruitadens-b76\.notion\.site/);
assert.match(content, /Support Bandkit/);
assert.match(content, /https:\/\/buy\.stripe\.com\/cNi00jgyeeifgIIdPU6Ri00/);
assert.match(content, /supportLink\.target = "_blank"/);
assert.match(content, /supportLink\.rel = "noopener noreferrer"/);
assert.ok(content.indexOf("const support =") > content.indexOf("const about ="), "Support must remain the final Settings section");

assert.match(privacy, /does not operate an analytics service or developer server/i);
assert.match(privacy, /public Notion form/i);
assert.match(privacy, /Stripe-hosted page/i);
assert.match(privacy, /does not receive, process or store payment-card/i);
assert.match(privacy, /Chrome Web Store User Data Policy\]\(https:\/\/developer\.chrome\.com\/docs\/webstore\/program-policies\/limited-use\/\), including the Limited Use requirements/);
assert.match(privacy, /Delete all Bandkit data/);
assert.doesNotMatch(privacy, /github\.com/i, "Privacy contact links must not point at the currently inaccessible repository");
assert.match(privacyPage, /<title>Bandkit Privacy Policy<\/title>/);
assert.match(privacyPage, /does not download or execute remote code/i);
assert.match(privacyPage, /Chrome Web Store User Data Policy/);
assert.match(privacyPage, /Delete all Bandkit data/);
assert.doesNotMatch(privacyPage, /<script\b/i, "Hosted privacy page must remain script-free");
assert.match(submission, /Financial and payment information/);
assert.match(submission, /No, I am not using remote code/);
assert.match(submission, /does not download audio/i);
assert.match(packaging, /node scripts\/build\.mjs --release/);
assert.match(buildScript, /runtimeIconNames\(\)/, "Production icons must be derived from final runtime references");
assert.match(buildScript, /extensionIcons/, "Manifest icon sizes must be explicitly included");
assert.match(packaging, /verify-release\.mjs/);

console.log("Chrome Web Store readiness checks passed");
