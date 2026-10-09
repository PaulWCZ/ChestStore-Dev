import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as mail from "@argentic/chest-sdk/mail";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import * as b from "../src/lib/booking.ts";
import * as mailer from "../src/lib/mailer.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, hugo, ines, nora } from "./support/members.ts";

// Email goes only to guests — people outside the company — through the
// Chest's mail connector (SDK 0.4.1-studio.5): to an address, with the
// calendar file, Reply-To the company's address. A host is told in the
// bell: one notice, English and French (the Chest shows each host theirs,
// and mails it to them by their own choice).

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    network: {},
    chest: { timeZone: "Europe/Paris" },
    tool: "booking",
    members: [camille, ines, hugo, { ...nora, role: "host" }],
    capabilities: ["database", "members", "notifications", "mail"],
    mail: { domain: "atelier.test", replyTo: "hello@atelier.test" },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});

const day = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const context = { hostName: "Inès Moreau", company: "Atelier", link: "https://booking.atelier.test/b/x", bookAgain: "https://booking.atelier.test/ines-moreau" };
const anyBooking = async () => {
  const [row] = await database.sql<{ id: string }[]>`select id::text as id from bookings limit 1`;
  return (await b.bookingsByIds(database.sql, [row!.id]))[0]!;
};

test("the guest gets the confirmation, the move and the cancellation, each with its calendar file, replies going to the company", async () => {
  const { sql } = database;
  await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  await b.saveWeekly(sql, asMember(ines), Array.from({ length: 7 }, () => [[0, 1440]]));
  const [type] = await b.typesOf(sql, ines.id);
  const host = (await b.hostOf(sql, ines.id))!;
  const free = await b.freeTimes(sql, host, type!, day(), day());
  const made = await b.book(sql, host, type!, { start: free[0]!.start, name: "Nora Petit", email: "Nora@Example.test", note: "", zone: "Europe/Paris", language: "en" });
  // Inès's page speaks French only: her guests read French; here, English.
  const booking = { ...made.booking, guestLanguage: "en" };
  chest.outbox.length = 0;

  assert.equal(await mailer.confirmed(booking, context), "email");
  assert.equal(await mailer.moved({ ...booking, moves: 1 }, context), "email");
  assert.equal(await mailer.cancelled(booking, context), "email");
  assert.equal(chest.outbox.length, 3);
  assert.ok(chest.outbox.every(m => m.to.length === 1 && m.to[0]!.toLowerCase() === "nora@example.test" && m.cc.length === 0));
  assert.ok(chest.outbox.every(m => m.replyTo === "hello@atelier.test"), "replies reach the company's address");
  assert.ok(chest.outbox.every(m => m.attachments.length === 1 && m.attachments[0]!.type.startsWith("text/calendar") && m.attachments[0]!.name === "booking.ics"));
  assert.ok(chest.outbox.every(m => m.text.includes("Reply to this email")), "the mail says where replies go");
  // Each key carries its recipient: after a restore from a backup, a
  // booking's id can name another guest's meeting.
  assert.deepEqual(chest.outbox.map(m => m.key), [`booked:${booking.id}:${booking.guestEmail}`, `moved:${booking.id}:1:${booking.guestEmail}`, `cancelled:${booking.id}:${booking.guestEmail}`].map(k => mail.idempotencyKey(k)));

  await mailer.reminder(booking, context);
  assert.equal(chest.outbox.length, 4, "the reminder goes to the guest");
  assert.equal(chest.outbox[3]!.replyTo, "hello@atelier.test");
});

test("the guest's French mails are in French, the reply line too", async () => {
  chest.outbox.length = 0;
  // Another guest: the same key within a day would answer the first message.
  const made = { ...(await anyBooking()), guestLanguage: "fr", guestEmail: "lea@example.test" };
  await mailer.confirmed(made, context);
  assert.match(chest.outbox[0]!.subject, /^Réservé\u202f: /u);
  assert.ok(chest.outbox[0]!.text.includes("Une question\u202f? Répondez à cet e-mail."));
  assert.equal(chest.outbox[0]!.attachments[0]!.name, "rendez-vous.ics");
});

test("the host hears of a booking in the bell, in English and French, never by email", async () => {
  const made = { ...(await anyBooking()), guestName: "Kenji Sato", guestNote: "About the oak table" };
  chest.outbox.length = 0;
  chest.notifications.length = 0;
  await tell.booked(made, "Europe/Paris", { en: "Meeting", fr: "Rendez-vous" });
  assert.equal(chest.outbox.length, 0, "no mail to a member");
  assert.equal(chest.notifications.length, 1, "one notice, both languages");
  const n = chest.notifications[0]!;
  assert.equal(n.member, ines.id);
  assert.equal(n.key, `booking:${made.id}`);
  assert.equal(n.path, `/chest/bookings/${made.id}`);
  assert.match(shownTo(n, "en").title, /^Kenji Sato booked /u);
  assert.match(shownTo(n, "fr").title, /^Kenji Sato a réservé /u);
  assert.match(shownTo(n, "en").body ?? "", /^Meeting — About the oak table/u);
  assert.match(shownTo(n, "fr").body ?? "", /^Rendez-vous — About the oak table/u);
  // A later notice of the booking replaces it.
  await tell.cancelled({ ...made, cancelReason: "" }, "Europe/Paris", { en: "Meeting", fr: "Rendez-vous" });
  assert.equal(chest.notifications.length, 1);
  assert.match(shownTo(chest.notifications[0]!, "en").title, /cancelled/u);
});

test("a member is never a mail recipient: the Chest refuses it", async () => {
  await assert.rejects(mail.send({ to: ines.id, subject: "x", text: "x" }), (e: Error & { code?: string }) => e.code === "invalid_recipient");
  await assert.rejects(mail.send({ to: Object.fromEntries([["member", ines.id]]) as unknown as string, subject: "x", text: "x" }), (e: Error & { code?: string }) => e.code === "invalid_recipient");
});

// The pages ask the Chest before promising an email (mail.available), and
// say why not in the owner's terms.
test("whether mail goes out, as the Chest says it: ready, not connected, suspended, a Chest without mail", async () => {
  assert.deepEqual(await mailer.mailInfo(), { state: "ready", replyTo: "hello@atelier.test" });
  for (const state of ["not_connected", "suspended"] as const) {
    chest.delivery.mail = state;
    try {
      assert.equal(await mailer.mailState(), state);
    } finally {
      chest.delivery.mail = "ready";
    }
  }
  // The owner has not connected the company's mail provider: nothing is
  // sent, and the guest keeps their page (the pages say so).
  chest.delivery.mail = "not_connected";
  try {
    const before = chest.outbox.length;
    assert.equal(await mailer.confirmed(await anyBooking(), context), "page");
    assert.equal(chest.outbox.length, before);
  } finally {
    chest.delivery.mail = "ready";
  }
  const plain = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, tool: "booking", members: [camille], capabilities: ["database", "members", "notifications"] });
  try {
    assert.equal(await mailer.mailState(), "not_granted");
  } finally {
    await plain.close();
  }
});

test("calendar files: a UID of each booking's own (id and its link's hash), the former UID for bookings made before", async () => {
  const { sql } = database;
  const made = await anyBooking();
  assert.match(made.uid, new RegExp(`^booking-${made.id}-[0-9a-f]{12}@booking\\.chest$`, "u"));
  // The guest's invitation (the email's attachment, /b/<secret>/ics).
  assert.ok(mailer.invitation(made, context).includes(`\r\nUID:${made.uid}\r\n`), "the invitation carries it");
  // Two bookings never share one (another company, a restored backup).
  const other = await sql<{ id: string }[]>`select id::text as id from bookings where id <> ${made.id} limit 1`;
  if (other[0]) assert.notEqual((await b.bookingsByIds(sql, [other[0].id]))[0]!.uid.split("-").at(-1), made.uid.split("-").at(-1));
  // Made before this version: the UID its invitations already carry.
  await sql`update bookings set legacy_uid = true where id = ${made.id}`;
  assert.equal((await b.bookingsByIds(sql, [made.id]))[0]!.uid, `booking-${made.id}@chest`);
  await sql`update bookings set legacy_uid = false where id = ${made.id}`;
});

test("a reminder says today, tomorrow or reminder, as the day is in the guest's zone", async () => {
  const made = { ...(await anyBooking()), startsAt: new Date("2026-10-08T20:00:00Z"), guestZone: "Europe/Paris", guestLanguage: "en" };
  chest.outbox.length = 0;
  await mailer.reminder({ ...made, moves: 11 }, context, Date.parse("2026-10-08T08:00:00Z"));
  await mailer.reminder({ ...made, moves: 12 }, context, Date.parse("2026-10-07T08:00:00Z"));
  await mailer.reminder({ ...made, moves: 13 }, context, Date.parse("2026-10-05T08:00:00Z"));
  assert.deepEqual(chest.outbox.map(m => m.subject.split(":")[0]), ["Today", "Tomorrow", "Reminder"]);
});

test("a colleague moves or cancels a host's booking: the host hears who did it, in English and French", async () => {
  const made = { ...(await anyBooking()), guestName: "Kenji Sato", cancelReason: "" };
  chest.outbox.length = 0;
  chest.notifications.length = 0;
  await tell.changedFor("moved", made, "Camille Martin", "Europe/Paris", { en: "Meeting", fr: "Rendez-vous" });
  assert.equal(chest.outbox.length, 0, "no mail to a member");
  const n = chest.notifications[0]!;
  assert.equal(n.member, made.memberId);
  assert.equal(n.key, `booking:${made.id}`);
  assert.equal(n.path, `/chest/bookings/${made.id}`);
  assert.match(shownTo(n, "en").title, /^Camille Martin moved your booking with Kenji Sato to /u);
  assert.match(shownTo(n, "fr").title, /^Camille Martin a déplacé votre rendez-vous avec Kenji Sato à /u);
  assert.equal(shownTo(n, "fr").body, "Rendez-vous");
  // The cancellation replaces it, with the colleague's reason.
  await tell.changedFor("cancelled", { ...made, cancelReason: "Closed that day" }, "Camille Martin", "Europe/Paris");
  assert.equal(chest.notifications.length, 1);
  assert.match(shownTo(chest.notifications[0]!, "en").title, /^Camille Martin cancelled your booking with Kenji Sato, /u);
  assert.equal(shownTo(chest.notifications[0]!, "en").body, "Closed that day");
});
