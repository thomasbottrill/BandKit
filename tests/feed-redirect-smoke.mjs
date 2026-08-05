import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../feed-redirect.js", import.meta.url), "utf8");

async function runRedirect({ href, state = {}, anchors = [] }) {
  const url = new URL(href);
  const styles = new Map();
  const writes = [];
  let replacement = "";
  const root = {
    style: {
      getPropertyValue: (name) => styles.get(name)?.value || "",
      getPropertyPriority: (name) => styles.get(name)?.priority || "",
      setProperty: (name, value, priority = "") => styles.set(name, { value, priority }),
      removeProperty: (name) => styles.delete(name)
    }
  };
  const context = {
    URL,
    Promise,
    location: {
      href: url.href,
      hostname: url.hostname,
      pathname: url.pathname,
      hash: url.hash,
      replace(value) { replacement = value; }
    },
    document: {
      documentElement: root,
      querySelectorAll: () => anchors.map((anchorHref) => ({ href: new URL(anchorHref, url).href }))
    },
    chrome: {
      storage: {
        local: {
          get(_key, callback) { callback({ bandcampHubState: state }); },
          set(value) { writes.push(value); }
        }
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.window.top = context.window;
  vm.createContext(context);
  vm.runInContext(source, context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { replacement, styles, writes };
}

let result = await runRedirect({
  href: "https://bandcamp.com/",
  state: { openHomeToFeed: true, feedUrl: "https://bandcamp.com/listener-name/feed" }
});
assert.equal(result.replacement, "https://bandcamp.com/listener-name/feed");
assert.equal(result.styles.get("visibility")?.value, "hidden");

result = await runRedirect({
  href: "https://bandcamp.com/",
  state: { openHomeToFeed: true },
  anchors: ["/listener-name/feed"]
});
assert.equal(result.replacement, "https://bandcamp.com/listener-name/feed");
assert.equal(result.writes.at(-1)?.bandcampHubState?.feedUrl, "https://bandcamp.com/listener-name/feed");

result = await runRedirect({
  href: "https://bandcamp.com/listener-name/feed",
  state: { openHomeToFeed: true }
});
assert.equal(result.replacement, "");
assert.equal(result.writes.at(-1)?.bandcampHubState?.feedUrl, "https://bandcamp.com/listener-name/feed");

result = await runRedirect({
  href: "https://bandcamp.com/",
  state: { openHomeToFeed: false, feedUrl: "https://bandcamp.com/listener-name/feed" }
});
assert.equal(result.replacement, "");
assert.equal(result.styles.has("visibility"), false);

result = await runRedirect({
  href: "https://bandcamp.com/",
  state: { openHomeToFeed: true, feedUrl: "https://bandcamp.com/feed" },
  anchors: ["/listener-name/feed"]
});
assert.equal(result.replacement, "https://bandcamp.com/listener-name/feed");

console.log("feed redirect smoke test passed");
