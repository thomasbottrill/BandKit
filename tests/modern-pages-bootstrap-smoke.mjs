import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../modern-pages-bootstrap.js", import.meta.url), "utf8");

function bootstrap({ hostname, pathname, enabled = true, storageError = false }) {
  const dataset = {};
  const context = {
    location: { hostname, pathname },
    document: { documentElement: { dataset } },
    chrome: {
      runtime: { lastError: storageError ? { message: "fixture failure" } : null },
      storage: {
        local: {
          get(key, callback) {
            assert.equal(key, "bandcampHubState");
            callback({ bandcampHubState: { appearance: { modernReleasePages: enabled } } });
          }
        }
      }
    },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  context.window = context;
  context.top = context;
  vm.runInNewContext(source, context);
  return { context, dataset };
}

let result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/album/example" });
assert.equal(result.dataset.bandkitModernBootstrap, "true");
assert.equal(result.dataset.bandkitModernPending, "true");
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "release");
assert.equal(result.dataset.bandkitModernPage, undefined, "Original palette must remain available until content initialization");
result.context.BandKitModernPagesBootstrap.finish();
assert.equal(result.dataset.bandkitModernPending, undefined);
assert.equal(result.dataset.bandkitModernReady, "true");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/listener/feed" });
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "feed");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/video" });
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "video");

result = bootstrap({ hostname: "label.bandcamp.com", pathname: "/community", enabled: false });
assert.equal(result.dataset.bandkitModernPage, "false");
assert.equal(result.dataset.bandkitModernPageType, undefined);
assert.equal(result.dataset.bandkitModernPending, undefined);
assert.equal(result.dataset.bandkitModernReady, "true");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/listener" });
assert.equal(result.dataset.bandkitModernBootstrap, undefined, "Collection pages must remain untouched");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/discover/electronic" });
assert.equal(result.dataset.bandkitModernBootstrap, undefined, "Discover must remain untouched");

result = bootstrap({ hostname: "daily.bandcamp.com", pathname: "/" });
assert.equal(result.dataset.bandkitModernBootstrap, undefined, "Bandcamp Daily must remain untouched");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/music", storageError: true });
assert.equal(result.dataset.bandkitModernPage, "false");
assert.equal(result.dataset.bandkitModernPending, undefined, "Storage failures must reveal the classic page");

console.log("Modern page startup bootstrap checks passed.");
