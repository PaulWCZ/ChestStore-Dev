import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readerOf } from "../lib/access.ts";
import { AppError } from "../lib/app-error.ts";
import { checkIn, updateKeyResult } from "../lib/key-results.ts";
import { emailOn, setEmail } from "../lib/mail.ts";
import { addComment } from "../lib/comments.ts";
import { createObjective, readObjective, updateObjective } from "../lib/objectives.ts";
import { cycleObjectives, keyResultChanges, viewersOf } from "../lib/read.ts";
import { remind, remindAll, waitingFor } from "../lib/remind.ts";
import { clockAt, weeklyReminder } from "../lib/tell.ts";
import { cycleCsv, checkInsCsv } from "../lib/export.ts";
import { catalogue } from "../lib/i18n/index.ts";
import { quarterOf } from "../lib/model.ts";
import { today } from "../lib/time.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, sofia } from "./support/members.ts";
import { companyObjective, running, world, type World } from "./support/world.ts";

// After the critique: who has not checked in and "Remind" (bell and
// email), the email switch, confidential objectives, and the history of a
// key result's changes.
let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const admin = asMember(camille), inesM = asMember(ines), hugoM = asMember(hugo), sofiaM = asMember(sofia);

test("the admins see who has not checked in this week, an objective's owner sees its own key results; Remind reaches the bell and the inbox once a day", async () => {
  const { sql } = w.database;
  const { cycle, sales } = await running(w);
  const company = await companyObjective(w, cycle.id);
  const team = await createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, title: "Open 12 shops", keyResults: [{ title: "Shops signed", kind: "number", start: "0", target: "12", owner: hugo.id }] });
  await sql`update key_results set created_at = now() - interval '10 days'`;
  const clock = clockAt();
  const all = await waitingFor(sql, admin, clock);
  assert.deepEqual(all.map(r => r.title).sort(), ["Customers signed", "Shops signed", "Website live"]);
  // Inès owns the Sales objective: she sees Hugo's key result there, not her own (My goals has it).
  assert.deepEqual((await waitingFor(sql, inesM, clock)).map(r => r.title), ["Shops signed"]);
  assert.deepEqual(await waitingFor(sql, sofiaM, clock), []);
  await assert.rejects(remind(sql, sofiaM, hugo.id, clock), refused("not_found"));
  await remind(sql, inesM, hugo.id, clock);
  assert.ok(w.chest.notifications.some(n => n.member === hugo.id && n.title === "Inès Moreau asks for your weekly update" && n.key === "checkin"));
  const mail = w.chest.outbox.find(m => m.to.includes("hugo@atelier-martin.test"))!;
  assert.equal(mail.subject, "Inès Moreau asks for your weekly update");
  assert.ok(mail.text.includes("Shops signed") && mail.text.includes("To stop these emails"));
  // Once a day, whoever asks.
  await assert.rejects(remind(sql, admin, hugo.id, clock), refused("already_reminded"));
  // Remind everyone: Hugo was reminded already, Inès is.
  assert.equal(await remindAll(sql, admin, clock), 1);
  await assert.rejects(remindAll(sql, inesM, clock), refused("forbidden"));
  // A check-in takes the key result off the list.
  await checkIn(sql, hugoM, team.keyResults[0]!.id, { value: "2", confidence: "on_track" });
  assert.ok(!(await waitingFor(sql, admin, clock)).some(r => r.title === "Shops signed"));
  void company;
  await sql`delete from cycles`;
  await sql`delete from teams`;
  await sql`delete from nudges`;
});

test("each person may turn the reminders' email off; the Friday reminder is emailed to the others", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  await companyObjective(w, cycle.id);
  await sql`update key_results set created_at = now() - interval '10 days'`;
  assert.equal(await emailOn(sql, hugoM), true);
  await setEmail(sql, hugoM, false);
  assert.equal(await emailOn(sql, hugoM), false);
  await assert.rejects(setEmail(sql, hugoM, "no"), refused("invalid"));
  const before = w.chest.outbox.length;
  await weeklyReminder(sql, new Date());
  const sent = w.chest.outbox.slice(before);
  assert.deepEqual(sent.map(m => m.to[0]), ["ines@atelier-martin.test"]);
  assert.equal(sent[0]!.subject, "1 résultat clé attend votre point de la semaine");
  // Delivered twice, it sends nothing again.
  await weeklyReminder(sql, new Date());
  assert.equal(w.chest.outbox.length, before + 1);
  await sql`delete from cycles`;
  await sql`delete from teams`;
});

test("the Friday reminder follows each person's email choice in the Chest: none is not sent, one a day waits for the Chest's digest", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  await companyObjective(w, cycle.id);
  await sql`update key_results set created_at = now() - interval '10 days'`;
  await sql`delete from preferences`;
  const chosen = { [hugo.id]: "none", [ines.id]: "digest" } as const;
  const people = w.chest.members.filter(m => m.id in chosen);
  for (const m of people) m.mailPreference = chosen[m.id as keyof typeof chosen];
  w.chest.clearCaches();
  try {
    const before = w.chest.outbox.length, held = w.chest.held.length;
    // Another day of the quarter than today: today's reminder was sent to
    // Inès above, and its key would answer this one with it.
    const firstDay = quarterOf(today()).startsOn === today();
    await weeklyReminder(sql, new Date(Date.now() + (firstDay ? 1 : -1) * 864e5));
    assert.equal(w.chest.outbox.length, before, "nothing sent now");
    assert.deepEqual(w.chest.held.slice(held).map(h => [h.member, h.reason]).sort(), [[hugo.id, "none"], [ines.id, "digest"]].sort());
    assert.ok(w.chest.notifications.some(n => n.member === hugo.id && n.key === "checkin"), "the bell still reminds");
  } finally {
    for (const m of people) delete m.mailPreference;
    w.chest.clearCaches();
    await sql`delete from cycles`;
    await sql`delete from teams`;
  }
});

test("a confidential objective: seen by its owner, its key results' owners, the people chosen or its team, and the admins; nobody else, anywhere", async () => {
  const { sql } = w.database;
  const { cycle, sales, workshop } = await running(w);
  const clock = clockAt();
  const secret = await createObjective(sql, admin, { cycleId: cycle.id, level: "company", title: "Reduce headcount cost 10%", visibility: "people", viewers: [sofia.id, camille.id], keyResults: [{ title: "Cost", kind: "money", start: "100", target: "90", owner: ines.id }] });
  assert.deepEqual(await viewersOf(sql, secret.id), [sofia.id]);
  const titles = async (who: typeof admin) => (await cycleObjectives(sql, cycle.id, clock, readerOf(who))).map(o => o.title);
  assert.deepEqual(await titles(admin), ["Reduce headcount cost 10%"]);
  assert.deepEqual(await titles(sofiaM), ["Reduce headcount cost 10%"]);
  assert.deepEqual(await titles(inesM), ["Reduce headcount cost 10%"]); // owns a key result
  assert.deepEqual(await titles(hugoM), []);
  await assert.rejects(readObjective(sql, hugoM, secret.id), refused("not_found"));
  await assert.rejects(addComment(sql, hugoM, secret.id, "What is this?"), refused("not_found"));
  // Not supported by what one cannot see.
  await assert.rejects(createObjective(sql, hugoM, { cycleId: cycle.id, level: "team", teamId: sales.id, title: "Hidden support", parentId: secret.id }), refused("parent_invalid"));
  // Not in the export either.
  const t = catalogue("en");
  assert.ok(!(await cycleCsv(sql, hugoM, cycle.id, t, "en", "Europe/Paris")).csv.includes("headcount"));
  assert.ok((await cycleCsv(sql, sofiaM, cycle.id, t, "en", "Europe/Paris")).csv.includes("headcount"));
  // A team's own: the group's members (Sales: Inès and Hugo); not for a team named here.
  const team = await createObjective(sql, inesM, { cycleId: cycle.id, level: "team", teamId: sales.id, title: "Sales bonus plan", visibility: "team" });
  assert.ok((await titles(hugoM)).includes("Sales bonus plan"));
  assert.ok(!(await titles(sofiaM)).includes("Sales bonus plan"));
  await assert.rejects(createObjective(sql, admin, { cycleId: cycle.id, level: "team", teamId: workshop.id, title: "x", visibility: "team" }), refused("invalid"));
  await assert.rejects(createObjective(sql, admin, { cycleId: cycle.id, level: "company", title: "x", visibility: "people", viewers: ["mbr_" + "z".repeat(26)] }), refused("invalid"));
  // Opened to everyone again.
  const opened = await updateObjective(sql, inesM, team.id, { visibility: "people", viewers: [sofia.id] });
  assert.deepEqual(opened.newViewers, [sofia.id]);
  assert.ok((await titles(sofiaM)).includes("Sales bonus plan"));
  await updateObjective(sql, inesM, team.id, { visibility: "everyone" });
  assert.deepEqual(await viewersOf(sql, team.id), []);
  assert.ok((await titles(asMember({ ...hugo, groups: [] }))).includes("Sales bonus plan"));
  await sql`delete from cycles`;
  await sql`delete from teams`;
});

test("a key result's target, start, weight and owner changes are kept with who made them; the check-ins download as a spreadsheet", async () => {
  const { sql } = w.database;
  const { cycle } = await running(w);
  const o = await companyObjective(w, cycle.id);
  const kr = o.keyResults[0]!;
  await checkIn(sql, inesM, kr.id, { value: "4", confidence: "at_risk", note: "Slow, week=1" });
  await updateKeyResult(sql, admin, kr.id, { target: "12", weight: 2 });
  await updateKeyResult(sql, admin, kr.id, { owner: hugo.id });
  const changes = (await keyResultChanges(sql, [kr.id])).get(kr.id)!;
  assert.deepEqual(changes.map(c => [c.field, c.before, c.after, c.author]), [["weight", "1", "2", camille.id], ["target", "20", "12", camille.id], ["owner", ines.id, hugo.id, camille.id]]);
  // Nothing noted when nothing changed.
  await updateKeyResult(sql, admin, kr.id, { title: "Customers signed" });
  assert.equal((await keyResultChanges(sql, [kr.id])).get(kr.id)!.length, 3);
  const csv = (await checkInsCsv(sql, admin, cycle.id, catalogue("fr"), "fr", "Europe/Paris")).csv;
  const [head, row] = csv.replace(/^﻿/u, "").split("\r\n");
  assert.equal(head, "Date;Objectif;Résultat clé;Valeur;Unité;Confiance;Note;Par");
  assert.ok(row!.includes(";Win 20 new customers;Customers signed;4;customers;À risque;\"Slow, week=1\";Inès Moreau"), row);
  await sql`delete from cycles`;
  await sql`delete from teams`;
});
