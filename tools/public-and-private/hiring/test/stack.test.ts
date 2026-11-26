import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { all } from "../src/i18n/index.ts";

atLeast(5);

// The stack's rules, checked on the sources without a server: the
// package's (no style={}, islands without server code, CSS without
// colours, every class defined, each capability declared and used, every
// schedule handled, every rule module tested), and Hiring's own.
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the package's rules hold on src/ and chest.json", () => {
  checkSources({ requireTests: true });
});

test("every language says every text, with the same {placeholders}; French typography", () => {
  checkWords(all);
});

// The browser gets the islands, the components they draw with, and the
// pure rules both sides share (src/shared/) — never the SDK, src/lib/,
// the actions, the pages or the package's server side.
test("src/shared/ and src/components/ stay pure: no SDK, no server code", () => {
  for (const file of [...sources("src/shared"), ...sources("src/components")]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-sdk/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-app(\/(db|members|testing|vite))?"/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|theme|app)/mu, file);
  }
});

// No <style> element and no HTML written as text — but the one data
// block a careers job page carries for search engines (JSON-LD, never run:
// the policy applies to scripts a browser runs), escaped by src/lib/reach.ts.
test("no <style> element and no HTML written as text, but the job's JSON-LD", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) {
    const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    assert.doesNotMatch(text, /<style[\s>]/u, file);
    const raw = [...text.matchAll(/dangerouslySetInnerHTML/gu)].length;
    assert.equal(raw, file === "src/pages/careers.tsx" ? 1 : 0, file);
  }
  assert.match(readFileSync("src/pages/careers.tsx", "utf8"), /<script type="application\/ld\+json" dangerouslySetInnerHTML=\{\{ __html: posting \}\} \/>/u);
});

// An Intl object lives outside V8's heap: one made per call (per row of a
// page, per free time of an interview) piles up. They are made once, in
// src/shared/format.ts, and kept.
test("Intl objects are made in one place only, and kept", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f) && f !== "src/shared/format.ts")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /new Intl\./u, `${file}: use src/shared/format.ts (kept)`);
    assert.doesNotMatch(text, /localeCompare\(|toLocale(Date|Time)?String\(/u, `${file}: a kept collator or formatter`);
  }
});
