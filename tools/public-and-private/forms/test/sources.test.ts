import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { atLeast, checkSources } from "@argentic/chest-app/testing";

atLeast(4);

// The stack's rules, checked on the sources without a server: the
// package's (no style={}, islands without server code, CSS without
// colours, every class defined, each capability declared and used, every
// schedule handled, every rule module tested), and Forms' own.
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the package's rules hold on src/ and chest.json", () => {
  checkSources({ requireTests: true });
});

// The browser gets the islands, the components they draw with, and the
// pure rules both sides share (src/shared/) — never the SDK, src/lib/'s
// server code, the actions or the pages.
test("src/shared/ stays pure: no SDK, no server code", () => {
  for (const file of sources("src/shared")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-sdk/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-app(\/(db|members|testing|vite))?"/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|app)/mu, file);
  }
});

test("no <style> element and no HTML written as text anywhere in the pages", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) {
    const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    assert.doesNotMatch(text, /<style[\s>]/u, file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, file);
    assert.doesNotMatch(text, /\sstyle=\{/u, file);
  }
});

// An Intl object lives outside V8's heap: one made per call (per row of a
// table, per answer of an export) piles up. They are made once, in
// src/shared/format.ts, and kept.
test("Intl objects are made in one place only, and kept", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f) && f !== "src/shared/format.ts")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /new Intl\./u, `${file}: use src/shared/format.ts (cached)`);
  }
});
