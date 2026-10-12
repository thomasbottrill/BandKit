function collectionItems(value) {
  return (Array.isArray(value) ? value : []).filter((item) => item?.id);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const CONCURRENT_SETTING_KEYS = Object.freeze([
  "openHomeToFeed",
  "feedUrl",
  "onboardingCompletedVersion",
  "onboardingStep",
  "whatsNewSeenVersion",
  "djToolsEnabled",
  "cartEnabled",
  "playlistsEnabled",
  "activityEnabled",
  "downloadsEnabled",
  "keyboardShortcutsEnabled",
  "downloadFormat",
  "autoAnalyzeTracks",
  "showTrackKeys",
  "showCamelotNotation",
  "recordPlaylistMetadata",
  "showMusicBarAnalysis",
  "keepMusicBarAnalysisVisible",
  "scrubberStyle",
  "scrubberHandleShape",
  "customScrubberHandle",
  "customTimeline",
  "customPlayerButtons",
  "musicBarTimelineColor",
  "musicBarHandleColor",
  "musicBarControlsColor",
  "musicBarPlayerColor",
  "retainTimelineColors",
  "scrubberHandleSize",
  "retainSvgHandleColors",
  "retainPngHandleColors",
  "musicBarScrubberWidth",
  "musicBarStyle",
  "musicBarDynamicColor",
  "musicBarPlayerDynamicColor",
  "musicBarPanelDynamicColor",
  "musicBarBlendMode",
  "musicBarPanelButtons",
  "musicBarRecentPanel",
  "musicBarSize",
  "musicBarVisualizer",
  "musicBarVisualizerType",
  "musicBarVisualizerOpacity",
  "musicBarVisualizerWidth",
  "musicBarVisualizerHeight",
  "musicBarVisualizerBlendMode",
  "musicBarWidth",
  "musicBarCustomWidth",
  "musicBarBottomOffset",
  "dockChevronGap"
]);

function mergeChangedValue(baseline, localState, latestState, key) {
  const latestHasValue = Object.prototype.hasOwnProperty.call(latestState || {}, key);
  return sameValue(localState?.[key], baseline?.[key]) && latestHasValue
    ? latestState[key]
    : localState?.[key];
}

export function mergeObjectChanges(baselineValue, localValue, latestValue) {
  const baseline = baselineValue && typeof baselineValue === "object" ? baselineValue : {};
  const local = localValue && typeof localValue === "object" ? localValue : {};
  const latest = latestValue && typeof latestValue === "object" ? latestValue : {};
  const merged = {};
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(local), ...Object.keys(latest)])) {
    merged[key] = mergeChangedValue(baseline, local, latest, key);
  }
  return merged;
}

export function mergeCollectionChanges(baselineValue, localValue, latestValue) {
  const baseline = collectionItems(baselineValue);
  const local = collectionItems(localValue);
  const latest = collectionItems(latestValue);
  const baselineById = new Map(baseline.map((item) => [String(item.id), item]));
  const localById = new Map(local.map((item) => [String(item.id), item]));
  const mergedById = new Map(latest.map((item) => [String(item.id), item]));

  for (const id of baselineById.keys()) {
    if (!localById.has(id)) mergedById.delete(id);
  }
  for (const [id, item] of localById) {
    if (!baselineById.has(id) || !sameValue(item, baselineById.get(id))) mergedById.set(id, item);
  }

  const ordered = [];
  const included = new Set();
  for (const item of local) {
    const id = String(item.id);
    if (!mergedById.has(id)) continue;
    ordered.push(mergedById.get(id));
    included.add(id);
  }
  for (const item of latest) {
    const id = String(item.id);
    if (included.has(id) || !mergedById.has(id)) continue;
    ordered.push(mergedById.get(id));
    included.add(id);
  }
  return ordered;
}

export function mergeConcurrentState(baseline, localState, latestState) {
  const localCartChanged = !sameValue(localState?.cart, baseline?.cart)
    || !sameValue(localState?.cartSavedAt, baseline?.cartSavedAt)
    || !sameValue(localState?.cartSummary, baseline?.cartSummary);
  const latestCartChanged = !sameValue(latestState?.cart, baseline?.cart)
    || !sameValue(latestState?.cartSavedAt, baseline?.cartSavedAt)
    || !sameValue(latestState?.cartSummary, baseline?.cartSummary);
  const useLatestCart = !localCartChanged || (latestCartChanged
    && (Number(latestState?.cartSavedAt) || 0) > (Number(localState?.cartSavedAt) || 0));
  const cartSource = useLatestCart ? latestState : localState;
  const merged = {
    ...localState,
    appearance: mergeObjectChanges(baseline?.appearance, localState?.appearance, latestState?.appearance),
    dj: mergeObjectChanges(baseline?.dj, localState?.dj, latestState?.dj),
    settingsDrawers: mergeObjectChanges(baseline?.settingsDrawers, localState?.settingsDrawers, latestState?.settingsDrawers),
    activity: mergeCollectionChanges(baseline?.activity, localState?.activity, latestState?.activity).slice(0, 500),
    cart: structuredClone(cartSource?.cart || []),
    cartSavedAt: cartSource?.cartSavedAt || null,
    cartSummary: structuredClone(cartSource?.cartSummary || null),
    savedPlaylists: mergeCollectionChanges(baseline?.savedPlaylists, localState?.savedPlaylists, latestState?.savedPlaylists),
    savedCarts: mergeCollectionChanges(baseline?.savedCarts, localState?.savedCarts, latestState?.savedCarts)
  };
  for (const key of [
    ...CONCURRENT_SETTING_KEYS,
    "backupIntroSeen",
    "backupReminderDays",
    "backupReminderSnoozedAt",
    "lastBackupAt"
  ]) {
    merged[key] = mergeChangedValue(baseline, localState, latestState, key);
  }
  merged.onboardingCompletedVersion = Math.max(
    0,
    Number(baseline?.onboardingCompletedVersion) || 0,
    Number(localState?.onboardingCompletedVersion) || 0,
    Number(latestState?.onboardingCompletedVersion) || 0
  );
  if (merged.onboardingCompletedVersion > 0) merged.onboardingStep = 0;
  return merged;
}
