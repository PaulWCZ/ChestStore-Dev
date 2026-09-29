import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-jobs/[name]/route.ts";
import * as b from "../lib/booking.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
// The declared calendar hosts, as the Chest's egress proxy reaches them
// (fakeChest network, SDK studio.15): what each address answers here.
let calendarsAnswer: (request: Request) => Response = () => new Response("", { status: 404 });
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["database", "members", "notifications", "mail"], mail: {}, schedules: [{ name: "reminders", cron: "5 * * * *" }, { name: "cleanup", cron: "40 3 * * *" }, { name: "calendars", cron: "*/15 * * * *" }], network: { "calendar.google.com": request => calendarsAnswer(request) } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the hourly run emails tomorrow's guests once, in the language they booked in, with their link", async () => {
  const { sql } = database;
  const host = await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  await b.saveWeekly(sql, asMember(ines), Array.from({ length: 7 }, () => [[0, 1440]]));
  const [type] = await b.typesOf(sql, ines.id);
  const tomorrow = new Date(Date.now() + 20 * 3600000);
  const day = tomorrow.toISOString().slice(0, 10);
  const free = await b.freeTimes(sql, { ...host, weekly: Array.from({ length: 7 }, () => [[0, 1440]]) }, type!, day, day);
  const start = free.find(s => Date.parse(s.start) > Date.now() + 4 * 3600000 && Date.parse(s.start) < Date.now() + 25 * 3600000)!.start;
  const { booking, secret } = await b.book(sql, { ...host, weekly: Array.from({ length: 7 }, () => [[0, 1440]]) }, type!, { start, name: "Alex", email: "alex@example.com", note: "", zone: "Europe/Paris", language: "fr" });
  await sql`update bookings set created_at = now() - interval '7 days' where id = ${booking.id}`;
  assert.equal(await chest.run("reminders", POST), 204);
  assert.equal(await chest.run("reminders", POST), 204);
  const sent = chest.outbox.filter(m => m.to.includes("alex@example.com"));
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.subject, /^Demain\u202f: Meeting avec Inès Moreau/u);
  assert.ok(sent[0]!.text.includes(`/b/${secret}`));
});

test("the nightly run is accepted, and a run not signed by the Chest is refused", async () => {
  assert.equal(await chest.run("cleanup", POST), 204);
  const response = await POST(new Request("http://tool.test/chest-jobs/cleanup", { method: "POST" }));
  assert.equal(response.status, 401);
});

test("every 15 minutes the hosts' other calendars are read again; one that cannot be read keeps its error", async () => {
  const { sql } = database;
  await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  // An address of a declared host that answers 404 through the Chest's
  // egress: the run still succeeds, the calendar says why.
  await sql`insert into calendars (member_id, url, provider, tried_at) values (${ines.id}, 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics', 'calendar.google.com', now() - interval '1 hour')`;
  calendarsAnswer = () => new Response("", { status: 404 });
  assert.equal(await chest.run("calendars", POST), 204);
  const [row] = await sql<{ error: string | null }[]>`select error from calendars`;
  assert.equal(row!.error, "not_found");
  // The calendar answers again: the next run reads it through the same
  // plain fetch, keeps its busy times, and the error goes.
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10).replaceAll("-", "");
  calendarsAnswer = () => new Response(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", "BEGIN:VEVENT", `DTSTART:${soon}T090000Z`, `DTEND:${soon}T100000Z`, "UID:a@google.com", "SUMMARY:Dentist", "END:VEVENT", "END:VCALENDAR"].join("\r\n"), { headers: { "content-type": "text/calendar" } });
  await sql`update calendars set tried_at = now() - interval '1 hour'`;
  assert.equal(await chest.run("calendars", POST), 204);
  const [again] = await sql<{ error: string | null; events: number }[]>`select error, events from calendars`;
  assert.equal(again!.error, null);
  assert.equal(again!.events, 1);
  assert.equal((await sql`select 1 from busy where member_id = ${ines.id}`).length, 1);
  assert.deepEqual(chest.egress.map(e => e.status), [404, 200]);
});
