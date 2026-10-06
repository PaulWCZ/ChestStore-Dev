import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { catalogue, locales } from "../src/i18n/index.ts";

// The stack's rules, checked on the sources without a server: the
// package's (no style={}, islands without server code, CSS without
// colours, every class defined, each capability declared and used, the
// schedule handled, every src/lib/ module tested), and Timesheets' own.
atLeast(5);
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the package's rules hold on src/ and chest.json", () => {
  checkSources({ requireTests: true });
});

test("every language says every text, with the same {placeholders}; French typography", () => {
  checkWords(Object.fromEntries(locales.map(l => [l, catalogue(l)])));
});

// The browser gets the islands, the components they draw with, and the
// pure rules both sides share (src/shared/: durations, amounts, days, the
// model's bounds, the import's formats) — never the SDK, src/lib/, the
// actions, the pages or the package's server side.
test("src/shared/ stays pure: no SDK, no server code, no package server side", () => {
  for (const file of sources("src/shared")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-(sdk|app"|app\/(db|members|testing|vite))/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|theme|app|calls|downloads)/mu, file);
  }
});

// An Intl object lives outside V8's heap: one made per call (per row of a
// report, per cell of a week) piles up. They are made once, in
// src/i18n/format.ts (and src/shared/days.ts' clock of a zone), and kept.
test("Intl objects are made in one place only, and kept", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f) && f !== "src/i18n/format.ts" && f !== "src/shared/days.ts")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /new Intl\./u, `${file}: use src/i18n/format.ts (cached)`);
  }
});

test("no <style> element, no HTML written as text, no Next.js left", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f))) {
    const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    assert.doesNotMatch(text, /<style[\s>]/u, file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, file);
    assert.doesNotMatch(text, /from "next|"use (client|server)"/u, file);
  }
});
