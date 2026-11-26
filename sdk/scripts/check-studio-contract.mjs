#!/usr/bin/env node
// The studio's run of 0.7.0's scripts/contract.mjs --check (beside this
// file, verbatim). 0.7.0's script also checks that check/package.json is
// the SDK's own version ("both are released together"); the studio's
// package is 0.7.0-studio.N while check/ is 0.7.0's, byte for byte. So this
// runs the official script, unchanged, on a copy of what it reads —
// scripts/contract.mjs, contract/, check/package.json — with package.json
// at the release the studio is built on (0.7.0: the version without its
// -studio.N), and nothing else differs.
//
//   node scripts/check-studio-contract.mjs
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const release = /^(\d+\.\d+\.\d+)-studio\.\d+$/u.exec(version)?.[1];
if (!release) throw new Error(`package.json ${version} is not a studio version (X.Y.Z-studio.N)`);
const work = mkdtempSync(join(tmpdir(), "chest-studio-contract-"));
try {
  for (const path of ["scripts/contract.mjs", "contract", "check/package.json"]) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    cpSync(join(root, path), join(work, path), { recursive: true });
  }
  writeFileSync(join(work, "package.json"), JSON.stringify({ version: release }));
  execFileSync(process.execPath, [join(work, "scripts", "contract.mjs"), "--check"], { stdio: "inherit" });
} finally {
  rmSync(work, { recursive: true, force: true });
}
