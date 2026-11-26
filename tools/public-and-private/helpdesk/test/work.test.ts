import assert from "node:assert/strict";
import { crc32 as zlibCrc, inflateRawSync } from "node:zlib";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import { exportZip } from "../src/lib/export.ts";
import { zipStream } from "../src/lib/zip.ts";
import { defaultHours } from "../src/shared/hours.ts";
import { catalogue } from "../src/i18n/index.ts";
import { erase, leave } from "../src/lib/lifecycle.ts";
import { report } from "../src/lib/reports.ts";
import * as rules from "../src/lib/rules.ts";
import * as tickets from "../src/lib/tickets.ts";
import * as views from "../src/lib/views.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";

// The work of a team: merging, several tickets at once, saved views, rules
// on arrival, the form's settings, the customer's opinion, reports, export.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
let n = 0;
const open = (extra: Partial<tickets.PublicInput> = {}) => tickets.fromForm(database.sql, { name: "Ana", email: `ana${++n}@example.com`, subject: `Question ${n}`, message: "Hello", language: "en", ...extra });
const answers = async (id: string) => [camille.id, ines.id, hugo.id].includes(id);

test("merging: the same customer's two requests become one, in time order; its link leads there; Undo splits them again", async () => {
  const { sql } = database;
  const a = await open({ email: "twice@example.com", subject: "Parcel" });
  await tickets.reply(sql, asMember(hugo), a.number, "It left today.");
  const b = await open({ email: "Twice@example.com", subject: "Parcel again", message: "Still nothing" });
  await tickets.addTag(sql, asMember(hugo), b.number, "Delivery");
  await tickets.setPriority(sql, asMember(hugo), b.number, "high");
  const other = await open();
  await assert.rejects(tickets.merge(sql, asMember(lea), b.number, a.number), refused("forbidden"));
  await assert.rejects(tickets.merge(sql, asMember(hugo), b.number, b.number), refused("merge_same"));
  await assert.rejects(tickets.merge(sql, asMember(hugo), other.number, a.number), refused("merge_other_customer"));
  const done = await tickets.merge(sql, asMember(hugo), b.number, a.number);
  assert.equal(done.status, "open");
  const into = await tickets.ticket(sql, asMember(hugo), a.number);
  assert.deepEqual(into.messages.map(m => m.kind), ["customer", "reply", "customer", "event"]);
  assert.equal(into.messages.at(-1)!.body, `merged:${b.number}:waiting`);
  assert.deepEqual([into.status, into.priority, into.tags.map(t => t.name)], ["open", "high", ["Delivery"]]);
  assert.ok(into.waitingSince, "the customer waits again");
  const from = await tickets.ticket(sql, asMember(hugo), b.number);
  assert.deepEqual([from.status, from.mergedInto, from.messages.length], ["closed", a.number, 0]);
  await assert.rejects(tickets.reply(sql, asMember(hugo), b.number, "x"), refused("merged"));
  // Its link shows the whole conversation, never the event.
  const seen = (await tickets.byLink(sql, b.secret))!;
  assert.equal(seen.number, a.number);
  assert.deepEqual(seen.messages.map(m => m.kind), ["customer", "reply", "customer"]);
  assert.ok(!(await tickets.listTickets(sql, asMember(hugo), "open")).some(r => r.number === b.number));
  await tickets.unmerge(sql, asMember(hugo), b.number, done.status);
  const back = await tickets.ticket(sql, asMember(hugo), b.number);
  assert.deepEqual([back.status, back.mergedInto, back.messages.map(m => m.body)], ["open", null, ["Still nothing"]]);
  assert.deepEqual((await tickets.ticket(sql, asMember(hugo), a.number)).messages.map(m => m.kind), ["customer", "reply"]);
  assert.equal((await tickets.ticket(sql, asMember(hugo), a.number)).status, "waiting");
});

test("several at once: close, give, tag, prioritise — each with Undo; viewers cannot; 100 at most", async () => {
  const { sql } = database;
  const list = [await open(), await open(), await open()];
  const numbers = list.map(t => t.number);
  await tickets.addTag(sql, asMember(hugo), numbers[0], "Thanks");
  await assert.rejects(tickets.bulk(sql, asMember(lea), numbers, { kind: "status", status: "closed" }, answers), refused("forbidden"));
  await assert.rejects(tickets.bulk(sql, asMember(hugo), Array.from({ length: 101 }, (_, i) => i + 1), { kind: "status", status: "closed" }, answers), refused("invalid"));
  await assert.rejects(tickets.bulk(sql, asMember(hugo), numbers, { kind: "assign", assignee: lea.id }, answers), refused("invalid"));
  const closed = await tickets.bulk(sql, asMember(hugo), numbers, { kind: "status", status: "closed" }, answers);
  assert.equal(closed.before.length, 3);
  for (const number of numbers) assert.equal((await tickets.ticket(sql, asMember(hugo), number)).status, "closed");
  await tickets.unbulk(sql, asMember(hugo), closed.before);
  for (const number of numbers) assert.equal((await tickets.ticket(sql, asMember(hugo), number)).status, "open");
  const given = await tickets.bulk(sql, asMember(hugo), numbers, { kind: "assign", assignee: ines.id }, answers);
  assert.ok((await tickets.listTickets(sql, asMember(ines), "mine")).filter(r => numbers.includes(r.number)).length === 3);
  await tickets.unbulk(sql, asMember(hugo), given.before);
  assert.equal((await tickets.ticket(sql, asMember(hugo), numbers[1])).assignee, null);
  const tagged = await tickets.bulk(sql, asMember(hugo), numbers, { kind: "tag", name: "thanks" }, answers);
  for (const number of numbers) assert.deepEqual((await tickets.ticket(sql, asMember(hugo), number)).tags.map(t => t.name), ["Thanks"]);
  await tickets.unbulk(sql, asMember(hugo), tagged.before, tagged.tag!.id);
  assert.deepEqual((await tickets.ticket(sql, asMember(hugo), numbers[0])).tags.map(t => t.name), ["Thanks"], "it had it before");
  assert.deepEqual((await tickets.ticket(sql, asMember(hugo), numbers[2])).tags, []);
  await tickets.bulk(sql, asMember(hugo), numbers, { kind: "priority", priority: "urgent" }, answers);
  assert.equal((await tickets.listTickets(sql, asMember(hugo), "open"))[0]!.priority, "urgent", "the most urgent first by default");
});

test("saved views: those who answer save what the inbox shows; its maker or an admin removes it", async () => {
  const { sql } = database;
  await assert.rejects(views.saveView(sql, asMember(lea), "Mine", { folder: "open" }), refused("forbidden"));
  await assert.rejects(views.saveView(sql, asMember(hugo), "Nothing", {}), refused("invalid"));
  const v = await views.saveView(sql, asMember(hugo), "Urgent deliveries", { folder: "open", priority: "urgent", tag: "3", sort: "recent", junk: "x", q: " lamp " });
  assert.deepEqual(v.params, { folder: "open", q: "lamp", priority: "urgent", tag: "3", sort: "recent" });
  assert.equal(views.viewHref(v.params), "/chest?folder=open&q=lamp&priority=urgent&tag=3&sort=recent");
  assert.deepEqual((await views.listViews(sql, asMember(lea))).map(x => x.name), ["Urgent deliveries"]);
  await assert.rejects(views.removeView(sql, asMember(ines), v.id), refused("forbidden"));
  assert.equal((await views.removeView(sql, asMember(camille), v.id)).name, "Urgent deliveries");
  const mine = await views.saveView(sql, asMember(hugo), "Mine", { folder: "mine", sort: "recent" });
  await erase(sql, hugo.id);
  assert.equal((await views.listViews(sql, asMember(lea))).find(x => x.id === mine.id)?.createdBy, "erased");
});

test("rules on arrival: an admin writes them; a new request gets its tag, priority and person; a member who leaves drops out", async () => {
  const { sql } = database;
  await assert.rejects(rules.saveRule(sql, asMember(hugo), { field: "text", value: "invoice", tag: "Invoice" }, answers), refused("forbidden"));
  await assert.rejects(rules.saveRule(sql, asMember(camille), { field: "text", value: "invoice" }, answers), refused("rule_empty"));
  await assert.rejects(rules.saveRule(sql, asMember(camille), { field: "from", value: "not a domain", tag: "x" }, answers), refused("invalid_rule"));
  await assert.rejects(rules.saveRule(sql, asMember(camille), { field: "text", value: "x", assignee: lea.id }, answers), refused("invalid"));
  await rules.saveRule(sql, asMember(camille), { field: "text", value: "facture", tag: "Invoice", assignee: ines.id }, answers);
  const vip = await rules.saveRule(sql, asMember(camille), { field: "from", value: "@BigCo.fr", priority: "urgent" }, answers);
  assert.equal(vip.value, "bigco.fr");
  const t = await open({ email: "boss@bigco.fr", subject: "Facture de septembre" });
  assert.equal(t.assignee, ines.id);
  const seen = await tickets.ticket(sql, asMember(lea), t.number);
  assert.deepEqual([seen.priority, seen.assignee, seen.tags.map(g => g.name)], ["urgent", ines.id, ["Invoice"]]);
  const plain = await tickets.ticket(sql, asMember(lea), (await open()).number);
  assert.deepEqual([plain.priority, plain.assignee, plain.tags], ["normal", null, []]);
  await leave(sql, ines.id);
  const left = await rules.listRules(sql, asMember(lea));
  assert.deepEqual(left.map(r => [r.value, r.assignee]), [["facture", null], ["bigco.fr", null]]);
  // Deleting says what the rule was; Undo puts it back in its place (rules
  // run in order), once.
  const gone = await rules.removeRule(sql, asMember(camille), left[0]!.id);
  assert.deepEqual([gone.id, gone.value, gone.tag], [left[0]!.id, "facture", "Invoice"]);
  await assert.rejects(rules.removeRule(sql, asMember(camille), left[0]!.id), refused("not_found"));
  await assert.rejects(rules.restoreRule(sql, asMember(hugo), gone, answers), refused("forbidden"));
  const back = await rules.restoreRule(sql, asMember(camille), gone, answers);
  assert.deepEqual(back, gone);
  assert.deepEqual((await rules.listRules(sql, asMember(lea))).map(r => r.value), ["facture", "bigco.fr"], "back before the later rule");
  await assert.rejects(rules.restoreRule(sql, asMember(camille), gone, answers), refused("invalid"), "not twice");
  const added = await rules.saveRule(sql, asMember(camille), { field: "text", value: "remboursement", tag: "Refund" }, answers);
  assert.ok(Number(added.id) > Number(vip.id), "a new rule after a restored one still gets a fresh id");
  await rules.removeRule(sql, asMember(camille), vip.id);
  await rules.removeRule(sql, asMember(camille), left[0]!.id);
  await rules.removeRule(sql, asMember(camille), added.id);
  assert.deepEqual(await rules.listRules(sql, asMember(lea)), []);
});

test("settings: the form's sentence per language (falling back on English), the websites that may frame it, the help centre, the hours", async () => {
  const { sql } = database;
  await sql`insert into settings (key, value) values ('intro', '"Old sentence"') on conflict (key) do update set value = excluded.value`;
  assert.equal(tickets.introFor(await tickets.settings(sql), "fr"), "Old sentence", "version 0.2's sentence is the English one");
  await tickets.saveSettings(sql, asMember(camille), { intros: { en: "Write to us.", fr: "" } });
  assert.equal(tickets.introFor(await tickets.settings(sql), "fr"), "Write to us.");
  await tickets.saveSettings(sql, asMember(camille), { intros: { fr: "Écrivez-nous." } });
  const s = await tickets.settings(sql);
  assert.deepEqual([tickets.introFor(s, "en"), tickets.introFor(s, "fr")], ["Write to us.", "Écrivez-nous."]);
  await assert.rejects(tickets.saveSettings(sql, asMember(camille), { intros: { "e-n": "x" } }), refused("invalid"));
  await tickets.saveSettings(sql, asMember(camille), { frameOrigins: "https://www.atelier-martin.fr/\nhttps://shop.atelier-martin.fr" });
  assert.deepEqual((await tickets.settings(sql)).frameOrigins, ["https://www.atelier-martin.fr", "https://shop.atelier-martin.fr"]);
  for (const bad of ["http://atelier.fr", "https://atelier.fr/contact", "*", "https://*.fr", "'self' https://evil.fr", "https://a.fr; script-src *"]) {
    await assert.rejects(tickets.saveSettings(sql, asMember(camille), { frameOrigins: bad }), refused("invalid_origin"), bad);
  }
  await assert.rejects(tickets.saveSettings(sql, asMember(hugo), { frameOrigins: "" }), refused("forbidden"));
  await tickets.saveSettings(sql, asMember(camille), { helpUrl: "https://wiki.atelier-martin.fr/aide" });
  await assert.rejects(tickets.saveSettings(sql, asMember(camille), { helpUrl: "javascript:alert(1)" }), refused("invalid_url"));
  await tickets.saveSettings(sql, asMember(camille), { hours: { on: true, days: defaultHours.days, holidays: ["2026-12-25"] } });
  assert.deepEqual((await tickets.settings(sql)).hours.holidays, ["2026-12-25"]);
  await assert.rejects(tickets.saveSettings(sql, asMember(camille), { hours: { on: true, days: [] } }), refused("invalid"));
});

test("the customer's opinion: once closed, one click, through their link only", async () => {
  const { sql } = database;
  const t = await open();
  await assert.rejects(tickets.rate(sql, t.secret, "good"), refused("not_closed"));
  await tickets.reply(sql, asMember(hugo), t.number, "Done", { close: true });
  await assert.rejects(tickets.rate(sql, t.secret, "great"), refused("invalid"));
  await assert.rejects(tickets.rate(sql, "z".repeat(32), "good"), refused("not_found"));
  assert.equal((await tickets.rate(sql, t.secret, "bad")).rating, "bad");
  await tickets.rate(sql, t.secret, "good");
  assert.equal((await tickets.ticket(sql, asMember(hugo), t.number)).rating, "good");
});

test("reports: requests and closings per week, the first answer in working hours, who answered, tags; admins only", async () => {
  const { sql } = database;
  await sql`delete from tickets`;
  // Monday 21 Sept 2026, 9:00 in Paris: a request answered at 10:30.
  const a = await open({ subject: "Monday" });
  await sql`update tickets set created_at = '2026-09-21T07:00:00Z' where number = ${a.number}`;
  await sql`update messages set created_at = '2026-09-21T07:00:00Z' where ticket_id = (select id from tickets where number = ${a.number})`;
  await tickets.addTag(sql, asMember(camille), a.number, "Delivery");
  await tickets.reply(sql, asMember(camille), a.number, "Answer", { close: true });
  await sql`update messages set created_at = '2026-09-21T08:30:00Z' where kind = 'reply' and ticket_id = (select id from tickets where number = ${a.number})`;
  await sql`update tickets set closed_at = '2026-09-21T08:30:00Z' where number = ${a.number}`;
  // Friday 25 Sept, 19:00: answered Monday 28 at 9:30 — 30 working minutes.
  const b = await open({ subject: "Friday" });
  await sql`update tickets set created_at = '2026-09-25T17:00:00Z' where number = ${b.number}`;
  await sql`update messages set created_at = '2026-09-25T17:00:00Z' where ticket_id = (select id from tickets where number = ${b.number})`;
  await tickets.reply(sql, asMember(camille), b.number, "Answer");
  await sql`update messages set created_at = '2026-09-28T07:30:00Z' where kind = 'reply' and ticket_id = (select id from tickets where number = ${b.number})`;
  await assert.rejects(report(sql, asMember(ines), { weeks: 4, hours: defaultHours, timeZone: "Europe/Paris", lateHours: 1 }), refused("forbidden"));
  const r = await report(sql, asMember(camille), { weeks: 4, hours: defaultHours, timeZone: "Europe/Paris", lateHours: 1, now: new Date("2026-09-29T10:00:00Z") });
  assert.deepEqual(r.weeks.map(w => [w.start, w.created, w.closed, w.medianFirst]), [["2026-09-07", 0, 0, null], ["2026-09-14", 0, 0, null], ["2026-09-21", 2, 1, 60], ["2026-09-28", 0, 0, null]]);
  assert.deepEqual([r.total.created, r.total.closed, r.total.open, r.total.medianFirst, r.total.withinTarget], [2, 1, 1, 60, 50]);
  assert.deepEqual(r.agents.map(x => [x.id, x.closed, x.medianFirst]), [[camille.id, 1, 60]]);
  assert.deepEqual(r.tags, [{ name: "Delivery", created: 1, open: 0 }]);
});

// Reads a ZIP the way an unzip tool does: the central directory, then each
// entry's deflated data, checked against its CRC and size.
function unzip(data: Buffer): Map<string, string> {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "a ZIP");
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    assert.equal(data.readUInt32LE(at), 0x02014b50);
    const [method, crc, packed, size, nameLength, local] = [data.readUInt16LE(at + 10), data.readUInt32LE(at + 16), data.readUInt32LE(at + 20), data.readUInt32LE(at + 24), data.readUInt16LE(at + 28), data.readUInt32LE(at + 42)];
    const name = data.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    assert.equal(data.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    assert.equal(method, 8, "deflated");
    const bytes = inflateRawSync(data.subarray(start, start + packed));
    assert.equal(bytes.length, size, name);
    assert.equal(zlibCrc(bytes), crc, name);
    assert.equal(data.readUInt32LE(start + packed), 0x08074b50, "a data descriptor");
    out.set(name, bytes.toString("utf8"));
    at += 46 + nameLength + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32);
  }
  return out;
}

test("export: every ticket and every message — notes too — in a ZIP of two spreadsheets and a JSON file", async () => {
  const { sql } = database;
  const t = await open({ subject: "Export me", message: "=HYPERLINK(\"x\")" });
  await tickets.note(sql, asMember(hugo), t.number, "Inside only");
  await tickets.reply(sql, asMember(hugo), t.number, "Hello, line one\nline two");
  await assert.rejects(exportZip(sql, asMember(lea), catalogue("en"), "en"), refused("forbidden"));
  const parts: Uint8Array[] = [];
  for await (const part of await exportZip(sql, asMember(hugo), catalogue("fr"), "fr")) parts.push(part);
  const files = unzip(Buffer.concat(parts));
  assert.deepEqual([...files.keys()], ["tickets.csv", "messages.csv", "tickets.json"]);
  const text = files.get("messages.csv")!;
  assert.ok(text.startsWith("\ufeffNuméro,Objet,Date,Type,De,Message,Fichiers\r\n"), "French headers, once");
  assert.equal(files.get("tickets.csv")!.split("\ufeff").length, 2, "one byte-order mark");
  assert.ok(text.includes("Note interne") && text.includes("Inside only") && text.includes("Hugo Bernard"), "notes and authors");
  assert.ok(text.includes("\"'=HYPERLINK(\"\"x\"\")\""), "formulas neutralised");
  assert.match(text, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/u, "local dates");
  const json = JSON.parse(files.get("tickets.json")!) as { tickets: { subject: string; messages: { kind: string; body: string }[] }[] };
  const mine = json.tickets.find(x => x.subject === "Export me")!;
  assert.deepEqual(mine.messages.map(m => m.kind), ["customer", "note", "reply"]);
  await assert.rejects(exportZip(sql, asMember(nora), catalogue("en"), "en"), refused("forbidden"));
});

test("the ZIP is written as it goes: empty files, many pieces, and an error stops it instead of ending a short archive", async () => {
  const many = function* () {
    for (let i = 0; i < 2000; i++) yield `line ${i}, ${"é".repeat(i % 50)}\n`;
  };
  const parts: Uint8Array[] = [];
  for await (const part of zipStream([{ name: "empty.txt", text: [] }, { name: "many.txt", text: many() }], new Date("2026-10-06T10:00:00Z"))) parts.push(part);
  const files = unzip(Buffer.concat(parts));
  assert.equal(files.get("empty.txt"), "");
  assert.equal(files.get("many.txt"), [...many()].join(""));
  const failing = async function* () {
    yield "first rows\n";
    throw new Error("the database went away");
  };
  await assert.rejects(async () => {
    for await (const part of zipStream([{ name: "x.csv", text: failing() }])) parts.push(part);
  }, /the database went away/u);
});

test("a website allowed in Settings may frame the form on the very next request: read from the database, never kept", async () => {
  const { sql } = database;
  const proxied = await import("../src/lib/frame.ts");
  await tickets.saveSettings(sql, asMember(camille), { frameOrigins: "https://www.atelier-martin.fr" });
  assert.deepEqual(await proxied.frameOrigins(), ["https://www.atelier-martin.fr"]);
  await tickets.saveSettings(sql, asMember(camille), { frameOrigins: "https://www.atelier-martin.fr\nhttps://shop.atelier-martin.fr" });
  assert.deepEqual(await proxied.frameOrigins(), ["https://www.atelier-martin.fr", "https://shop.atelier-martin.fr"]);
  await tickets.saveSettings(sql, asMember(camille), { frameOrigins: "" });
  assert.deepEqual(await proxied.frameOrigins(), []);
});
