import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import * as forms from "../lib/forms.ts";
import { catalogue } from "../lib/i18n/index.ts";
import { template } from "../lib/templates.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

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

const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code);
};
const good = () => form([q("short", "Your name", { required: true })], "Contact");

test("who may create forms: managers and creators, not members, not people without a role", async () => {
  const { sql } = database;
  assert.ok((await forms.create(sql, asMember(camille), { definition: good() })).slug);
  assert.ok((await forms.create(sql, asMember(ines), { definition: good() })).slug);
  await refused(forms.create(sql, asMember(hugo), { definition: good() }), "forbidden");
  await refused(forms.create(sql, asMember(nora), { definition: good() }), "forbidden");
  await refused(forms.create(sql, null, { definition: good() }), "forbidden");
});

test("a form is seen by its owner, managers and people it is shared with — others do not know it exists", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: good() });
  await refused(forms.open(sql, asMember(hugo), f.id), "not_found");
  assert.equal((await forms.open(sql, asMember(camille), f.id)).level, "owner");
  await forms.share(sql, asMember(ines), f.id, hugo.id, "viewer");
  assert.equal((await forms.open(sql, asMember(hugo), f.id)).level, "viewer");
  await refused(forms.open(sql, asMember(hugo), f.id, "editor"), "forbidden");
  await refused(forms.saveDraft(sql, asMember(hugo), f.id, JSON.stringify(good()), f.revision), "forbidden");
  await refused(forms.share(sql, asMember(hugo), f.id, lea.id, "editor"), "forbidden");
  await forms.share(sql, asMember(ines), f.id, hugo.id, "editor");
  await forms.saveDraft(sql, asMember(hugo), f.id, JSON.stringify(good()), f.revision);
  // Listing: Hugo sees it as shared, Léa does not see it.
  assert.ok((await forms.list(sql, asMember(hugo))).some(x => x.id === f.id && x.level === "editor"));
  assert.ok(!(await forms.list(sql, asMember(lea))).some(x => x.id === f.id));
  await forms.share(sql, asMember(ines), f.id, hugo.id, null);
  await refused(forms.open(sql, asMember(hugo), f.id), "not_found");
  await refused(forms.open(sql, asMember(camille), "12abc"), "not_found");
});

test("two editors never overwrite each other silently", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: good() });
  const first = await forms.saveDraft(sql, asMember(ines), f.id, JSON.stringify({ ...good(), title: "One" }), f.revision);
  await refused(forms.saveDraft(sql, asMember(camille), f.id, JSON.stringify({ ...good(), title: "Two" }), f.revision), "conflict");
  await forms.saveDraft(sql, asMember(camille), f.id, JSON.stringify({ ...good(), title: "Two" }), first.revision);
  assert.equal((await forms.open(sql, asMember(ines), f.id)).form.draft.title, "Two");
  await refused(forms.saveDraft(sql, asMember(ines), f.id, "{not json", 99), "invalid");
});

test("publishing: refused while incomplete; a new version only when the draft changed", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: form([q("short", "")], "") });
  await refused(forms.publish(sql, asMember(ines), f.id), "incomplete");
  await forms.saveDraft(sql, asMember(ines), f.id, JSON.stringify(good()), f.revision);
  const one = await forms.publish(sql, asMember(ines), f.id);
  assert.equal(one.version, 1);
  assert.equal(one.first, true);
  assert.equal(one.form.status, "published");
  assert.equal(await forms.unpublished(sql, one.form), false);
  assert.equal((await forms.publish(sql, asMember(ines), f.id)).version, 1, "nothing changed: same version");
  const changed = { ...good(), title: "Contact us" };
  await forms.saveDraft(sql, asMember(ines), f.id, JSON.stringify(changed), one.form.revision);
  assert.equal(await forms.unpublished(sql, (await forms.open(sql, asMember(ines), f.id)).form), true);
  assert.equal((await forms.publish(sql, asMember(ines), f.id)).version, 2);
  assert.equal((await forms.bySlug(sql, f.slug))!.definition.title, "Contact us");
  // Discard: the draft goes back to what is published.
  const { form: now } = await forms.open(sql, asMember(ines), f.id);
  await forms.saveDraft(sql, asMember(ines), f.id, JSON.stringify({ ...changed, title: "Oops" }), now.revision);
  await forms.discard(sql, asMember(ines), f.id);
  assert.equal((await forms.open(sql, asMember(ines), f.id)).form.draft.title, "Contact us");
});

test("a draft or a deleted form is never shown to respondents; closing and reopening", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: good() });
  assert.equal(await forms.bySlug(sql, f.slug), null, "a draft");
  await forms.publish(sql, asMember(ines), f.id);
  assert.ok(await forms.bySlug(sql, f.slug));
  const closed = await forms.close(sql, asMember(ines), f.id);
  assert.deepEqual(forms.openState(closed), { open: false, reason: "closed" });
  await forms.reopen(sql, asMember(ines), f.id);
  await forms.remove(sql, asMember(ines), f.id);
  assert.equal(await forms.bySlug(sql, f.slug), null, "deleted");
  await refused(forms.open(sql, asMember(ines), f.id), "not_found");
  await refused(forms.restore(sql, asMember(hugo), f.id), "not_found");
  await forms.restore(sql, asMember(ines), f.id);
  assert.ok(await forms.bySlug(sql, f.slug));
  assert.equal(await forms.bySlug(sql, "../../etc"), null);
});

test("a closing date in the past closes the form; reopening clears it", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: good() });
  await forms.publish(sql, asMember(ines), f.id);
  const s = await forms.saveSettings(sql, asMember(ines), f.id, { audience: "public", layout: "classic", accent: "teal", watchers: [] }, new Date(Date.now() - 60000));
  assert.deepEqual(forms.openState(s), { open: false, reason: "date" });
  const again = await forms.reopen(sql, asMember(ines), f.id);
  assert.equal(again.closesAt, null);
  assert.equal(forms.openState(again).open, true);
});

test("settings: watchers are only people who may open the form; anonymity and files never meet", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: form([q("short", "Name"), q("file", "CV")], "Apply") });
  await forms.share(sql, asMember(ines), f.id, hugo.id, "viewer");
  await forms.saveSettings(sql, asMember(ines), f.id, { audience: "public", layout: "steps", accent: "berry", watchers: [ines.id, hugo.id, lea.id] }, null);
  assert.deepEqual((await forms.team(sql, f.id)).watchers.sort(), [hugo.id, ines.id].sort());
  await refused(forms.saveSettings(sql, asMember(ines), f.id, { audience: "team", anonymous: true, layout: "steps", accent: "berry", watchers: [] }, null), "anonymous_files");
  await refused(forms.saveSettings(sql, asMember(hugo), f.id, { audience: "team", layout: "steps", accent: "berry", watchers: [] }, null), "forbidden");
});

test("templates start forms in the member's language, with their settings; a duplicate is a new draft", async () => {
  const { sql } = database;
  const it = template("it", catalogue("fr"));
  const f = await forms.create(sql, asMember(camille), it);
  assert.equal(f.draft.title, "Demande informatique");
  assert.equal(f.audience, "team");
  assert.equal(f.once, false);
  const pulse = await forms.create(sql, asMember(camille), template("pulse", catalogue("en")));
  assert.equal(pulse.anonymous, true);
  const copy = await forms.duplicate(sql, asMember(camille), pulse.id, title => `Copy of ${title}`);
  assert.equal(copy.draft.title, "Copy of How was your week?");
  assert.equal(copy.anonymous, true);
  assert.equal(copy.status, "draft");
  assert.notEqual(copy.draft.pages[0]!.questions[0]!.id, pulse.draft.pages[0]!.questions[0]!.id);
});

test("the team's open forms, and whether I answered", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(camille), { definition: good(), settings: { audience: "team" } });
  assert.ok(!(await forms.teamForms(sql, asMember(hugo))).some(x => x.slug === f.slug), "a draft is not offered");
  await forms.publish(sql, asMember(camille), f.id);
  const listed = (await forms.teamForms(sql, asMember(hugo))).find(x => x.slug === f.slug);
  assert.ok(listed && !listed.answered);
  assert.deepEqual(await forms.teamForms(sql, asMember(nora)), []);
});
