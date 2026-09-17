// A missing playback snapshot during a handoff is not an empty session.
// Keep the last selected track until replacement metadata or an explicit clear.
export function resolvePlayerPresentation(previous, track, available, cleared) {
  if (cleared) return { track: null, retained: false };
  if (available && track?.title) return { track: { ...track }, retained: false };
  return { track: previous || null, retained: Boolean(previous) };
}
