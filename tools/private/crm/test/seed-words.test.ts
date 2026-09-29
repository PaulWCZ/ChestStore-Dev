import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as companies from "../lib/companies.ts";
import { companiesCsv } from "../lib/export.ts";
import * as fields from "../lib/fields.ts";
import { catalogue } from "../lib/i18n/index.ts";
import { tags } from "../lib/model.ts";
import { keptKeys, shownName } from "../lib/seed-words.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, ines } from "./support/members.ts";

// The names the tool seeds (the sample's tags, industries, own fields and
// their choices) follow each reader's language until someone renames them.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
const en = catalogue("en"), fr = catalogue("fr");

test("a seeded name is shown in the reader's language; typed in any language it stays one key", () => {
  assert.equal(shownName("tags", "@keyAccount", en), "key account");
  assert.equal(shownName("tags", "@keyAccount", fr), "grand compte");
  assert.equal(shownName("industries", "@foodRetail", fr), "Commerce alimentaire");
  assert.equal(shownName("tags", "@unknownKey", fr), "@unknownKey");
  assert.equal(shownName("tags", "vip", fr), "vip");
  // A record's seeded tags come back from a form in either language: kept.
  assert.deepEqual(keptKeys("tags", ["@keyAccount", "@retail"], ["Grand compte", "retail", "VIP"]), ["@keyAccount", "@retail", "VIP"]);
  // A person who types a seeded word on a record without it writes their own word.
  assert.deepEqual(keptKeys("tags", ["vip"], ["key account"]), ["key account"]);
  assert.deepEqual(tags("grand compte, VIP"), ["grand compte", "VIP"]);
});

test("a company keeps its seeded industry and tags through a form saved in French", async () => {
  const { sql } = database;
  const c = await companies.addCompany(sql, asMember(ines), { name: "Boulangeries Durand" });
  // As the sample seeds it.
  await sql`update companies set industry = '@foodRetail', tags = '{"@retail","@keyAccount"}' where id = ${c.id}`;
  const read = await companies.company(sql, asMember(ines), c.id);
  assert.equal(read.industry, "@foodRetail");
  assert.deepEqual(read.tags, ["@retail", "@keyAccount"]);
  // The form shows the French names; saved as they are, the keys stay.
  await companies.updateCompany(sql, asMember(ines), c.id, { industry: shownName("industries", read.industry, fr), tags: read.tags.map(x => shownName("tags", x, fr)).join(", ") });
  const again = await companies.company(sql, asMember(ines), c.id);
  assert.equal(again.industry, "@foodRetail");
  assert.deepEqual(again.tags, ["@retail", "@keyAccount"]);
  // Renamed: the person's words.
  await companies.updateCompany(sql, asMember(ines), c.id, { industry: "Boulangerie industrielle" });
  assert.equal((await companies.company(sql, asMember(ines), c.id)).industry, "Boulangerie industrielle");
  // The list filters by the key; the export reads the reader's words.
  const csv = await companiesCsv(sql, asMember(ines), { tag: "@keyAccount" }, fr, "fr");
  assert.ok(csv.includes("commerce, grand compte"));
});

test("a seeded field shows its name and choices in the reader's language until renamed", async () => {
  const { sql } = database;
  await sql`insert into fields (object, label, kind, options, position, label_key, option_keys) values ('companies', 'Segment', 'choice', '{"Small business","Key account"}', 0, 'segment', '{"smallBusiness","keyAccount"}')`;
  const [f] = await fields.listFields(sql, "companies", fr);
  assert.equal(f!.label, "Segment");
  assert.deepEqual(f!.optionLabels, ["Petite entreprise", "Grand compte"]);
  assert.equal(fields.optionLabel(f!, "Key account"), "Grand compte");
  // Settings sent back as a French reader saw them: nothing renamed.
  await fields.updateField(sql, asMember(camille), f!.id, { label: "Segment", options: "Petite entreprise\nGrand compte" });
  const [kept] = await fields.listFields(sql, "companies", en);
  assert.deepEqual(kept!.options, ["Small business", "Key account"]);
  assert.deepEqual(kept!.optionLabels, ["Small business", "Key account"]);
  assert.equal(kept!.labelKey, "segment");
  // Renamed: the manager's words, for everyone.
  await fields.updateField(sql, asMember(camille), f!.id, { label: "Taille", options: "TPE\nGrand compte" });
  const [renamed] = await fields.listFields(sql, "companies", en);
  assert.equal(renamed!.label, "Taille");
  assert.deepEqual(renamed!.optionLabels, ["TPE", "Grand compte"]);
  assert.equal(renamed!.labelKey, null);
});
