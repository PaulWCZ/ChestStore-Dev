import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as activities from "../src/lib/activities.ts";
import * as companies from "../src/lib/companies.ts";
import * as contacts from "../src/lib/contacts.ts";
import * as deals from "../src/lib/deals.ts";
import { AppError } from "../src/lib/errors.ts";
import { lookalikes, search } from "../src/lib/search.ts";
import * as steps from "../src/lib/steps.ts";
import { today } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("companies: sales add and edit, a viewer reads, no role sees nothing; fields are checked", async () => {
  const { sql } = database;
  const acme = await companies.addCompany(sql, asMember(hugo), { name: "Boulangeries Durand", website: "durand.fr", phone: "01 23 45 67 89", tags: "retail, VIP", industry: "Food" });
  const read = await companies.company(sql, asMember(lea), acme.id);
  assert.equal(read.owner, hugo.id);
  assert.deepEqual(read.tags, ["retail", "VIP"]);
  await assert.rejects(companies.addCompany(sql, asMember(lea), { name: "Nope" }), refused("forbidden"));
  await assert.rejects(companies.company(sql, asMember(nora), acme.id), refused("forbidden"));
  await assert.rejects(companies.addCompany(sql, asMember(hugo), { name: "" }), refused("empty"));
  await assert.rejects(companies.addCompany(sql, asMember(hugo), { name: "X", website: "javascript:alert(1)" }), refused("invalid"));
  // Giving it to someone: only someone of the team (sales or manager).
  await assert.rejects(companies.updateCompany(sql, asMember(hugo), acme.id, { owner: lea.id }), refused("invalid"));
  const changed = await companies.updateCompany(sql, asMember(hugo), acme.id, { owner: ines.id, industry: "Bakery" });
  assert.deepEqual(changed.ownerChanged, { from: hugo.id, to: ines.id });
  assert.equal((await companies.company(sql, asMember(hugo), acme.id)).industry, "Bakery");
  // Deleting: the owner (now Inès) or a manager.
  await assert.rejects(companies.deleteCompany(sql, asMember(hugo), acme.id), refused("forbidden"));
  const list = await companies.listCompanies(sql, asMember(lea), { q: "boulangerie" });
  assert.deepEqual(list.rows.map(c => c.name), ["Boulangeries Durand"]);
  assert.equal((await companies.listCompanies(sql, asMember(ines), { owner: "me" })).total, 1);
  assert.equal((await companies.listCompanies(sql, asMember(ines), { tag: "vip" })).total, 1);
  await companies.deleteCompany(sql, asMember(camille), acme.id);
  await assert.rejects(companies.company(sql, asMember(camille), acme.id), refused("not_found"));
});

test("contacts: linked to a company, duplicates are warned, search ignores accents", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(ines), { name: "Société Générale d’Emballage", website: "https://www.sge.fr" });
  const claire = await contacts.addContact(sql, asMember(ines), { name: "Claire Lefèvre", email: "Claire@SGE.fr", company: co.id, title: "Achats" });
  const c = await contacts.contact(sql, asMember(hugo), claire.id);
  assert.equal(c.email, "Claire@sge.fr");
  assert.equal(c.company?.name, "Société Générale d’Emballage");
  await assert.rejects(contacts.addContact(sql, asMember(ines), { name: "X", email: "nope" }), refused("invalid_email"));
  await assert.rejects(contacts.addContact(sql, asMember(ines), { name: "X", company: "999999" }), refused("not_found"));
  assert.deepEqual((await lookalikes(sql, asMember(ines), { kind: "contact", email: "claire@sge.fr" })).map(l => [l.name, l.why]), [["Claire Lefèvre", "email"]]);
  assert.deepEqual((await lookalikes(sql, asMember(ines), { kind: "contact", name: "claire lefevre" })).map(l => l.why), ["name"]);
  assert.deepEqual(await lookalikes(sql, asMember(ines), { kind: "contact", name: "claire lefevre", except: claire.id }), []);
  assert.deepEqual((await lookalikes(sql, asMember(ines), { kind: "company", name: "Societe generale d emballage" })).map(l => l.why), ["name"]);
  assert.deepEqual((await lookalikes(sql, asMember(ines), { kind: "company", name: "Other name", website: "sge.fr" })).map(l => l.why), ["domain"]);
  const found = await search(sql, asMember(lea), "lefevre");
  assert.deepEqual(found.contacts.map(x => x.name), ["Claire Lefèvre"]);
  assert.deepEqual((await search(sql, asMember(lea), "emballage")).companies.map(x => x.name), ["Société Générale d’Emballage"]);
  assert.deepEqual((await search(sql, asMember(lea), "lefevr")).contacts.length, 1); // a prefix
  assert.deepEqual((await search(sql, asMember(lea), "Lefebvre")).contacts.length, 1); // close enough
  assert.deepEqual((await search(sql, asMember(lea), "%_%")).contacts, []);
  await assert.rejects(search(sql, asMember(nora), "claire"), refused("forbidden"));
});

test("deals: created at the top of their stage, moved by their owner, won with a reason, reopened", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Garage Petit" });
  const pierre = await contacts.addContact(sql, asMember(hugo), { name: "Pierre Petit", company: co.id });
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Fleet of 12 vans", contact: pierre.id, value: 4800000, expectedClose: "2026-12-15" });
  assert.equal(d.company?.id, co.id, "the contact brings their company");
  assert.equal(d.value, 4800000);
  assert.equal(d.owner, hugo.id);
  const stages = await (await import("../src/lib/stages.ts")).listStages(sql);
  const won = stages.find(s => s.kind === "won")!;
  const second = stages[1]!;
  // Inès does not own it; Léa is a viewer.
  await assert.rejects(deals.moveDeal(sql, asMember(ines), d.id, second.id), refused("forbidden"));
  await assert.rejects(deals.moveDeal(sql, asMember(lea), d.id, second.id), refused("forbidden"));
  await assert.rejects(deals.addDeal(sql, asMember(lea), { title: "Viewer deal" }), refused("forbidden"));
  const other = await deals.addDeal(sql, asMember(hugo), { title: "Spare parts", company: co.id, stage: second.id });
  await deals.moveDeal(sql, asMember(hugo), d.id, second.id, other.id, null);
  const board = (await deals.boardDeals(sql, asMember(lea))).filter(x => x.stageId === second.id).map(x => x.title);
  assert.deepEqual(board.slice(0, 2), ["Spare parts", "Fleet of 12 vans"]);
  const closed = await deals.moveDeal(sql, asMember(hugo), d.id, won.id, null, null, "Best service offer");
  assert.equal(closed.deal.reason, "Best service offer");
  assert.ok(closed.deal.closedAt);
  const history = await activities.timeline(sql, { dealId: d.id });
  assert.deepEqual(history.map(h => h.kind), ["won", "stage", "created"]);
  assert.equal(history[0]?.body, "Best service offer");
  // Reopened: no longer closed, no reason.
  const reopened = await deals.moveDeal(sql, asMember(hugo), d.id, stages[0]!.id);
  assert.equal(reopened.deal.closedAt, null);
  assert.equal(reopened.deal.reason, "");
  // A contact of another company is refused.
  const elsewhere = await contacts.addContact(sql, asMember(hugo), { name: "Someone Else", company: (await companies.addCompany(sql, asMember(hugo), { name: "Elsewhere" })).id });
  await assert.rejects(deals.updateDeal(sql, asMember(hugo), d.id, { contact: elsewhere.id }), refused("invalid"));
  await assert.rejects(deals.updateDeal(sql, asMember(hugo), d.id, { value: -1 }), refused("bad_amount"));
  // Filters of the list.
  const closing = await deals.listDeals(sql, asMember(lea), { closing: "month" }, 500, "2026-12-03");
  assert.deepEqual(closing.rows.map(x => x.title), ["Fleet of 12 vans"]);
  assert.equal((await deals.listDeals(sql, asMember(lea), { owner: "me" })).total, 0);
  assert.equal((await deals.listDeals(sql, asMember(lea), { status: "won" })).total, 0);
});

test("owners: a manager gives a deal; a salesperson takes an unassigned one; the deleted deal goes with its history", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(camille), { title: "Maintenance contract", value: 120000, owner: ines.id });
  assert.equal(d.owner, ines.id);
  await assert.rejects(deals.addDeal(sql, asMember(camille), { title: "For a viewer", owner: lea.id }), refused("invalid"));
  const given = await deals.setOwner(sql, asMember(camille), d.id, hugo.id);
  assert.equal(given.given, hugo.id);
  await assert.rejects(deals.setOwner(sql, asMember(ines), d.id, ines.id), refused("forbidden"));
  await deals.setOwner(sql, asMember(camille), d.id, null);
  const taken = await deals.setOwner(sql, asMember(ines), d.id, ines.id);
  assert.equal(taken.deal.owner, ines.id);
  assert.equal(taken.given, null);
  await assert.rejects(deals.deleteDeal(sql, asMember(hugo), d.id), refused("forbidden"));
  await deals.deleteDeal(sql, asMember(ines), d.id);
  assert.deepEqual(await activities.timeline(sql, { dealId: d.id }), []);
});

test("activities: one tap logs a call; a note needs words; the author edits, a manager removes, Undo restores", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(ines), { name: "Imprimerie Roux" });
  const p = await contacts.addContact(sql, asMember(ines), { name: "Hélène Roux", company: co.id });
  const d = await deals.addDeal(sql, asMember(ines), { title: "Brochures", contact: p.id });
  const call = await activities.log(sql, asMember(hugo), { deal: d.id }, "call", "");
  assert.equal(call.contact?.id, p.id);
  assert.equal(call.company?.id, co.id);
  assert.ok((await contacts.contact(sql, asMember(hugo), p.id)).lastContact, "a call counts as a contact");
  await assert.rejects(activities.log(sql, asMember(hugo), { contact: p.id }, "note", " "), refused("empty"));
  await assert.rejects(activities.log(sql, asMember(lea), { contact: p.id }, "call", ""), refused("forbidden"));
  await assert.rejects(activities.log(sql, asMember(hugo), { contact: p.id }, "created", "x"), refused("invalid"));
  const note = await activities.log(sql, asMember(hugo), { company: co.id }, "note", "Prefers email");
  await assert.rejects(activities.edit(sql, asMember(ines), note.id, "Mine now"), refused("forbidden"));
  await activities.edit(sql, asMember(hugo), note.id, "Prefers email, mornings");
  // The company's timeline gathers what was logged on its deals and people.
  const onCompany = await activities.timeline(sql, { companyId: co.id });
  assert.deepEqual(onCompany.slice(0, 2).map(a => a.kind), ["note", "call"]);
  assert.equal(onCompany[0]?.body, "Prefers email, mornings");
  await assert.rejects(activities.remove(sql, asMember(ines), note.id), refused("forbidden"));
  await activities.remove(sql, asMember(camille), note.id);
  assert.ok(!(await activities.timeline(sql, { companyId: co.id })).some(a => a.id === note.id));
  await activities.restore(sql, asMember(camille), note.id);
  assert.ok((await activities.timeline(sql, { companyId: co.id })).some(a => a.id === note.id && a.author === hugo.id));
  // What the tool records is never edited by hand.
  const created = (await activities.timeline(sql, { dealId: d.id })).find(a => a.kind === "created")!;
  await assert.rejects(activities.remove(sql, asMember(camille), created.id), refused("forbidden"));
});

test("next steps: several open per deal or contact, with a time; done logs it; my day; the tile's count", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Coffee machines" });
  const now = today();
  const first = await steps.addStep(sql, asMember(hugo), { deal: d.id }, { text: "Send the quote", due: now });
  assert.equal(first.given, null);
  const second = await steps.addStep(sql, asMember(hugo), { deal: d.id }, { text: "Call the buyer", due: now, time: "14:30" });
  assert.notEqual(second.step.id, first.step.id, "a second open step, not a replacement");
  assert.equal(second.step.time, "14:30");
  const changed = await steps.updateStep(sql, asMember(hugo), first.step.id, { text: "Send the quote v2", due: now, time: "09:00", owner: ines.id });
  assert.equal(changed.given, ines.id);
  assert.equal(changed.previousOwner, hugo.id);
  assert.deepEqual((await steps.openSteps(sql, { dealId: d.id })).map(s => [s.text, s.time]), [["Send the quote v2", "09:00"], ["Call the buyer", "14:30"]]);
  const read = await deals.deal(sql, asMember(lea), d.id);
  assert.equal(read.step?.text, "Send the quote v2", "the soonest is the next step");
  assert.equal(read.steps, 2);
  await assert.rejects(steps.addStep(sql, asMember(ines), { deal: d.id }, { text: "Mine", due: now }), refused("forbidden"));
  await assert.rejects(steps.addStep(sql, asMember(hugo), { deal: d.id }, { text: "x", due: "2026-02-30" }), refused("bad_date"));
  await assert.rejects(steps.addStep(sql, asMember(hugo), { deal: d.id }, { text: "x", due: now, time: "25:00" }), refused("bad_time"));
  await assert.rejects(steps.addStep(sql, asMember(hugo), { deal: d.id }, { text: "x", due: now, owner: lea.id }), refused("invalid"));
  const mine = await steps.myDay(sql, asMember(ines));
  assert.deepEqual(mine.map(s => [s.text, s.on?.kind, s.on?.title]), [["Send the quote v2", "deal", "Coffee machines"]]);
  assert.equal((await steps.urgentCounts(sql, [ines.id, hugo.id])).get(ines.id), 1);
  // Inès may say it is done: it is hers, even on Hugo's deal. Another step
  // is still open: it was not the last.
  const done = await steps.completeStep(sql, asMember(ines), changed.step.id);
  assert.equal(done.last, false);
  const logged = await activities.timeline(sql, { dealId: d.id });
  assert.equal(logged[0]?.kind, "step");
  assert.equal(logged[0]?.body, "Send the quote v2");
  assert.deepEqual(await steps.myDay(sql, asMember(ines)), []);
  await assert.rejects(steps.completeStep(sql, asMember(ines), done.step.id), refused("not_found"));
  // Undo: open again, the activity gone.
  await steps.reopenStep(sql, asMember(ines), done.step.id);
  assert.equal((await steps.myDay(sql, asMember(ines))).length, 1);
  assert.ok(!(await activities.timeline(sql, { dealId: d.id })).some(a => a.kind === "step"));
  await steps.clearStep(sql, asMember(hugo), done.step.id);
  assert.deepEqual(await steps.myDay(sql, asMember(ines)), []);
  assert.equal((await steps.completeStep(sql, asMember(hugo), second.step.id)).last, true, "the last one: the page asks what comes next");
  // A contact's step: anyone of sales.
  const p = await contacts.addContact(sql, asMember(hugo), { name: "Paul Girard" });
  const s = await steps.addStep(sql, asMember(ines), { contact: p.id }, { text: "Call back", due: now });
  assert.equal((await contacts.contact(sql, asMember(lea), p.id)).step?.id, s.step.id);
  await assert.rejects(steps.addStep(sql, asMember(lea), { contact: p.id }, { text: "x", due: now }), refused("forbidden"));
  await assert.rejects(steps.clearStep(sql, asMember(lea), s.step.id), refused("forbidden"));
  await assert.rejects(steps.completeStep(sql, asMember(lea), s.step.id), refused("forbidden"));
});

test("a step of one's own: about no client, seen and changed only by its owner and who planned it", async () => {
  const { sql } = database;
  const now = today();
  const own = await steps.addStep(sql, asMember(hugo), null, { text: "Prepare the trade show", due: now, time: "08:30" });
  assert.equal(own.step.dealId, null);
  assert.equal(own.step.contactId, null);
  const day = await steps.myDay(sql, asMember(hugo));
  assert.ok(day.some(x => x.id === own.step.id && x.on === null));
  await assert.rejects(steps.addStep(sql, asMember(lea), null, { text: "x", due: now }), refused("forbidden"));
  await assert.rejects(steps.addStep(sql, asMember(hugo), null, { text: "x", due: now, owner: null }), refused("invalid"));
  await assert.rejects(steps.completeStep(sql, asMember(ines), own.step.id), refused("not_found"));
  await assert.rejects(steps.clearStep(sql, asMember(ines), own.step.id), refused("not_found"));
  const done = await steps.completeStep(sql, asMember(hugo), own.step.id);
  assert.equal(done.activityId, null, "nothing to log it on");
  // A manager may plan one for someone of the team.
  const given = await steps.addStep(sql, asMember(camille), null, { text: "Visit the new office", due: now, owner: ines.id });
  assert.equal(given.given, ines.id);
  await steps.clearStep(sql, asMember(camille), given.step.id);
});

test("GDPR: a contact is exported whole, then deleted for good with everything written about them", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(ines), { name: "Cabinet Blanc" });
  const p = await contacts.addContact(sql, asMember(ines), { name: "Sophie Blanc", email: "sophie@blanc.fr", company: co.id });
  const d = await deals.addDeal(sql, asMember(ines), { title: "Audit", contact: p.id });
  await activities.log(sql, asMember(ines), { contact: p.id }, "note", "Allergic to cats (should not be here)");
  await activities.log(sql, asMember(ines), { deal: d.id }, "meeting", "Met Sophie at her office");
  const companyNote = await activities.log(sql, asMember(ines), { company: co.id }, "note", "Firm moves in May");
  await steps.addStep(sql, asMember(ines), { contact: p.id }, { text: "Send the invite", due: today() });
  const file = await contacts.exportContact(sql, asMember(lea), p.id);
  assert.equal(file.contact.email, "sophie@blanc.fr");
  assert.equal(file.deals.length, 1);
  assert.equal(file.activities.filter(a => a.kind === "note" || a.kind === "meeting").length, 2);
  assert.equal(file.steps.length, 1);
  await assert.rejects(contacts.deleteContact(sql, asMember(hugo), p.id), refused("forbidden"));
  await assert.rejects(contacts.deleteContact(sql, asMember(lea), p.id), refused("forbidden"));
  await contacts.deleteContact(sql, asMember(ines), p.id);
  const [left] = await sql`select count(*)::int as n from activities where body like '%Sophie%' or body like '%cats%'`;
  assert.equal(left!["n"], 0);
  const [stepsLeft] = await sql`select count(*)::int as n from steps where contact_id = ${p.id}`;
  assert.equal(stepsLeft!["n"], 0);
  assert.equal((await deals.deal(sql, asMember(ines), d.id)).contact, null, "the deal stays, without her");
  assert.ok((await activities.timeline(sql, { companyId: co.id })).some(a => a.id === companyNote.id));
});
