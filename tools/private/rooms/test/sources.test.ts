import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { catalogue, locales } from "../src/i18n/index.ts";

// The package's checks of a tool's sources: no style={}, no server code in
// an island or a shared component, no colour in the CSS, no class defined
// nowhere, each capability declared and used, every src/lib/ module
// tested; every word in every language, with its placeholders and French
// typography; and no Intl object made outside the cached formatters.
atLeast(3);

test("the sources keep the package's rules", () => {
  checkSources({ requireTests: true });
});

test("every language says every text", () => {
  checkWords(Object.fromEntries(locales.map(l => [l, catalogue(l)])));
});

// An Intl object lives outside V8's heap: one made per desk, per quarter
// hour or per row piles up hundreds of MiB before a GC frees them. They
// are made once per language, zone and style in src/i18n/format.ts (and
// the zone reader of imported calendars, src/lib/wall-clock.ts, keeps its
// own per zone) — nowhere else.
test("no Intl object is made outside the cached formatters", () => {
  const root = join(import.meta.dirname, "..", "src");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/u.test(name) ? [path] : [];
  });
  const allowed = new Set(["i18n/format.ts", "lib/wall-clock.ts"]);
  const found = walk(root).filter(file => !allowed.has(relative(root, file))).flatMap(file =>
    [...readFileSync(file, "utf8").matchAll(/new Intl\.\w+/gu)].map(m => `${relative(root, file)}: ${m[0]}`));
  assert.deepEqual(found, []);
});
