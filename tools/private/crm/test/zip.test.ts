import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { crc32, zip } from "../lib/zip.ts";

// The whole-book export is a ZIP any system opens: checked against the
// standard CRC-32 and, when the system has it, unzip itself.
test("a ZIP of text files: standard CRC-32, UTF-8 names, read back by unzip", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const bytes = zip([{ name: "companies.csv", text: "id,name\r\n1,Société Générale\r\n" }, { name: "notes-é.csv", text: "" }], new Date("2026-09-29T10:00:00Z"));
  const dir = mkdtempSync(join(tmpdir(), "crm-zip-"));
  try {
    writeFileSync(join(dir, "a.zip"), bytes);
    let unzip = true;
    try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); } catch { unzip = false; }
    if (unzip) {
      execFileSync("unzip", ["-q", "-o", join(dir, "a.zip"), "-d", join(dir, "out")]);
      assert.equal(readFileSync(join(dir, "out", "companies.csv"), "utf8"), "id,name\r\n1,Société Générale\r\n");
      assert.equal(readFileSync(join(dir, "out", "notes-é.csv"), "utf8"), "");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
