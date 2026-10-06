import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { catalogues } from "../src/i18n/index.ts";

// What a type cannot check, read in the sources (Node runs .ts as is).
atLeast(4);

const src = join(import.meta.dirname, "..", "src");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.tsx?$/u.test(name) ? [join(dir, name)] : []));

test("every language says every text, with the same {placeholders}; French typography", () => {
  checkWords(catalogues);
});

test("the sources: no style={}, no server code in islands, no colour in CSS, known classes, capabilities used and declared, every module tested", () => {
  checkSources({ requireTests: true });
});

// Each Intl object lives outside V8's heap: made per row or per render,
// hundreds of MiB pile up. They are made once, in src/i18n/format.ts.
test("no Intl object is made outside the cached formatters", () => {
  const found = walk(src).filter(file => !file.endsWith(join("i18n", "format.ts"))).flatMap(file =>
    [...readFileSync(file, "utf8").matchAll(/new Intl\.\w+|\.toLocale(?:Date|Time)?String\(|\.localeCompare\([^)]*,/gu)].map(m => `${relative(src, file)}: ${m[0]}`));
  assert.deepEqual(found, []);
});

// An island's props travel in the page's HTML: it gets the words it says,
// never the whole catalogue.
test("no island is given the whole catalogue", () => {
  const found = walk(src).flatMap(file => [...readFileSync(file, "utf8").matchAll(/<Island[^>]*props=\{\{[^}]*\bt\b(?:\s*[,}])/gu)].map(m => `${relative(src, file)}: ${m[0].slice(0, 80)}`));
  assert.deepEqual(found, []);
});
