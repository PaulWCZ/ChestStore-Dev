import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { checkSources } from "@argentic/chest-app/testing";

// The stack's rules, checked on the sources without a server: the
// package's (no style={}, islands without server code, CSS without
// colours, every class defined, each capability declared and used, every
// schedule handled), and News's own about src/shared/.
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the package's rules hold on src/ and chest.json", () => {
  checkSources();
});

// The browser gets the islands, the components they draw with, and the
// pure rules both sides share (src/shared/: the text's marks, the
// editor's document, the model's bounds) — never the SDK, src/lib/, the
// actions, the pages, the theme or the package's server side.
test("src/shared/ stays pure: no SDK, no server code, no package server side", () => {
  for (const file of sources("src/shared")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-(sdk|app)/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|theme|app|calls)/mu, file);
  }
});

test("no <style> element and no HTML written as text anywhere in the pages", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) {
    const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    assert.doesNotMatch(text, /<style[\s>]/u, file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, file);
  }
});
