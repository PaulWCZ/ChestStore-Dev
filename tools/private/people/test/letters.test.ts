import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/errors.ts";
import { catalogue } from "../src/i18n/index.ts";
import { ofRecord } from "../src/lib/journal.ts";
import { addExamples, fill, listLetters, printLetter, purgeLetters, removeLetter, saveLetter, shown } from "../src/lib/letters.ts";
import { createRecord, updateRecord } from "../src/lib/records.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, nora, sofia } from "./support/members.ts";

// Letters from templates: a certificat de travail, an attestation d'emploi.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications"], chest: { organization: "Atelier Martin" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hr = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("fields fill a letter; what the record does not say is blank and named; unknown braces stay", () => {
  const done = fill("{name} works here since {firstDay} as {job}. {unknown} {lastDay}", { name: "PETIT Nora", firstDay: "23 September 2026", job: "" });
  assert.equal(done.text, "PETIT Nora works here since 23 September 2026 as ……. {unknown} ……");
  assert.deepEqual(done.missing, ["job", "lastDay"]);
});

test("the two examples in one click, each shown in the reader's language until HR rewords it; deleting has Undo", async () => {
  const { sql } = database;
  await assert.rejects(addExamples(sql, asMember(hugo), catalogue("en")), refused("forbidden"));
  const ids = await addExamples(sql, hr, catalogue("fr"));
  assert.equal(ids.length, 2);
  // Twice: nothing more.
  assert.deepEqual(await addExamples(sql, hr, catalogue("fr")), []);
  const [cert] = await listLetters(sql, hr);
  assert.deepEqual([cert!.phrase, shown(cert!, catalogue("en")).name, shown(cert!, catalogue("fr")).name], ["certificate", "Certificate of employment", "Certificat de travail"]);
  // Saved as it is (in English): still the example; reworded: HR's own.
  const same = await saveLetter(sql, hr, cert!.id, catalogue("en").letters.examples.certificate);
  assert.equal(same.phrase, "certificate");
  const fr = catalogue("fr").letters.examples.certificate;
  const mine = await saveLetter(sql, hr, cert!.id, { name: fr.name, body: fr.body.replace("[Adresse de l’entreprise]", "12 rue des Tanneurs, 69007 Lyon").replace("[ville]", "Lyon") });
  assert.equal(mine.phrase, null);
  await removeLetter(sql, hr, ids[1]!, true);
  assert.equal((await listLetters(sql, hr)).length, 1);
  await removeLetter(sql, hr, ids[1]!, false);
  assert.equal((await listLetters(sql, hr)).length, 2);
  assert.equal(await purgeLetters(sql), 0);
  await assert.rejects(saveLetter(sql, hr, null, { name: "", body: "x" }), refused("empty"));
});

test("a letter printed from a record: filled in HR's language, signed by them, noted in the record's journal; nobody else prints", async () => {
  const { sql } = database;
  const { id } = await createRecord(sql, hr, { memberId: nora.id });
  await updateRecord(sql, hr, id, { legalName: "PETIT Nora", birthDate: "2000-02-11", job: "Sales assistant", qualification: "Employée, niveau 2", startDate: "2026-09-23", endDate: "2027-03-31" });
  const [cert] = await listLetters(sql, hr);
  const done = await printLetter(sql, hr, id, cert!.id, "2027-03-31");
  assert.equal(done.title, "Certificat de travail");
  assert.match(done.text, /^CERTIFICAT DE TRAVAIL\n\nAtelier Martin\n12 rue des Tanneurs, 69007 Lyon/u);
  assert.match(done.text, /Je soussigné\(e\) Camille Martin, agissant pour le compte de Atelier Martin, certifie que PETIT Nora, né\(e\) le 11 février 2000, a été employé\(e\) dans notre entreprise du 23 septembre 2026 au 31 mars 2027, en qualité de Sales assistant \(Employée, niveau 2\)\./u);
  assert.match(done.text, /Fait à Lyon, le 31 mars 2027\./u);
  assert.deepEqual(done.missing, []);
  const log = await ofRecord(sql, id);
  assert.deepEqual([log[0]!.action, log[0]!.fields], ["letter_printed", ["Certificat de travail"]]);
  // In English for an English-speaking HR person; what is missing is said.
  const attestation = (await listLetters(sql, hr)).find(l => l.phrase === "attestation")!;
  const en = await printLetter(sql, asMember(sofia), id, attestation.id, "2026-10-01");
  assert.match(en.text, /confirm that PETIT Nora has been employed by the company since 23 September 2026 as Sales assistant\. Contract: Permanent \(CDI\), full time\./u);
  await assert.rejects(printLetter(sql, asMember(nora), id, cert!.id, "2027-03-31"), refused("forbidden"));
  await assert.rejects(printLetter(sql, hr, "999", cert!.id, "2027-03-31"), refused("not_found"));
});
