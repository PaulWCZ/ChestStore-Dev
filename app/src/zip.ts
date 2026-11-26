// zipStream(): a .zip written as it is read — files fetched one at a time,
// never the whole archive in memory (a tool has 256 MiB):
//   return new Response(zipStream(entries()), { headers: { "Content-Type": "application/zip",
//     "Content-Disposition": 'attachment; filename="export.zip"' } });
//   async function* entries() {
//     yield { name: "notes.csv", data: csvText };
//     for (const f of list) yield { name: `files/${f.name}`, data: (await files.get(f.name)).data };
//   }
// Stored (not compressed: photos and PDFs are already), UTF-8 names, CRC
// and sizes after each file (data descriptors). Up to 65,535 files and
// 4 GiB in all (no ZIP64): beyond, it throws.
export type ZipEntry = { name: string; data: Uint8Array | string | AsyncIterable<Uint8Array>; modified?: Date };

const table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (crc: number, bytes: Uint8Array) => {
  let c = ~crc >>> 0;
  for (const b of bytes) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
};
// DOS time and date (local fields, as zip readers show them).
function dos(at: Date): [number, number] {
  const year = Math.max(1980, at.getFullYear());
  return [(at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1), ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()];
}
const encoder = new TextEncoder();

export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): ReadableStream<Uint8Array> {
  const central: Uint8Array[] = [];
  let offset = 0;
  let count = 0;
  const iterator = (async function* () {
    for await (const entry of entries as AsyncIterable<ZipEntry>) {
      if (++count > 65535) throw new RangeError("zipStream: more than 65,535 files");
      const name = encoder.encode(entry.name.replace(/^\/+/u, ""));
      if (name.length === 0 || name.length > 65535 || entry.name.split("/").includes("..")) throw new RangeError(`zipStream: a file name: ${entry.name}`);
      const [time, date] = dos(entry.modified ?? new Date());
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0808, true); // sizes after the data; UTF-8 name
      lv.setUint16(8, 0, true); // stored
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      yield local;
      const start = offset;
      offset += local.length;
      let crc = 0;
      let size = 0;
      const parts: AsyncIterable<Uint8Array> | Iterable<Uint8Array> = typeof entry.data === "string" ? [encoder.encode(entry.data)] : entry.data instanceof Uint8Array ? [entry.data] : entry.data;
      for await (const part of parts) {
        crc = crc32(crc, part);
        size += part.byteLength;
        yield part;
      }
      offset += size;
      if (offset > 0xffffffff) throw new RangeError("zipStream: more than 4 GiB");
      const descriptor = new Uint8Array(16);
      const dv = new DataView(descriptor.buffer);
      dv.setUint32(0, 0x08074b50, true);
      dv.setUint32(4, crc, true);
      dv.setUint32(8, size, true);
      dv.setUint32(12, size, true);
      yield descriptor;
      offset += 16;
      const record = new Uint8Array(46 + name.length);
      const cv = new DataView(record.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0808, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, start, true);
      record.set(name, 46);
      central.push(record);
    }
    const directory = central.reduce((n, r) => n + r.length, 0);
    for (const record of central) yield record;
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, count, true);
    ev.setUint16(10, count, true);
    ev.setUint32(12, directory, true);
    ev.setUint32(16, offset, true);
    yield end;
  })();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
}
