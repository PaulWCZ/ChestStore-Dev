import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

// A ZIP archive written as a stream, one entry at a time (PKWARE APPNOTE
// 6.3, the parts every unzip reads): each entry's bytes are asked for only
// when the archive reaches it, so an export of many files never holds more
// than one in memory. Names in UTF-8 (flag 11); text is deflated, files
// already packed (PDF, JPEG, Office) are stored as they are. No ZIP64: an
// archive stops before 65,535 entries or 4 GiB, and the caller says so.
export type Entry = { name: string; date: Date; deflate?: boolean; data: () => Promise<Uint8Array | null> };
export const maxEntries = 65000;
export const maxBytes = 4_000_000_000;

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, d.getUTCFullYear()));
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

// safeName: a path inside the archive that no unzip writes outside its
// folder — no leading slash, no "..", no control or reserved characters.
export function safeName(name: string): string {
  return name
    .split("/")
    .map(part => part.replace(/[\p{Cc}<>:"\\|?*]/gu, "_").replace(/^\.+$/u, "_").trim().slice(0, 120) || "_")
    .join("/");
}

export function zipStream(entries: Entry[]): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let index = 0;
  let count = 0;
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (index < entries.length) {
        const entry = entries[index++]!;
        const raw = await entry.data();
        if (!raw) continue;
        const data = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
        const packed = entry.deflate ? deflateRawSync(data) : data;
        // Past the bounds of a plain ZIP, the archive ends here.
        if (count + 1 >= maxEntries || offset + packed.length + 1024 > maxBytes) {
          index = entries.length;
          break;
        }
        const name = Buffer.from(safeName(entry.name), "utf8");
        const { time, date } = dosTime(entry.date);
        const crc = crc32(data) >>> 0;
        const method = entry.deflate ? 8 : 0;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        const head = Buffer.alloc(46);
        head.writeUInt32LE(0x02014b50, 0);
        head.writeUInt16LE(20, 4);
        head.writeUInt16LE(20, 6);
        head.writeUInt16LE(0x0800, 8);
        head.writeUInt16LE(method, 10);
        head.writeUInt16LE(time, 12);
        head.writeUInt16LE(date, 14);
        head.writeUInt32LE(crc, 16);
        head.writeUInt32LE(packed.length, 20);
        head.writeUInt32LE(data.length, 24);
        head.writeUInt16LE(name.length, 28);
        head.writeUInt32LE(offset, 42);
        central.push(head, name);
        offset += local.length + name.length + packed.length;
        count++;
        controller.enqueue(new Uint8Array(Buffer.concat([local, name, packed])));
        return;
      }
      if (finished) return;
      finished = true;
      const directory = Buffer.concat(central);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(count, 8);
      end.writeUInt16LE(count, 10);
      end.writeUInt32LE(directory.length, 12);
      end.writeUInt32LE(offset, 16);
      controller.enqueue(new Uint8Array(Buffer.concat([directory, end])));
      controller.close();
    },
  });
}

// readZip lists an archive's entries and their bytes (tests, and reading
// small archives): the central directory, then each entry.
export function readZip(bytes: Uint8Array): { name: string; data: Buffer }[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip");
  const total = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("bad directory");
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28), extra = buf.readUInt16LE(at + 30), comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const packed = buf.subarray(start, start + size);
    out.push({ name, data: method === 8 ? inflate(packed) : Buffer.from(packed) });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

const inflate = (b: Buffer) => inflateRawSync(b);
