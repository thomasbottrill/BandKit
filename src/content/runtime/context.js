export let runtimeState;
export let runtimeLive;
export let runtimeSaveState;
export let runtimeSeamless;

export function updateRuntimeState(value) {
  runtimeState = value;
  return value;
}

export function updateRuntimeLive(value) {
  runtimeLive = value;
  return value;
}

export function updateRuntimeSaveState(value) {
  runtimeSaveState = value;
  return value;
}

export function updateRuntimeSeamless(value) {
  runtimeSeamless = value;
  return value;
}
