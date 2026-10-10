// While Bandkit's cart is off, Bandcamp's own cart shares one card with the
// release's buying options on modern pages: a Cart tab and a Buy tab. Every
// change is recorded with the modern layout, so turning modern pages off puts
// Bandcamp's cart back exactly as it was.
export function registerModernReleaseCart(r) {
  r.$prepareModernReleaseCart = function prepareModernReleaseCart(purchasePanel, purchaseList) {
    const sidecart = document.querySelector("#rightColumn > #sidecart");
    if (!sidecart || !purchasePanel || !purchaseList) return;
    const tabs = r.$createModernReleaseShell("div", "bandkit-modern-commerce-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Cart and buying options");
    const cartView = r.$createModernReleaseShell("div", "bandkit-modern-cart-view");
    cartView.id = "bandkit-modern-cart-view";
    cartView.setAttribute("role", "tabpanel");
    purchaseList.id ||= "bandkit-modern-purchase-list";
    purchaseList.setAttribute("role", "tabpanel");
    const createTab = (view, label, controls) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "bandkit-modern-commerce-tab";
      tab.dataset.view = view;
      tab.id = `bandkit-modern-${view}-tab`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", controls);
      tab.append(label);
      return tab;
    };
    const cartTab = createTab("cart", "Cart", cartView.id);
    const count = document.createElement("span");
    count.className = "bandkit-modern-commerce-count";
    cartTab.append(count);
    const buyTab = createTab("buy", "Buy", purchaseList.id);
    cartView.setAttribute("aria-labelledby", cartTab.id);
    purchaseList.setAttribute("aria-labelledby", buyTab.id);
    tabs.append(cartTab, buyTab);
    purchasePanel.prepend(tabs, cartView);
    r.$moveModernReleaseNode(sidecart, cartView);

    // The release's buying options are what the page is for, so they open
    // first; a cart that just grew is shown so the add is confirmed.
    let view = "buy";
    let lastCount = -1;
    const select = (next, focus = false) => {
      view = next;
      purchasePanel.dataset.bandkitCommerceView = next;
      for (const tab of [cartTab, buyTab]) {
        const active = tab.dataset.view === next;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      }
    };
    const sync = () => {
      const items = sidecart.querySelectorAll("#item_list > .item").length;
      purchasePanel.dataset.bandkitCartCount = String(items);
      count.textContent = items > 99 ? "99+" : String(items);
      count.hidden = !items;
      cartTab.setAttribute("aria-label", items ? `Cart, ${items} item${items === 1 ? "" : "s"}` : "Cart");
      if (!items && view === "cart") select("buy");
      else if (lastCount >= 0 && items > lastCount) select("cart");
      lastCount = items;
    };
    tabs.addEventListener("click", (event) => {
      const tab = event.target.closest(".bandkit-modern-commerce-tab");
      if (tab) select(tab.dataset.view);
    });
    tabs.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      select(view === "cart" ? "buy" : "cart", true);
    });
    select(view);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(sidecart, { childList: true, subtree: true });
    r.$modernReleaseCleanups.push(() => {
      observer.disconnect();
      delete purchasePanel.dataset.bandkitCommerceView;
      delete purchasePanel.dataset.bandkitCartCount;
    });
  };
}
