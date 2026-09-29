import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as b from "../lib/booking.ts";
import * as mailer from "../lib/mailer.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, nora } from "./support/members.ts";

// SDK studio.15: every member chooses in the Chest how tools may email them
// (all, a daily digest, none), and mail.send applies it. A guest's
// confirmation, a move and a cancellation are transactional — the guest
// gets them even when they are a member who turned email off; the host's
// own notice and a reminder honour the choice.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    tool: "booking",
    members: [
      camille,
      // Inès hosts and chose no email from tools; Nora, a colleague who
      // books a meeting with her as a guest, chose none too.
      { ...ines, email: "ines@atelier.test", mailPreference: "none" },
      { ...hugo, email: "hugo@atelier.test", mailPreference: "digest" },
      { ...nora, role: "host", email: "nora@atelier.test", mailPreference: "none" },
    ],
    capabilities: ["database", "members", "members.email", "notifications", "mail"],
    mail: { domain: "atelier.test" },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});

const day = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const context = { hostName: "Inès Moreau", company: "Atelier", link: "https://booking.atelier.test/b/x", bookAgain: "https://booking.atelier.test/ines-moreau" };

test("a colleague who turned email off still gets their booking's confirmation, move and cancellation; not the reminder", async () => {
  const { sql } = database;
  await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  await b.saveWeekly(sql, asMember(ines), Array.from({ length: 7 }, () => [[0, 1440]]));
  const [type] = await b.typesOf(sql, ines.id);
  const host = (await b.hostOf(sql, ines.id))!;
  const free = await b.freeTimes(sql, host, type!, day(), day());
  const { booking } = await b.book(sql, host, type!, { start: free[0]!.start, name: "Nora Petit", email: "Nora@Atelier.test", note: "", zone: "Europe/Paris", language: "en" });
  chest.outbox.length = 0;
  chest.held.length = 0;

  assert.equal(await mailer.confirmed(booking, context), "email");
  assert.equal(await mailer.moved({ ...booking, moves: 1 }, context), "email");
  assert.equal(await mailer.cancelled(booking, context), "email");
  assert.equal(chest.outbox.length, 3);
  assert.ok(chest.outbox.every(m => m.to.map(a => a.toLowerCase()).includes("nora@atelier.test")));
  assert.equal(chest.held.length, 0);

  // A reminder is not transactional: her choice holds it back.
  await mailer.reminder(booking, context);
  assert.equal(chest.outbox.length, 3);
  assert.deepEqual(chest.held.map(h => [h.member, h.reason]), [[nora.id, "none"]]);
});

test("the host's own notice honours their email choice: none is not sent, a digest waits", async () => {
  const { sql } = database;
  const [booking] = await sql<{ id: string }[]>`select id::text as id from bookings limit 1`;
  const made = (await b.bookingsByIds(sql, [booking!.id]))[0]!;
  chest.outbox.length = 0;
  chest.held.length = 0;
  await mailer.toHost("booked", made, { locale: "fr", zone: "Europe/Paris", link: "https://booking-chest.atelier.test/chest/bookings/1" });
  assert.equal(chest.outbox.length, 0);
  assert.deepEqual(chest.held.map(h => [h.member, h.reason]), [[ines.id, "none"]]);
  // The same booking handed to another host: the key names the recipient
  // (whole, never cut — studio.15), so it is no key conflict.
  await mailer.toHost("booked", { ...made, memberId: hugo.id }, { locale: "en", zone: "Europe/Paris", link: "https://booking-chest.atelier.test/chest/bookings/1" });
  assert.equal(chest.outbox.length, 0);
  assert.deepEqual(chest.held.at(-1)?.reason, "digest");
});
