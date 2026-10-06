import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { atLeast, checkSources } from "@argentic/chest-app/testing";

// The stack's rules, checked on the sources without a server: the
// package's (no style={}, islands without server code, CSS without
// colours, every class defined, each capability declared and used, every
// schedule handled), and the wiki's own about src/shared/ and the page's
// HTML.
atLeast(3);
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the package's rules hold on src/ and chest.json", () => {
  checkSources({ requireTests: true });
});

// The browser gets the islands, the components they draw with, and the
// pure rules both sides share (src/shared/: the links and pictures a page
// may hold, the bounds, the editor's timings) — never the SDK, src/lib/,
// the actions, the pages, the theme or the package's server side.
test("src/shared/ stays pure: no SDK, no server code, no package server side", () => {
  for (const file of sources("src/shared")) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-(sdk|app)/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|theme|app|calls|frame)/mu, file);
  }
});

// A page's text is HTML the server wrote from the checked document
// (src/lib/render.ts): put in as it is in one component only.
test("no <style> element, and HTML put in as it is only by src/components/prose.tsx", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) {
    const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    assert.doesNotMatch(text, /<style[\s>]/u, file);
    if (!file.endsWith("components/prose.tsx")) assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, file);
  }
});
