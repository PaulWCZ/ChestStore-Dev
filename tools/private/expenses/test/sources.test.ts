import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { atLeast, checkSources } from "@argentic/chest-app/testing";

// The package's checks of a tool's sources — no style={}, no server code in
// an island or a shared component, no colour in the CSS, no class defined
// nowhere, each capability declared and used, every module of src/lib/
// tested — and the tool's own.
atLeast(2);
const root = join(import.meta.dirname, "..");

test("the sources keep the package's rules", () => {
  checkSources({ requireTests: true });
});

// Intl objects live outside V8's heap: one made per row or per render piles
// up hundreds of MiB. They are made once, in src/i18n/format.ts only.
test("no Intl object is made outside src/i18n/format.ts", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/u.test(name) ? [path] : [];
  });
  const found = walk(join(root, "src"))
    .filter(file => relative(root, file) !== join("src", "i18n", "format.ts"))
    .filter(file => /new\s+Intl\./u.test(readFileSync(file, "utf8")))
    .map(file => relative(root, file));
  assert.deepEqual(found, []);
});
