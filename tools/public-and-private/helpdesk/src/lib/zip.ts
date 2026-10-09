// A ZIP archive of a few text files, written as it goes: each file is
// deflated while its text is produced, and the archive leaves in pieces, so
// exporting a desk of any size holds a few batches in memory, never the
// whole file. Any operating system opens it. Small and tested; no dependency
// beyond Node's zlib.
// Format: PKWARE APPNOTE 6.3.x — for each file a local header, the deflated
// data, then a data descriptor (flag bit 3: sizes and CRC known only at the
// end); then the central directory. Names in UTF-8 (flag bit 11). No ZIP64:
// a file beyond 4 GiB is refused (a help desk's text is far from it).

import { Readable, pipeline } from "node:stream";
import { createDeflateRaw, crc32 } from "node:zlib";

export type ZipFile = { name: string; text: AsyncIterable<string> | Iterable<string> };

// The date and time of the files, as MS-DOS writes them.
function dos(date: Date): { time: number; day: number } {
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    day: ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

const flags = 0x0808; // bit 3: data descriptor; bit 11: UTF-8 names
const deflated = 8;
const limit = 0xffffffff;

export async function* zipStream(files: ZipFile[], now = new Date()): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const { time, day } = dos(now);
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, flags, true);
    l.setUint16(8, deflated, true);
    l.setUint16(10, time, true);
    l.setUint16(12, day, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    yield local;
    let crc = 0;
    let size = 0;
    let packed = 0;
    const source = Readable.from(
      (async function* () {
        for await (const text of file.text) {
          const bytes = encoder.encode(text);
          crc = crc32(bytes, crc);
          size += bytes.length;
          if (size > limit) throw new Error(`${file.name} is over 4 GiB`);
          yield bytes;
        }
      })(),
    );
    // pipeline() carries an error of the source into the deflater, whose
    // iteration below then throws: a failed export stops, never ends as a
    // valid-looking archive with data missing.
    const deflater = pipeline(source, createDeflateRaw({ level: 6 }), () => {});
    for await (const chunk of deflater as AsyncIterable<Buffer>) {
      packed += chunk.length;
      yield new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length);
    }
    if (packed > limit || offset > limit) throw new Error("the archive is over 4 GiB");
    const descriptor = new Uint8Array(16);
    const d = new DataView(descriptor.buffer);
    d.setUint32(0, 0x08074b50, true);
    d.setUint32(4, crc, true);
    d.setUint32(8, packed, true);
    d.setUint32(12, size, true);
    yield descriptor;
    const entry = new Uint8Array(46 + name.length);
    const c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, flags, true);
    c.setUint16(10, deflated, true);
    c.setUint16(12, time, true);
    c.setUint16(14, day, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, packed, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    offset += local.length + packed + descriptor.length;
  }
  const size = central.reduce((n, e) => n + e.length, 0);
  for (const entry of central) yield entry;
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  yield end;
}
