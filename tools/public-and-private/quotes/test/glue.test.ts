import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/shared/app-error.ts";
import { disposition, downloadLimits, downloadsInFlight, linkGuard, publicFile } from "../src/lib/downloads.ts";
import { ensureLink } from "../src/lib/online.ts";
import { forgetKept, keptBytes, keptLimits, recall, remember } from "../src/lib/kept.ts";
import { grantLogo } from "../src/lib/logo.ts";
import { cut } from "../src/lib/notify.ts";
import { nameOf, people } from "../src/lib/people.ts";
import { answerUrl, publicOrigin } from "../src/lib/public-origin.ts";
import { remindLatePayers } from "../src/lib/reminders.ts";
import { kindOf, rowView } from "../src/lib/rows.ts";
import { listStamp } from "../src/lib/stamp.ts";
import { sendQuote, listDocuments } from "../src/lib/documents.ts";
import type { DocView } from "../src/lib/views.ts";
import { catalogue } from "../src/i18n/index.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea } from "./support/members.ts";

// The glue around the rules: the public part's file bounds and its kept
// copies, the logo's grant, the bell's words, the names of people, the
// public address, the lists' rows.
let chest: FakeChest;
let database: TestDatabase;
before(async () => {
  chest = await fakeChest({ tool: "quotes", members: everyone, capabilities: ["members", "files", "notifications"], former: [{ id: "mbr_" + "z".repeat(26), name: "Zoé Ancienne", status: "former" }, { id: "mbr_" + "y".repeat(26), name: "Yann Sans", status: "no_access" }], chest: { publicUrl: "https://devis.atelier-martin.fr" } });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await database.close();
  await chest.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("files kept by their fingerprint: the most recent stay, within the bound", () => {
  forgetKept();
  const big = new Uint8Array(keptLimits.fileBytes);
  remember("a", big);
  remember("b", big);
  remember("c", big);
  assert.equal(recall("a")?.byteLength, keptLimits.fileBytes, "recalled: now the most recent");
  remember("d", big);
  assert.ok(keptBytes() <= keptLimits.totalBytes);
  assert.equal(recall("b"), null, "the oldest went first");
  assert.ok(recall("a") && recall("d"));
  remember("too-big", new Uint8Array(keptLimits.fileBytes + 1));
  assert.equal(recall("too-big"), null);
  forgetKept();
  assert.equal(keptBytes(), 0);
});

test("public files: two at once, the third told to come back; a slot is given back when the body has left", async () => {
  const file = { bytes: new Uint8Array(downloadLimits.chunk * 2 + 10), name: "Devis D-2026-0001.pdf", disposition: "inline" as const, type: "application/pdf" };
  const first = await publicFile(async () => file);
  const second = await publicFile(async () => file);
  assert.equal(downloadsInFlight(), 2);
  const third = await publicFile(async () => file);
  assert.equal(third.status, 503);
  assert.equal(third.headers.get("retry-after"), String(downloadLimits.retryAfter));
  assert.equal((await first.arrayBuffer()).byteLength, file.bytes.byteLength);
  assert.equal(first.headers.get("content-disposition"), `inline; filename="Devis D-2026-0001.pdf"; filename*=UTF-8''Devis%20D-2026-0001.pdf`);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  await second.body!.cancel();
  assert.equal(downloadsInFlight(), 0);
  assert.equal((await publicFile(async () => null)).status, 404);
  assert.equal(downloadsInFlight(), 0, "a refusal gives its slot back");
  assert.equal(disposition("attachment", "Facture é.pdf"), `attachment; filename="Facture _.pdf"; filename*=UTF-8''Facture%20%C3%A9.pdf`);
});

test("a link hands out its files so many times an hour, whoever asks", async () => {
  const { sql } = database;
  const c = await client(sql);
  const q = await draft(sql, "quote", c.id, [line("Logo", 1000, 50000)]);
  await sendQuote(sql, asMember(hugo), q.id, null, today);
  const link = await ensureLink(sql, asMember(hugo), q.id);
  const at = new Date("2026-09-28T10:15:00Z");
  for (let i = 0; i < downloadLimits.perLinkHour; i++) assert.equal(await linkGuard(sql, link.id, at), true);
  assert.equal(await linkGuard(sql, link.id, at), false);
  assert.equal(await linkGuard(sql, link.id, new Date("2026-09-28T11:01:00Z")), true, "the next hour");
});

test("the logo's upload: an administrator's, a PNG or JPEG of 1 MiB at most", async () => {
  await assert.rejects(grantLogo(asMember(hugo), { type: "image/png", size: 100 }), refused("forbidden"));
  await assert.rejects(grantLogo(asMember(camille), { type: "image/gif", size: 100 }), refused("logo_type"));
  await assert.rejects(grantLogo(asMember(camille), { type: "image/png", size: (1 << 20) + 1 }), refused("logo_too_large"));
  const granted = await grantLogo(asMember(camille), { type: "image/png", size: 1000 });
  assert.match(granted.object, /^logo\/[0-9a-f]{24}\.png$/u);
  assert.equal(granted.method, "PUT");
});

test("the bell's words are cut by characters, with an ellipsis", () => {
  assert.equal(cut("Facture  prête :\n Dupain", 80), "Facture prête : Dupain");
  assert.equal(cut("é".repeat(100), 10), "é".repeat(9) + "…");
});

test("people: a member's name, a former member's, one who lost access, an erased one", async () => {
  const found = await people([hugo.id, "mbr_" + "z".repeat(26), "mbr_" + "y".repeat(26), "erased", "tool:crm"]);
  assert.equal(nameOf(found.get(hugo.id), "en"), "Hugo Bernard");
  assert.equal(nameOf(found.get("mbr_" + "z".repeat(26)), "en"), "Zoé Ancienne (former member)");
  assert.equal(nameOf(found.get("mbr_" + "y".repeat(26)), "fr"), "Yann Sans (sans accès)");
  assert.equal(nameOf(undefined, "fr"), "Membre inconnu");
});

test("the public address is the Chest's word (a company's own domain), never guessed", () => {
  assert.equal(publicOrigin(), "https://devis.atelier-martin.fr");
  assert.equal(answerUrl("SampleAnswerLinkQuoteD0006Roux01"), "https://devis.atelier-martin.fr/q/SampleAnswerLinkQuoteD0006Roux01");
});

test("reminders stay off until an administrator turns them on", async () => {
  assert.deepEqual(await remindLatePayers(database.sql, "2026-12-01"), { emailed: 0, told: 0 });
});

test("a list's row: its kind, number, client and amount, written for the reader", async () => {
  const rows = await listDocuments(database.sql, asMember(lea), { types: ["quote"] }, today);
  const row = rows[0]!;
  const view = rowView(row, catalogue("fr"), "fr");
  assert.equal(view.kind, kindOf(row, catalogue("fr")));
  assert.equal(view.href, `/chest/documents/${row.id}`);
  assert.match(view.amount, /600,00\s€/u);
  assert.equal(view.stateText, catalogue("fr").states[row.state]);
  const shape: Pick<DocView, "id"> = { id: view.id };
  assert.equal(shape.id, row.id);
});

test("the lists' version moves with what they show, and only then", async () => {
  const { sql } = database;
  const first = await listStamp(sql, today);
  assert.equal(await listStamp(sql, today), first, "nothing new: the same mark (a refresh gets a 304)");
  await sql`update documents set updated_at = updated_at where false`;
  assert.equal(await listStamp(sql, today), first, "an empty statement changes nothing");
  const c = await client(sql, { name: "Version Témoin" });
  const withClient = await listStamp(sql, today);
  assert.notEqual(withClient, first, "a client's name changed");
  const d = await draft(sql, "quote", c.id, [line("Logo", 1000, 50000)]);
  const withDraft = await listStamp(sql, today);
  assert.notEqual(withDraft, withClient, "a new draft");
  await sql`update documents set deleted_at = now(), updated_at = now() where id = ${d.id}`;
  assert.notEqual(await listStamp(sql, today), withDraft, "a draft dropped");
  assert.notEqual(await listStamp(sql, "2099-01-01"), await listStamp(sql, today), "another day: what is overdue moves");
  const still = await listStamp(sql, today);
  await sql`delete from payments where id < 0`;
  assert.equal(await listStamp(sql, today), still, "a statement that changes nothing does not move it");
});
