import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { test } from "node:test";
import { AppError, field } from "../src/core/tool.ts";
import { formatter, publicLocale } from "../src/i18n/index.ts";

// The stack's rules, checked on the sources without a server (Node runs
// .ts as is): what an action's fields read, how dates are written, and
// what the policy and the browser's bundle forbid.
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("an action's fields read forms and JSON alike, and refuse with a code", () => {
  assert.equal(field.text({ max: 5 }).read("  hi "), "hi");
  assert.throws(() => field.text({ max: 5 }).read("toolong"), { code: "too_long" });
  assert.equal(field.int({ min: 0, max: 1440 }).read("600"), 600);
  assert.throws(() => field.int({ min: 0, max: 1440 }).read("1441"), AppError);
  assert.throws(() => field.id().read("1 or 1=1"), AppError);
  assert.equal(field.day().read("2026-10-08"), "2026-10-08");
  assert.throws(() => field.day().read("8/10/2026"), AppError);
  // The answers to a host's questions: q_<id> fields of the form.
  const answers = field.keyed(/^q_([a-z0-9]{4,12})$/u, field.text({ min: 0, max: 50 }), 2);
  assert.deepEqual(answers.read(undefined, { q_abcd: "Yes", name: "Alex" }), { abcd: "Yes" });
  assert.throws(() => answers.read(undefined, { q_aaaa: "1", q_bbbb: "2", q_cccc: "3" }), AppError);
});

test("dates in the reader's language and zone", () => {
  const fr = formatter("fr", "Europe/Paris");
  assert.equal(fr.date(new Date("2026-10-05T22:30:00Z")), "6 oct. 2026");
  assert.equal(publicLocale(undefined, "de", "fr"), "fr", "the Chest's language before English");
});

// What the browser may run: the islands, the components they use, the
// starter's client; of src/lib/, only the pure modules below (rules and
// time, no SDK, no database, no node:), and never src/actions.ts, a page,
// the theme or the routes.
const browserSafe = new Set(["src/lib/zone.ts", "src/lib/zones.ts", "src/lib/questions.ts", "src/lib/model.ts", "src/lib/slots.ts", "src/lib/app-error.ts"]);
const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/^import (?!type)[^;]*? from "([^"]+)";/gmu)].map(m => m[1]!);

test("pages carry no style attribute; the browser never gets the SDK or the server's code", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f))) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\sstyle=\{/u, `${file}: style={} is refused by the policy (use a class)`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, `${file}: no HTML written as text`);
    const browser = file.startsWith("src/islands/") || file.startsWith("src/components/") || file === "src/core/client.tsx" || file === "src/core/entry.tsx";
    if (!browser) continue;
    for (const from of importsOf(file)) {
      assert.ok(!from.startsWith("@argentic/chest-sdk"), `${file}: the SDK is for the server only`);
      assert.ok(!from.startsWith("node:"), `${file}: ${from} is the server's`);
      if (!from.startsWith(".")) continue;
      const target = normalize(join(dirname(file), from));
      assert.ok(target.startsWith("src/islands/") || target.startsWith("src/components/") || target.startsWith("src/core/") || target === "src/i18n/format.ts" || browserSafe.has(target), `${file}: ${target} is server code`);
    }
  }
  // The pure modules the browser gets stay pure, all the way down.
  for (const file of browserSafe) {
    for (const from of importsOf(file)) {
      assert.ok(from.startsWith("."), `${file}: imports ${from}`);
      const target = normalize(join(dirname(file), from));
      assert.ok(browserSafe.has(target) || target === "src/core/tool.ts", `${file}: imports ${target}`);
    }
  }
});

test("the look is a stylesheet: no <style> element anywhere in the pages", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) assert.doesNotMatch(readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, ""), /<style[\s>]/u, file);
});
