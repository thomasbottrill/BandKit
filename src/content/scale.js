// Viewing preferences deliberately live outside the portable visual-theme keys.
export const SCALE_MIN = 75;
export const SCALE_MAX = 150;
export const PAGE_SCALE_OPTIONS = [
  { value: "compact", label: "Small (Bandcamp)" },
  { value: "normal", label: "Normal (Bandkit)" },
  { value: "larger", label: "Larger" },
  { value: "custom", label: "Custom" }
];
export const INTERFACE_SCALE_OPTIONS = PAGE_SCALE_OPTIONS.map(option => ({
  ...option,
  label: { compact: "Smaller", normal: "Normal" }[option.value] || option.label
}));
export const PAGE_SCALE_GROUPS = [
  { value: "release", label: "Albums & tracks" },
  { value: "feed", label: "Feed" },
  { value: "community", label: "Community" },
  { value: "artist", label: "Other artist pages" }
];

export function scalePercent(value, fallback = 100) {
  const number = typeof value === "number" || typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, number))) : fallback;
}

export function normalizeScale(value, pages = false) {
  const preset = PAGE_SCALE_OPTIONS.some(option => option.value === value?.preset) ? value.preset : "normal";
  const result = { preset, custom: scalePercent(value?.custom) };
  if (pages) {
    result.adjustByPage = value?.adjustByPage === true;
    result.overrides = Object.fromEntries(PAGE_SCALE_GROUPS.map(({ value: key }) => [
      key, value?.overrides?.[key] == null ? null : scalePercent(value.overrides[key], null)
    ]));
  }
  return result;
}

export function normalizeAppearanceScales(appearance) {
  let changed = false;
  for (const key of ["pageScale", "interfaceScale"]) {
    const previous = appearance[key];
    const normalized = normalizeScale(previous, key === "pageScale");
    // Chrome storage can reorder object keys. Compare preference values so a
    // storage round trip cannot start a normalization/save loop across tabs.
    for (const [field, value] of Object.entries(normalized)) {
      if (field === "overrides") {
        if (PAGE_SCALE_GROUPS.some(({ value: group }) => previous?.overrides?.[group] !== value[group])) changed = true;
      } else if (previous?.[field] !== value) changed = true;
    }
    appearance[key] = normalized;
  }
  return changed;
}

export function pageScaleGroup(pageType) {
  if (["release", "feed", "community"].includes(pageType)) return pageType;
  return ["music", "merch", "video", "subscribe"].includes(pageType) ? "artist" : "";
}

export function resolveScale(value, group = "") {
  const scale = normalizeScale(value, Boolean(group));
  if (scale.preset === "custom") {
    const percent = scale.adjustByPage ? scale.overrides?.[group] ?? scale.custom : scale.custom;
    return percent / 100;
  }
  return { compact: 0.8, normal: 1, larger: 1.15 }[scale.preset];
}

export function resolvePageScale(appearance, pageType) {
  const group = pageScaleGroup(pageType);
  return appearance?.modernReleasePages !== false && group ? resolveScale(appearance?.pageScale, group) : 1;
}

export function interfaceScale(appearance) {
  return resolveScale(appearance?.interfaceScale);
}

// DOM rectangles are screen CSS pixels; zoomed fixed surfaces use local pixels.
export function scaleRect(rect, scale) {
  if (!rect) return null;
  return Object.fromEntries(["left", "right", "top", "bottom", "width", "height", "x", "y"].map(key => [key, rect[key] / scale]));
}
