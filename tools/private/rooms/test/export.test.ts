import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../lib/desk-bookings.ts";
import { bookingsCsv, occupancyCsv } from "../lib/export.ts";
import { catalogue } from "../lib/i18n/index.ts";
import { setPresence } from "../lib/presence.ts";
import * as rooms from "../lib/room-bookings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";
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

test("the bookings of a period, in the admin's words, formulas neutralised; members may not export", async () => {
  const { sql } = database;
  const d = workday(1);
  await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: d, part: "am" }, zone);
  await rooms.bookRoom(sql, asMember(ines), { roomId: o.atlas, day: d, start: 600, end: 660, title: "=HYPERLINK(\"x\")", attendees: [hugo.id] }, zone);
  const csv = await bookingsCsv(sql, asMember(camille), d, d, catalogue("fr"), "fr", zone);
  const lines = csv.replace(/^﻿/u, "").trim().split("\r\n");
  assert.equal(lines[0], "Date,Type,Site,Étage,Lieu,Début,Fin,Réservé par,Objet,Personnes invitées");
  assert.equal(lines[1], `${d},Poste,Paris,First floor,D-01 · Open space,00:00,12:00,Hugo Bernard,,`);
  assert.equal(lines[2], `${d},Salle,Paris,Ground floor,Atlas,10:00,11:00,Inès Moreau,"'=HYPERLINK(""x"")",1`);
  await assert.rejects(bookingsCsv(sql, asMember(hugo), d, d, catalogue("en"), "en", zone), { code: "forbidden" });
  await assert.rejects(bookingsCsv(sql, asMember(camille), d, "1999-01-01", catalogue("en"), "en", zone), { code: "invalid" });
});

test("occupancy per day: counts only, per office", async () => {
  const { sql } = database;
  const d = workday(1);
  await setPresence(sql, asMember(camille), { day: d, status: "office" }, zone);
  const csv = await occupancyCsv(sql, asMember(camille), d, d, catalogue("en"));
  const lines = csv.replace(/^﻿/u, "").trim().split("\r\n");
  assert.equal(lines[0], "Date,Office,People at the office,Desks booked,Desks,Desk occupancy (%),Room hours booked");
  assert.equal(lines[1], `${d},Paris,3,1,4,25,1`, "Camille said so, Hugo holds a desk, Inès has a meeting in Atlas");
  // Inès says she works from home that day: her meeting no longer counts her.
  await setPresence(sql, asMember(ines), { day: d, status: "remote" }, zone);
  const after = (await occupancyCsv(sql, asMember(camille), d, d, catalogue("en"))).replace(/^﻿/u, "").trim().split("\r\n");
  assert.equal(after[1], `${d},Paris,2,1,4,25,1`);
  await assert.rejects(occupancyCsv(sql, asMember(ines), d, d, catalogue("en")), { code: "forbidden" });
});
