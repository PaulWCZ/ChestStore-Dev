import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { catalogue, locales } from "../src/i18n/index.ts";

// What a client reads on the public pages never shows a raw "{company}".
// Every word a public page takes from the catalogue is found in its source
// (through the names the file gives the catalogue: `t`, `o = t.online`,
// `words`…); a word that holds a {placeholder} must reach the page through
// format() or plural(). Round 3 found "{company} est prévenue" on the page
// after accepting: this test finds that class of mistake before a client
// does. A new public file must be listed here (the last test checks it).

const root = join(import.meta.dirname, "..");

// Each public file, and what its names stand for in the catalogue ("" is
// the catalogue itself; several roots: the first that holds the key).
const publicFiles: Record<string, Record<string, string[]>> = {
  "src/pages/PublicHome.tsx": { t: [""] },
  "src/pages/Answer.tsx": { t: [""], o: ["online"] },
  "src/islands/AnswerForm.tsx": { t: ["online"] },
  "src/components/quote-sheet.tsx": { words: ["pdf"] },
  "src/layout.tsx": { t: [""] },
};

type Found = { file: string; path: string; key: string; text: string };

function valueAt(tree: unknown, path: string): unknown {
  let at: unknown = tree;
  for (const part of path.split(".").filter(Boolean)) {
    if (!at || typeof at !== "object" || !(part in at)) return undefined;
    at = (at as Record<string, unknown>)[part];
  }
  return at;
}

// The words a use shows: a string, or a plural's forms. A whole section
// (`t.online` given to a name) is not shown as it is.
const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value]
    : value && typeof value === "object" && Object.keys(value).every(k => ["zero", "one", "other"].includes(k)) ? Object.values(value).filter((v): v is string => typeof v === "string")
    : [];

// The calls an index sits inside, the innermost first (a rough reading of
// the source: parentheses counted, identifiers before each open one).
function enclosingCalls(source: string, index: number): string[] {
  const calls: string[] = [];
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = source[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth > 0) { depth--; continue; }
      const name = /([A-Za-z_$][\w$]*)\s*$/u.exec(source.slice(Math.max(0, i - 60), i));
      calls.push(name ? name[1]! : "");
    }
  }
  return calls;
}

export function unformatted(file: string, source: string, names: Record<string, string[]>, words: unknown): Found[] {
  const found: Found[] = [];
  for (const [name, roots] of Object.entries(names)) {
    const pattern = new RegExp(`(?<![\\w$.])${name}\\.([A-Za-z_]\\w*(?:\\.[A-Za-z_]\\w*)*)`, "gu");
    for (const m of source.matchAll(pattern)) {
      for (const rootPath of roots) {
        const key = [rootPath, m[1]].filter(Boolean).join(".");
        const value = valueAt(words, key);
        if (value === undefined) continue;
        const holes = strings(value).filter(s => /\{\w+\}/u.test(s));
        if (holes.length > 0 && !enclosingCalls(source, m.index!).some(c => c === "format" || c === "plural")) {
          found.push({ file, path: m[0], key, text: holes[0]! });
        }
        break;
      }
    }
  }
  return found;
}

test("the scan finds a word with a placeholder written as it is", () => {
  const words = { online: { acceptedNext: "{company} has been told.", lead: "From {company}.", plain: "Thank you." } };
  const names = { o: ["online"] };
  assert.equal(unformatted("x.tsx", `<p>{o.acceptedNext}</p><p>{o.plain}</p>`, names, words).length, 1);
  assert.equal(unformatted("x.tsx", `<p>{format(o.acceptedNext, { company })}</p>`, names, words).length, 0);
  assert.equal(unformatted("x.tsx", `format(ok ? o.acceptedNext : o.lead, { company })`, names, words).length, 0);
  assert.equal(unformatted("x.tsx", `format(o.lead, { company }) + o.acceptedNext`, names, words).length, 1);
});

test("every word of the public pages that holds a placeholder is filled, in every language", () => {
  for (const locale of locales) {
    const words = catalogue(locale);
    const found: Found[] = [];
    for (const [file, names] of Object.entries(publicFiles)) {
      found.push(...unformatted(file, readFileSync(join(root, file), "utf8"), names, words));
    }
    assert.deepEqual(found.map(f => `${f.file}: ${f.path} (${f.key}: "${f.text}")`), [], `${locale}: words shown with their placeholders`);
  }
});

test("every public page is scanned", () => {
  const walk = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : []));
  // The public part's pages, and the islands they show.
  const pages = [...walk("src/pages").filter(f => /PublicHome|Answer/u.test(f)), "src/islands/AnswerForm.tsx", "src/layout.tsx"].map(f => relative(".", f));
  for (const page of pages) assert.ok(page in publicFiles, `${page} is a public page: list it in test/public-words.test.ts`);
});
