import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import * as files from "@argentic/chest-sdk/files";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import * as attachments from "../src/lib/attachments.ts";
import { issue } from "../src/lib/form-token.ts";
import * as mailer from "../src/lib/mailer.ts";
import { checkFile, fileName } from "../src/lib/model.ts";
import * as tickets from "../src/lib/tickets.ts";
import { publicFile as fileOf } from "../src/lib/downloads.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, lea } from "./support/members.ts";

// Files on messages: a visitor's (public uploads, claimed once), a
// member's (private uploads), what each may open.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "files", "notifications", "mail"], mail: { domain: "atelier.test", mailboxes: ["support"] }, storage: { publicUploads: true } });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => chest.outbox.splice(0));

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const pdf = "%PDF-1.7\nhello";
let visitors = 0;
const visitor = () => `198.51.100.${++visitors}`;
const shown = () => issue(Date.now() - 10000);

// What a visitor's browser does: ask, send, keep the claim.
async function visitorSends(where: { started?: string; secret?: string }, data: Uint8Array | string, type: string, from = visitor()): Promise<string> {
  const up = await attachments.visitorGrant(database.sql, where, from, type, typeof data === "string" ? data.length : data.length);
  const sent = await chest.upload(up.url, data, type);
  assert.equal(sent.status, 201);
  const answer = (await sent.json()) as { claim?: string; name?: string };
  assert.equal(answer.name, undefined, "a visitor never learns the object's name");
  return answer.claim!;
}
const visitorFiles = (list: unknown): tickets.Files => ({ take: () => attachments.take("public", list), drop: attachments.remove });
const memberFiles = (list: unknown): tickets.Files => ({ take: () => attachments.take("team", list), drop: attachments.remove });
const form = (email: string) => ({ name: "Jean", email, subject: "Broken lamp", message: "See the photo.", language: "en" });
const objects = () => [...chest.files.keys()];

test("a visitor adds files to the form: kept on the ticket, the team sees them, their link opens them", async () => {
  const { sql } = database;
  const started = shown();
  const photo = await visitorSends({ started }, png, "image/png");
  const invoice = await visitorSends({ started }, pdf, "application/pdf");
  const t = await tickets.fromForm(sql, form("jean@example.com"), visitorFiles(JSON.stringify([{ ref: photo, name: "lamp.png" }, { ref: invoice, name: "../../invoice.pdf" }])));
  assert.equal(t.files, 2);
  const seen = await tickets.ticket(sql, asMember(lea), t.number);
  const kept = seen.messages[0]!.attachments;
  assert.deepEqual(kept.map(a => [a.fileName, a.type, a.size]), [["lamp.png", "image/png", png.length], ["_.._invoice.pdf", "application/pdf", pdf.length]]);
  assert.ok(!objects().some(o => o.startsWith("uploads/public/")), "moved out of the uploads");
  // The customer's link opens their own files, as downloads.
  const answer = await fileOf(t.secret, kept[0]!.id);
  assert.equal(answer.status, 200);
  assert.deepEqual(new Uint8Array(await answer.arrayBuffer()), png);
  assert.match(answer.headers.get("content-disposition")!, /^attachment; filename="lamp\.png"/u);
  assert.equal(answer.headers.get("x-content-type-options"), "nosniff");
  assert.match(answer.headers.get("content-security-policy")!, /sandbox/u);
  // The claim served once.
  await assert.rejects(tickets.fromForm(sql, form("again@example.com"), visitorFiles([{ ref: photo, name: "x.png" }])), refused("file_missing"));
});

test("a visitor can never reach another's file: not by claim, not by name, not by link", async () => {
  const { sql } = database;
  const mine = await tickets.fromForm(sql, form("anna@example.com"));
  const theirs = await tickets.fromForm(sql, form("bob@example.com"), visitorFiles([{ ref: await visitorSends({ started: shown() }, png, "image/png"), name: "bob.png" }]));
  const bobFile = (await tickets.ticket(sql, asMember(lea), theirs.number)).messages[0]!.attachments[0]!;
  // Bob's file through Anna's link: nothing.
  const through = await fileOf(mine.secret, bobFile.id);
  assert.equal(through.status, 404);
  assert.equal(await tickets.linkFile(sql, "x".repeat(32), bobFile.id), null);
  assert.equal(await tickets.linkFile(sql, mine.secret, "abc"), null);
  // Naming an object the tool holds, a member's upload, or a forged claim.
  const count = (await sql<{ n: number }[]>`select count(*)::int as n from attachments`)[0]!.n;
  const held = (await sql<{ object: string }[]>`select object from attachments where id = ${bobFile.id}`)[0]!.object;
  for (const ref of [held, "uploads/team/0123456789abcdef0123.png", "A".repeat(32) + ".claim", ""]) {
    await assert.rejects(tickets.customerReply(sql, mine.secret, "Mine now", visitorFiles([{ ref, name: "x.png" }])), (e: unknown) => e instanceof AppError && ["file_missing", "invalid"].includes(e.code), ref);
  }
  assert.equal((await sql<{ n: number }[]>`select count(*)::int as n from attachments`)[0]!.n, count);
  // Uploading for a request needs its link; for the form, a form shown.
  await assert.rejects(attachments.visitorGrant(sql, { secret: "y".repeat(32) }, visitor(), "image/png", 10), refused("not_found"));
  await assert.rejects(attachments.visitorGrant(sql, { started: "123.abc" }, visitor(), "image/png", 10), refused("invalid"));
  await assert.rejects(attachments.visitorGrant(sql, {}, visitor(), "image/png", 10), refused("invalid"));
  // With their own link, a file goes on their own request only.
  const own = await visitorSends({ secret: mine.secret }, pdf, "application/pdf");
  await tickets.customerReply(sql, mine.secret, "Here is the receipt", visitorFiles([{ ref: own, name: "receipt.pdf" }]));
  const annaThread = (await tickets.byLink(sql, mine.secret))!.messages;
  assert.deepEqual(annaThread.flatMap(m => m.attachments.map(a => a.fileName)), ["receipt.pdf"]);
  assert.deepEqual((await tickets.byLink(sql, theirs.secret))!.messages.flatMap(m => m.attachments.map(a => a.fileName)), ["bob.png"]);
});

test("limits: types, size, five files a message, a few uploads an hour; a refused message keeps its claims", async () => {
  const { sql } = database;
  assert.equal(checkFile("image/png", 10), null);
  assert.equal(checkFile("text/html", 10), "file_type");
  assert.equal(checkFile("application/x-msdownload", 10), "file_type");
  assert.equal(checkFile("image/png", 0), "file_type");
  assert.equal(checkFile("image/png", (10 << 20) + 1), "file_too_large");
  assert.equal(fileName("a/b\\c.txt"), "a_b_c.txt");
  assert.equal(fileName(""), "file");
  await assert.rejects(attachments.visitorGrant(sql, { started: shown() }, visitor(), "text/html", 100), refused("file_type"));
  await assert.rejects(attachments.visitorGrant(sql, { started: shown() }, visitor(), "image/svg+xml", 100), refused("file_type"));
  await assert.rejects(attachments.visitorGrant(sql, { started: shown() }, visitor(), "image/png", 11 << 20), refused("file_too_large"));
  // The Chest holds the upload to what was granted: a bigger file, another type.
  const up = await attachments.visitorGrant(sql, { started: shown() }, visitor(), "image/png", 10);
  assert.equal((await chest.upload(up.url, new Uint8Array((10 << 20) + 1), "image/png")).status, 413);
  const up2 = await attachments.visitorGrant(sql, { started: shown() }, visitor(), "image/png", 10);
  assert.equal((await chest.upload(up2.url, "<script>", "text/html")).status, 415);
  // Six files: the message is refused, before any claim is spent.
  const from = visitor();
  const claims: string[] = [];
  for (let i = 0; i < 6; i++) claims.push(await visitorSends({ started: shown() }, png, "image/png", from));
  const six = claims.map((ref, i) => ({ ref, name: `p${i}.png` }));
  await assert.rejects(tickets.fromForm(sql, form("six@example.com"), visitorFiles(six)), refused("too_many_files"));
  // A message refused for its words spends no claim: sent again, it works.
  await assert.rejects(tickets.fromForm(sql, { ...form("not-an-email"), email: "nope" }, visitorFiles(six.slice(0, 5))), refused("invalid_email"));
  const ok = await tickets.fromForm(sql, form("five@example.com"), visitorFiles(six.slice(0, 5)));
  assert.equal(ok.files, 5);
  // Twenty uploads an hour from one visitor, then no more.
  for (let i = 0; i < 14; i++) await attachments.visitorGrant(sql, { started: shown() }, from, "image/png", 10);
  await assert.rejects(attachments.visitorGrant(sql, { started: shown() }, from, "image/png", 10), refused("too_many"));
  // A closed form takes no file.
  await tickets.saveSettings(sql, asMember(camille), { formOpen: false });
  await assert.rejects(attachments.visitorGrant(sql, { started: shown() }, visitor(), "image/png", 10), refused("closed_form"));
  await tickets.saveSettings(sql, asMember(camille), { formOpen: true });
});

test("an upload nobody claims is deleted by the Chest after a day", async () => {
  const claim = await visitorSends({ started: shown() }, png, "image/png");
  const before = objects().filter(o => o.startsWith("uploads/public/")).length;
  assert.ok(before >= 1);
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 86400 * 1000 + 5000 });
  try {
    await assert.rejects(attachments.take("public", [{ ref: claim, name: "late.png" }]), refused("file_missing"));
    assert.equal(objects().filter(o => o.startsWith("uploads/public/")).length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("a member adds files to a reply (emailed with it) or a note (never on the customer's page)", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form("claire@example.com"));
  await assert.rejects(attachments.memberGrant(asMember(lea), "application/pdf", 10), refused("forbidden"));
  const send = async (data: Uint8Array | string, type: string) => {
    const up = await attachments.memberGrant(asMember(hugo), type, typeof data === "string" ? data.length : data.length);
    const sent = await chest.upload(up.url, data, type);
    assert.equal(sent.status, 201);
    return ((await sent.json()) as { name: string }).name;
  };
  const guide = await send(pdf, "application/pdf");
  assert.match(guide, /^uploads\/team\//u);
  const done = await tickets.reply(sql, asMember(hugo), t.number, "The assembly guide is attached.", {}, memberFiles([{ ref: guide, name: "guide.pdf" }]));
  assert.deepEqual(done.files.map(f => f.fileName), ["guide.pdf"]);
  const sent = await mailer.answer(done.ticket, "The assembly guide is attached.", asMember(hugo), "Atelier", done.threading, done.messageId, done.files);
  assert.equal(sent.delivery, "email");
  assert.deepEqual(chest.outbox.at(-1)!.attachments.map(a => [a.name, a.type]), [["guide.pdf", "application/pdf"]]);
  // The same upload cannot go on a second message.
  await assert.rejects(tickets.note(sql, asMember(hugo), t.number, "Again", memberFiles([{ ref: guide, name: "guide.pdf" }])), refused("file_missing"));
  const internal = await send(png, "image/png");
  await tickets.note(sql, asMember(hugo), t.number, "Photo from the warehouse", memberFiles([{ ref: internal, name: "shelf.png" }]));
  const team = await tickets.ticket(sql, asMember(lea), t.number);
  const noteFile = team.messages.find(m => m.kind === "note")!.attachments[0]!;
  const replyFile = team.messages.find(m => m.kind === "reply")!.attachments[0]!;
  const customer = (await tickets.byLink(sql, t.secret))!;
  assert.deepEqual(customer.messages.flatMap(m => m.attachments.map(a => a.fileName)), ["guide.pdf"]);
  assert.equal((await fileOf(t.secret, noteFile.id)).status, 404);
  assert.equal((await fileOf(t.secret, replyFile.id)).status, 200);
  // A file of a type not allowed, put there some other way, is refused and deleted.
  await files.put("uploads/team/aaaaaaaaaaaaaaaaaaaa.html", "<script>", "text/html");
  await assert.rejects(tickets.note(sql, asMember(hugo), t.number, "x", memberFiles([{ ref: "uploads/team/aaaaaaaaaaaaaaaaaaaa.html", name: "x.html" }])), refused("file_type"));
  assert.ok(!chest.files.has("uploads/team/aaaaaaaaaaaaaaaaaaaa.html"));
  // A member's upload never added to a message goes after a day.
  const forgotten = await send(png, "image/png");
  assert.equal(await attachments.sweep(new Date()), 0);
  assert.ok(await attachments.sweep(new Date(Date.now() + 2 * 86400000)) >= 1);
  assert.ok(!chest.files.has(forgotten));
});

test("a customer's erasure and the retention take their files with them", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, form("erase.files@example.com"), visitorFiles([{ ref: await visitorSends({ started: shown() }, png, "image/png"), name: "me.png" }]));
  const object = (await sql<{ object: string }[]>`select a.object from attachments a join messages m on m.id = a.message_id join tickets t on t.id = m.ticket_id where t.number = ${t.number}`)[0]!.object;
  const gone = await tickets.eraseCustomer(sql, asMember(camille), "erase.files@example.com");
  assert.deepEqual(gone.objects, [object]);
  await attachments.remove(gone.objects);
  assert.ok(!chest.files.has(object));
});
