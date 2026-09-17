import { createElement } from "../core.js";

export function createPageAnalysisBadge(kind, text, uncertain, unavailable) {
  const badge = createElement("span", `bandkit-track-analysis-${kind}`, text);
  badge.classList.toggle("is-uncertain", uncertain);
  badge.classList.toggle("is-unavailable", unavailable);
  return badge;
}
