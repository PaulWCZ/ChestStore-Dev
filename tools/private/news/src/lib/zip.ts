import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
// Copied from the studio's Wiki tool (same licence, MIT, © 2026 Argentic).
import { AppError } from "@argentic/chest-app";

// A small ZIP reader (in memory: the Chest gives no disk) and a streaming
// writer, for the Slack import and "Download all posts". Only what those need: stored and deflated entries, UTF-8
// names, no encryption, no ZIP64. The reader is bounded against hostile
// archives: entries, sizes and the total are capped before anything is
// inflated, names are only names (no "..", no absolute paths).

// What an archive may hold, inflated: a Slack export is JSON text (a
// channel's year is a few MiB). Read in a tool's 256 MiB, beside the
// archive itself (50 MiB at most).
export const zipLimits = {
  entries: 5000,
  entry: 32 << 20,
  total: 64 << 20,
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
  if (end < 0) throw new AppError("not_export");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  if (count > zipLimits.entries) throw new AppError("too_many", { max: zipLimits.entries });
  const out: ZipEntry[] = [];
  let total = 0;
  for (let k = 0; k < count; k++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new AppError("not_export");
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
    if ((flags & 0x1) !== 0) throw new AppError("not_export");
    if (size > zipLimits.entry) throw new AppError("file_too_large");
    total += size;
    if (total > zipLimits.total) throw new AppError("file_too_large");
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new AppError("not_export");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + packed > buf.length) throw new AppError("not_export");
    const raw = buf.subarray(start, start + packed);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        // Never more than the entry says it holds: a bomb stops here.
        data = inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
      } catch {
        throw new AppError("not_export");
      }
    } else throw new AppError("not_export");
    if (data.length !== size) throw new AppError("not_export");
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

// A ZIP written as it goes: each entry is compressed and handed to
// `write` at once, only the central directory (a few dozen bytes an entry)
// is kept until finish(). An export of hundreds of MiB of files passes
// through one file at a time, never held whole (a tool has 256 MiB).
export class ZipWriter {
  private readonly centrals: Buffer[] = [];
  private offset = 0;
  private count = 0;
  private readonly time: number;
  private readonly day: number;
  private readonly write: (chunk: Uint8Array) => Promise<void> | void;
  constructor(write: (chunk: Uint8Array) => Promise<void> | void, now = new Date()) {
    this.write = write;
    ({ time: this.time, day: this.day } = dosTime(now));
  }

  // stored: kept as it is, not compressed — a picture, a video, a PDF is
  // compressed already (compressing it again costs a copy of it in memory
  // and time, for nothing).
  async add(entryName: string, content: Uint8Array | string, { stored = false }: { stored?: boolean } = {}): Promise<void> {
    const name = Buffer.from(entryName, "utf8");
    const data = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content.buffer, content.byteOffset, content.byteLength);
    const packed = stored ? data : deflateRawSync(data);
    const store = stored || packed.length >= data.length;
    const body = store ? data : packed;
    const sum = crc32(data);
    if (this.offset + 30 + name.length + body.length > 0xffffffff || this.count >= 0xffff) throw new AppError("file_too_large");
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt16LE(this.time, 10);
    head.writeUInt16LE(this.day, 12);
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
    central.writeUInt16LE(this.time, 12);
    central.writeUInt16LE(this.day, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(this.offset, 42);
    this.centrals.push(central, name);
    this.count++;
    this.offset += head.length + name.length + body.length;
    await this.write(head);
    await this.write(name);
    await this.write(body);
  }

  async finish(): Promise<void> {
    const directory = Buffer.concat(this.centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.count, 8);
    end.writeUInt16LE(this.count, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(this.offset, 16);
    await this.write(directory);
    await this.write(end);
  }
}

// The same, whole, in memory: for small archives (tests).
export async function zipped(entries: { name: string; data: Uint8Array | string }[], now = new Date()): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter(chunk => { chunks.push(chunk); }, now);
  for (const e of entries) await zip.add(e.name, e.data);
  await zip.finish();
  const all = Buffer.concat(chunks);
  return new Uint8Array(all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer);
}
