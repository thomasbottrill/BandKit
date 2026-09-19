const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function pngDimensions(bytes) {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((value, i) => bytes[i] === value)
    || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") throw new Error("That file is not a valid PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096) throw new Error("Use a PNG no larger than 4096 × 4096 pixels.");
  return { width, height };
}

export function alphaBounds(pixels, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function normalizePngHandle(value) {
  if (typeof value?.png !== "string" || value.png.length > 128 * 1024
    || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.png)) return null;
  try {
    const header = Uint8Array.from(globalThis.atob(value.png.slice(22, 54)), (char) => char.charCodeAt(0));
    const { width, height } = pngDimensions(header);
    if (width > 128 || height > 128) return null;
    return { name: String(value.name || "Custom.png").slice(0, 120), png: value.png };
  } catch { return null; }
}

export async function importPngHandle(file) {
  if (file.size > 4 * 1024 * 1024) throw new Error("Choose a PNG smaller than 4 MB.");
  pngDimensions(new Uint8Array(await file.slice(0, 24).arrayBuffer()));
  const bitmap = await window.createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const bounds = alphaBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (!bounds) throw new Error("This PNG is fully transparent. Choose an image containing a visible icon.");
    const output = document.createElement("canvas");
    output.width = 128; output.height = 128;
    const target = output.getContext("2d");
    const scale = 110 / Math.max(bounds.width, bounds.height);
    const width = bounds.width * scale, height = bounds.height * scale;
    target.drawImage(canvas, bounds.left, bounds.top, bounds.width, bounds.height, (128 - width) / 2, (128 - height) / 2, width, height);
    // Preserve the original RGB and alpha. Only the separate outline uses
    // this image as a silhouette; the foreground displays the actual PNG.
    return { name: file.name.slice(0, 120), png: output.toDataURL("image/png") };
  } finally { bitmap.close(); }
}
