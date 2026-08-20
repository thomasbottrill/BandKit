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
      "privacy/**"
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
      "max-lines": ["error", { "max": 1000, "skipBlankLines": false, "skipComments": false }],
      "max-lines-per-function": ["error", { "max": 200, "skipBlankLines": true, "skipComments": true, "IIFEs": true }],
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
        structuredClone: "readonly",
        URL: "readonly"
      }
    }
  }
];
