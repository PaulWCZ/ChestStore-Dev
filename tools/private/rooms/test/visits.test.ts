import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { erase, leave } from "../src/lib/lifecycle.ts";
import { myCsv } from "../src/lib/mine.ts";
import { catalogue } from "../src/i18n/index.ts";
import { addDays, today } from "../src/lib/model.ts";
import { purge } from "../src/lib/settings.ts";
import * as tell from "../src/lib/tell.ts";
import * as visits from "../src/lib/visits.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, tom } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const now = () => today(zone);

test("a member announces their own visitor; only they and the reception see it; the reception announces for anyone", async () => {
  const { sql } = database;
  const d = workday(1);
  const mine = await visits.announce(sql, asMember(hugo), { officeId: o.office, day: d, at: 600, name: "  Paul   Durand ", company: "Client SA" }, zone);
  assert.deepEqual([mine.name, mine.company, mine.host, mine.createdBy, mine.at], ["Paul Durand", "Client SA", hugo.id, hugo.id, 600]);
  const forInes = await visits.announce(sql, asMember(tom), { officeId: o.office, day: d, at: 630, name: "Marie Leroy", host: ines.id }, zone);
  assert.equal(forInes.host, ines.id);
  // Who sees what: the host and whoever announced; the reception, all.
  assert.deepEqual((await visits.visitsOn(sql, asMember(hugo), o.office, d)).map(v => v.name), ["Paul Durand"]);
  assert.deepEqual((await visits.visitsOn(sql, asMember(ines), o.office, d)).map(v => v.name), ["Marie Leroy"]);
  assert.deepEqual((await visits.visitsOn(sql, asMember(lea), o.office, d)).map(v => v.name), [], "another member sees nobody's visitors");
  assert.deepEqual((await visits.visitsOn(sql, asMember(tom), o.office, d)).map(v => v.name), ["Paul Durand", "Marie Leroy"]);
  assert.deepEqual((await visits.visitsOn(sql, asMember(camille), o.office, d)).map(v => v.name), ["Paul Durand", "Marie Leroy"]);
  assert.deepEqual((await visits.myVisitors(sql, asMember(ines), d, d)).map(v => v.name), ["Marie Leroy"]);
  // The host hears the reception announced it, in their language.
  chest.notifications.length = 0;
  await tell.visitAnnounced(asMember(tom), forInes);
  await tell.visitAnnounced(asMember(hugo), mine);
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title]), [[ines.id, "Tom Walker a annoncé votre visiteur Marie Leroy"]], "announcing one's own visitor is silent");
});

test("refusals: no role, a member announcing for someone else, a past day, too far, an odd time, no name, an unknown office or host", async () => {
  const { sql } = database;
  const d = workday(1);
  const base = { officeId: o.office, day: d, at: 600, name: "X" };
  await assert.rejects(visits.announce(sql, asMember(nora), base, zone), { code: "forbidden" });
  await assert.rejects(visits.announce(sql, asMember(hugo), { ...base, host: ines.id }, zone), { code: "forbidden" });
  await assert.rejects(visits.announce(sql, asMember(hugo), { ...base, day: addDays(now(), -1) }, zone), { code: "past" });
  await assert.rejects(visits.announce(sql, asMember(hugo), { ...base, day: addDays(now(), 120) }, zone), { code: "too_far" });
  await assert.rejects(visits.announce(sql, asMember(hugo), { ...base, at: 601 }, zone), { code: "invalid" });
  await assert.rejects(visits.announce(sql, asMember(hugo), { ...base, name: "   " }, zone), { code: "empty" });
  await assert.rejects(visits.announce(sql, asMember(hugo), { ...base, name: "x".repeat(121) }, zone), { code: "too_long" });
  await assert.rejects(visits.announce(sql, asMember(hugo), { ...base, officeId: "9999" }, zone), { code: "not_found" });
  await assert.rejects(visits.announce(sql, asMember(tom), { ...base, host: nora.id }, zone), { code: "not_found" }, "a host must have Rooms");
  await assert.rejects(visits.visitsOn(sql, asMember(nora), o.office, d), { code: "forbidden" });
});

test("the reception marks an arrival on the day, the host hears it once; Undo; a member cannot mark someone else's visitor; cancel and restore", async () => {
  const { sql } = database;
  const d = now();
  const v = await visits.announce(sql, asMember(lea), { officeId: o.office, day: d, at: 1425, name: "Anna Weber", company: "Weber GmbH" }, zone);
  const later = await visits.announce(sql, asMember(lea), { officeId: o.office, day: workday(2), at: 600, name: "Tomorrow's" }, zone);
  await assert.rejects(visits.arrive(sql, asMember(hugo), v.id, zone), { code: "not_found" }, "not his visitor: he does not see it");
  await assert.rejects(visits.arrive(sql, asMember(tom), later.id, zone), { code: "not_today" });
  const first = await visits.arrive(sql, asMember(tom), v.id, zone);
  assert.equal(first.first, true);
  assert.ok(first.visit.arrivedAt);
  assert.equal((await visits.arrive(sql, asMember(tom), v.id, zone)).first, false, "a second tap is not a second arrival");
  chest.notifications.length = 0;
  await tell.visitorHere(asMember(tom), first.visit, "Paris");
  assert.equal(chest.notifications.length, 1);
  assert.equal(chest.notifications[0]!.member, lea.id);
  assert.equal(chest.notifications[0]!.title, "Anna Weber (Weber GmbH) est là pour vous");
  assert.equal(chest.notifications[0]!.body, "Paris · rendez-vous de 23:45");
  assert.equal((await visits.unarrive(sql, asMember(tom), v.id)).arrivedAt, null);
  // The host marks it themselves: nobody else to tell.
  const own = await visits.arrive(sql, asMember(lea), v.id, zone);
  chest.notifications.length = 0;
  await tell.visitorHere(asMember(lea), own.visit, "Paris");
  assert.equal(chest.notifications.length, 0);
  // Cancel: a member who neither hosts nor announced it cannot; Undo brings it back.
  await assert.rejects(visits.cancelVisit(sql, asMember(hugo), later.id, zone), { code: "not_found" });
  await visits.cancelVisit(sql, asMember(tom), later.id, zone);
  assert.equal((await visits.myVisitors(sql, asMember(lea), workday(2), workday(2))).length, 0);
  await visits.restoreVisit(sql, asMember(lea), later.id);
  assert.equal((await visits.myVisitors(sql, asMember(lea), workday(2), workday(2))).length, 1);
});

test("a host who leaves: their coming visitors are cancelled; erased: no trace of their id; old visits go with old bookings; in the host's own data", async () => {
  const { sql } = database;
  const d = workday(3);
  await visits.announce(sql, asMember(ines), { officeId: o.office, day: d, at: 600, name: "Coming", company: "ACME" }, zone);
  const csv = await myCsv(sql, asMember(ines), catalogue("en"), "en", zone);
  assert.match(csv, /My visitor,Paris,Coming · ACME,10:00/u);
  await leave(sql, ines.id, zone);
  assert.equal((await visits.visitsOn(sql, asMember(tom), o.office, d)).filter(v => v.name === "Coming").length, 0);
  await erase(sql, ines.id, zone);
  const [left] = await sql<{ n: number }[]>`select count(*)::int as n from visits where host = ${ines.id} or created_by = ${ines.id} or arrived_by = ${ines.id}`;
  assert.equal(left!.n, 0);
  // A visit long past goes when the week is read (purge).
  await sql`insert into visits (office_id, day, at_minute, name, host, created_by) values (${o.office}, ${addDays(now(), -400)}, 600, 'Old', ${hugo.id}, ${hugo.id})`;
  await purge(sql, zone);
  const [old] = await sql<{ n: number }[]>`select count(*)::int as n from visits where name = 'Old'`;
  assert.equal(old!.n, 0);
});
