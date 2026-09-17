import { runtimeState } from "./context.js";

export function syncNowPlayingShuffleButton(button, active) {
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", active ? "Turn shuffle off" : "Turn shuffle on");
  button.title = button.getAttribute("aria-label");
}

export function protectNowPlayingShuffleClick(r, button) {
  button.addEventListener("pointerdown", () => {
    r.$nowPlayingShuffleInteractionActive = true;
    const finishInteraction = () => {
      window.removeEventListener("pointerup", finishInteraction, true);
      window.removeEventListener("pointercancel", finishInteraction, true);
      window.removeEventListener("blur", finishInteraction, true);
      window.setTimeout(() => {
        r.$nowPlayingShuffleInteractionActive = false;
        if (!r.$nowPlayingShuffleRefreshPending) return;
        r.$nowPlayingShuffleRefreshPending = false;
        r.$renderPanelContent();
      }, 0);
    };
    window.addEventListener("pointerup", finishInteraction, { capture: true, once: true });
    window.addEventListener("pointercancel", finishInteraction, { capture: true, once: true });
    window.addEventListener("blur", finishInteraction, { capture: true, once: true });
  });
}

export function setupCompactPanelNotices(r, isCompact) {
  r.$unseenDestinationCounts = {};
  r.$syncDestinationNotices = () => {
    if (runtimeState.open) delete r.$unseenDestinationCounts[runtimeState.activeTab];
    for (const button of r.$panelShortcuts.querySelectorAll(".hub-panel-shortcut")) {
      const count = r.$unseenDestinationCounts[button.dataset.tab] || 0;
      button.classList.toggle("has-dot", count > 0);
      const badge = button.querySelector(".hub-panel-shortcut-count");
      if (badge) badge.textContent = count > 99 ? "99+" : String(count);
    }
  };
  r.$clearCompactPanelNotice = function clearCompactPanelNotice() {
    window.clearTimeout(r.$compactPanelNoticeTimer);
    r.$compactPanelNoticeTimer = 0;
    r.$compactPanelButton.classList.remove("is-notifying");
  };
  r.$showCompactPanelNotice = function showCompactPanelNotice(icon, label = "Panel updated", count) {
    if (!isCompact() || !icon.includes("cart")) return;
    count = count ?? runtimeState.cart.length;
    if (!count) return;
    r.$unseenDestinationCounts.cart = count;
    r.$syncDestinationNotices();
    window.clearTimeout(r.$compactPanelNoticeTimer);
    const noticeIcon = r.$compactPanelButton.querySelector(".hub-compact-panel-icon");
    noticeIcon.textContent = `Cart ${count}`;
    noticeIcon.setAttribute("role", "status");
    noticeIcon.removeAttribute("aria-hidden");
    noticeIcon.setAttribute("title", label);
    r.$compactPanelButton.classList.remove("is-notifying");
    void r.$compactPanelButton.offsetWidth;
    r.$compactPanelButton.classList.add("is-notifying");
    r.$compactPanelNoticeTimer = window.setTimeout(() => r.$clearCompactPanelNotice(), 3600);
  };
}

export function setupCompactPanelFocusRelease(r, isPanelOpen) {
  r.$compactPanelFocusReleaseTimer = 0;
  r.$compactPanelFocusReleasePending = false;
  r.$cancelCompactPanelFocusRelease = () => {
    window.clearTimeout(r.$compactPanelFocusReleaseTimer);
    r.$compactPanelFocusReleaseTimer = 0;
    r.$compactPanelFocusReleasePending = false;
  };
  r.$scheduleCompactPanelFocusRelease = () => {
    window.clearTimeout(r.$compactPanelFocusReleaseTimer);
    r.$compactPanelFocusReleasePending = true;
    r.$compactPanelFocusReleaseTimer = window.setTimeout(() => {
      r.$compactPanelFocusReleaseTimer = 0;
      if (isPanelOpen()) return void (r.$compactPanelFocusReleasePending = false);
      if (r.$player.matches(":hover")) return;
      if (r.$shadow.activeElement === r.$compactPanelButton) r.$compactPanelButton.blur();
      r.$compactPanelFocusReleasePending = false;
    }, 5000);
  };
  r.$restorePanelFocus = (controls) => {
    const focusTarget = controls.find((control) => control && !control.disabled && control.getClientRects().length);
    focusTarget?.focus();
  };
  r.$panel.addEventListener("click", (event) => {
    if (event.detail === 0) return;
    window.setTimeout(() => {
      if (!isPanelOpen() && r.$shadow.activeElement === r.$compactPanelButton) r.$scheduleCompactPanelFocusRelease();
    }, 0);
  }, { capture: true });
  r.$player.addEventListener("pointerleave", () => {
    if (r.$compactPanelFocusReleasePending) r.$scheduleCompactPanelFocusRelease();
  });
}
