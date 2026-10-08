// Keep the category links in the header's normal page position. Only the
// primary row returns with Bandcamp's native scroll-up header. The surrounding
// container retains its full height so switching states never shifts content.
const HEADER_SCROLL_CSS = `
  .menu-bar:is(.fixed-show, .fixed-hide):has(> .corp-sub-nav) {
    --header-height: var(--bc-menubar-height, 53px);
  }
  .menu-bar:is(.fixed-show, .fixed-hide) > .corp-sub-nav {
    display: none !important;
  }
`;

export function applyHeaderScrollBehavior(root) {
  if (!root?.querySelector(".menu-bar > .corp-sub-nav")) return;
  if (root.querySelector("#bandkit-header-scroll-style")) return;
  const style = document.createElement("style");
  style.id = "bandkit-header-scroll-style";
  style.textContent = HEADER_SCROLL_CSS;
  (root.head || root).append(style);
}
