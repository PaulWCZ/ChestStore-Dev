import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { csvLine } from "../src/csv.ts";
import { formatter, publicLocale } from "../src/i18n.ts";
import { checkPage, checkSources, checkWords } from "../src/testing.ts";
import { AppError, cutText, field, toolPath } from "../src/tool.ts";

test("fields read forms and JSON alike, and refuse with a code", () => {
  const refused = (f: () => unknown, code: string) => assert.throws(f, (e: unknown) => e instanceof AppError && e.code === code);
  assert.equal(field.text({ max: 5 }).read("  hi "), "hi");
  refused(() => field.text({ max: 5 }).read("   "), "empty");
  refused(() => field.text({ max: 5 }).read("toolong"), "too_long");
  assert.equal(field.int({ min: 1, max: 9 }).read("3"), 3);
  assert.equal(field.int({ min: -9, max: 9 }).read(" -3 "), -3);
  refused(() => field.int({ min: 1, max: 9 }).read("12"), "invalid");
  refused(() => field.int({ min: 0, max: 9 }).read(""), "empty");
  refused(() => field.int({ min: 0, max: 9 }).read(" "), "empty");
  for (const odd of ["0x5", "1e1", "1.0", "+3", "٣"]) refused(() => field.int({ min: 0, max: 99 }).read(odd), "invalid");
  refused(() => field.id().read("1 or 1=1"), "invalid");
  assert.equal(field.bool().read("on"), true);
  assert.equal(field.bool().read(undefined), false);
  assert.deepEqual(field.list(field.id(), 3).read("7"), ["7"]);
  refused(() => field.list(field.id(), 1).read(["1", "2"]), "invalid");
  assert.equal(field.optional(field.day()).read(""), undefined);
  assert.equal(field.nullable(field.day()).read(""), null);
  assert.equal(field.nullable(field.day()).read(undefined), undefined);
  assert.equal(field.sent(field.text({ min: 0, max: 9 })).read(""), "");
  refused(() => field.choice(["a", "b"]).read("c"), "invalid");
  assert.equal(field.day().read("2024-02-29"), "2024-02-29");
  for (const odd of ["2026-02-31", "2026-13-01", "2026-2-1", "2025-02-29"]) refused(() => field.day().read(odd), "invalid");
  assert.deepEqual(field.keyed(/^d(\d+)$/u, field.int({ min: 0, max: 2 }), 5).read(undefined, { d12: "1", d13: "2", x: "9" }), { "12": 1, "13": 2 });
  refused(() => field.json().read("{}"), "invalid");
  assert.equal(field.money({ max: 1e9 }).read("1 234,50"), 123450);
  assert.equal(field.money({ max: 1e9 }).read("1\u202f234,50"), 123450);
  assert.equal(field.money({ max: 1e9 }).read("1,234.50"), 123450);
  assert.equal(field.money({ max: 1e9 }).read("1.234,50"), 123450);
  assert.equal(field.money({ max: 1e9 }).read("12,5"), 1250);
  assert.equal(field.money({ max: 1e9 }).read("0,50"), 50);
  for (const odd of ["1,234", "0,500", "1,250", "1.234", "12.345", "0.500,00", "1.234.567", "1,234,567", "1.2345"]) refused(() => field.money({ max: 1e12 }).read(odd), "invalid");
  for (const odd of [12.345, 1.005, Infinity]) refused(() => field.money({ max: 1e12 }).read(odd), "invalid");
  refused(() => field.money({ max: 1e9 }).read(undefined), "empty");
  refused(() => field.int({ min: 0, max: 9 }).read(undefined), "empty");
  refused(() => field.text({ max: 9 }).read("a\u0000b"), "invalid");
  refused(() => field.text({ max: 9 }).read("a\u001bb"), "invalid");
  assert.equal(field.text({ max: 9 }).read("a\tb\nc"), "a\tb\nc");
  refused(() => field.money({ max: 1e9 }).read(""), "empty");
  refused(() => field.money({ max: 1e9 }).read("1,23,4"), "invalid");
  assert.equal(cutText("short", 80), "short");
  const long = "👩‍👩‍👧".repeat(30);
  const cut = cutText(long, 80);
  assert.ok([...cut].length <= 80 && cut.endsWith("…") && !cut.includes("\u200d…"));
  assert.equal(field.money({ max: 1e9 }).read("12.5"), 1250);
  assert.equal(field.money({ max: 1e9 }).read(12.5), 1250);
  refused(() => field.money({ max: 1e9 }).read("12.345"), "invalid");
  refused(() => field.money({ max: 100 }).read("2"), "invalid");
});

test("a redirect stays in the tool", () => {
  assert.equal(toolPath("/chest/notes/1?x=2#a"), "/chest/notes/1?x=2#a");
  for (const evil of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\\/evil.example", "https://evil.example", "evil", "", null,
    "/..//evil.com", "/.//evil.com", "/%2e%2e//evil.com", "/%2E/%2fevil.com", "/./\\evil.com", "/chest/..//evil.com", "/chest/../x", "/%2f/evil.com", "/%5cevil.com"]) assert.equal(toolPath(evil), null, String(evil));
  assert.equal(toolPath("/jobs?back=//x"), "/jobs?back=//x");
});

test("dates, days, numbers, amounts and plurals in the reader's language and zone", () => {
  const fr = formatter("fr", "Europe/Paris", "EUR"), en = formatter("en", "America/New_York", "EUR");
  const at = new Date("2026-10-05T22:30:00Z");
  assert.equal(fr.date(at), "6 oct. 2026");
  assert.equal(en.date(at), "5 Oct 2026");
  const year = String(new Date().getUTCFullYear());
  assert.equal(en.day(`${year}-10-05`).includes(year), false, "this year: no year");
  assert.match(en.day("2031-01-05"), /2031/u, "another year: its year");
  const paris = formatter("en", "Europe/Paris");
  assert.notEqual(paris.time(new Date("2026-10-25T00:30:00Z")), paris.time(new Date("2026-10-25T01:30:00Z")), "02:30 twice: told apart");
  assert.equal(paris.time(new Date("2026-10-25T05:30:00Z")), "06:30");
  assert.equal(en.today(new Date("2026-10-06T02:00:00Z")), "2026-10-05"); // still the 5th in New York
  assert.equal(fr.today(new Date("2026-10-05T22:30:00Z")), "2026-10-06");
  assert.equal(fr.money(1234.5), "1 234,50 €");
  assert.equal(fr.money(123450, { cents: true }), "1 234,50 €");
  assert.equal(fr.plural({ one: "{count} note", other: "{count} notes" }, 0), "0 note");
  assert.equal(en.plural({ one: "{count} note", other: "{count} notes" }, 0), "0 notes");
  assert.equal(publicLocale(["en", "fr"], undefined, "de-DE, fr;q=0.8, en;q=0.5"), "fr");
  assert.equal(publicLocale(["en", "fr"], "en", "fr"), "en");
  assert.equal(publicLocale(["en", "fr"], undefined, "de", "fr"), "fr");
});

test("CSV cells are quoted, formulas defused", () => {
  assert.equal(csvLine([1, "a,b", 'say "hi"', "=1+1", -2]), '1,"a,b","say ""hi""",\'=1+1,-2\r\n');
});

test("checkPage finds what the policy blocks", () => {
  assert.throws(() => checkPage('<div style="width:3px"></div>'));
  assert.throws(() => checkPage("<script>alert(1)</script>"));
  assert.throws(() => checkPage("<style>a{}</style>"));
  assert.equal(checkPage('<script type="module" src="/assets/client.js"></script><div class="x"></div>'), '<script type="module" src="/assets/client.js"></script><div class="x"></div>');
});

test("checkWords: missing texts, placeholders, French typography", () => {
  checkWords({ en: { a: "Hello {name}", b: { c: "Done." } }, fr: { a: "Bonjour {name}", b: { c: "Fait !" } } });
  assert.throws(() => checkWords({ en: { a: "x", b: "y" }, fr: { a: "x" } }), /fr\.b: missing/u);
  assert.throws(() => checkWords({ en: { a: "{n} items" }, fr: { a: "{count} éléments" } }), /placeholders/u);
  assert.throws(() => checkWords({ en: { a: "Sure?" }, fr: { a: "Sûr ?" } }), /narrow/u);
  assert.throws(() => checkWords({ en: { a: "Note: hi" }, fr: { a: "Note: salut" } }), /narrow/u);
});

test("checkSources: style={}, server code in islands, colours, unknown classes, capabilities", () => {
  const dir = mkdtempSync(join(tmpdir(), "chest-app-"));
  mkdirSync(join(dir, "src", "islands"), { recursive: true });
  const write = (path: string, text: string) => writeFileSync(join(dir, path), text);
  write("package.json", "{}");
  write("chest.json", JSON.stringify({ capabilities: ["database"] }));
  write("src/styles.css", ".note { color: var(--ink); }");
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = () => <div className="note" />;');
  write("src/islands/X.tsx", "export const X = () => null;");
  checkSources({ root: dir });
  const fails = (path: string, text: string, pattern: RegExp) => {
    write(path, text);
    assert.throws(() => checkSources({ root: dir }), pattern);
  };
  fails("src/islands/X.tsx", "export const X = () => <b style={{ width: 3 }} />;", /style=\{\}/u);
  fails("src/islands/X.tsx", "const s = { style: { width: 3 } };\nexport const X = () => <b {...{ style: s }} />;", /style=\{\}/u);
  fails("src/islands/X.tsx", 'import { member } from "@argentic/chest-sdk/member";', /server only/u);
  fails("src/islands/X.tsx", 'import { db } from "@argentic/chest-app/db";', /server code/u);
  write("src/islands/X.tsx", "export const X = () => null;");
  fails("src/styles.css", ".note { color: #fff; }", /colour/u);
  write("src/styles.css", ".note { color: var(--ink); }");
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = () => <div className="note ck-field-group" />;', /ck-field-group/u);
  // A family completed by the code (`c-${color}`): some class starts with it.
  write("src/styles.css", ".note { color: var(--ink); } .c-sky { --c: var(--ink); }");
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = ({ c }: { c: string }) => <div className={`note c-${c}`} />;');
  checkSources({ root: dir });
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = ({ c }: { c: string }) => <div className={`note x-${c}`} />;', /"x-"/u);
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = () => <div className="note" />;');
  fails("src/app.tsx", "export const A = () => null;", /asks "database"/u);
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nimport * as m from "@argentic/chest-sdk/members";', /declare it/u);
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const a = { send: publicAction({}, async () => null) };', /without "public": true/u);
  write("chest.json", JSON.stringify({ capabilities: ["database"], public: true }));
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const a = { send: publicAction({}, async () => null) };', /without bound/u);
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const a = { send: publicAction({}, async () => null, { bound: { budgets: { new: { perVisitor: 1, perDay: 9 } } } }) };', /never calls charge/u);
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const a = { send: publicAction({}, async (_, { charge }) => { await charge("new"); }, { bound: { budgets: { new: { perVisitor: 1, perDay: 9 } } } }) };');
  checkSources({ root: dir });
  write("chest.json", JSON.stringify({ capabilities: ["database"] }));
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\n// publicPage() would serve visitors\nexport const A = () => <div className="note" />;');
  checkSources({ root: dir });
  mkdirSync(join(dir, "src", "lib"));
  write("src/lib/rules.ts", "export const x = 1;");
  checkSources({ root: dir });
  assert.throws(() => checkSources({ root: dir, requireTests: true }), /no test imports it/u);
  mkdirSync(join(dir, "test"));
  write("test/units.test.ts", 'import { x } from "../src/lib/rules.ts";');
  checkSources({ root: dir, requireTests: true });
});
