import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { addArrival, linkArrival, listArrivals, removeArrival, suggestions, updateArrival } from "../src/lib/arrivals.ts";
import { directory } from "../src/lib/directory.ts";
import { AppError } from "../src/lib/errors.ts";
import { examples, listName, samePhrase, stepText } from "../src/lib/examples.ts";
import { addField, listFields, purgeFields, removeField, setValue, updateField, valuesOf } from "../src/lib/fields.ts";
import { catalogue } from "../src/i18n/index.ts";
import { plan } from "../src/lib/importer.ts";
import { fieldDates } from "../src/lib/morning.ts";
import { ofMember } from "../src/lib/journal.ts";
import * as j from "../src/lib/journeys.ts";
import { isWeekend } from "../src/shared/model.ts";
import { email } from "../src/lib/email.ts";
import { filled, profile, updateJob, updateOwn } from "../src/lib/profiles.ts";
import { today } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora, sofia, tom, seen } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone.map(m => ({ ...m, email: m.firstName.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "") + "@example.test" })), capabilities: ["members", "members.email", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hr = asMember(camille);
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("extra fields: HR adds them; each person fills theirs, HR any; HR-only ones stay HR's; removed with Undo", async () => {
  const { sql } = database;
  await assert.rejects(addField(sql, asMember(hugo), { label: "T-shirt" }), refused("forbidden"));
  const shirt = await addField(sql, hr, { label: "T-shirt", editor: "person" });
  const desk = await addField(sql, hr, { label: "Desk", editor: "hr" });
  await setValue(sql, asMember(hugo), hugo.id, shirt.id, "L");
  await assert.rejects(setValue(sql, asMember(hugo), hugo.id, desk.id, "B12"), refused("forbidden"));
  await assert.rejects(setValue(sql, asMember(hugo), nora.id, shirt.id, "S"), refused("forbidden"));
  await setValue(sql, hr, hugo.id, desk.id, "B12");
  await assert.rejects(setValue(sql, hr, hugo.id, shirt.id, "x".repeat(201)), refused("too_long"));
  const { entries } = await directory(sql, asMember(nora));
  assert.deepEqual(entries.find(e => e.id === hugo.id)?.extras, { [shirt.id]: "L", [desk.id]: "B12" });
  // The work address comes from the Chest (members.email).
  assert.equal(entries.find(e => e.id === hugo.id)?.email, "hugo@example.test");
  await setValue(sql, asMember(hugo), hugo.id, shirt.id, "");
  assert.deepEqual((await valuesOf(sql, hr, [hugo.id])).get(hugo.id), { [desk.id]: "B12" });
  await updateField(sql, hr, desk.id, { label: "Office desk", editor: "hr" });
  await removeField(sql, hr, desk.id, true);
  assert.deepEqual((await listFields(sql, hr)).map(f => f.label), ["T-shirt"]);
  assert.equal((await valuesOf(sql, hr, [hugo.id])).get(hugo.id), undefined);
  await removeField(sql, hr, desk.id, false);
  assert.deepEqual((await valuesOf(sql, hr, [hugo.id])).get(hugo.id), { [desk.id]: "B12" });
  assert.equal(await purgeFields(sql), 0);
});

test("date and choice fields: values checked, a date reminds HR in the bell, the import reads them; a field's kind never changes", async () => {
  const { sql } = database;
  const visit = await addField(sql, hr, { label: "Medical visit", editor: "hr", kind: "date", alertDays: "30" });
  const size = await addField(sql, hr, { label: "Size", editor: "person", kind: "choice", options: "S\nM\n\nL\nm" });
  assert.deepEqual([visit.kind, visit.alertDays, size.kind, size.options], ["date", 30, "choice", ["S", "M", "L"]]);
  await assert.rejects(addField(sql, hr, { label: "Nothing", kind: "choice", options: "\n" }), refused("empty"));
  await assert.rejects(addField(sql, hr, { label: "Odd", kind: "colour" }), refused("invalid"));
  await assert.rejects(addField(sql, hr, { label: "Late", kind: "date", alertDays: "900" }), refused("invalid"));
  await assert.rejects(setValue(sql, hr, hugo.id, visit.id, "next week"), refused("invalid"));
  await assert.rejects(setValue(sql, hr, hugo.id, visit.id, "2026-02-30"), refused("invalid"));
  await assert.rejects(setValue(sql, asMember(hugo), hugo.id, size.id, "XXL"), refused("invalid"));
  await setValue(sql, asMember(hugo), hugo.id, size.id, "l");
  await setValue(sql, hr, hugo.id, visit.id, "2026-10-20");
  await setValue(sql, hr, nora.id, visit.id, "2027-03-01");
  assert.deepEqual([(await valuesOf(sql, hr, [hugo.id])).get(hugo.id)?.[size.id], (await valuesOf(sql, hr, [hugo.id])).get(hugo.id)?.[visit.id]], ["L", "2026-10-20"]);
  // The list changes; the kind does not; the reminder may go.
  await updateField(sql, hr, size.id, { label: "Size", editor: "person", options: "S\nM\nL\nXL" });
  assert.deepEqual((await listFields(sql, hr)).find(f => f.id === size.id)?.options, ["S", "M", "L", "XL"]);
  // Within 30 days of 29 September: Hugo's visit, not Nora's.
  chest.notifications.length = 0;
  await fieldDates(sql, "2026-09-29");
  const told = chest.notifications.filter(n => n.member === camille.id).map(seen);
  assert.deepEqual(told.map(n => [n.path, n.key]), [[`/chest/people/${hugo.id}`, `field:${visit.id}:${hugo.id}:2026-10-20`]]);
  assert.match(told[0]!.title, /^Hugo Bernard[\u202f ]: Medical visit le 20 octobre$/u);
  await updateField(sql, hr, visit.id, { label: "Medical visit", editor: "hr", alertDays: "" });
  chest.notifications.length = 0;
  await fieldDates(sql, "2026-09-29");
  assert.equal(chest.notifications.length, 0);
  // The import: a date in the file's order, a choice whatever its case.
  const fields = await listFields(sql, hr);
  const p = plan("Name,Medical visit,Size\nHugo Bernard,21/10/2026,xl\nNora Petit,soon,XXL\n", everyone.map(m => ({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, photo: null, role: m.role, locale: "en" as const, email: "" })), fields);
  assert.deepEqual(p.rows.map(r => [r.extras, r.problems]), [[{ [visit.id]: "2026-10-21", [size.id]: "XL" }, []], [{}, ["date", "choice"]]]);
  await removeField(sql, hr, visit.id, true);
  await removeField(sql, hr, size.id, true);
});

test("who sees an extra field: a date is HR's and the person's only by default; a private value never reaches a colleague, not even through the search", async () => {
  const { sql } = database;
  const visit = await addField(sql, hr, { label: "Medical visit", editor: "hr", kind: "date" });
  const langs = await addField(sql, hr, { label: "Languages", kind: "text" });
  const badge = await addField(sql, hr, { label: "Badge", kind: "text", seen: "private" });
  assert.deepEqual([visit.seen, langs.seen, badge.seen], ["private", "everyone", "private"]);
  await setValue(sql, hr, nora.id, visit.id, "2026-10-19");
  await setValue(sql, hr, nora.id, badge.id, "B-77");
  await setValue(sql, asMember(nora), nora.id, langs.id, "French, Vietnamese");
  const as = async (who: typeof hugo) => (await directory(sql, asMember(who))).entries.find(e => e.id === nora.id)?.extras;
  // A colleague sees the languages only; Nora and HR see everything.
  assert.deepEqual(await as(hugo), { [langs.id]: "French, Vietnamese" });
  assert.deepEqual(await as(nora), { [visit.id]: "2026-10-19", [langs.id]: "French, Vietnamese", [badge.id]: "B-77" });
  assert.deepEqual((await directory(sql, hr)).entries.find(e => e.id === nora.id)?.extras, { [visit.id]: "2026-10-19", [langs.id]: "French, Vietnamese", [badge.id]: "B-77" });
  // HR opens one to everyone, and back; a wrong visibility is refused.
  await updateField(sql, hr, badge.id, { label: "Badge", editor: "hr", seen: "everyone" });
  assert.equal((await as(hugo))?.[badge.id], "B-77");
  await updateField(sql, hr, badge.id, { label: "Badge", editor: "hr" });
  assert.equal((await as(hugo))?.[badge.id], "B-77");
  await assert.rejects(updateField(sql, hr, badge.id, { label: "Badge", editor: "hr", seen: "team" }), refused("invalid"));
  for (const f of [visit, langs, badge]) await removeField(sql, hr, f.id, true);
});

test("the migration made every existing date field private (the sample's Medical visit included)", async () => {
  const { sql } = database;
  const { readFileSync } = await import("node:fs");
  const run = (file: string) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
  // The schema as it was before 0006, in a schema of its own, rolled back.
  await sql.begin(async tx => {
    await tx.unsafe("create schema before6; set local search_path to before6, public");
    for (const f of ["0001_people.sql", "0002_arrivals.sql", "0003_away.sql", "0004_records.sql", "0005_field_kinds_and_names.sql"]) await tx.unsafe(run(f)).simple();
    await tx.unsafe("insert into fields (label, editor, position, kind, alert_days) values ('Medical visit', 'hr', 1, 'date', 30), ('Languages', 'person', 2, 'text', null)");
    await tx.unsafe(run("0006_privacy_permits_requests_letters.sql")).simple();
    const rows = await tx.unsafe<{ label: string; seen: string }[]>("select label, seen from fields order by position");
    assert.deepEqual(rows.map(r => [r.label, r.seen]), [["Medical visit", "private"], ["Languages", "everyone"]]);
    throw new Error("rollback");
  }).catch((error: unknown) => { if (!(error instanceof Error) || error.message !== "rollback") throw error; });
});

test("the import shows the columns it leaves out", () => {
  const p = plan("Name,Hobby,T-Shirt Size,Empty\nHugo Bernard,Chess,M,\n", everyone.map(m => ({ id: m.id, name: m.name, firstName: m.firstName, lastName: m.lastName, photo: null, role: m.role, locale: "en" as const, email: "" })), []);
  assert.equal(p.missing, "field");
  assert.deepEqual(p.leftOut, ["Hobby", "T-Shirt Size"]);
});

test("HR's changes to job details are written in the journal (field names only); a form sending what it shows changes nothing", async () => {
  const { sql } = database;
  await updateJob(sql, hr, tom.id, { title: "Developer", managerId: ines.id, phone: "" });
  await updateJob(sql, hr, tom.id, { title: "Developer", managerId: ines.id });
  const log = await ofMember(sql, tom.id);
  assert.deepEqual(log.map(e => [e.actor, e.action, e.fields]), [[camille.id, "profile_changed", ["title", "managerId"]]]);
});

test("an arrival written by HR by hand: the same as Hiring's, corrected, linked by its work address, cleared when linked", async () => {
  const { sql } = database;
  await assert.rejects(addArrival(sql, asMember(hugo), { name: "Lucie" }), refused("forbidden"));
  await assert.rejects(addArrival(sql, hr, { name: "" }), refused("empty"));
  await assert.rejects(addArrival(sql, hr, { name: "Lucie", workEmail: "not an address" }), refused("invalid_email"));
  await assert.rejects(addArrival(sql, hr, { name: "Lucie", managerId: "mbr_" + "z".repeat(26) }), refused("not_member"));
  const a = await addArrival(sql, hr, { name: "Lucie Garnier", job: "Sales associate", team: "Sales", startDate: "2026-11-02", managerId: ines.id, workEmail: "Nora@Example.test" });
  assert.deepEqual([a.source, a.status, a.workEmail, a.managerId], ["manual", "expected", "Nora@example.test", ines.id]);
  const fixed = await updateArrival(sql, hr, a.id, { name: "Lucie Garnier", job: "Sales associate", startDate: "2026-11-03", managerId: ines.id, workEmail: "Nora@Example.test" });
  assert.equal(fixed.startDate, "2026-11-03");
  // Her checklist before day 1: the newcomer's steps wait, the rest runs.
  const t = await j.createTemplate(sql, hr, { kind: "onboarding", name: "Newcomer" });
  await j.addTemplateItem(sql, hr, t.id, { text: "Laptop", role: "hr", offset: -7 });
  await j.addTemplateItem(sql, hr, t.id, { text: "Say hi", role: "person", offset: 0 });
  const started = await j.startJourney(sql, hr, { arrivalId: a.id, templateId: t.id, anchor: "2026-11-03" });
  assert.deepEqual((await j.journey(sql, hr, started.id)).items.map(i => i.assignee), [camille.id, null]);
  // She got the Chest under another name: her work address says who she is.
  const { entries } = await directory(sql, hr);
  assert.deepEqual([...suggestions(await listArrivals(sql, hr), entries)].map(([id, p]) => [id, p.map(x => x.id)]), [[a.id, [nora.id]]]);
  await linkArrival(sql, hr, a.id, nora.id);
  const [row] = await sql`select name, work_email, status from arrivals where id = ${a.id}`;
  assert.deepEqual([row?.name, row?.work_email, row?.status], ["", "", "linked"]);
  assert.deepEqual((await j.journey(sql, hr, started.id)).items.map(i => i.assignee), [camille.id, nora.id]);
  // Hiring's arrivals are not HR's to correct.
  await assert.rejects(updateArrival(sql, hr, a.id, { name: "X" }), refused("not_found"));
  const b = await addArrival(sql, hr, { name: "By mistake" });
  await removeArrival(sql, hr, b.id);
  assert.equal((await listArrivals(sql, hr)).length, 0);
});

test("example steps speak each reader's language until reworded; the newcomer's profile step ticks itself", async () => {
  const { sql } = database;
  const fr = catalogue("fr"), en = catalogue("en");
  const ids = await j.addExamples(sql, asMember(sofia), examples(en));
  const onboarding = await j.template(sql, hr, ids[0]!);
  const laptop = onboarding.items[0]!;
  assert.deepEqual([laptop.text, laptop.phrase], ["Order the laptop and accessories", "onboarding.laptop"]);
  assert.equal(stepText(laptop, fr), fr.checklists.examples.onboarding.items.laptop);
  // Saved in French without a change: still the phrase; reworded: HR's words.
  assert.ok(samePhrase("onboarding.laptop", fr.checklists.examples.onboarding.items.laptop));
  const same = await j.updateTemplateItem(sql, hr, laptop.id, { text: fr.checklists.examples.onboarding.items.laptop, role: "hr", offset: -14 });
  assert.deepEqual([same.phrase, same.text], ["onboarding.laptop", "Order the laptop and accessories"]);
  const reworded = await j.updateTemplateItem(sql, hr, laptop.id, { text: "Commander le Mac", role: "hr", offset: -14 });
  assert.deepEqual([reworded.phrase, stepText(reworded, en)], [null, "Commander le Mac"]);
  // The example's name too: « Nouvel arrivant au bureau » for a French
  // reader, kept when saved unchanged in French, HR's once renamed; a
  // checklist started from it keeps the phrase.
  assert.deepEqual([onboarding.phrase, listName(onboarding, fr)], ["onboarding", fr.checklists.examples.onboarding.name]);
  await j.renameTemplate(sql, hr, onboarding.id, fr.checklists.examples.onboarding.name);
  assert.equal((await j.template(sql, hr, onboarding.id)).phrase, "onboarding");

  // Nora's welcome: her "fill in your profile" ticks itself once she does.
  await updateJob(sql, hr, nora.id, { managerId: ines.id });
  const started = await j.startJourney(sql, hr, { personId: nora.id, templateId: onboarding.id, anchor: today() });
  assert.equal(listName(await j.journey(sql, hr, started.id), en), "Office newcomer");
  await j.renameTemplate(sql, hr, onboarding.id, "Bienvenue à l’atelier");
  assert.deepEqual([(await j.template(sql, hr, onboarding.id)).phrase, listName(await j.template(sql, hr, onboarding.id), en)], [null, "Bienvenue à l’atelier"]);
  const step = (await j.journey(sql, hr, started.id)).items.find(i => i.phrase === "onboarding.profile")!;
  assert.equal(step.assignee, nora.id);
  // An empty profile does not count; a bio does (the action then ticks).
  assert.equal(filled(await updateOwn(sql, asMember(nora), { pronouns: "elle" })), false);
  assert.equal(filled(await updateOwn(sql, asMember(nora), { bio: "Bonjour !" })), true);
  const ticked = await j.autoTick(sql, nora.id, "onboarding.profile");
  assert.equal(ticked.length, 1);
  assert.equal((await j.journey(sql, hr, started.id)).items.find(i => i.id === step.id)?.done, true);
  assert.equal((await j.autoTick(sql, nora.id, "onboarding.profile")).length, 0);
  assert.equal((await profile(sql, hr, nora.id)).managerId, ines.id);
});

test("addresses and weekends", () => {
  // The package's field.email: the domain lower-cased, the rest as written.
  assert.equal(email(" Lucie.Garnier@Atelier-Martin.fr "), "Lucie.Garnier@atelier-martin.fr");
  assert.equal(email(""), "");
  assert.equal(email("  "), "");
  for (const bad of ["lucie", "a@b", "a b@c.fr", "<a@b.fr>", "Lucie <lucie@atelier.fr>", "lucie@[10.0.0.1]", "lu\u202ecie@atelier.fr"]) assert.throws(() => email(bad), (e: unknown) => e instanceof AppError && e.code === "invalid_email", bad);
  assert.deepEqual(["2026-10-10", "2026-10-11", "2026-10-12"].map(isWeekend), [true, true, false]);
});
