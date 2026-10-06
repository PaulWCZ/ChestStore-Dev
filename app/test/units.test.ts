import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { csvLine } from "../src/csv.ts";
import { formatter, publicLocale } from "../src/i18n.ts";
import { islandRegistry } from "../src/registry.ts";
import { checkPage, checkSources, checkWords } from "../src/testing.ts";
import { AppError, cutText, field, readMoney, toolPath } from "../src/tool.ts";

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
  for (const odd of ["1,234", "1,250", "1.234", "12.345"]) refused(() => field.money({ max: 1e12 }).read(odd), "amount_ambiguous");
  for (const odd of ["0,500", "0.500,00", "1.2345", "12 50", "1 2 3", "1,000.000,5"]) refused(() => field.money({ max: 1e12 }).read(odd), "invalid");
  assert.equal(field.money({ max: 1e12 }).read("1,234,567"), 123456700, "two group marks: whole");
  assert.equal(field.money({ max: 1e12 }).read("1.000.000"), 100000000);
  assert.equal(field.money({ max: 1e12 }).read("12 345 678,90"), 1234567890);
  // Other minor units: yen (0 decimals), dinars (3).
  const yen = field.money({ max: 1e12, decimals: 0 }), dinar = field.money({ max: 1e12, decimals: 3 });
  assert.equal(yen.read("1,250"), 1250, "no decimals: a group mark");
  assert.equal(yen.read("1.250"), 1250);
  assert.equal(yen.read("1 250"), 1250);
  assert.equal(yen.read(1250), 1250);
  for (const odd of ["12,5", "12.50", "1,25", 12.5]) refused(() => yen.read(odd), "invalid");
  refused(() => dinar.read("12,345"), "amount_ambiguous");
  assert.equal(dinar.read("12,34"), 12340, "three decimals");
  assert.equal(dinar.read("0,345"), 345);
  assert.equal(dinar.read("1.234,567"), 1234567);
  assert.equal(dinar.read("0,5"), 500);
  assert.equal(dinar.read(1.25), 1250);
  refused(() => dinar.read("1.2345"), "invalid");
  assert.equal(readMoney("1 250", 0), 1250);
  for (const [typed, minor] of [["€12 500", 1250000], ["12 500 €", 1250000], ["12500 EUR", 1250000], ["EUR 12,50", 1250], ["-$5", -500], ["12\u202f500,25\u00a0€", 1250025]] as const) assert.equal(field.money({ min: -1e9, max: 1e12 }).read(typed), minor, typed);
  refused(() => field.money({ max: 1e12 }).read("€"), "invalid");
  refused(() => readMoney("1,250"), "amount_ambiguous");
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
  refused(() => field.money({ max: 1e9 }).read("12.345"), "amount_ambiguous");
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
  for (const wrong of ["2026-02-31", "", "31/12/2026"]) assert.throws(() => fr.day(wrong), (e: unknown) => e instanceof AppError && e.code === "invalid", wrong);
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
  checkPage('<script type="application/ld+json">{"@type":"JobPosting"}</script><script type="application/json" id="d">{}</script>');
  assert.throws(() => checkPage('<script type="application/ld+json"></script><script>alert(1)</script>'), /policy blocks/u);
  assert.throws(() => checkPage('<script type="module">1</script>'), /policy blocks/u);
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
  // Class names: only the literals that become classes.
  write("src/styles.css", ".note { color: var(--ink); } .on { color: var(--ink); } .off { color: var(--ink); } .c-sky { color: var(--ink); }");
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = ({ s, on, c, k }: { s: Set<string>; on: boolean; c: string; k: string }) => <><div className={s.has("merchant") ? "on" : "off"} /><div className={cx("note", on && "on")} /><div className={`note ${on ? "on" : "off"} c-${c}`} /><div className={k === "weird" ? "on" : ""} /></>;');
  checkSources({ root: dir });
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = ({ on }: { on: boolean }) => <div className={`note ${on ? "nowhere" : ""}`} />;', /"nowhere"/u);
  // Types are not classes.
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = ({ k }: { k: string }) => <div className={(k as Pick<Record<string, string>, "zz" | "yy">["zz"]) ?? "note"} />;');
  checkSources({ root: dir });
  write("src/styles.css", ".note { color: var(--ink); }");
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const A = () => <div className="note" />;');
  write("chest.json", JSON.stringify({ capabilities: ["database"], public: true }));
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const a = { send: publicAction({}, async () => null) };', /without bound/u);
  // budgets: read in the publicAction call, not anywhere in the file.
  mkdirSync(join(dir, "src", "i18n"), { recursive: true });
  write("src/i18n/en.ts", "export const en = { errors: { limit: \"Too many.\", expired: \"Expired.\" } };");
  write("src/i18n/format.ts", "export const twice = (n: number) => n * 2;");
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nconst limits = { budgets: 3 };\nexport const a = { send: publicAction({}, async () => null, { bound: { perVisitor: 1, perDay: 9 } }) };');
  checkSources({ root: dir });
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const a = { send: publicAction({}, async (_, { charge }) => { await charge("new"); }, { bound: { budgets: { new: { perVisitor: 1, perDay: 9, perSubject: 2 } } } }) };', /never says its subject/u);
  write("src/i18n/en.ts", "export const en = { errors: { limit: \"Too many.\" } };");
  fails("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\nexport const a = { send: publicAction({}, async () => null, { bound: { perVisitor: 1, perDay: 9 } }) };', /errors\.expired/u);
  write("src/i18n/en.ts", "export const en = { errors: { limit: \"Too many.\", expired: \"Expired.\" } };");
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
  // A module in a folder of lib/ needs its test too.
  mkdirSync(join(dir, "src", "lib", "pricing"));
  write("src/lib/pricing/vat.ts", "export const vat = 1;");
  assert.throws(() => checkSources({ root: dir, requireTests: true }), /pricing[/\\]vat\.ts: no test imports it/u);
  write("test/units.test.ts", 'import { x } from "../src/lib/rules.ts";\nimport { vat } from "../src/lib/pricing/vat.ts";');
  checkSources({ root: dir, requireTests: true });
});

test("text: code points, bidirectional overrides removed, only invisible characters is empty", () => {
  const refusedAs = (run: () => unknown, code: string) => assert.throws(run, (e: unknown) => e instanceof AppError && e.code === code);
  assert.equal(field.text({ max: 3 }).read("é😀a"), "é😀a", "three characters, five UTF-16 units");
  refusedAs(() => field.text({ max: 3 }).read("abcd"), "too_long");
  assert.equal(field.text({ max: 40 }).read("invoice\u202Efdp.exe"), "invoicefdp.exe");
  refusedAs(() => field.text({ max: 5 }).read("\u200b"), "empty");
  refusedAs(() => field.text({ max: 5 }).read("\u200b \ufeff"), "empty");
});

test("the islands' registry: each island with its file and its name there — a folder, a default export, an alias; a package's left out", () => {
  const dir = mkdtempSync(join(tmpdir(), "chest-app-"));
  mkdirSync(join(dir, "src", "islands", "deep"), { recursive: true });
  mkdirSync(join(dir, "src", "components"), { recursive: true });
  const write = (path: string, text: string) => writeFileSync(join(dir, path), text);
  write("chest.json", JSON.stringify({ name: "probe" }));
  write("package.json", "{}");
  write("src/islands/A.tsx", "export function A() { return null; }");
  write("src/islands/deep/B.tsx", "export default function B() { return null; }");
  write("src/islands/deep/index.tsx", "export { A as Again } from \"../A.tsx\";");
  write("src/components/board.tsx", "const Board = () => null;\nexport { Board };");
  write("src/islands/index.ts", [
    "import { ToastHost } from \"@argentic/chest-app/client\";",
    "// import { Gone } from \"./Gone.tsx\";",
    "import { A } from \"./A.tsx\";",
    "import B from \"./deep/B.tsx\";",
    "import { Again as C } from \"./deep\";",
    "import { Board } from \"../components/board.tsx\";",
    "export const islands = {\n  ToastHost, A,\n  Bee: B, C, Board,\n};",
  ].join("\n"));
  const found = islandRegistry(dir).map(i => [i.name, i.file.slice(dir.length).replaceAll("\\", "/"), i.exported]);
  assert.deepEqual(found, [
    ["A", "/src/islands/A.tsx", "A"],
    ["Bee", "/src/islands/deep/B.tsx", "default"],
    ["C", "/src/islands/deep/index.tsx", "Again"],
    ["Board", "/src/components/board.tsx", "Board"],
  ]);
  checkSources({ root: dir });
  // A wrapper's call around the list is read through.
  write("src/islands/index.ts", "import { A } from \"./A.tsx\";\nimport B from \"./deep/B.tsx\";\nexport const islands = allLive({ A, B });");
  assert.deepEqual(islandRegistry(dir).map(i => i.name), ["A", "B"]);
  // An island defined in the registry itself is in no file: refused, by checkSources too.
  write("src/islands/index.ts", "import { A } from \"./A.tsx\";\nconst Local = () => null;\nexport const islands = { A, Local };");
  assert.throws(() => islandRegistry(dir), /Local is not imported from a file/u);
  assert.throws(() => checkSources({ root: dir }), /Local is not imported from a file/u);
});

test("checkSources: a public action asking a proof of work needs errors.needs_javascript; the starter's example left is warned about", () => {
  const dir = mkdtempSync(join(tmpdir(), "chest-app-"));
  mkdirSync(join(dir, "src", "i18n"), { recursive: true });
  const write = (path: string, text: string) => writeFileSync(join(dir, path), text);
  write("package.json", "{}");
  write("chest.json", JSON.stringify({ name: "probe", capabilities: ["database"], public: true }));
  write("src/i18n/en.ts", "export const en = { errors: { limit: \"Too many.\", expired: \"Expired.\" } };");
  write("src/app.tsx", 'import { db } from "@argentic/chest-app/db";\n// EXAMPLE (Notes)\nexport const a = { send: publicAction({}, async () => null, { bound: { perVisitor: 1, perDay: 9, work: true } }) };');
  assert.throws(() => checkSources({ root: dir }), /errors\.needs_javascript/u);
  write("src/i18n/en.ts", "export const en = { errors: { limit: \"Too many.\", expired: \"Expired.\", needs_javascript: \"Needs JavaScript.\" } };");
  const warned: string[] = [];
  const warn = console.warn;
  console.warn = (text: string) => void warned.push(text);
  try {
    checkSources({ root: dir });
  } finally {
    console.warn = warn;
  }
  assert.match(warned.join("\n"), /EXAMPLE \(Notes\)/u);
});
