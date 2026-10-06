import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestEvents as POST } from "../src/lib/deliveries.ts";
import { AppError } from "../src/lib/app-error.ts";
import * as attachments from "../src/lib/attachments.ts";
import * as tell from "../src/lib/tell.ts";
import * as tickets from "../src/lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea, nora } from "./support/members.ts";

// My requests: any member who reaches Support — Nora has no role, like most
// colleagues who send an IT request with a team form of Forms — reads and
// answers the tickets they asked, and nothing else: never another person's
// ticket, never a note, never a file that is not on their own request.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] }, chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en" } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => chest.notifications.splice(0));

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
let n = 0;
const next = () => String(++n).padStart(8, "0");
// A team form's answer from a colleague (Forms' "forms.request", version 1).
async function asks(member: string, subject: string): Promise<number> {
  const status = await chest.deliver({ type: "forms.request", data: {
    v: 1, form: { id: "9", title: "IT request" }, answer: { id: "itreq" + next(), at: "2026-09-29T10:00:00.000Z", language: "en", path: null },
    subject, details: "My screen stays black.", requester: { name: null, email: null, member }, fields: [],
  } }, POST);
  assert.equal(status, 204);
  return (await database.sql<{ number: number }[]>`select number from tickets order by id desc limit 1`)[0]!.number;
}
const memberFiles = (list: unknown): tickets.Files => ({ take: () => attachments.take("team", list), drop: attachments.remove });

test("a colleague without a role reads their own requests, and no one else's", async () => {
  const { sql } = database;
  const mine = await asks(nora.id, "Black screen");
  const leas = await asks(lea.id, "New keyboard");
  const customer = await tickets.fromForm(sql, { name: "Jean", email: "jean@example.com", subject: "Broken lamp", message: "It flickers.", language: "en" });
  const list = await tickets.myRequests(sql, asMember(nora));
  assert.deepEqual(list.map(r => r.number), [mine], "only Nora's");
  assert.deepEqual((await tickets.myRequests(sql, asMember(lea))).map(r => r.number), [leas]);
  // Hugo answers tickets but asked nothing: My requests is empty for him.
  assert.deepEqual(await tickets.myRequests(sql, asMember(hugo)), []);
  // Another person's ticket, a customer's, one that does not exist: all "not found".
  for (const number of [leas, customer.number, 999999]) await assert.rejects(tickets.myRequest(sql, asMember(nora), number), refused("not_found"));
  await assert.rejects(tickets.myRequest(sql, asMember(nora), "1; drop table tickets"), (e: unknown) => e instanceof AppError);
  await assert.rejects(tickets.myRequests(sql, null), refused("forbidden"));
  // The team's view stays closed to her: no role, no inbox, no ticket.
  await assert.rejects(tickets.ticket(sql, asMember(nora), mine), refused("forbidden"));
  await assert.rejects(tickets.listTickets(sql, asMember(nora), "open"), refused("forbidden"));
});

test("she reads the answers (never the notes), writes again, rates; the team hears of it", async () => {
  const { sql } = database;
  const number = await asks(nora.id, "Printer jammed");
  await tickets.note(sql, asMember(ines), number, "Internal: the printer is under warranty.");
  const done = await tickets.reply(sql, asMember(ines), number, "Nora, the technician comes tomorrow morning.");
  await tell.colleagueAnswered(done.ticket, asMember(ines));
  // The bell opens her own view of it, not the team's ticket page.
  const bell = chest.notifications.find(x => x.member === nora.id)!;
  assert.equal(bell.path, `/chest/mine/${number}`);
  assert.equal(bell.title, `Inès Moreau answered your request ${number}`);
  const seen = await tickets.myRequest(sql, asMember(nora), number);
  assert.deepEqual(seen.messages.map(m => m.kind), ["customer", "reply"], "no note");
  assert.equal(seen.messages[1]!.body, "Nora, the technician comes tomorrow morning.");
  assert.equal(seen.status, "waiting");
  assert.equal((await tickets.myRequests(sql, asMember(nora))).find(r => r.number === number)!.status, "waiting");
  // She writes again: the ticket goes back to the team, its agent is told by her name.
  const again = await tickets.writeMine(sql, asMember(nora), number, "Thank you, I will be in from 9.");
  await tell.customerWrote(again, "Thank you, I will be in from 9.");
  assert.equal((await tickets.ticket(sql, asMember(ines), number)).status, "open");
  assert.equal(chest.notifications.find(x => x.member === ines.id && x.key?.endsWith(":reply"))!.title, `Nora Petit a écrit à nouveau sur la ${number}`);
  const team = await tickets.ticket(sql, asMember(ines), number);
  assert.equal(team.messages.at(-1)!.kind, "customer");
  assert.equal(team.messages.at(-1)!.author, null, "her own words, not typed by someone");
  // Nobody writes on someone else's request, or an empty message.
  await assert.rejects(tickets.writeMine(sql, asMember(lea), number, "Hello"), refused("not_found"));
  await assert.rejects(tickets.writeMine(sql, asMember(nora), number, "   "), (e: unknown) => e instanceof AppError);
  // Rated once closed, by her only.
  await assert.rejects(tickets.rateMine(sql, asMember(nora), number, "good"), refused("not_closed"));
  await tickets.setStatus(sql, asMember(ines), number, "closed");
  await assert.rejects(tickets.rateMine(sql, asMember(lea), number, "good"), refused("not_found"));
  await assert.rejects(tickets.rateMine(sql, asMember(nora), number, "great"), refused("invalid"));
  assert.equal((await tickets.rateMine(sql, asMember(nora), number, "good")).rating, "good");
  // Writing on a closed request reopens it.
  await tickets.writeMine(sql, asMember(nora), number, "It jammed again.");
  assert.equal((await tickets.myRequest(sql, asMember(nora), number)).status, "open");
});

test("files: hers and the answers', never a note's or another request's; uploads only for her own request", async () => {
  const { sql } = database;
  const number = await asks(nora.id, "Laptop sticker");
  const other = await asks(lea.id, "Mouse");
  const pdf = "%PDF-1.7\nhello";
  await assert.rejects(attachments.requesterGrant(sql, asMember(nora), other, "application/pdf", pdf.length), refused("not_found"));
  const up = await attachments.requesterGrant(sql, asMember(nora), number, "application/pdf", pdf.length);
  const sent = await chest.upload(up.url, pdf, "application/pdf");
  const ref = ((await sent.json()) as { name: string }).name;
  await tickets.writeMine(sql, asMember(nora), number, "The form, signed.", memberFiles([{ ref, name: "form.pdf" }]));
  const agentUp = await attachments.memberGrant(asMember(ines), "application/pdf", pdf.length);
  const agentRef = ((await (await chest.upload(agentUp.url, pdf, "application/pdf")).json()) as { name: string }).name;
  await tickets.note(sql, asMember(ines), number, "Our copy.", memberFiles([{ ref: agentRef, name: "internal.pdf" }]));
  const [own] = await sql<{ id: string }[]>`select a.id from attachments a where a.file_name = 'form.pdf'`;
  const [internal] = await sql<{ id: string }[]>`select a.id from attachments a where a.file_name = 'internal.pdf'`;
  assert.equal((await tickets.myFile(sql, asMember(nora), number, own!.id))?.fileName, "form.pdf");
  assert.equal(await tickets.myFile(sql, asMember(nora), number, internal!.id), null, "never a note's file");
  assert.equal(await tickets.myFile(sql, asMember(lea), number, own!.id), null, "never someone else's");
  assert.equal(await tickets.myFile(sql, asMember(lea), other, own!.id), null, "never through another request");
  assert.equal(await tickets.myFile(sql, asMember(nora), number, "x"), null);
});

test("merged, spam or erased: her merged request opens the one it went into; spam and erased ones are nobody's", async () => {
  const { sql } = database;
  const first = await asks(nora.id, "VPN");
  const second = await asks(nora.id, "VPN again");
  await tickets.merge(sql, asMember(hugo), second, first);
  assert.equal((await tickets.myRequest(sql, asMember(nora), second)).number, first);
  assert.ok(!(await tickets.myRequests(sql, asMember(nora))).some(r => r.number === second), "listed once");
  const junk = await asks(nora.id, "Spam test");
  await tickets.setStatus(sql, asMember(hugo), junk, "spam");
  await assert.rejects(tickets.myRequest(sql, asMember(nora), junk), refused("not_found"));
  await sql`update tickets set requester = 'erased' where number = ${first}`;
  await assert.rejects(tickets.myRequest(sql, asMember(nora), first), refused("not_found"));
  assert.equal(await tickets.myOpenCount(sql, asMember(nora)), (await tickets.myRequests(sql, asMember(nora))).filter(r => r.status !== "closed").length);
});
