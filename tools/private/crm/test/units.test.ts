import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { catalogues } from "../src/i18n/index.ts";

// What a type cannot check, read in the sources (Node runs .ts as is).
atLeast(3);
const root = join(import.meta.dirname, "..");

test("every language says every text, with the same {placeholders}; French typography", () => {
  checkWords(catalogues);
});

test("the sources: no style={}, no server code in islands, no colour in CSS, known classes, capabilities used and declared", () => {
  checkSources({ root });
});

// Each Intl object lives outside V8's heap: one made per row of a page
// piles up hundreds of MiB. They are made once, kept, in src/i18n/format.ts.
test("no Intl object is made anywhere but the kept ones of src/i18n/format.ts", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/u.test(name) ? [path] : [];
  });
  const found = walk(join(root, "src")).filter(f => !f.endsWith(join("i18n", "format.ts"))).filter(f => /new Intl\./u.test(readFileSync(f, "utf8"))).map(f => relative(root, f));
  assert.deepEqual(found, []);
});
