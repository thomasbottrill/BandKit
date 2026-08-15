const browserGlobals = Object.fromEntries([
  "AbortController", "Audio", "Blob", "CSS", "CustomEvent", "DOMParser", "Element",
  "Event", "File", "FileReader", "HTMLAudioElement", "HTMLCanvasElement", "HTMLElement",
  "HTMLInputElement", "HTMLMediaElement", "MediaMetadata", "MediaSource", "MutationObserver",
  "ResizeObserver", "ShadowRoot", "URL", "URLSearchParams", "Window", "cancelAnimationFrame",
  "chrome", "clearInterval", "clearTimeout", "confirm", "console", "crypto", "document",
  "fetch", "getComputedStyle", "globalThis", "history", "location", "navigator", "performance",
  "prompt", "requestAnimationFrame", "requestIdleCallback", "setInterval", "setTimeout",
  "structuredClone", "window"
].map((name) => [name, "readonly"]));

export default [
  {
    ignores: [
      ".cache/**",
      "dist/**",
      "node_modules/**",
      "background.js",
      "cart-autosave.js",
      "content.js",
      "feed-redirect.js",
      "modern-pages-bootstrap.js",
      "offscreen.js",
      "page-media-bridge.js",
      "popup.js"
    ]
  },
  {
    files: ["*.js", "src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals
    },
    rules: {
      "no-async-promise-executor": "error",
      "no-constant-binary-expression": "error",
      "no-duplicate-imports": "error",
      "no-promise-executor-return": "error",
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrors": "none" }]
    }
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        structuredClone: "readonly"
      }
    }
  }
];
