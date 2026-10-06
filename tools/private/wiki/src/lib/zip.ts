import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { AppError } from "./errors.ts";

// A small ZIP reader and writer, in memory (the Chest gives no disk), for
// the imports (a Notion export is a zip) and the exports (a space as
// Markdown files). Only what those need: stored and deflated entries, UTF-8
// names, no encryption, no ZIP64. The reader is bounded against hostile
// archives: entries, sizes and the total are capped before anything is
// inflated, names are only names (no "..", no absolute paths).

export const zipLimits = {
  entries: 5000,
  entry: 32 << 20,
  total: 256 << 20,
} as const;

export type ZipEntry = { name: string; data: Uint8Array };

function findEnd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

// cleanName keeps a safe relative path, or null for what is not a file.
export function cleanName(raw: string): string | null {
  const parts = raw.replace(/\\/gu, "/").split("/").filter(p => p !== "" && p !== ".");
  if (parts.length === 0 || parts.some(p => p === ".." || /\p{Cc}/u.test(p))) return null;
  if (parts[0] === "__MACOSX" || parts.at(-1)!.startsWith("._") || parts.at(-1) === ".DS_Store") return null;
  return parts.join("/");
}

export function readZip(bytes: Uint8Array, wanted: (name: string) => boolean = () => true): ZipEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(buf);
  if (end < 0) throw new AppError("import_invalid");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  if (count > zipLimits.entries) throw new AppError("too_many", { max: zipLimits.entries });
  const out: ZipEntry[] = [];
  let total = 0;
  for (let k = 0; k < count; k++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new AppError("import_invalid");
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const packed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const rawName = buf.subarray(at + 46, at + 46 + nameLength).toString((flags & 0x800) !== 0 ? "utf8" : "latin1");
    at += 46 + nameLength + extra + comment;
    const name = cleanName(rawName);
    if (name === null || rawName.endsWith("/") || !wanted(name)) continue;
    if ((flags & 0x1) !== 0) throw new AppError("import_invalid");
    if (size > zipLimits.entry) throw new AppError("file_too_large");
    total += size;
    if (total > zipLimits.total) throw new AppError("file_too_large");
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new AppError("import_invalid");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + packed > buf.length) throw new AppError("import_invalid");
    const raw = buf.subarray(start, start + packed);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        // Never more than the entry says it holds: a bomb stops here.
        data = inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
      } catch {
        throw new AppError("import_invalid");
      }
    } else throw new AppError("import_invalid");
    if (data.length !== size) throw new AppError("import_invalid");
    out.push({ name, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) });
  }
  return out;
}

function dosTime(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function writeZip(entries: { name: string; data: Uint8Array | string }[], now = new Date()): Uint8Array<ArrayBuffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const { time, day } = dosTime(now);
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    const packed = deflateRawSync(data);
    const store = packed.length >= data.length;
    const body = store ? data : packed;
    const sum = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(day, 12);
    head.writeUInt32LE(sum, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(head, name, body);
    centrals.push(central, name);
    offset += head.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, directory, end]);
  return new Uint8Array(all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer);
}
