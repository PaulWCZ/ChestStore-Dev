import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { AppError, field } from "../src/core/tool.ts";
import { formatter, publicLocale } from "../src/i18n/index.ts";

// The stack's rules, checked on the sources without a server (Node runs
// .ts as is): what an action's fields read, how dates and numbers are
// written, and what the policy and the browser's bundle forbid.
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("an action's fields read forms and JSON alike, and refuse with a code", () => {
  const code = (f: () => unknown) => assert.throws(f, AppError);
  assert.equal(field.text({ max: 5 }).read("  hi "), "hi");
  assert.throws(() => field.text({ max: 5 }).read("   "), { code: "empty" });
  assert.throws(() => field.text({ max: 5 }).read("toolong"), { code: "too_long" });
  code(() => field.id().read("1 or 1=1"));
  assert.equal(field.bool().read("on"), true);
  code(() => field.choice(["a", "b"]).read("c"));
});

test("dates, numbers, lists and plurals in the reader's language and zone", () => {
  const fr = formatter("fr", "Europe/Paris"), en = formatter("en", "America/New_York");
  const at = new Date("2026-10-05T22:30:00Z");
  assert.equal(fr.date(at), "6 oct. 2026"); // already the 6th in Paris
  assert.equal(en.date(at), "5 Oct 2026");
  assert.equal(fr.number(3.75), "3,8");
  assert.equal(en.list(["Sales", "Tech", "Léa"]), "Sales, Tech and Léa");
  assert.equal(fr.plural({ one: "{count} réponse", other: "{count} réponses" }, 0), "0 réponse");
  assert.equal(publicLocale(undefined, "de-DE, fr;q=0.8, en;q=0.5"), "fr");
  assert.equal(publicLocale(undefined, "de", "fr"), "fr", "the Chest's language before English");
});

// The browser gets the islands, the components they draw with, and the
// pure rules both sides share (src/shared/: the text's marks, the
// editor's document, the model's bounds) — never the SDK, src/lib/, the
// actions, the pages or the theme.
test("pages carry no style attribute; the browser never gets the SDK or the server's code", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f))) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\sstyle=\{/u, `${file}: style={} is refused by the policy (use a class)`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, `${file}: no HTML written as text`);
    if (file.startsWith("src/islands/") || file.startsWith("src/shared/") || file === "src/core/client.tsx" || file === "src/core/entry.tsx" || file.startsWith("src/components/")) {
      assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-sdk/mu, `${file}: the SDK is for the server only`);
      assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|theme|app|calls)/mu, `${file}: server code in the browser`);
    }
  }
});

test("the look is a stylesheet: no <style> element anywhere in the pages", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) assert.doesNotMatch(readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, ""), /<style[\s>]/u, file);
});
