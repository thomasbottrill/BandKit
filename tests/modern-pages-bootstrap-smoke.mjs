import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../dist/unpacked/modern-pages-bootstrap.js", import.meta.url), "utf8");

function bootstrap({ hostname, pathname, enabled, globallyEnabled = true, storageError = false, pageTheme }) {
  const dataset = {};
  const properties = {};
  const context = {
    location: { hostname, pathname },
    document: { documentElement: { dataset, style: { setProperty(name, value) { properties[name] = value; } } } },
    chrome: {
      runtime: { lastError: storageError ? { message: "fixture failure" } : null },
      storage: {
        local: {
          get(keys, callback) {
            assert.deepEqual([...keys], ["bandcampHubEnabled", "bandcampHubState", "bandcampHubPageTheme"]);
            callback({
              bandcampHubEnabled: globallyEnabled,
              ...(pageTheme === undefined ? {} : { bandcampHubPageTheme: pageTheme }),
              ...(enabled === undefined
                ? { bandcampHubState: {} }
                : { bandcampHubState: { appearance: { modernReleasePages: enabled } } })
            });
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
  return { context, dataset, properties };
}

let result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/album/example", enabled: true });
assert.equal(result.dataset.bandkitModernBootstrap, "true");
assert.equal(result.dataset.bandkitModernPending, "true");
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "release");
assert.equal(result.dataset.bandkitModernPage, undefined, "Original palette must remain available until content initialization");
result.context.BandKitModernPagesBootstrap.finish();
assert.equal(result.dataset.bandkitModernPending, undefined);
assert.equal(result.dataset.bandkitModernReady, "true");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/listener/feed", enabled: true });
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "feed");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/video", enabled: true });
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "video");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/subscribe", enabled: true });
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "subscribe");

result = bootstrap({ hostname: "label.bandcamp.com", pathname: "/artists", enabled: true });
assert.equal(result.context.BandKitModernPagesBootstrap.pageType, "music");

result = bootstrap({ hostname: "label.bandcamp.com", pathname: "/community", enabled: false });
assert.equal(result.dataset.bandkitModernPage, "false");
assert.equal(result.dataset.bandkitModernPageType, undefined);
assert.equal(result.dataset.bandkitModernPending, undefined);
assert.equal(result.dataset.bandkitModernReady, "true");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/album/default-on" });
assert.equal(result.dataset.bandkitModernBootstrap, "true", "Modern pages must start enabled when no preference is stored");
assert.equal(result.dataset.bandkitModernPending, "true");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/album/deactivated", enabled: true, globallyEnabled: false });
assert.equal(result.dataset.bandkitEnabled, "false");
assert.equal(result.dataset.bandkitModernPage, "false", "Global deactivation must keep the original Bandcamp page");
assert.equal(result.dataset.bandkitModernPending, undefined);
assert.equal(result.dataset.bandkitModernReady, undefined, "Global deactivation must not animate or restyle the page");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/listener" });
assert.equal(result.dataset.bandkitModernBootstrap, undefined, "Collection pages must remain untouched");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/discover/electronic" });
assert.equal(result.dataset.bandkitModernBootstrap, undefined, "Discover must remain untouched");

result = bootstrap({ hostname: "daily.bandcamp.com", pathname: "/" });
assert.equal(result.dataset.bandkitModernBootstrap, undefined, "Bandcamp Daily must remain untouched");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/music", storageError: true });
assert.equal(result.dataset.bandkitModernPage, "false");
assert.equal(result.dataset.bandkitModernPending, undefined, "Storage failures must reveal the classic page");

// The page stylesheet ships at document_start, so replaying the last resolved
// colours there is what keeps a navigation from painting Bandcamp's palette
// first. It has to reach the pages that never get a modern page type, which is
// where the theme visibly flashed.
const cache = { enabled: true, variables: { "--bandkit-page-background": "rgb(37, 4, 4)", "--bandkit-page-scheme": "dark" } };

result = bootstrap({ hostname: "bandcamp.com", pathname: "/discover", pageTheme: cache });
assert.equal(result.dataset.bandkitPageTheme, "true", "Discover must carry the themed hook before the runtime starts");
assert.deepEqual(result.properties, cache.variables, "Discover must paint the cached colours from the first frame");
assert.equal(result.dataset.bandkitModernBootstrap, undefined, "Early theming must not switch Discover onto the modern page path");

result = bootstrap({ hostname: "artist.bandcamp.com", pathname: "/album/themed", enabled: true, pageTheme: cache });
assert.deepEqual(result.properties, cache.variables, "Release pages must paint the cached colours behind their reveal gate");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/discover", pageTheme: { enabled: false, variables: cache.variables } });
assert.deepEqual(result.properties, {}, "A theme the user turned off must not be replayed");
assert.equal(result.dataset.bandkitPageTheme, undefined);

result = bootstrap({ hostname: "bandcamp.com", pathname: "/discover", globallyEnabled: false, pageTheme: cache });
assert.deepEqual(result.properties, {}, "Deactivating Bandkit must leave the page in Bandcamp's own colours");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/discover" });
assert.deepEqual(result.properties, {}, "A first run with nothing cached must fall back to the runtime without throwing");

result = bootstrap({ hostname: "bandcamp.com", pathname: "/cart/checkout", pageTheme: cache });
assert.equal(result.dataset.bandkitCheckoutPage, "true", "Checkout keys off the URL, so it can be set before first paint");
assert.equal(result.dataset.bandkitCheckoutError, "false");

console.log("Modern page startup bootstrap checks passed.");
