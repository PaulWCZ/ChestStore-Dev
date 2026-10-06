import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// Nothing shown to a person is written outside the catalogues: no text
// between JSX tags, no words in the attributes people read or hear.
const root = join(import.meta.dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (["node_modules", "dist", "vendor", "test"].includes(name)) return [];
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

test("no words in the pages outside lib/i18n", () => {
  const found: string[] = [];
  for (const file of files(root)) {
    const source = readFileSync(file, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/gu, "").replace(/^\s*\/\/.*$/gmu, "");
    // Text between a tag's end and the next tag or expression (a regular
    // expression, not a parser: code between generics is told apart by the
    // characters JSX text does not hold).
    for (const m of source.matchAll(/([^=\s-])\s*>([^<>{}]*)</gu)) {
      const text = m[2]!.trim();
      if (/\p{L}{2,}/u.test(text) && !/[;=()[\]]/u.test(text)) found.push(`${relative(root, file)}: "${text}"`);
    }
    for (const m of source.matchAll(/\s(placeholder|title|alt|aria-label|label)="([^"]*\p{L}[^"]*)"/gu)) found.push(`${relative(root, file)}: ${m[1]}="${m[2]}"`);
  }
  assert.deepEqual(found, []);
});

// Intl objects live outside V8's heap: one made per row of a page piles up
// hundreds of MiB before a collection frees them. Only src/shared/format.ts
// makes them, once per language and style, and keeps them.
test("no Intl object is made outside the cached formatters", () => {
  const found: string[] = [];
  const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/u.test(name) ? [path] : [];
  });
  for (const file of sources(join(root, "src"))) {
    if (file.endsWith(join("shared", "format.ts"))) continue;
    const source = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    if (/new Intl\./u.test(source)) found.push(relative(root, file));
  }
  assert.deepEqual(found, []);
});
