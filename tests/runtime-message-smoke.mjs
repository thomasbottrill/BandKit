import assert from "node:assert/strict";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();

assert.match(source, /message port closed\|receiving end does not exist\|could not establish connection\|extension context invalidated/i,
  "Expected extension transport disconnects must be classified as transient");
assert.match(source, /resolve\(\{ ok: false, error, transient: isTransientRuntimeMessageError\(error\) \}\)/,
  "Runtime messaging must mark transient disconnect responses");
assert.match(source, /if \(response\?\.transient\) return null;/,
  "Seamless playback commands must not surface transient message-port errors as user-facing toasts");

console.log("Runtime message regression checks passed.");
