import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import * as members from "@argentic/chest-sdk/members";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestSchedules as jobs } from "../src/calls.ts";
import { chestEvents as events } from "../src/calls.ts";
import { normalize, plainText } from "../src/lib/doc.ts";
import * as editing from "../src/lib/editing.ts";
import { catalogue } from "../src/i18n/index.ts";
import { fromMarkdown } from "../src/lib/markdown.ts";
import * as pages from "../src/lib/pages.ts";
import * as reviews from "../src/lib/reviews.ts";
import { search } from "../src/lib/search.ts";
import * as spaces from "../src/lib/spaces.ts";
import * as templates from "../src/lib/templates.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, nora, tom } from "./support/members.ts";

// Templates (a space's own and the built-in ones) and review reminders
// (every 3, 6 or 12 months; the owner told once, by the "reviews" schedule).

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.notifications.splice(0);
  members.forget();
});

const en = catalogue("en");
const fr = catalogue("fr");

async function write(pageId: string, who: typeof ines, text: string) {
  const { sql } = database;
  const p = await pages.page(sql, asMember(who), pageId);
  await editing.startEditing(sql, asMember(who), pageId);
  await editing.publish(sql, asMember(who), pageId, { title: p.title, doc: normalize(fromMarkdown(text)), baseVersion: p.version });
}

test("editors mark a page as a template of its space; readers cannot, nor list them", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Sales" });
  const model = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Client visit report" });
  await write(model.id, ines, "## Client\n\nWho we met.\n\n## Next steps\n\n- [ ] Send the quote");
  await assert.rejects(templates.setTemplate(sql, asMember(hugo), model.id, true), /forbidden/u);
  await assert.rejects(templates.setTemplate(sql, asMember(nora), model.id, true), /not_found/u);
  await assert.rejects(templates.setTemplate(sql, asMember(ines), model.id, "on"), /invalid/u);
  assert.equal(await templates.setTemplate(sql, asMember(tom), model.id, true), true);
  assert.equal((await pages.page(sql, asMember(hugo), model.id)).template, true);
  assert.deepEqual(await templates.spaceTemplates(sql, asMember(ines), s.id), [{ id: model.id, title: "Client visit report" }]);
  await assert.rejects(templates.spaceTemplates(sql, asMember(hugo), s.id), /forbidden/u);
  // Unmarked, it is a page again; in the trash, it is no template.
  await templates.setTemplate(sql, asMember(ines), model.id, false);
  assert.deepEqual(await templates.spaceTemplates(sql, asMember(ines), s.id), []);
  await templates.setTemplate(sql, asMember(ines), model.id, true);
  await pages.deletePage(sql, asMember(ines), model.id);
  assert.deepEqual(await templates.spaceTemplates(sql, asMember(ines), s.id), []);
  await pages.restorePage(sql, asMember(ines), model.id);
});

test("a new page starts blank, from a template of its space (copied once, searchable), or a built-in model", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Visits" });
  const model = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Visit template" });
  await write(model.id, ines, "## Client\n\nWho we met at the showroom.");
  await templates.setTemplate(sql, asMember(ines), model.id, true);
  const blank = await templates.createFrom(sql, asMember(tom), { spaceId: s.id, title: "Blank one", start: "blank" }, en);
  assert.equal(plainText((await pages.page(sql, asMember(tom), blank.id)).doc), "");
  const copy = await templates.createFrom(sql, asMember(tom), { spaceId: s.id, title: "Visit to Durand", start: model.id }, en);
  const made = await pages.page(sql, asMember(tom), copy.id);
  assert.equal(made.version, 1);
  assert.equal(made.template, false);
  assert.match(plainText(made.doc), /showroom/u);
  assert.ok((await search(sql, asMember(tom), "showroom")).some(r => r.id === copy.id));
  // Changing the template later changes only pages made after.
  await write(model.id, ines, "## Client\n\nSomething else.");
  assert.match(plainText((await pages.page(sql, asMember(tom), copy.id)).doc), /showroom/u);
  // Built-in models, in the editor's language.
  const notes = await templates.createFrom(sql, asMember(camille), { spaceId: s.id, title: "Réunion du lundi", start: "builtin:meeting" }, fr);
  assert.match(plainText((await pages.page(sql, asMember(camille), notes.id)).doc), /Ordre du jour/u);
  const record = await templates.createFrom(sql, asMember(tom), { spaceId: s.id, title: "Why Postgres", start: "builtin:decision" }, en);
  assert.match(plainText((await pages.page(sql, asMember(tom), record.id)).doc), /Consequences/u);
  const howto = await templates.createFrom(sql, asMember(tom), { spaceId: s.id, title: "Order paper", start: "builtin:howto" }, en);
  assert.match(plainText((await pages.page(sql, asMember(tom), howto.id)).doc), /Before you start/u);
  // Refused: an unknown model, a page that is no template, a reader.
  await assert.rejects(templates.createFrom(sql, asMember(tom), { spaceId: s.id, title: "X", start: "builtin:poem" }, en), /invalid/u);
  await assert.rejects(templates.createFrom(sql, asMember(tom), { spaceId: s.id, title: "X", start: "../1" }, en), /invalid/u);
  await assert.rejects(templates.createFrom(sql, asMember(tom), { spaceId: s.id, title: "X", start: blank.id }, en), /not_found/u);
  await assert.rejects(templates.createFrom(sql, asMember(hugo), { spaceId: s.id, title: "X", start: model.id }, en), /forbidden/u);
});

test("a template is offered only in its own space, and never reveals a space kept from the editor", async () => {
  const { sql } = database;
  const hr = await spaces.createSpace(sql, asMember(camille), { name: "HR", visibility: "groups", groups: [groups.office] });
  const secret = await pages.createPage(sql, asMember(camille), { spaceId: hr.id, title: "Warning letter" });
  await write(secret.id, camille, "Dear employee, confidential.");
  await templates.setTemplate(sql, asMember(camille), secret.id, true);
  const open = await spaces.createSpace(sql, asMember(tom), { name: "Tech" });
  // Tom cannot see HR: its template is not found, from any space.
  await assert.rejects(templates.createFrom(sql, asMember(tom), { spaceId: open.id, title: "X", start: secret.id }, en), /not_found/u);
  await assert.rejects(templates.spaceTemplates(sql, asMember(tom), hr.id), /not_found/u);
  // Camille sees both, but a template of HR does not start a page in Tech.
  await assert.rejects(templates.createFrom(sql, asMember(camille), { spaceId: open.id, title: "X", start: secret.id }, en), /not_found/u);
});

test("review reminders: editors set them (3, 6 or 12 months) and become their owner; readers cannot", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Policies" });
  const p = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Travel policy" });
  assert.equal((await pages.page(sql, asMember(ines), p.id)).review, null);
  await assert.rejects(reviews.setReview(sql, asMember(hugo), p.id, 6), /forbidden/u);
  await assert.rejects(reviews.setReview(sql, asMember(ines), p.id, 5), /invalid/u);
  await assert.rejects(reviews.setReview(sql, asMember(ines), p.id, "6"), /invalid/u);
  await assert.rejects(reviews.markReviewed(sql, asMember(ines), p.id), /invalid/u);
  await reviews.setReview(sql, asMember(ines), p.id, 6);
  const set = (await pages.page(sql, asMember(hugo), p.id)).review;
  assert.equal(set?.months, 6);
  assert.equal(set?.owner, ines.id);
  assert.equal(set?.due, false);
  await assert.rejects(reviews.markReviewed(sql, asMember(hugo), p.id), /forbidden/u);
  // Tom changes it: it is his now.
  assert.deepEqual(await reviews.setReview(sql, asMember(tom), p.id, 12), { previousOwner: ines.id });
  assert.equal((await pages.page(sql, asMember(tom), p.id)).review?.owner, tom.id);
  await reviews.setReview(sql, asMember(tom), p.id, null);
  assert.equal((await pages.page(sql, asMember(tom), p.id)).review, null);
});

test("when due, the owner is told once by the morning run; 'Still correct' settles it for months", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Office" });
  const p = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Fire drill" });
  const quiet = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Coffee machine" });
  await reviews.setReview(sql, asMember(ines), p.id, 3);
  await reviews.setReview(sql, asMember(ines), quiet.id, 12);
  // Nothing is due yet: the run tells nobody.
  assert.equal(await chest.run("reviews", jobs), 204);
  assert.equal(chest.notifications.length, 0);
  // Four months later…
  await sql`update pages set reviewed_at = now() - interval '4 months' where id = ${p.id}`;
  assert.equal((await pages.page(sql, asMember(ines), p.id)).review?.due, true);
  assert.deepEqual((await reviews.myReviews(sql, asMember(ines))).map(r => r.id), [p.id]);
  assert.deepEqual(await reviews.myReviews(sql, asMember(tom)), []);
  assert.equal(await chest.run("reviews", jobs), 204);
  assert.deepEqual(chest.notifications.map(n => ({ member: n.member, title: shownTo(n, "fr").title, key: n.key, path: n.path })), [
    { member: ines.id, title: "À relire : « Fire drill »", key: `review:${p.id}`, path: `/chest/pages/${p.id}` },
  ]);
  // Told once: the next mornings add nothing.
  chest.notifications.splice(0);
  assert.equal(await chest.run("reviews", jobs), 204);
  assert.equal(chest.notifications.length, 0);
  // Any editor of the page says it is still correct: not due for 3 months.
  await reviews.markReviewed(sql, asMember(tom), p.id);
  const after = (await pages.page(sql, asMember(ines), p.id)).review;
  assert.equal(after?.due, false);
  assert.equal(after?.owner, ines.id);
  assert.deepEqual(await reviews.myReviews(sql, asMember(ines)), []);
  // A save is not a check.
  await sql`update pages set reviewed_at = now() - interval '4 months' where id = ${p.id}`;
  await write(p.id, tom, "Meet in the courtyard.");
  assert.equal((await pages.page(sql, asMember(ines), p.id)).review?.due, true);
});

test("an owner who left: the reminder goes to whoever last saved the page, if they still write there", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(camille), { name: "IT" });
  const p = await pages.createPage(sql, asMember(camille), { spaceId: s.id, title: "Backups" });
  await reviews.setReview(sql, asMember(tom), p.id, 6);
  await write(p.id, camille, "Every night at 2:00.");
  await sql`update pages set reviewed_at = now() - interval '7 months' where id = ${p.id}`;
  assert.equal(await chest.emit({ type: "member.removed", data: { id: tom.id } }, events), 204);
  assert.equal((await pages.page(sql, asMember(camille), p.id)).review?.owner, null);
  await chest.run("reviews", jobs);
  assert.deepEqual(chest.notifications.filter(n => n.key === `review:${p.id}`).map(n => n.member), [camille.id]);
  // A page whose last editor is a reader (or gone) waits: nobody is told.
  chest.notifications.splice(0);
  const q = await pages.createPage(sql, asMember(camille), { spaceId: s.id, title: "Printers" });
  await reviews.setReview(sql, asMember(camille), q.id, 3);
  await sql`update pages set review_owner = null, updated_by = ${hugo.id}, reviewed_at = now() - interval '4 months' where id = ${q.id}`;
  await chest.run("reviews", jobs);
  assert.equal(chest.notifications.filter(n => n.key === `review:${q.id}`).length, 0);
  assert.equal((await sql`select review_told from pages where id = ${q.id}`)[0]!["review_told"], false);
});

test("a page in the trash asks for no review", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(ines), { name: "Old" });
  const p = await pages.createPage(sql, asMember(ines), { spaceId: s.id, title: "Fax numbers" });
  await reviews.setReview(sql, asMember(ines), p.id, 12);
  await sql`update pages set reviewed_at = now() - interval '13 months' where id = ${p.id}`;
  await pages.deletePage(sql, asMember(ines), p.id);
  await chest.run("reviews", jobs);
  assert.equal(chest.notifications.filter(n => n.key === `review:${p.id}`).length, 0);
  assert.equal((await reviews.myReviews(sql, asMember(ines))).some(r => r.id === p.id), false);
});

test("the schedule route refuses what the Chest did not sign", async () => {
  const response = await jobs(new Request("http://tool.test/chest-jobs/reviews", { method: "POST", body: "{}" }));
  assert.equal(response.status, 401);
});
