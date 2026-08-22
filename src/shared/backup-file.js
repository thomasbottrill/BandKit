export const BACKUP_FILENAME = "BandKit Backup.json";
const FORMAT_VERSION = 3;

async function permissionForHandle(handle) {
  if (!handle || handle.kind !== "file") return "missing";
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
}

async function readBackupFile(handle) {
  try {
    return JSON.parse(await (await handle.getFile()).text());
  } catch {
    return null;
  }
}

async function writeBackupFile(handle, value) {
  const writable = await handle.createWritable();
  try {
    await writable.write(`${JSON.stringify(value, null, 2)}\n`);
  } finally {
    await writable.close();
  }
}

function itemTimestamp(item) {
  return Date.parse(item?.modifiedAt || item?.updatedAt || item?.savedAt || "") || 0;
}

function portableLibraryItem(item, kind, updatedAt) {
  return {
    id: String(item?.id || ""),
    name: String(item?.name || (kind === "playlist" ? "Playlist" : "Cart")),
    savedAt: item?.savedAt || updatedAt,
    modifiedAt: item?.modifiedAt || item?.savedAt || updatedAt,
    ...(kind === "cart" ? {
      autoSaved: item?.autoSaved === true,
      sourcePage: item?.sourcePage || "",
      summary: item?.summary || null
    } : {}),
    items: Array.isArray(item?.items) ? item.items : []
  };
}

function normalizeTombstones(value) {
  return (Array.isArray(value) ? value : [])
    .filter((entry) => entry?.id && entry?.deletedAt)
    .map((entry) => ({ id: String(entry.id), deletedAt: entry.deletedAt }));
}

function updatedTombstones(previousItems, currentItems, existingTombstones, exportedAt) {
  const currentIds = new Set(currentItems.map((item) => String(item.id || "")).filter(Boolean));
  const tombstones = new Map(normalizeTombstones(existingTombstones).map((entry) => [entry.id, entry]));
  for (const previous of Array.isArray(previousItems) ? previousItems : []) {
    const id = String(previous?.id || "");
    if (id && !currentIds.has(id) && !tombstones.has(id)) tombstones.set(id, { id, deletedAt: exportedAt });
  }
  for (const id of currentIds) tombstones.delete(id);
  return [...tombstones.values()].slice(-1000);
}

function normalizedBackup(backup, previous = null) {
  const exportedAt = backup?.exportedAt || new Date().toISOString();
  const playlists = (Array.isArray(backup?.playlists?.saved) ? backup.playlists.saved : [])
    .map((item) => portableLibraryItem(item, "playlist", exportedAt))
    .filter((item) => item.id);
  const carts = (Array.isArray(backup?.carts?.saved) ? backup.carts.saved : [])
    .map((item) => portableLibraryItem(item, "cart", exportedAt))
    .filter((item) => item.id);
  return {
    format: "bandkit-backup",
    version: FORMAT_VERSION,
    exportedAt,
    notice: backup?.notice || "Bandkit does not collect or store bank account details, card numbers, passwords, or Bandcamp cookies.",
    playlists: {
      nowPlaying: Array.isArray(backup?.playlists?.nowPlaying) ? backup.playlists.nowPlaying : [],
      saved: playlists
    },
    carts: {
      current: Array.isArray(backup?.carts?.current) ? backup.carts.current : [],
      saved: carts
    },
    deletions: {
      playlists: updatedTombstones(
        previous?.playlists?.saved,
        playlists,
        [...normalizeTombstones(previous?.deletions?.playlists), ...normalizeTombstones(backup?.deletions?.playlists)],
        exportedAt
      ),
      carts: updatedTombstones(
        previous?.carts?.saved,
        carts,
        [...normalizeTombstones(previous?.deletions?.carts), ...normalizeTombstones(backup?.deletions?.carts)],
        exportedAt
      )
    },
    activity: Array.isArray(backup?.activity) ? backup.activity : [],
    settings: backup?.settings && typeof backup.settings === "object" ? backup.settings : {}
  };
}

export async function saveBackupFile(handle, backup) {
  if (!handle || handle.kind !== "file") throw new Error("Choose a backup file first.");
  const permission = await permissionForHandle(handle);
  if (permission !== "granted") throw new Error("Bandkit could not write to the selected backup file.");
  const payload = normalizedBackup(backup, await readBackupFile(handle));
  await writeBackupFile(handle, payload);
  return {
    ok: true,
    playlists: payload.playlists.saved.length,
    carts: payload.carts.saved.length
  };
}

function mergeLibrary(localItems, fileItems, tombstoneEntries) {
  const tombstones = new Map(normalizeTombstones(tombstoneEntries)
    .map((entry) => [entry.id, Date.parse(entry.deletedAt) || 0]));
  const merged = new Map((Array.isArray(localItems) ? localItems : [])
    .filter((item) => item?.id)
    .map((item) => [String(item.id), item]));
  let restored = 0;
  let updated = 0;
  for (const fileItem of Array.isArray(fileItems) ? fileItems : []) {
    const id = String(fileItem?.id || "");
    if (!id || (tombstones.get(id) || 0) >= itemTimestamp(fileItem)) continue;
    const localItem = merged.get(id);
    if (!localItem) {
      merged.set(id, fileItem);
      restored += 1;
    } else if (itemTimestamp(fileItem) > itemTimestamp(localItem)) {
      merged.set(id, fileItem);
      updated += 1;
    }
  }
  return { items: [...merged.values()], restored, updated };
}

export async function restoreBackupFile(handle, state) {
  if (!handle || handle.kind !== "file") throw new Error("Choose a BandKit Backup.json file.");
  const backup = await readBackupFile(handle);
  const recognizable = backup && typeof backup === "object"
    && (backup.format === "bandkit-backup" || backup.format === "bandkit-data-home")
    && backup.playlists && backup.carts;
  if (!recognizable) throw new Error("Bandkit could not read this backup file.");
  const playlists = mergeLibrary(state?.savedPlaylists, backup.playlists.saved, backup.deletions?.playlists);
  const carts = mergeLibrary(state?.savedCarts, backup.carts.saved, backup.deletions?.carts);
  const hasLocalPlaylist = Boolean(state?.playlist?.length);
  const hasLocalCart = Boolean(state?.cart?.length);
  return {
    ok: true,
    state: {
      ...(state || {}),
      playlist: hasLocalPlaylist ? state.playlist : backup.playlists.nowPlaying || [],
      cart: hasLocalCart ? state.cart : backup.carts.current || [],
      savedPlaylists: playlists.items,
      savedCarts: carts.items
    },
    restoredPlaylists: playlists.restored,
    restoredCarts: carts.restored,
    restoredNowPlaying: !hasLocalPlaylist && Boolean(backup.playlists.nowPlaying?.length),
    restoredCurrentCart: !hasLocalCart && Boolean(backup.carts.current?.length),
    updatedPlaylists: playlists.updated,
    updatedCarts: carts.updated
  };
}
