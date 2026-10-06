import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { decideQuote, getDocument, removeDraft, saveDraft } from "../src/lib/documents.ts";
import { AppError } from "../src/lib/app-error.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { answer, openLink, shownPdf } from "../src/lib/online.ts";
import { pdfFileName } from "../src/lib/pdf/document.ts";
import { draftMessage, markSent, sendDocument } from "../src/lib/sending.ts";
import { changesSince, diffLines, discardVersion, earlierVersions, reviseQuote, versionPdf, versionsOf } from "../src/lib/versions.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea, sofia } from "./support/members.ts";

// A sent quote never changes silently under its number (round 3): changing
// it starts its next version; the version sent is kept with the PDF the
// client was shown; the client's link says a new version is coming, then
// shows it, saying which one it replaces; earlier versions stay readable;
// an answer names the version it was given on.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier-martin.test" } });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const context = { company: "Atelier Martin SARL", sender: "Inès Moreau", iban: "", bic: "", today };
const visitor = { hash: "h4sh0fth3v1s1t0r", userAgent: "Mozilla/5.0 (test)", language: "fr" as const };
const origin = "https://quotes.atelier.argentic.work";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function sentQuote() {
  const { sql } = database;
  const c = await client(sql, { name: "Client " + Math.random().toString(36).slice(2, 8), siren: "", vatNumber: "" });
  const q = await draft(sql, "quote", c.id, [line("Logo", 1000, 40000), line("Site vitrine", 1000, 150000)], ines);
  const message = draftMessage(await getDocument(sql, asMember(ines), q.id, today), "send", context);
  await sendDocument(sql, asMember(ines), q.id, message, today, { origin });
  const secret = chest.outbox.at(-1)!.text.split("/q/")[1]!.split(/\s/u)[0]!;
  return { id: q.id, secret };
}

test("only a sent quote waiting for its answer gets a next version, by those who write quotes", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Brouillon SARL", siren: "", vatNumber: "" });
  const d = await draft(sql, "quote", c.id, [line("Conseil", 1000, 10000)], ines);
  await assert.rejects(reviseQuote(sql, asMember(ines), d.id, today), refused("wrong_status"));
  const { id } = await sentQuote();
  await assert.rejects(reviseQuote(sql, asMember(lea), id, today), refused("forbidden"));
  await decideQuote(sql, asMember(ines), id, "accepted");
  await assert.rejects(reviseQuote(sql, asMember(ines), id, today), refused("wrong_status"));
  // The answer taken back: the quote waits again, and may change.
  await decideQuote(sql, asMember(ines), id, "sent");
  assert.equal((await reviseQuote(sql, asMember(hugo), id, today)).version, 2);
});

test("changing a sent quote keeps the version sent and its PDF; the link waits for the new one", async () => {
  const { sql } = database;
  const { id, secret } = await sentQuote();
  const before = await getDocument(sql, asMember(ines), id, today);
  const read = await shownPdf(sql, (await openLink(sql, secret, today))!, today);

  const next = await reviseQuote(sql, asMember(ines), id, today);
  assert.equal(next.status, "draft");
  assert.equal(next.version, 2);
  assert.equal(next.number, before.number, "same number: the version says the change");
  // Editable again as a draft; never deleted (it was sent under its number).
  await saveDraft(sql, asMember(ines), id, { lines: [line("Logo", 1000, 40000), line("Site vitrine", 1000, 160000), line("Photos", 1000, 30000)] });
  await assert.rejects(removeDraft(sql, asMember(ines), id), refused("wrong_status"));

  // The version sent, kept as it was, with the very PDF the client read.
  const [v1] = await versionsOf(sql, asMember(lea), id);
  assert.equal(v1!.version, 1);
  assert.equal(v1!.gross, before.gross);
  assert.equal(v1!.lines.length, 2);
  assert.equal(v1!.pdfSha256, read.sha256);
  assert.equal(v1!.replacedBy, ines.id);
  const pdf = await versionPdf(sql, id, "1");
  assert.equal(sha(pdf.bytes), read.sha256);
  await assert.rejects(versionPdf(sql, id, "2"), refused("not_found"));
  await assert.rejects(versionPdf(sql, id, "../1"), refused("not_found"));

  // The client's link: being updated, no answer taken on what they read.
  const opened = (await openLink(sql, secret, today))!;
  assert.equal(opened.showing, "revising");
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: read.sha256 }, visitor, today), refused("changed"));
  assert.equal((await earlierVersions(sql, id)).length, 1);
});

test("a new version not sent yet is discarded: the quote is again what was sent, and the client may still answer it", async () => {
  const { sql } = database;
  const { id, secret } = await sentQuote();
  const before = await getDocument(sql, asMember(ines), id, today);
  const read = await shownPdf(sql, (await openLink(sql, secret, today))!, today);
  await reviseQuote(sql, asMember(ines), id, today);
  await saveDraft(sql, asMember(ines), id, { title: "Autre chose", lines: [line("Tout autre chose", 1000, 999900)] });
  await assert.rejects(discardVersion(sql, asMember(lea), id), refused("forbidden"));
  const back = await discardVersion(sql, asMember(ines), id);
  assert.equal(back.status, "sent");
  assert.equal(back.version, 1);
  const after = await getDocument(sql, asMember(ines), id, today);
  assert.deepEqual(after.lines.map(l => [l.description, l.net]), before.lines.map(l => [l.description, l.net]));
  assert.equal(after.gross, before.gross);
  assert.equal(after.title, before.title);
  assert.equal(after.sentAt, before.sentAt);
  assert.equal(after.updatedAt, before.updatedAt);
  assert.equal((await versionsOf(sql, asMember(lea), id)).length, 0);
  await assert.rejects(discardVersion(sql, asMember(ines), id), refused("wrong_status"));
  // Nothing changed for the client: the answer on what they read counts.
  const done = await answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: read.sha256 }, visitor, today);
  assert.equal(done.answer.version, 1);
});

test("the new version goes by email under the same link, saying what it replaces; the client accepts exactly it", async () => {
  const { sql } = database;
  const { id, secret } = await sentQuote();
  const read = await shownPdf(sql, (await openLink(sql, secret, today))!, today);
  await reviseQuote(sql, asMember(ines), id, today);
  await saveDraft(sql, asMember(ines), id, { lines: [line("Logo", 1000, 40000), line("Site vitrine", 1000, 160000)] });
  const full = await getDocument(sql, asMember(ines), id, today);
  const message = draftMessage(full, "send", { ...context, replaces: today });
  assert.equal(message.subject, `Devis ${full.number} v2 — Atelier Martin SARL`);
  assert.ok(message.text.includes("la version 2 de notre devis") && message.text.includes("Elle remplace la version envoyée le 28 septembre 2026"), message.text);
  await sendDocument(sql, asMember(ines), id, message, today, { origin });
  const mail = chest.outbox.at(-1)!;
  assert.ok(mail.text.startsWith(`Lisez le devis ${full.number} v2 et acceptez-le en ligne : ${origin}/q/${secret}`), "the same link, first");
  assert.equal(mail.attachments?.[0]?.name, pdfFileName(full));
  assert.match(pdfFileName(full), /-v2\.pdf$/u);

  // The page shows the new version; an answer on the old one is refused,
  // and the page can say what changed.
  const opened = (await openLink(sql, secret, today))!;
  assert.equal(opened.showing, "open");
  assert.equal(opened.full.version, 2);
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: read.sha256 }, visitor, today), refused("changed"));
  const changed = await changesSince(sql, opened.full, read.sha256);
  assert.equal(changed?.version, 1);
  assert.deepEqual(changed?.changes, [
    { kind: "changed", description: "Site vitrine", before: 150000, after: 160000 },
    { kind: "total", before: 228000, after: 240000 },
  ]);
  const now = await shownPdf(sql, opened, today);
  assert.notEqual(now.sha256, read.sha256);
  const done = await answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: now.sha256 }, visitor, today);
  assert.equal(done.answer.version, 2);
  assert.equal(done.answer.gross, 240000);
  assert.equal(done.answer.pdfSha256, now.sha256);
  // The earlier version stays readable, as it was sent.
  assert.equal(sha((await versionPdf(sql, id, 1)).bytes), read.sha256);
});

test("a version sent by hand counts too, and versions follow each other", async () => {
  const { sql } = database;
  const { id } = await sentQuote();
  await reviseQuote(sql, asMember(ines), id, today);
  await markSent(sql, asMember(ines), id, today);
  await reviseQuote(sql, asMember(sofia), id, today);
  await markSent(sql, asMember(sofia), id, today);
  const full = await getDocument(sql, asMember(lea), id, today);
  assert.equal(full.version, 3);
  assert.equal(full.status, "sent");
  assert.deepEqual((await versionsOf(sql, asMember(lea), id)).map(v => v.version), [2, 1]);
});

test("changes are told by their words: changed, added, removed, then the total", () => {
  const l = (description: string, net: number) => ({ kind: "line" as const, itemId: null, description, quantity: 1000, unit: "", unitPrice: net, discount: 0, vatRate: 2000, goods: false, net });
  const section = { ...l("Titre", 0), kind: "section" as const };
  assert.deepEqual(diffLines([section, l("A", 100), l("B", 200)], 360, [l("A", 150), l("C", 50)], 240), [
    { kind: "changed", description: "A", before: 100, after: 150 },
    { kind: "added", description: "C", amount: 50 },
    { kind: "removed", description: "B", amount: 200 },
    { kind: "total", before: 360, after: 240 },
  ]);
  assert.deepEqual(diffLines([l("A", 100)], 120, [l("A", 100)], 120), []);
});

test("an erased member's id leaves the versions", async () => {
  const { sql } = database;
  const { id } = await sentQuote();
  await reviseQuote(sql, asMember(hugo), id, today);
  await erase(sql, hugo.id);
  const [v] = await versionsOf(sql, asMember(lea), id);
  assert.equal(v!.replacedBy, "erased");
});
