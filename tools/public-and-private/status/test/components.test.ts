import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { addComponent, allComponents, moveComponent, putBack, removeComponent, shownComponents, tree, updateComponent } from "../lib/components.ts";
import { openIncident } from "../lib/incidents.ts";
import { statusView } from "../lib/status-view.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, nora } from "./support/members.ts";

let database: TestDatabase;
// The Chest the tool runs in: its zone and language are read on every page.
let chest: FakeChest;
const editor = asMember(camille);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ chest: { organization: "Atelier Martin", timeZone: "Europe/Paris" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate incidents, components, subscribers restart identity cascade`;
});

const refuses = async (code: string, step: () => Promise<unknown>) => {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code, code);
};

test("components and groups keep the editors' order; moving swaps neighbours", async () => {
  const { sql } = database;
  const a = await addComponent(sql, editor, { name: "Website", description: "Our pages" });
  const g = await addComponent(sql, editor, { name: "Online shop", kind: "group" });
  const b = await addComponent(sql, editor, { name: "Checkout", parentId: g.id });
  const c = await addComponent(sql, editor, { name: "Payments", parentId: g.id });
  assert.deepEqual(tree(await allComponents(sql)).map(e => [e.name, e.children.map(k => k.name)]), [["Website", []], ["Online shop", ["Checkout", "Payments"]]]);
  await moveComponent(sql, editor, g.id, "up");
  await moveComponent(sql, editor, c.id, "up");
  await moveComponent(sql, editor, c.id, "up");
  assert.deepEqual(tree(await allComponents(sql)).map(e => [e.name, e.children.map(k => k.name)]), [["Online shop", ["Payments", "Checkout"]], ["Website", []]]);
  // Out of a group, into another level.
  await updateComponent(sql, editor, b.id, { parentId: null, name: "Checkout page" });
  assert.deepEqual(tree(await allComponents(sql)).map(e => e.name), ["Online shop", "Website", "Checkout page"]);
  assert.equal((await allComponents(sql)).find(x => x.id === a.id)!.description, "Our pages");
  await refuses("invalid", () => updateComponent(sql, editor, b.id, { parentId: a.id }));
  await refuses("invalid", () => moveComponent(sql, editor, a.id, "sideways"));
});

test("hidden components and groups leave the public page; hiding keeps their history", async () => {
  const { sql } = database;
  const a = await addComponent(sql, editor, { name: "Website" });
  const g = await addComponent(sql, editor, { name: "Internal", kind: "group" });
  await addComponent(sql, editor, { name: "Back office", parentId: g.id });
  await updateComponent(sql, editor, g.id, { hidden: true });
  assert.deepEqual(shownComponents(await allComponents(sql)).map(c => c.name), ["Website"]);
  await openIncident(sql, editor, { title: "x", status: "investigating", body: "x", states: { [a.id]: "major" } });
  await updateComponent(sql, editor, a.id, { hidden: true });
  const view = await statusView(sql, "Europe/Paris");
  assert.equal(view.entries.length, 0);
  assert.equal(view.overall, "operational", "the banner speaks of what is shown");
  assert.equal(view.names.size, 0, "a hidden name is never written on the public page");
});

test("deleting: a component with a history is hidden instead, a group must be empty", async () => {
  const { sql } = database;
  const a = await addComponent(sql, editor, { name: "Website" });
  const b = await addComponent(sql, editor, { name: "Blog" });
  const g = await addComponent(sql, editor, { name: "Shop", kind: "group" });
  const c = await addComponent(sql, editor, { name: "Checkout", parentId: g.id });
  await sql`insert into subscribers (email, token, components) values ('x@example.com', ${"x".repeat(32)}, ${[b.id, a.id]}::bigint[])`;
  await openIncident(sql, editor, { title: "x", status: "investigating", body: "x", states: { [a.id]: "major" } });
  await refuses("in_use", () => removeComponent(sql, editor, a.id));
  await refuses("has_children", () => removeComponent(sql, editor, g.id));
  await removeComponent(sql, editor, b.id);
  await removeComponent(sql, editor, c.id);
  await removeComponent(sql, editor, g.id);
  assert.deepEqual((await allComponents(sql)).map(x => x.name), ["Website"]);
  const [s] = await sql<{ components: string[] }[]>`select components from subscribers`;
  assert.deepEqual(s!.components.map(String), [a.id], "a subscriber no longer follows what is gone");
});

test("a deletion is undone: the component comes back in its place, with its marks", async () => {
  const { sql } = database;
  const g = await addComponent(sql, editor, { name: "Shop", kind: "group" });
  await addComponent(sql, editor, { name: "Catalogue", parentId: g.id });
  const b = await addComponent(sql, editor, { name: "Checkout", parentId: g.id, description: "Paying", teamOnly: true });
  await addComponent(sql, editor, { name: "Payments", parentId: g.id });
  await updateComponent(sql, editor, b.id, { hidden: true });
  const gone = await removeComponent(sql, editor, b.id);
  assert.deepEqual(tree(await allComponents(sql))[0]!.children.map(c => c.name), ["Catalogue", "Payments"]);
  const back = await putBack(sql, editor, { kind: gone.kind, name: gone.name, description: gone.description, parentId: gone.parentId, position: gone.position, hidden: gone.hidden, teamOnly: gone.teamOnly });
  assert.deepEqual(tree(await allComponents(sql))[0]!.children.map(c => c.name), ["Catalogue", "Checkout", "Payments"], "in its place");
  assert.deepEqual([back.description, back.hidden, back.teamOnly, back.parentId], ["Paying", true, true, g.id]);
  // A group deleted and put back; a putBack is checked like an addition.
  const gone2 = await removeComponent(sql, editor, (await addComponent(sql, editor, { name: "Empty", kind: "group" })).id);
  assert.equal((await putBack(sql, editor, { kind: gone2.kind, name: gone2.name, position: gone2.position })).kind, "group");
  await refuses("forbidden", () => putBack(sql, asMember(nora), { name: "x" }));
  await refuses("empty", () => putBack(sql, editor, { name: " " }));
  const payments = (await allComponents(sql)).find(c => c.name === "Payments")!.id;
  await refuses("invalid", () => putBack(sql, editor, { name: "x", parentId: payments }));
});

test("components are the editors': refused to anyone else, bounded", async () => {
  const { sql } = database;
  await refuses("forbidden", () => addComponent(sql, asMember(nora), { name: "x" }));
  await refuses("forbidden", () => addComponent(sql, null, { name: "x" }));
  const a = await addComponent(sql, editor, { name: "Website" });
  await refuses("forbidden", () => updateComponent(sql, asMember(nora), a.id, { name: "y" }));
  await refuses("forbidden", () => moveComponent(sql, asMember(nora), a.id, "up"));
  await refuses("forbidden", () => removeComponent(sql, asMember(nora), a.id));
  await refuses("empty", () => addComponent(sql, editor, { name: " " }));
  await refuses("too_long", () => addComponent(sql, editor, { name: "x".repeat(81) }));
  await refuses("too_long", () => addComponent(sql, editor, { name: "x", description: "x".repeat(201) }));
  await refuses("not_found", () => updateComponent(sql, editor, "999", { name: "y" }));
  await refuses("not_found", () => updateComponent(sql, editor, "abc", { name: "y" }));
  await refuses("invalid", () => addComponent(sql, editor, { name: "Child", parentId: a.id }));
  for (let i = 1; i < 60; i++) await addComponent(sql, editor, { name: "C" + i });
  await refuses("too_many", () => addComponent(sql, editor, { name: "One too many" }));
});
