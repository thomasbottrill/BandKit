import { DEFAULT_DATA_FOLDER } from "../content/state.js";

const DATABASE_NAME = "bandkit-data-home";
const DATABASE_VERSION = 1;
const HANDLE_STORE = "handles";
const DIRECTORY_KEY = "directory";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
        request.result.createObjectStore(HANDLE_STORE);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("Bandkit could not open its folder settings.")));
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE, mode);
      const request = operation(transaction.objectStore(HANDLE_STORE));
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error || new Error("Bandkit could not update its folder settings.")));
      transaction.addEventListener("abort", () => reject(transaction.error || new Error("Bandkit could not update its folder settings.")));
    });
  } finally {
    database.close();
  }
}

export function getDataDirectoryHandle() {
  return withStore("readonly", (store) => store.get(DIRECTORY_KEY));
}

export function saveDataDirectoryHandle(handle) {
  return withStore("readwrite", (store) => store.put(handle, DIRECTORY_KEY));
}

export function clearDataDirectoryHandle() {
  return withStore("readwrite", (store) => store.delete(DIRECTORY_KEY));
}

export function dataHomeFolderName(handle) {
  return handle?.name?.toLowerCase() === DEFAULT_DATA_FOLDER.toLowerCase()
    ? `Documents/${DEFAULT_DATA_FOLDER}`
    : handle?.name ? `${handle.name}/${DEFAULT_DATA_FOLDER}` : "";
}

export async function dataHomeStatus() {
  const handle = await getDataDirectoryHandle();
  if (!handle) return { configured: false, ready: false, folderName: "", permission: "missing", handle: null };
  let permission = "prompt";
  try {
    permission = await handle.queryPermission({ mode: "readwrite" });
  } catch {
    permission = "denied";
  }
  return {
    configured: true,
    ready: permission === "granted",
    folderName: dataHomeFolderName(handle),
    permission,
    handle
  };
}

async function writeTextFile(directory, filename, value) {
  const fileHandle = await directory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(value);
  await writable.close();
}

function writeJsonFile(directory, filename, value) {
  return writeTextFile(directory, filename, `${JSON.stringify(value, null, 2)}\n`);
}

function safeFileName(value, fallback) {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .toLowerCase() || fallback;
}

export async function writeDataHomeToHandle(handle, backup) {
  if (!handle) return { ok: false, needsSetup: true, error: "Choose a data folder to continue." };
  let permission = "denied";
  try {
    permission = await handle.queryPermission({ mode: "readwrite" });
  } catch {
    permission = "denied";
  }
  if (permission !== "granted") {
    return {
      ok: false,
      needsPermission: true,
      permission,
      folderName: dataHomeFolderName(handle),
      error: "Chrome needs permission to update your existing Bandkit data folder."
    };
  }

  const rootDirectory = handle.name.toLowerCase() === DEFAULT_DATA_FOLDER.toLowerCase()
    ? handle
    : await handle.getDirectoryHandle(DEFAULT_DATA_FOLDER, { create: true });
  const [playlistsDirectory, cartsDirectory, activityDirectory, settingsDirectory] = await Promise.all([
    rootDirectory.getDirectoryHandle("Playlists", { create: true }),
    rootDirectory.getDirectoryHandle("Carts", { create: true }),
    rootDirectory.getDirectoryHandle("Activity", { create: true }),
    rootDirectory.getDirectoryHandle("Settings", { create: true })
  ]);
  const savedPlaylists = Array.isArray(backup?.playlists?.saved) ? backup.playlists.saved : [];
  const savedCarts = Array.isArray(backup?.carts?.saved) ? backup.carts.saved : [];
  const playlistIndex = savedPlaylists.map((playlist, index) => ({
    id: playlist.id,
    name: playlist.name,
    savedAt: playlist.savedAt,
    file: `${String(index + 1).padStart(2, "0")}-${safeFileName(playlist.name, "playlist")}.json`
  }));
  const cartIndex = savedCarts.map((cart, index) => ({
    id: cart.id,
    name: cart.name,
    savedAt: cart.savedAt,
    file: `${String(index + 1).padStart(2, "0")}-${safeFileName(cart.name, "cart")}.json`
  }));

  await Promise.all([
    writeTextFile(rootDirectory, "README.txt", [
      "Bandkit data home",
      "",
      `Last saved: ${backup.exportedAt}`,
      "",
      "Your data is grouped into Playlists, Carts, Activity, and Settings.",
      "Bandkit does not collect or store bank account details, card numbers, passwords, or Bandcamp cookies.",
      "Bandkit keeps its working copy in Chrome and refreshes this organized folder automatically."
    ].join("\n")),
    writeJsonFile(playlistsDirectory, "now-playing.json", backup?.playlists?.nowPlaying || []),
    writeJsonFile(playlistsDirectory, "index.json", playlistIndex),
    writeJsonFile(cartsDirectory, "current-cart.json", backup?.carts?.current || []),
    writeJsonFile(cartsDirectory, "index.json", cartIndex),
    writeJsonFile(activityDirectory, "activity.json", backup?.activity || []),
    writeJsonFile(settingsDirectory, "settings.json", backup?.settings || {}),
    ...savedPlaylists.map((playlist, index) => writeJsonFile(playlistsDirectory, playlistIndex[index].file, playlist)),
    ...savedCarts.map((cart, index) => writeJsonFile(cartsDirectory, cartIndex[index].file, cart))
  ]);

  return { ok: true, ready: true, folderName: dataHomeFolderName(handle) };
}

export async function writeDataHome(backup) {
  return writeDataHomeToHandle(await getDataDirectoryHandle(), backup);
}
