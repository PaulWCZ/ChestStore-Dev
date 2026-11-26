import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { test } from "node:test";
import { AppError, field } from "@argentic/chest-app";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";
import { formatter } from "../src/i18n/index.ts";

// The stack's rules, checked on the sources without a server (Node runs
// .ts as is): the package's checks of the sources and the words, what an
// action's fields read, how dates are written, and what the browser gets.
atLeast(5);
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the sources: no style={}, islands without server code, no colour in CSS, every class defined, capabilities used and declared", () => {
  checkSources();
});

test("the words: French says every English text, with the same placeholders and its own spacing", () => {
  checkWords({ en, fr });
});

test("an action's fields read forms and JSON alike, and refuse with a code", () => {
  assert.equal(field.text({ max: 5 }).read("  hi "), "hi");
  assert.throws(() => field.text({ max: 5 }).read("toolong"), { code: "too_long" });
  assert.equal(field.int({ min: 0, max: 1440 }).read("600"), 600);
  assert.throws(() => field.int({ min: 0, max: 1440 }).read("1441"), AppError);
  assert.throws(() => field.id().read("1 or 1=1"), AppError);
  assert.equal(field.day().read("2026-10-08"), "2026-10-08");
  // The answers to a host's questions: q_<id> fields of the form.
  const answers = field.keyed(/^q_([a-z0-9]{4,12})$/u, field.text({ min: 0, max: 50 }), 2);
  assert.deepEqual(answers.read(undefined, { q_abcd: "Yes", name: "Alex" }), { abcd: "Yes" });
  assert.throws(() => answers.read(undefined, { q_aaaa: "1", q_bbbb: "2", q_cccc: "3" }), AppError);
});

test("dates in the reader's language and zone", () => {
  assert.equal(formatter("fr", "Europe/Paris").date(new Date("2026-10-05T22:30:00Z")), "6 oct. 2026");
});

// What the browser runs: the islands, the components they use, the
// package's client; of the tool's own modules, src/shared/ (pure: no SDK,
// no database, no node:, no refusal) and the formats of src/i18n/format.ts.
test("the browser gets src/shared/ and the formats, never the services", () => {
  const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/^import (?!type)[^;]*? from "([^"]+)";/gmu)].map(m => m[1]!);
  for (const file of sources("src").filter(f => /^src\/(islands|components|shared)\/.*\.tsx?$/u.test(f) || f === "src/entry.tsx" || f === "src/i18n/format.ts")) {
    for (const from of importsOf(file)) {
      assert.ok(!from.startsWith("@argentic/chest-sdk") && !from.startsWith("node:") && (from !== "@argentic/chest-app" || file.startsWith("src/islands/")), `${file}: ${from} is the server's`);
      if (!from.startsWith(".")) continue;
      const target = normalize(join(dirname(file), from));
      assert.match(target, /^src\/(islands|components|shared)\/|^src\/i18n\/format\.ts$|\.css$/u, `${file}: ${target} is server code`);
    }
  }
});
