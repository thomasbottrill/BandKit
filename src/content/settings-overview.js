import { createElement, createSectionHeading } from "./core.js";
import { createSettingsBackRow, createSettingsDetailHeader, createSettingsOverviewCard, resetSettingsDisclosures } from "./settings-drawer.js";
import { runtimeSaveState, runtimeState } from "./runtime/context.js";
import { createVisualThemeSettings } from "./runtime/visual-theme-settings.js";
import { createScaleSettingsSection } from "./runtime/scale-settings.js";

export function registerSettingsOverview(r) {
  r.$settingsOverviewSections = function settingsOverviewSections() {
    return [
      { id: "player", title: "Player" },
      { id: "features", title: "Features" },
      { id: "appearance", title: "Appearance" },
      { id: "browsing", title: "Browsing" },
      { id: "onboarding", title: "Help" },
      { id: "privacy", title: "Data" },
      { id: "about", title: "About" }
    ];
  };

  r.$renderSettingsOverview = function renderSettingsOverview() {
    r.$content.append(createSectionHeading("Settings"));
    const stack = createElement("div", "hub-settings-overview-stack");
    for (const section of r.$settingsOverviewSections()) {
      stack.append(createSettingsOverviewCard({
        ...section,
        onOpen: () => {
          resetSettingsDisclosures();
          runtimeState.settingsView = section.id;
          runtimeState.settingsSubView = "index";
          runtimeSaveState();
          r.$saveLayoutState?.();
          r.$render();
        }
      }));
    }
    r.$content.append(stack);
  };

  r.$renderSettings = function renderSettings() {
    // Tools now lives inside Features; send anything still pointing at it there.
    if (runtimeState.settingsView === "tools") runtimeState.settingsView = "features";
    const sections = new Map(r.$settingsOverviewSections().map((section) => [section.id, section]));
    const view = sections.has(runtimeState.settingsView) ? runtimeState.settingsView : "index";
    if (view === "index") {
      runtimeState.settingsView = "index";
      runtimeState.settingsSubView = "index";
      r.$renderSettingsOverview();
      return;
    }

    const playerSections = new Map([
      ["design", "Design"],
      ["size", "Size"],
      ["timeline", "Controls"],
      ["visualiser", "Visualiser"]
    ]);
    const playerSubView = view === "player" && playerSections.has(runtimeState.settingsSubView)
      ? runtimeState.settingsSubView : "index";
    if (view === "player") runtimeState.settingsSubView = playerSubView;
    const goBack = () => {
      resetSettingsDisclosures();
      if (view === "appearance" && runtimeState.settingsSubView.startsWith("theme-")) runtimeState.settingsSubView = "themes";
      else if (runtimeState.settingsSubView !== "index") runtimeState.settingsSubView = "index";
      else {
        runtimeState.settingsView = "index";
        runtimeState.settingsSubView = "index";
      }
      runtimeSaveState();
      r.$saveLayoutState?.();
      r.$render();
    };
    const title = playerSubView === "index" ? sections.get(view).title : playerSections.get(playerSubView);
    const backLabel = playerSubView === "index" ? "Back to Settings" : "Back to Player";
    r.$content.append(createSettingsDetailHeader(title), createSettingsBackRow(backLabel, goBack));
    if (view === "player") r.$renderPlaybackSettings();
    if (view === "features") r.$renderFeatureSettings();
    if (view === "browsing") r.$renderBrowsingSettings();
    if (view === "appearance") {
      const editor = runtimeState.settingsSubView.replace(/^theme-/, "");
      if (runtimeState.settingsSubView.startsWith("theme-") && playerSections.has(editor)) {
        r.$content.querySelector(".hub-settings-detail-title span").textContent = playerSections.get(editor);
        r.$content.querySelector(".hub-settings-back-row").replaceWith(createSettingsBackRow("Back to Themes", goBack));
        r.$renderPlaybackSettings(editor);
        return;
      }
      const { appearance, appearanceMode, themeGroup } = r.$createAppearanceSettings();
      appearance.prepend(createVisualThemeSettings(r), createScaleSettingsSection(r));
      r.$appendAppearanceThemePicker(themeGroup, appearanceMode);
      r.$appendSavedThemeSettings(themeGroup, appearanceMode);
      r.$appendCustomThemeSettings(themeGroup, appearanceMode);
      r.$finishAppearanceSettings(appearance, themeGroup);
    }
    if (view === "onboarding") r.$renderOnboardingSettings();
    if (view === "privacy") r.$renderPrivacySettings();
    if (view === "about") r.$renderAboutSettings();
    if (view !== "player") convertSettingsDrawers(r, sections.get(view).title, goBack);
  };
}

function convertSettingsDrawers(r, parentTitle, goBack) {
  const groups = [...r.$content.querySelectorAll("[data-settings-disclosure]")]
    .filter(group => !group.parentElement.closest("[data-settings-disclosure]"));
  if (!groups.length) return;
  const fromTheme = runtimeState.settingsSubView === "theme-colours";
  const key = fromTheme || runtimeState.settingsSubView === "theme" ? "colours" : runtimeState.settingsSubView;
  const selected = groups.find(group => group.dataset.settingsDisclosure === key);
  if (selected) {
    const backActions = selected.querySelector("[data-settings-back-actions]");
    backActions?.remove();
    r.$content.querySelector(".hub-settings-detail-title span").textContent = selected.querySelector(".hub-settings-disclosure-title").textContent;
    r.$content.querySelector(".hub-settings-back-row").replaceWith(createSettingsBackRow(fromTheme ? "Back to Themes" : `Back to ${parentTitle}`, goBack, backActions));
    for (const group of groups) {
      if (group !== selected) { group.remove(); continue; }
      group.querySelector(".hub-settings-disclosure-trigger").remove();
      group.querySelector(".hub-settings-disclosure-content").hidden = false;
      group.classList.add("is-open");
    }
  } else {
    runtimeState.settingsSubView = "index";
    for (const group of groups) {
      const title = group.querySelector(".hub-settings-disclosure-title").textContent;
      group.replaceWith(createSettingsOverviewCard({ id: group.dataset.settingsDisclosure, title, onOpen: () => {
        runtimeState.settingsSubView = group.dataset.settingsDisclosure;
        runtimeSaveState();
        r.$saveLayoutState?.();
        r.$render();
      } }));
    }
  }
}
