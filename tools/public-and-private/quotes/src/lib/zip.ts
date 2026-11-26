// A minimal ZIP writer: "stored" entries (no compression — receipts are
// JPEG and PDF, already compressed), written one after the other so an
// archive streams out with only one file in memory at a time. Written for
// this tool (no dependency): PKWARE APPNOTE 6.3.x, local headers with the
// CRC-32 and sizes known (no data descriptor), UTF-8 names (flag 11), no
// ZIP64 — so at most 65,535 entries and 4 GiB, which the callers bound far
// below (lib/model.ts limits).

const table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// CRC-32 (IEEE 802.3, the one ZIP uses).
export function crc32(data: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// MS-DOS date and time, as ZIP records them (local time of the values given).
function dos(date: Date): { time: number; day: number } {
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

type Entry = { name: Uint8Array; crc: number; size: number; offset: number; time: number; day: number };

export class ZipWriter {
  private entries: Entry[] = [];
  private offset = 0;
  private names = new Set<string>();

  // The bytes of one file: its local header, then its data.
  file(name: string, data: Uint8Array, date = new Date()): Uint8Array[] {
    if (this.entries.length >= 65535) throw new Error("zip: too many entries");
    if (!name || name.startsWith("/") || name.split("/").includes("..") || this.names.has(name)) throw new Error("zip: bad or repeated name");
    this.names.add(name);
    const encoded = new TextEncoder().encode(name);
    const { time, day } = dos(date);
    const crc = crc32(data);
    const header = new Uint8Array(30 + encoded.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // version needed: 2.0
    v.setUint16(6, 0x0800, true); // UTF-8 names
    v.setUint16(8, 0, true); // stored
    v.setUint16(10, time, true);
    v.setUint16(12, day, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, encoded.length, true);
    v.setUint16(28, 0, true);
    header.set(encoded, 30);
    this.entries.push({ name: encoded, crc, size: data.length, offset: this.offset, time, day });
    this.offset += header.length + data.length;
    if (this.offset > 0xffffffff) throw new Error("zip: over 4 GiB");
    return [header, data];
  }

  // The central directory and its end record: the last bytes.
  finish(): Uint8Array {
    const size = this.entries.reduce((s, e) => s + 46 + e.name.length, 0);
    const out = new Uint8Array(size + 22);
    const v = new DataView(out.buffer);
    let at = 0;
    for (const e of this.entries) {
      v.setUint32(at, 0x02014b50, true);
      v.setUint16(at + 4, 20, true); // made by: 2.0
      v.setUint16(at + 6, 20, true);
      v.setUint16(at + 8, 0x0800, true);
      v.setUint16(at + 10, 0, true);
      v.setUint16(at + 12, e.time, true);
      v.setUint16(at + 14, e.day, true);
      v.setUint32(at + 16, e.crc, true);
      v.setUint32(at + 20, e.size, true);
      v.setUint32(at + 24, e.size, true);
      v.setUint16(at + 28, e.name.length, true);
      // extra, comment, disk, internal and external attributes: 0
      v.setUint32(at + 42, e.offset, true);
      out.set(e.name, at + 46);
      at += 46 + e.name.length;
    }
    v.setUint32(at, 0x06054b50, true);
    v.setUint16(at + 8, this.entries.length, true);
    v.setUint16(at + 10, this.entries.length, true);
    v.setUint32(at + 12, size, true);
    v.setUint32(at + 16, this.offset, true);
    return out;
  }
}
