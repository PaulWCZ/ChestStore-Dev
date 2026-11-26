import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { atLeast, checkSources } from "@argentic/chest-app/testing";
import { teamOrigin } from "../src/lib/origin.ts";

atLeast(5);

// The stack's rules, checked on the sources without a server: the
// package's (no style={}, islands without server code, CSS without
// colours, every class defined, each capability declared and used, every
// schedule handled, every rule module tested), and Equipment's own.
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the package's rules hold on src/ and chest.json", () => {
  checkSources({ requireTests: true });
});

// The browser gets the islands, the components they draw with, and the
// pure rules both sides share (src/shared/) — never the SDK, src/lib/,
// the actions, the pages or the package's server side.
test("src/shared/ stays pure: no SDK, no server code", () => {
  for (const file of sources("src/shared")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-sdk/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-app(\/(db|members|testing|vite))?"/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|theme|app)/mu, file);
  }
});

test("no <style> element and no HTML written as text anywhere in the pages", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) {
    const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    assert.doesNotMatch(text, /<style[\s>]/u, file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, file);
  }
});

// An Intl object lives outside V8's heap: one made per call (per row of a
// page) piles up. They are made once, in src/i18n/format.ts, and kept.
test("Intl objects are made in one place only, and kept", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f) && f !== "src/i18n/format.ts")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /new Intl\./u, `${file}: use src/i18n/format.ts (cached)`);
    assert.doesNotMatch(readFileSync(file, "utf8"), /localeCompare\([^)]*,/u, `${file}: compareText() (a kept collator)`);
  }
});

test("links that leave the page name the Chest's team host, else the host asked", () => {
  // Outside a Chest (no fake here): the request's own origin.
  assert.equal(teamOrigin(new Request("https://equipment.example/chest/labels")), "https://equipment.example");
});
