import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { atLeast } from "@argentic/chest-app/testing";
import { fakeChest, type FakeChest, type FakeMember } from "@argentic/chest-sdk/testing";
import { catalogue } from "../src/i18n/index.ts";
import { composeData, initialOf } from "../src/lib/compose.ts";
import { composeWords } from "../src/lib/compose-words.ts";
import { toCsv, separatorFor } from "../src/lib/csv.ts";
import { db } from "../src/lib/db.ts";
import { expense } from "../src/lib/expenses.ts";
import { receiptFileName, selectionOf } from "../src/lib/export.ts";
import { cleanup } from "../src/lib/jobs.ts";
import { letterText } from "../src/lib/mail.ts";
import { cut } from "../src/lib/notify.ts";
import { rowView } from "../src/lib/rows.ts";
import { ocrBase } from "../src/shared/ocr-files.ts";
import { categories } from "../src/lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, tom } from "./support/members.ts";
import { call, deliver, get, server } from "./support/server.ts";

// The server as built for the tests, over a month of sample expenses
// (seed/sample.sql): every page for every role, the policy, the look, the
// actions as an island calls them — two at once on the same expense
// included —, and the small rules the pages use.
atLeast(12);

const sofia: FakeMember = { id: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa", firstName: "Sofia", lastName: "Rossi", name: "Sofia Rossi", photo: null, role: "employee", isAdmin: false, isBuilder: false, groups: [], language: "en" };
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
  chest = await fakeChest({ members: [...everyone, sofia], network: {}, chest: { publicUrl: null } });
  await server();
});
after(async () => {
  await chest.close();
  await database.close();
});

const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

test("every page answers each role, in their language, under the strict policy", async () => {
  const pages = ["/chest", "/chest/new", "/chest/new?trip=1", "/chest/new?allowance=1", "/chest/expenses/10", "/chest/expenses/10/edit", "/chest/approve", "/chest/search?q=SNCF", "/chest/search", "/chest/pay", "/chest/cards", "/chest/export", "/chest/export?by=paid", "/chest/settings", "/chest/settings/company"];
  for (const who of [camille, ines, hugo, lea, tom]) {
    for (const path of pages) {
      const response = await get(who, path);
      // Hugo's draft is his: others get its 404, and its edit screen too.
      const theirs = path.startsWith("/chest/expenses/10") && who.id !== hugo.id;
      assert.equal(response.status, theirs ? 404 : 200, `${who.firstName} ${path}`);
      assert.equal(response.headers.get("content-security-policy"), policy, path);
      assert.equal(response.headers.get("cache-control"), "no-store", path);
      const html = await response.text();
      assert.match(html, new RegExp(`<html lang="${who.language}">`, "u"), path);
      assert.doesNotMatch(html, /<style|\sstyle="/u, path);
    }
  }
  assert.equal((await get(null, "/chest")).status, 401);
});

test("My expenses: the figures, what to send, the sections' numbers in the tabs", async () => {
  const html = await (await get(hugo, "/chest")).text();
  assert.match(html, /My expenses/u);
  assert.match(html, /G7 Taxi/u);
  assert.match(html, /Chez Janou/u);
  // Inès approves: what waits for her is counted on her tab.
  const forInes = await (await get(ines, "/chest")).text();
  const waiting = (await database.sql<{ n: number }[]>`select count(*)::int as n from expenses where status = 'submitted' and deleted_at is null and approver_id = ${ines.id} and member_id <> ${ines.id}`)[0]!.n;
  assert.ok(waiting > 0);
  assert.match(forInes, new RegExp(`À valider[^<]*</span><span[^>]*class="ck-count"[^>]*>${waiting}<`, "u"));
  // An employee has no "To approve" tab.
  assert.doesNotMatch(html, /href="\/chest\/approve"/u);
});

test("the look: the company's choice as a stylesheet, its address the hash of its text; the tool's own outside /chest", async () => {
  const linkOf = async () => /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(await (await get(hugo, "/chest")).text())![1]!;
  const own = await linkOf();
  const sheet = await get(hugo, own);
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get("content-type") ?? "", /^text\/css/u);
  assert.match(sheet.headers.get("cache-control") ?? "", /immutable/u);
  assert.match(await sheet.text(), /\/assets\/fonts\/jetbrains-mono-latin-wght-normal\.woff2/u);
  chest.theme.all = { mode: "catalogue", theme: "newsprint" };
  const chosen = await linkOf();
  assert.notEqual(chosen, own);
  assert.doesNotMatch(await (await get(hugo, chosen)).text(), /jetbrains-mono/u);
  chest.theme.all = { mode: "own" };
  assert.equal((await get(null, "/look.css")).status, 200);
  assert.equal((await get(null, "/assets/icon.svg")).status, 200);
});

test("the receipt reader's files: members only, a policy that lets its worker compile WebAssembly", async () => {
  const worker = await get(hugo, `${ocrBase}/worker.min.js`);
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get("content-type") ?? "", /^text\/javascript/u);
  assert.equal(worker.headers.get("content-security-policy"), "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; frame-ancestors 'none'");
  assert.ok(Number(worker.headers.get("content-length")) > 50_000);
  assert.equal(worker.headers.get("cache-control"), "private, max-age=31536000, immutable");
  await worker.body?.cancel();
  assert.equal((await get(hugo, "/chest/ocr/6.0.0-1.0.0/worker.min.js")).status, 404, "another version");
  const model = await get(hugo, `${ocrBase}/fra.traineddata.gz`);
  assert.equal(model.status, 200);
  await model.body?.cancel();
  assert.equal((await get(hugo, `${ocrBase}/LICENSE-tesseract.js.txt`)).status, 404);
  assert.equal((await get(hugo, `${ocrBase}/..%2Fserver%2Fapp.js`)).status, 404);
  assert.equal((await get(null, `${ocrBase}/worker.min.js`)).status, 401);
});

test("no public part: the host's root says where Expenses lives, in the visitor's language", async () => {
  const html = await (await get(null, "/", { "accept-language": "fr-FR,fr;q=0.9" })).text();
  assert.match(html, /<html lang="fr">/u);
  assert.match(html, /Cet outil est dans votre Chest/u);
  assert.equal((await get(null, "/nothing")).status, 404);
  assert.equal((await call(null, "sendExpenses", { ids: ["9"] })).status, 401, "a member's action, without a member");
  const outside = await deliver(new Request("https://expenses-chest.chest.test/actions/sendExpenses", { method: "POST", body: "{}", headers: { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin" } }));
  assert.equal(outside.status, 404, "no public action");
});

test("a member whose role gives nothing sees why, and no page reads anything", async () => {
  const response = await get(nora, "/chest/approve");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /You can’t use this tool yet/u);
  assert.doesNotMatch(html, /Brasserie|SNCF/u);
  assert.equal((await call(nora, "sendExpenses", { ids: ["9"] })).status, 403);
});

test("send, then approve: an island's calls, a refusal in the reader's words", async () => {
  const sent = await call(hugo, "sendExpenses", { ids: ["9", "10"] });
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.value, { count: 2, to: "Inès Moreau" });
  const again = await call(hugo, "sendExpenses", { ids: ["9"] });
  assert.deepEqual([again.status, again.error, again.message], [400, "not_draft", "Only drafts can be changed or sent."]);
  const self = await call(ines, "decideExpenses", { ids: ["18"], verdict: "approve" });
  assert.equal(self.error, "self_approval");
  assert.equal(self.message, "Vous ne pouvez pas valider vos propres dépenses.");
  const refuse = await call(ines, "decideExpenses", { ids: ["9"], verdict: "refuse" });
  assert.equal(refuse.error, "reason_needed");
});

test("two approvals of the same expense at once: one wins, the other is told", async () => {
  const [a, b] = await Promise.all([call(ines, "decideExpenses", { ids: ["10"], verdict: "approve" }), call(camille, "decideExpenses", { ids: ["10"], verdict: "approve" })]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  assert.equal((a.ok ? b : a).error, "not_submitted");
  const history = await database.sql`select count(*)::int as n from history where expense_id = 10 and kind = 'approved'`;
  assert.equal(history[0]!["n"], 1);
});

test("marking paid twice at once pays once; Undo gives it back", async () => {
  const [a, b] = await Promise.all([call(camille, "markPaid", { ids: ["6"], paidOn: "2026-09-30" }), call(camille, "markPaid", { ids: ["6"], paidOn: "2026-09-30" })]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  assert.equal((a.ok ? b : a).error, "not_approved");
  assert.equal((await database.sql`select count(*)::int as n from history where expense_id = 6 and kind = 'paid'`)[0]!["n"], 1);
  assert.equal((await call(camille, "unmarkPaid", { ids: ["6"] })).ok, true);
  assert.equal((await database.sql`select status from expenses where id = 6`)[0]!["status"], "approved");
  // Not the accountant: refused.
  assert.equal((await call(ines, "markPaid", { ids: ["6"], paidOn: "2026-09-30" })).status, 403);
});

test("an amount is read as the person typed it, in their currency; an ambiguous one is refused", async () => {
  const [meals] = (await categories(database.sql, {})).filter(c => c.key === "meals");
  const save = (amount: string, currency?: string) => call(lea, "saveExpense", { id: null, input: { spentOn: "2026-09-20", amount, categoryId: meals!.id, merchant: "Test", ...(currency ? { currency, rate: "0,0061" } : {}) } });
  const fr = await save("1 234,50");
  assert.equal(fr.ok, true);
  assert.equal((await expense(database.sql, asMember(lea), fr.value.id)).expense.amount, 123450);
  const en = await save("1,234.50");
  assert.equal((await expense(database.sql, asMember(lea), en.value.id)).expense.amount, 123450);
  const ambiguous = await save("1,234");
  assert.deepEqual([ambiguous.status, ambiguous.error], [400, "amount_ambiguous"]);
  assert.equal(ambiguous.message, catalogue("fr").errors.amount_ambiguous);
  const letter = await save("1O,50");
  assert.deepEqual([letter.error, letter.message], ["amount_invalid", "Saisissez un montant, par exemple 12,50."]);
  const yen = await save("1,234", "JPY");
  assert.equal((await expense(database.sql, asMember(lea), yen.value.id)).expense.amount, 1234);
});

test("downloads refuse in the reader's words", async () => {
  const refused = await get(ines, "/chest/export/csv?month=2026-09");
  assert.equal(refused.status, 403);
  assert.equal(await refused.text(), catalogue("fr").errors.forbidden);
  assert.equal((await get(camille, "/chest/pay/files/999")).status, 404);
  const zip = await get(camille, "/chest/export/zip?month=2026-09");
  assert.equal(zip.status, 200);
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.match(zip.headers.get("content-disposition") ?? "", /^attachment; filename="Notes-de-frais_2026-09\.zip"$/u);
  await zip.arrayBuffer();
});

test("the small rules of the pages: rows, words, files, letters", async () => {
  const t = catalogue("en");
  // The services' connection is the package's pool (the tests give theirs).
  assert.equal(typeof db, "function");
  const e = (await expense(database.sql, asMember(hugo), "1")).expense;
  const cats = new Map((await categories(database.sql, { archived: true })).map(c => [c.id, c]));
  const row = rowView(e, { t, locale: "en", categories: cats, currency: "EUR" });
  assert.deepEqual([row.what, row.amount, row.stamp, row.icon, row.href], ["Café de Flore", "€47.20", { kind: "paid", text: "Paid" }, "pdf", "/chest/expenses/1"]);
  assert.equal(initialOf(e, "fr").amount, "47,20");
  const data = await composeData(database.sql, asMember(hugo), t, "en");
  assert.ok(data.categories.length > 3 && data.vehicle !== null && data.team.every(m => m.id !== hugo.id));
  assert.deepEqual(Object.keys(composeWords(t)).sort(), ["allowance", "date", "errors", "form", "receipt", "saved", "send", "sent", "sentAlone", "trip"]);
  assert.equal(toCsv([["=1+1", "a;b"]], separatorFor("fr")), "﻿'=1+1;\"a;b\"\r\n");
  assert.equal(receiptFileName({ id: "7", spentOn: "2026-09-02", amount: 9800, currency: "EUR", object: "receipts/2026-09/x.pdf" }, "Inès Moreau"), "2026-09-02_Ines-Moreau_98-00EUR_E7.pdf");
  assert.deepEqual(selectionOf(new URLSearchParams("month=2026-09&by=paid")), { month: "2026-09", person: null, by: "paid" });
  assert.equal(cut("a  b", 3), "a b");
  assert.equal(cut("abcdef", 4), "abc…");
  assert.match(letterText(t, { subject: "S", lines: ["Line"] }, "/chest/approve", "https://acme.example"), /^Line\n\nOpen it: https:\/\/acme\.example\/chest\/approve\n\n—\n/u);
  assert.deepEqual(await cleanup(database.sql), { uploads: 0, drafts: 0 });
});

test("a sent expense nobody decided on is taken back by its owner, and only then", async () => {
  const back = await call(hugo, "retractExpense", { id: "8" });
  assert.equal(back.ok, true);
  assert.equal((await database.sql`select status from expenses where id = 8`)[0]!["status"], "draft");
  assert.equal((await call(hugo, "retractExpense", { id: "8" })).error, "not_submitted");
  assert.equal((await call(lea, "retractExpense", { id: "7" })).status, 404, "not hers");
  assert.equal((await call(hugo, "retractExpense", { id: "5" })).error, "not_submitted", "approved: too late");
  assert.match(await (await get(hugo, "/chest/expenses/7")).text(), /&quot;retract&quot;:true/u);
  assert.match(await (await get(hugo, "/chest/expenses/8")).text(), /&quot;retract&quot;:false/u);
});

test("To pay back: what the accountant approved themselves is said; a file is cancelled only after a confirmation", async () => {
  const html = await (await get({ ...camille, language: "en" }, "/chest/pay")).text();
  assert.match(html, /You approved it: have someone else check it before paying/u);
  assert.match(html, /Cancel the file of|Pay back by transfer file/u);
});
