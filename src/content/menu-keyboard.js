// Keyboard navigation shared by every Bandkit popup: overflow menus, destination
// menus, date pickers and the onboarding listboxes. Enter and Space already
// activate a focused button, so what these popups were missing is movement —
// Up/Down between items, Home/End to the ends, and Escape back to the trigger.
// The settings picker keeps its own equivalent handling.

const FOCUSABLE = "button:not(:disabled), [role='option']:not([aria-disabled='true']), [role='menuitem']:not(:disabled)";

function activeElementFor(element) {
  const root = element.getRootNode();
  return root?.activeElement || document.activeElement;
}

// `offsetParent` is not a reliable visibility test here: it returns null when
// the nearest positioned ancestor sits outside the element's shadow tree, which
// is exactly how these popups are built, so every item looked hidden.
export function menuItems(menu, selector = FOCUSABLE) {
  return [...menu.querySelectorAll(selector)]
    .filter(item => !item.hidden && (item.checkVisibility?.() ?? true));
}

export function focusMenuItem(menu, index = 0, selector = FOCUSABLE) {
  const items = menuItems(menu, selector);
  if (!items.length) return false;
  items.at(index)?.focus();
  return true;
}

// Moves focus between a popup's items. `onEscape` is optional so popups that
// already close themselves on Escape keep that behaviour untouched.
export function attachMenuKeyNavigation(menu, { selector = FOCUSABLE, onEscape } = {}) {
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = menuItems(menu, selector);
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(activeElementFor(menu));
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : current < 0 ? (step === 1 ? 0 : items.length - 1)
          : (current + step + items.length) % items.length;
    items[next].focus();
  });
}

// Opens a closed popup from its trigger and lands on the first or last item, so
// the arrow keys work from the moment the control has focus.
export function attachMenuTriggerKeyNavigation(trigger, menu, { open, selector = FOCUSABLE } = {}) {
  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    // Opening with the mouse leaves focus on the trigger, so an already-open
    // popup must still take the arrow key and step into its list.
    if (menu.hidden) { if (open) open(); else trigger.click(); }
    const index = event.key === "ArrowUp" ? -1 : 0;
    // Menus that fill on open do so synchronously, but focus after a frame so a
    // trigger that re-renders its popup still lands on the finished list.
    if (!focusMenuItem(menu, index, selector)) {
      window.requestAnimationFrame(() => focusMenuItem(menu, index, selector));
    }
  });
}
