import { createElement } from "../core.js";

// File parsing and application updates remain caller-owned. Always release the
// pending state and clear the input so the same file can be selected again.
export function createArtworkUpload({ ariaLabel, title, accept = ".svg,.png,image/svg+xml,image/png", onFile, onError }) {
  const button = createElement("button", "hub-custom-handle-upload", "Upload");
  button.type = "button";
  button.setAttribute("aria-label", ariaLabel);
  if (title) button.dataset.settingsTooltip = title;
  const input = createElement("input", "");
  input.type = "file";
  input.accept = accept;
  input.hidden = true;
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    button.disabled = true;
    try { await onFile(file); }
    catch (error) { onError(error); }
    finally { button.disabled = false; input.value = ""; }
  });
  return { button, input };
}
