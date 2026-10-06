import { inflateSync } from "node:zlib";

// The company's logo, read once when it is uploaded and again when a PDF
// prints it: a JPEG (kept as it is: PDF reads JPEG) or a PNG (decoded to
// its pixels, with its transparency as a soft mask). Written for this tool
// from the PNG specification (W3C, 2003) and JPEG's frame headers (ITU
// T.81); nothing else is accepted.

export type Image = {
  format: "jpeg" | "raw";
  width: number;
  height: number;
  colorSpace: "DeviceRGB" | "DeviceGray" | "DeviceCMYK";
  // JPEG: the file; raw: the pixels, 8 bits per component, row after row.
  data: Uint8Array;
  // raw: the opacity of each pixel (8 bits), when the PNG has any.
  alpha?: Uint8Array;
  adobeInverted?: boolean;
};

const maxSide = 4000;

export class ImageError extends Error {}

export function readImage(bytes: Uint8Array): Image {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
  if (bytes.length > 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return readPng(bytes);
  throw new ImageError("not a PNG or JPEG");
}

function readJpeg(bytes: Uint8Array): Image {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  let adobe = false;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) throw new ImageError("bad JPEG marker");
    const marker = bytes[at + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = v.getUint16(at + 2);
    if (marker === 0xee && length >= 12 && Buffer.from(bytes.subarray(at + 4, at + 9)).toString("latin1") === "Adobe") adobe = true;
    // Start of frame (baseline, progressive…), not DHT (c4), JPG (c8), DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const precision = bytes[at + 4]!;
      const height = v.getUint16(at + 5);
      const width = v.getUint16(at + 7);
      const components = bytes[at + 9]!;
      if (precision !== 8 || width < 1 || height < 1 || width > maxSide || height > maxSide) throw new ImageError("unsupported JPEG size");
      const colorSpace = components === 1 ? "DeviceGray" : components === 3 ? "DeviceRGB" : components === 4 ? "DeviceCMYK" : null;
      if (!colorSpace) throw new ImageError("unsupported JPEG colours");
      return { format: "jpeg", width, height, colorSpace, data: bytes, adobeInverted: adobe };
    }
    at += 2 + length;
  }
  throw new ImageError("JPEG without a frame");
}

function readPng(bytes: Uint8Array): Image {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0, height = 0, depth = 0, type = -1, interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = v.getUint32(at);
    const kind = Buffer.from(bytes.subarray(at + 4, at + 8)).toString("latin1");
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (data.length !== length) throw new ImageError("truncated PNG");
    if (kind === "IHDR") {
      width = v.getUint32(at + 8);
      height = v.getUint32(at + 12);
      depth = data[8]!;
      type = data[9]!;
      interlace = data[12]!;
    } else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") transparency = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    at += 12 + length;
  }
  if (width < 1 || height < 1 || width > maxSide || height > maxSide) throw new ImageError("unsupported PNG size");
  if (depth !== 8 || interlace !== 0 || ![0, 2, 3, 4, 6].includes(type)) throw new ImageError("unsupported PNG kind");
  if (type === 3 && !palette) throw new ImageError("PNG without its palette");
  const channels = type === 0 ? 1 : type === 2 ? 3 : type === 3 ? 1 : type === 4 ? 2 : 4;
  const raw = inflateSync(Buffer.concat(idat.map(d => Buffer.from(d))), { maxOutputLength: (width * channels + 1) * height + 1 });
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new ImageError("truncated PNG data");
  const pixels = new Uint8Array(stride * height);
  // Undo each row's filter (none, sub, up, average, Paeth).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = y * stride;
    const source = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[row + x - channels]! : 0;
      const b = y > 0 ? pixels[row - stride + x]! : 0;
      const c = x >= channels && y > 0 ? pixels[row - stride + x - channels]! : 0;
      const value = raw[source + x]!;
      let out: number;
      if (filter === 0) out = value;
      else if (filter === 1) out = value + a;
      else if (filter === 2) out = value + b;
      else if (filter === 3) out = value + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        out = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new ImageError("bad PNG filter");
      pixels[row + x] = out & 0xff;
    }
  }
  const count = width * height;
  if (type === 0 || type === 2) {
    return { format: "raw", width, height, colorSpace: type === 0 ? "DeviceGray" : "DeviceRGB", data: pixels };
  }
  if (type === 4 || type === 6) {
    const colours = type === 4 ? 1 : 3;
    const colour = new Uint8Array(count * colours);
    const alpha = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < colours; k++) colour[i * colours + k] = pixels[i * (colours + 1) + k]!;
      alpha[i] = pixels[i * (colours + 1) + colours]!;
    }
    return { format: "raw", width, height, colorSpace: type === 4 ? "DeviceGray" : "DeviceRGB", data: colour, ...(alpha.some(a => a !== 255) ? { alpha } : {}) };
  }
  // A palette: each index becomes its colour, and its opacity (tRNS).
  const rgb = new Uint8Array(count * 3);
  const alpha = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const index = pixels[i]!;
    rgb[i * 3] = palette![index * 3] ?? 0;
    rgb[i * 3 + 1] = palette![index * 3 + 1] ?? 0;
    rgb[i * 3 + 2] = palette![index * 3 + 2] ?? 0;
    alpha[i] = transparency && index < transparency.length ? transparency[index]! : 255;
  }
  return { format: "raw", width, height, colorSpace: "DeviceRGB", data: rgb, ...(alpha.some(a => a !== 255) ? { alpha } : {}) };
}
