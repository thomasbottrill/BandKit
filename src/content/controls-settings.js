import { createSettingsDisclosure } from "./settings-drawer.js";

// Only the Controls page uses these three local drawers. Their open state is
// kept during control edits, then reset by the normal settings navigation.
export function appendControlsDrawers(parent, timeline, handle, playback) {
  const asChildren = (value) => Array.isArray(value) ? value : [value];
  for (const [title, children] of [["Timeline", timeline], ["Handle", asChildren(handle)], ["Playback", asChildren(playback)]]) {
    const drawer = createSettingsDisclosure(title, "", `controls-${title.toLowerCase()}`);
    drawer.group.classList.add("hub-controls-drawer");
    drawer.content.append(...children);
    parent.append(drawer.group);
  }
}
