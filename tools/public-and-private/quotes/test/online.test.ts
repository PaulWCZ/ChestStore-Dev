import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { decideQuote, getDocument, saveDraft } from "../lib/documents.ts";
import { AppError } from "../lib/errors.ts";
import { erase } from "../lib/lifecycle.ts";
import { reviseQuote } from "../lib/versions.ts";
import { answer, answerPdf, answersOf, ensureLink, liveLink, openLink, renewLink, revokeLink, shownPdf } from "../lib/online.ts";
import { draftMessage, markSent, sendDocument, withAnswerLink } from "../lib/sending.ts";
import { answeredOnline } from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea, sofia } from "./support/members.ts";

// The client's answer online: a sent quote carries a secret link; the
// client reads the quote (page and PDF) and accepts it ("Bon pour accord")
// or declines it; the answer is kept with its proof, the quote changes
// state, its author hears it in the bell. Nothing opens without the secret.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier-martin.test" } });
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const context = { company: "Atelier Martin SARL", sender: "Inès Moreau", iban: "", bic: "", today };
const visitor = { hash: "h4sh0fth3v1s1t0r", userAgent: "Mozilla/5.0 (test)", language: "fr" as const };
const secretOf = (url: string) => url.split("/q/")[1]!.split(/\s/u)[0]!;

async function sentQuote(by = ines) {
  const { sql } = database;
  const c = await client(sql, { name: "Client " + Math.random().toString(36).slice(2, 8), siren: "", vatNumber: "" });
  const q = await draft(sql, "quote", c.id, [line("Refonte du site", 1000, 250000)], by);
  const message = draftMessage(await getDocument(sql, asMember(by), q.id, today), "send", context);
  await sendDocument(sql, asMember(by), q.id, message, today, { origin: "https://quotes.atelier.argentic.work" });
  const mail = chest.outbox.at(-1)!;
  return { id: q.id, secret: secretOf(mail.text), mail };
}

test("a quote's email carries its answer link, before the sign-off, in the client's language", async () => {
  const { sql } = database;
  const { id, secret, mail } = await sentQuote();
  assert.match(secret, /^[A-Za-z0-9_-]{32}$/u);
  // The link is the email's first line, not an afterthought; nobody is
  // asked to reply to accept (round 3: replies reach a mailbox the tool
  // never reads).
  const number = (await getDocument(sql, asMember(ines), id, today)).number!;
  assert.ok(mail.text.startsWith(`Lisez le devis ${number} et acceptez-le en ligne\u202f: https://quotes.atelier.argentic.work/q/` + secret + "\n\nBonjour"), mail.text.slice(0, 200));
  assert.ok(!/répondre à cet e-mail|reply to this email/u.test(mail.text));
  const link = await liveLink(sql, id);
  assert.equal(link?.secret, secret);
  // The same link on every send; never twice in one text.
  assert.equal((await ensureLink(sql, asMember(ines), id)).secret, secret);
  const url = "https://x.test/q/" + secret;
  assert.equal(withAnswerLink(withAnswerLink("Bonjour,\n\nCordialement,\nInès", "fr", url, "D-2026-0001"), "fr", url, "D-2026-0001").split(url).length, 2);
  // The secret is stored hashed for lookups.
  const [row] = await sql<{ secret_hash: string }[]>`select secret_hash from quote_links where document_id = ${id}`;
  assert.equal(row!.secret_hash, createHash("sha256").update(secret).digest("hex"));
});

test("a quote sent by hand gets its link too; a draft has none", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Par la main SARL", siren: "", vatNumber: "" });
  const q = await draft(sql, "quote", c.id, [line("Conseil", 1000, 50000)], hugo);
  await assert.rejects(ensureLink(sql, asMember(hugo), q.id), refused("wrong_status"));
  await markSent(sql, asMember(hugo), q.id, today);
  assert.ok(await liveLink(sql, q.id));
});

test("nothing opens without the exact secret", async () => {
  const { sql } = database;
  assert.equal(await openLink(sql, "nope", today), null);
  assert.equal(await openLink(sql, "A".repeat(32), today), null);
  assert.equal(await openLink(sql, "../../chest", today), null);
});

test("the client accepts: name, Bon pour accord, the PDF they saw; the author hears it", async () => {
  const { sql } = database;
  const { id, secret } = await sentQuote(ines);
  const opened = (await openLink(sql, secret, today))!;
  assert.equal(opened.showing, "open");
  const shown = await shownPdf(sql, opened, today);
  // The PDF shown is kept, and its fingerprint is the file's.
  const [link] = await sql<{ pdf_object: string; pdf_sha256: string }[]>`select pdf_object, pdf_sha256 from quote_links where document_id = ${id}`;
  const kept = chest.files.get(link!.pdf_object)!;
  assert.equal(createHash("sha256").update(kept.data).digest("hex"), shown.sha256);
  // Shown again: the same file, not drawn twice.
  assert.equal((await shownPdf(sql, (await openLink(sql, secret, today))!, today)).sha256, shown.sha256);

  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", shown: shown.sha256 }, visitor, today), refused("must_agree"));
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "M", agree: "yes", shown: shown.sha256 }, visitor, today), refused("name_short"));
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: "0".repeat(64) }, visitor, today), refused("changed"));
  await assert.rejects(answer(sql, secret, { answer: "maybe", name: "Marie Dupain", agree: "yes", shown: shown.sha256 }, visitor, today), refused("invalid"));

  const before = chest.notifications.length;
  const done = await answer(sql, secret, { answer: "accepted", name: "  Marie   Dupain ", agree: "yes", shown: shown.sha256 }, visitor, today);
  await answeredOnline(done.full, done.answer);
  assert.equal(done.answer.name, "Marie Dupain");
  assert.equal(done.answer.pdfSha256, shown.sha256);
  assert.equal(done.answer.answeredOn, today);
  assert.equal(done.answer.visitorHash, visitor.hash);
  const full = await getDocument(sql, asMember(lea), id, today);
  assert.equal(full.state, "accepted");
  assert.equal(full.decidedBy, "client");
  const told = chest.notifications.slice(before);
  assert.deepEqual(told.map(n => n.member), [ines.id]);
  assert.equal(told[0]!.title, `Marie Dupain a accepté le devis ${full.number} en ligne`);
  assert.equal(told[0]!.path, `/chest/documents/${id}`);
  // The page now says it is accepted, by whom; a second answer is refused.
  const after = (await openLink(sql, secret, today))!;
  assert.equal(after.showing, "accepted");
  assert.equal(after.answer?.name, "Marie Dupain");
  await assert.rejects(answer(sql, secret, { answer: "refused", name: "Someone Else", shown: shown.sha256 }, visitor, today), refused("answered"));
  // The members read the proof and download the exact PDF.
  const [a] = await answersOf(sql, asMember(lea), id);
  const pdf = await answerPdf(sql, asMember(lea), a!.id);
  assert.equal(createHash("sha256").update(pdf.bytes).digest("hex"), shown.sha256);
  assert.equal(pdf.documentId, id);
  await assert.rejects(answerPdf(sql, null, a!.id), refused("forbidden"));
});

test("the client declines with a reason; the quote is refused", async () => {
  const { sql } = database;
  const { id, secret } = await sentQuote(hugo);
  const opened = (await openLink(sql, secret, today))!;
  const { sha256 } = await shownPdf(sql, opened, today);
  const done = await answer(sql, secret, { answer: "refused", name: "Paul Client", reason: "Trop cher pour nous cette année.", shown: sha256 }, visitor, today);
  assert.equal(done.answer.reason, "Trop cher pour nous cette année.");
  assert.equal((await getDocument(sql, asMember(lea), id, today)).state, "refused");
  // Taken back by the company: the page waits for an answer again.
  await decideQuote(sql, asMember(hugo), id, "sent");
  assert.equal((await openLink(sql, secret, today))!.showing, "open");
});

test("a quote changed after the client opened it must be read again", async () => {
  const { sql } = database;
  const { id, secret } = await sentQuote(ines);
  const { sha256 } = await shownPdf(sql, (await openLink(sql, secret, today))!, today);
  // A sent quote changes through its next version (test/versions.test.ts).
  await reviseQuote(sql, asMember(ines), id, today);
  await saveDraft(sql, asMember(ines), id, { lines: [line("Refonte du site", 1000, 260000)] });
  assert.equal((await openLink(sql, secret, today))!.showing, "revising");
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: sha256 }, visitor, today), refused("changed"));
  await markSent(sql, asMember(ines), id, today);
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: sha256 }, visitor, today), refused("changed"));
  const fresh = await shownPdf(sql, (await openLink(sql, secret, today))!, today);
  assert.notEqual(fresh.sha256, sha256);
  const done = await answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: fresh.sha256 }, visitor, today);
  assert.equal(done.answer.version, 2);
  assert.equal((await getDocument(sql, asMember(lea), id, today)).state, "accepted");
});

test("past its validity date the link says the quote expired", async () => {
  const { sql } = database;
  const { secret } = await sentQuote(ines);
  const opened = (await openLink(sql, secret, today))!;
  const later = "2027-06-01";
  assert.equal((await openLink(sql, secret, later))!.showing, "expired");
  const { sha256 } = await shownPdf(sql, opened, today);
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: sha256 }, visitor, later), refused("expired"));
});

test("a link turned off never works again; a new one does", async () => {
  const { sql } = database;
  const { id, secret } = await sentQuote(ines);
  await assert.rejects(revokeLink(sql, asMember(lea), id), refused("forbidden"));
  await revokeLink(sql, asMember(ines), id);
  assert.equal((await openLink(sql, secret, today))!.showing, "off");
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: "a".repeat(64) }, visitor, today), refused("link_off"));
  await assert.rejects(revokeLink(sql, asMember(ines), id), refused("wrong_status"));
  const fresh = await renewLink(sql, asMember(sofia), id);
  assert.notEqual(fresh.secret, secret);
  assert.equal((await openLink(sql, fresh.secret, today))!.showing, "open");
  assert.equal((await openLink(sql, secret, today))!.showing, "off");
});

test("an erased member's id leaves the links", async () => {
  const { sql } = database;
  const { id } = await sentQuote(hugo);
  await erase(sql, hugo.id);
  const [row] = await sql<{ created_by: string }[]>`select created_by from quote_links where document_id = ${id}`;
  assert.equal(row!.created_by, "erased");
});
