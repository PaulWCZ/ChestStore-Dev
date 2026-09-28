import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { crc32, ZipWriter } from "../lib/zip.ts";

// Reads an archive back by its central directory, checking each entry's
// local header and CRC: what any unzip does.
export function readZip(bytes: Uint8Array): { name: string; data: Uint8Array; date: number }[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, "end record");
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(at, true), 0x02014b50, "central entry");
    const crc = v.getUint32(at + 16, true), size = v.getUint32(at + 24, true), nameLength = v.getUint16(at + 28, true), offset = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    assert.equal(v.getUint32(offset, true), 0x04034b50, "local header");
    assert.equal(v.getUint32(offset + 14, true), crc);
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    const data = bytes.subarray(start, start + size);
    assert.equal(crc32(data), crc, "crc of " + name);
    out.push({ name, data, date: v.getUint16(offset + 12, true) });
    at += 46 + nameLength;
  }
  return out;
}

const join8 = (parts: Uint8Array[]) => {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return all;
};

test("CRC-32 matches the standard check values", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
  assert.equal(crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog")), 0x414fa339);
});

test("an archive reads back entry by entry, with UTF-8 names and the dates given", () => {
  const zip = new ZipWriter();
  const parts = [
    ...zip.file("2026-09-12_Ines-Moreau_42-50EUR_E1.pdf", new TextEncoder().encode("%PDF-1.4 a")),
    ...zip.file("dépenses.csv", new TextEncoder().encode("a;b\r\n"), new Date("2026-09-30T12:00:00Z")),
    ...zip.file("empty.txt", new Uint8Array()),
    zip.finish(),
  ];
  const bytes = join8(parts);
  const entries = readZip(bytes);
  assert.deepEqual(entries.map(e => e.name), ["2026-09-12_Ines-Moreau_42-50EUR_E1.pdf", "dépenses.csv", "empty.txt"]);
  assert.equal(new TextDecoder().decode(entries[1]!.data), "a;b\r\n");
  assert.equal(entries[1]!.date, ((2026 - 1980) << 9) | (9 << 5) | 30);
  assert.throws(() => zip.file("dépenses.csv", new Uint8Array()));
  assert.throws(() => new ZipWriter().file("../escape", new Uint8Array()));
  // And the system's unzip agrees, when there is one.
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  try {
    writeFileSync(join(dir, "a.zip"), bytes);
    let out = "";
    try {
      out = execFileSync("unzip", ["-t", join(dir, "a.zip")], { encoding: "utf8" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    assert.match(out, /No errors detected/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
