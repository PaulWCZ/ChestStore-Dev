import { inflateRawSync } from "node:zlib";

// readZip lists an archive's entries and their bytes (the tests read the
// export back): the central directory, then each entry.
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
    out.push({ name, data: method === 8 ? inflateRawSync(packed) : Buffer.from(packed) });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}
