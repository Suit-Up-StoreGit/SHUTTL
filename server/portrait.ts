// Accept one bounded, static WebP image chunk. EXIF/XMP/animation containers
// are intentionally rejected; the browser upload is flattened before sending.
export function safePortrait(bytes: Buffer) {
  if (
    bytes.length < 30 ||
    bytes.length > 44000 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    return false;
  const kind = bytes.toString("ascii", 12, 16),
    size = bytes.readUInt32LE(16);
  if (20 + size + (size % 2) !== bytes.length) return false;
  let width: number, height: number;
  if (kind === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 1 || bytes[25] !== 0x2a)
      return false;
    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  } else if (kind === "VP8L") {
    if (bytes[20] !== 0x2f) return false;
    const bits = bytes.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else return false;
  return width > 0 && height > 0 && width <= 256 && height <= 256;
}
export function sanitizePortrait(bytes: Buffer): Buffer | null {
  if (safePortrait(bytes)) return bytes;
  if (
    bytes.length < 30 ||
    bytes.length > 44000 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    return null;
  let raster: Buffer | null = null,
    extended = false,
    profile = false;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) return null;
    const kind = bytes.toString("ascii", offset, offset + 4),
      size = bytes.readUInt32LE(offset + 4),
      end = offset + 8 + size + (size % 2);
    if (end > bytes.length) return null;
    if (kind === "VP8X") {
      if (
        extended ||
        offset !== 12 ||
        size !== 10 ||
        (bytes[offset + 8] & ~0x20) !== 0 ||
        bytes.readUIntLE(offset + 12, 3) + 1 > 256 ||
        bytes.readUIntLE(offset + 15, 3) + 1 > 256
      )
        return null;
      extended = true;
    } else if (kind === "ICCP") {
      if (!extended || profile || size > 8192) return null;
      profile = true;
    } else if (kind === "VP8 " || kind === "VP8L") {
      if (raster) return null;
      raster = bytes.subarray(offset, end);
    } else return null;
    offset = end;
  }
  if (!raster) return null;
  const header = Buffer.alloc(12);
  header.write("RIFF", 0);
  header.writeUInt32LE(4 + raster.length, 4);
  header.write("WEBP", 8);
  const clean = Buffer.concat([header, raster]);
  return safePortrait(clean) ? clean : null;
}
