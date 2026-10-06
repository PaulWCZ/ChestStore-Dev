import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import * as files from "@argentic/chest-sdk/files";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { company as readCompany } from "../src/lib/company.ts";
import { getDocument } from "../src/lib/documents.ts";
import { AppError } from "../src/lib/app-error.ts";
import { answer, openLink, shownPdf } from "../src/lib/online.ts";
import { draftMessage, sendDocument } from "../src/lib/sending.ts";
import { grantTerms, removeTerms, saveTerms, termsFile } from "../src/lib/terms.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, ines, lea, sofia } from "./support/members.ts";

// The company's terms and conditions of sale (CGV): a PDF added once by an
// administrator, sent with every quote, linked on the client's page, and
// kept by its fingerprint with an answer given online.

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
const pdf = new TextEncoder().encode("%PDF-1.4\n% Conditions générales de vente\n%%EOF\n");
const context = { company: "Atelier Martin SARL", sender: "Inès Moreau", iban: "", bic: "", today };
const visitor = { hash: "h4sh", userAgent: "test", language: "fr" as const };

test("only an administrator adds the terms, and only a PDF within bounds", async () => {
  const { sql } = database;
  await assert.rejects(grantTerms(asMember(sofia), { type: "application/pdf", size: 1000 }), refused("forbidden"));
  await assert.rejects(grantTerms(asMember(camille), { type: "image/png", size: 1000 }), refused("terms_type"));
  await assert.rejects(grantTerms(asMember(camille), { type: "application/pdf", size: 6 << 20 }), refused("terms_too_large"));
  const grant = await grantTerms(asMember(camille), { type: "application/pdf", size: 1000 });
  assert.match(grant.object, /^terms\/[0-9a-f]{24}\.pdf$/u);
  // A file that is not a PDF is refused and removed.
  await files.put("terms/000000000000000000000001.pdf", new TextEncoder().encode("hello"), "application/pdf");
  await assert.rejects(saveTerms(sql, asMember(camille), "terms/000000000000000000000001.pdf", "cgv.pdf"), refused("terms_type"));
  assert.equal(chest.files.has("terms/000000000000000000000001.pdf"), false);
  await assert.rejects(saveTerms(sql, asMember(camille), "../logo/x.pdf", "cgv.pdf"), refused("file_missing"));
  await assert.rejects(saveTerms(sql, asMember(lea), grant.object, "cgv.pdf"), refused("forbidden"));
});

test("the terms go with every quote; an answer online keeps their fingerprint", async () => {
  const { sql } = database;
  await files.put("terms/000000000000000000000002.pdf", pdf, "application/pdf");
  await saveTerms(sql, asMember(camille), "terms/000000000000000000000002.pdf", "CGV Atelier Martin 2026.pdf");
  const c = await readCompany(sql);
  assert.equal(c.terms?.name, "CGV Atelier Martin 2026.pdf");
  assert.equal(c.terms?.sha256, createHash("sha256").update(pdf).digest("hex"));
  assert.equal((await termsFile(sql))?.sha256, c.terms?.sha256);

  const buyer = await client(sql, { name: "Client CGV", siren: "", vatNumber: "" });
  const q = await draft(sql, "quote", buyer.id, [line("Conseil", 1000, 50000)], ines);
  await sendDocument(sql, asMember(ines), q.id, draftMessage(await getDocument(sql, asMember(ines), q.id, today), "send", context), today, { origin: "https://q.test" });
  const mail = chest.outbox.at(-1)!;
  assert.equal(mail.attachments?.length, 2);
  assert.equal(mail.attachments?.[1]?.name, "Conditions-generales-de-vente.pdf");
  const secret = mail.text.split("/q/")[1]!.split(/\s/u)[0]!;
  const shown = await shownPdf(sql, (await openLink(sql, secret, today))!, today);
  // Terms changed since the page was shown: read again.
  await assert.rejects(answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: shown.sha256, terms: "" }, visitor, today), refused("changed"));
  const done = await answer(sql, secret, { answer: "accepted", name: "Marie Dupain", agree: "yes", shown: shown.sha256, terms: c.terms!.sha256 }, visitor, today);
  assert.equal(done.answer.termsSha256, c.terms!.sha256);

  // Removed: quotes go without them; the file stays for that answer.
  await removeTerms(sql, asMember(camille));
  assert.equal((await readCompany(sql)).terms, null);
  assert.ok(chest.files.has("terms/000000000000000000000002.pdf"));
  const again = await draft(sql, "quote", buyer.id, [line("Conseil", 1000, 50000)], ines);
  await sendDocument(sql, asMember(ines), again.id, draftMessage(await getDocument(sql, asMember(ines), again.id, today), "send", context), today);
  assert.equal(chest.outbox.at(-1)!.attachments?.length, 1);
});
