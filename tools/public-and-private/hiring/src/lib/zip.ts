import { crc32, deflateRawSync } from "node:zlib";

// A ZIP archive written as a stream (PKWARE APPNOTE 6.3.x, the common
// subset every system opens): each file compressed (deflate) or stored,
// UTF-8 names, one entry after the other, the central directory at the
// end. Entries come one at a time from a generator, so an export of every
// CV holds one CV in memory at once, never all of them. No dependency.

export type Entry = { name: string; data: Uint8Array; date?: Date };

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// A name inside the archive: no leading slash, no "..", no backslash.
export function entryName(name: string): string {
  return name.replace(/\\/gu, "/").split("/").filter(p => p !== "" && p !== "." && p !== "..").join("/").slice(0, 250) || "file";
}

export function zipStream(entries: AsyncIterable<Entry> | Iterable<Entry>): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let count = 0;
  const iterator = (Symbol.asyncIterator in entries ? (entries as AsyncIterable<Entry>)[Symbol.asyncIterator]() : (async function* () { yield* entries as Iterable<Entry>; })());
  let done = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) return;
      const next = await iterator.next();
      if (next.done) {
        const directory = Buffer.concat(central);
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(count, 8);
        end.writeUInt16LE(count, 10);
        end.writeUInt32LE(directory.length, 12);
        end.writeUInt32LE(offset, 16);
        controller.enqueue(new Uint8Array(Buffer.concat([directory, end])));
        controller.close();
        done = true;
        return;
      }
      const { name, data, date = new Date() } = next.value;
      const fileName = Buffer.from(entryName(name), "utf8");
      const packed = deflateRawSync(data);
      const store = packed.length >= data.length;
      const body = store ? Buffer.from(data) : packed;
      const crc = crc32(data);
      const { time, date: day } = dosTime(date);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6); // UTF-8 names
      local.writeUInt16LE(store ? 0 : 8, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(day, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(fileName.length, 26);
      const head = Buffer.alloc(46);
      head.writeUInt32LE(0x02014b50, 0);
      head.writeUInt16LE(20, 4);
      head.writeUInt16LE(20, 6);
      head.writeUInt16LE(0x0800, 8);
      head.writeUInt16LE(store ? 0 : 8, 10);
      head.writeUInt16LE(time, 12);
      head.writeUInt16LE(day, 14);
      head.writeUInt32LE(crc, 16);
      head.writeUInt32LE(body.length, 20);
      head.writeUInt32LE(data.length, 24);
      head.writeUInt16LE(fileName.length, 28);
      head.writeUInt32LE(offset, 42);
      central.push(head, fileName);
      const chunk = Buffer.concat([local, fileName, body]);
      offset += chunk.length;
      count++;
      if (count > 65535 || offset > 0xffffffff) throw new Error("archive too large");
      controller.enqueue(new Uint8Array(chunk));
    },
  });
}

// readZip lists the files of a small archive (a test reads what the tool
// wrote): names and contents.
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const { inflateRawSync } = await import("node:zlib");
  const b = Buffer.from(bytes);
  const out = new Map<string, Uint8Array>();
  let at = 0;
  while (b.readUInt32LE(at) === 0x04034b50) {
    const method = b.readUInt16LE(at + 8), size = b.readUInt32LE(at + 18), nameLength = b.readUInt16LE(at + 26), extra = b.readUInt16LE(at + 28);
    const name = b.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extra;
    const body = b.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(body) : body);
    at = start + size;
  }
  return out;
}
