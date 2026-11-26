import { inflateRawSync } from "node:zlib";
import { AppError } from "./errors.ts";

// A small ZIP reader, in memory (the Chest gives no disk), for the imports
// (a Notion or Confluence export is a zip, a Word document too). Only what
// those need: stored and deflated entries, UTF-8 names, no encryption, no
// ZIP64. The wiki writes its own zips as a stream (the package's
// zipStream, src/lib/export.ts).
//
// Bounded against hostile archives and against the tool's memory (256 MiB
// on a Chest): the directory is read first — entries counted, each
// entry's size and the total checked before anything is inflated —, then
// each entry is inflated only when it is read, never all at once (a stored
// one is a view of the archive: no copy). One budget is shared by an
// archive and the archives inside it (a Notion export's zip in a zip): a
// zip-in-zip gets no fresh allowance. Names are only names (no "..", no
// absolute paths).

export const zipLimits = {
  entries: 5000,
  // One entry, inflated: the largest file a page may hold.
  entry: 25 << 20,
  // Every entry of an import, inflated, its archives within archives
  // included (what is declared, checked before inflating).
  total: 96 << 20,
  // An archive inside the archive (Notion's "Part-1.zip"): as large as an
  // import. Stored, it is a view and costs nothing until its own entries
  // are read; compressed, it counts like any entry.
  archive: 60 << 20,
} as const;

// What is left of an import's allowance: shared down the nesting.
export type ZipBudget = { left: number };
export const zipBudget = (): ZipBudget => ({ left: zipLimits.total });

// An entry: its name, its size, and its bytes when read (`data` inflates a
// compressed entry each time it is read: read it once, use it, drop it).
export type ZipEntry = { readonly name: string; readonly size: number; readonly data: Uint8Array };

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

export function readZip(bytes: Uint8Array, wanted: (name: string) => boolean = () => true, budget: ZipBudget = zipBudget()): ZipEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(buf);
  if (end < 0) throw new AppError("import_invalid");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  if (count > zipLimits.entries) throw new AppError("too_many", { max: zipLimits.entries });
  const out: ZipEntry[] = [];
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
    if (method !== 0 && method !== 8) throw new AppError("import_invalid");
    const archive = /\.zip$/iu.test(name);
    if (size > (archive ? zipLimits.archive : zipLimits.entry)) throw new AppError("file_too_large");
    if (!archive || method !== 0) budget.left -= size;
    if (budget.left < 0) throw new AppError("file_too_large");
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new AppError("import_invalid");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + packed > buf.length || (method === 0 && packed !== size)) throw new AppError("import_invalid");
    const raw = buf.subarray(start, start + packed);
    out.push({
      name,
      size,
      get data(): Uint8Array {
        if (method === 0) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
        let data: Buffer;
        try {
          // Never more than the entry says it holds: a bomb stops here.
          data = inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
        } catch {
          throw new AppError("import_invalid");
        }
        if (data.length !== size) throw new AppError("import_invalid");
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      },
    });
  }
  return out;
}
