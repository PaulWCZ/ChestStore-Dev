import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST as events } from "../app/chest-events/route.ts";
import * as candidates from "../lib/candidates.ts";
import * as cv from "../lib/cv.ts";
import { catalogue, format, locales } from "../lib/i18n/index.ts";
import * as interviews from "../lib/interviews.ts";
import { jobTemplateKeys } from "../lib/jobs.ts";
import * as lifecycle from "../lib/lifecycle.ts";
import * as messages from "../lib/messages.ts";
import { sniff } from "../lib/model.ts";
import * as outbox from "../lib/outbox.ts";
import { parse } from "../lib/rich-text.ts";
import * as selfSchedule from "../lib/self-schedule.ts";
import * as share from "../lib/share.ts";
import { addDays, dayOf, instantOf } from "../lib/time.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// Round 3: the interviewers' real calendars (Booking's busy times heard,
// Hiring's told back), lunch, one history line per link, files sent to a
// candidate (and with a template), a photo as a CV, jobs to start from.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  process.env["CHEST_TOOL"] = "hiring";
  chest = await fakeChest({
    members: everyone,
    capabilities: ["members", "files", "notifications", "mail", "calendar"],
    mail: { domain: "atelier.test", mailboxes: ["jobs"] },
    calendar: { domain: "atelier.test", toolTitle: "Hiring", company: "Atelier Martin" },
    settings: { company: "Atelier Martin" },
    timeZone: "Europe/Paris",
    emits: ["hiring.hired", "hiring.hire_cancelled", "hiring.busy"],
    receivers: 1,
    storage: { publicUploads: true },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});

const zone = "Europe/Paris";
const isTeam = async (id: string) => [camille.id, hugo.id, ines.id].includes(id);
const signer = async () => ({ name: "Camille Martin", firstName: "Camille" });
function nextMonday(): string {
  let d = addDays(dayOf(new Date(), zone), 2);
  while (new Date(d + "T12:00:00Z").getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}
const tokenOf = (link: string) => link.split("/interview/")[1]!.split("?")[0]!;
const minute = (d: Date) => d.toISOString().slice(0, 16) + "Z";
let n = 0;
const someone = (slug: string) => application(slug, { email: `c${++n}@example.com`, name: `Candidate ${n}` });

// What Booking tells: Inès is taken from … to …
function bookingBusy(member: string, spans: [Date, Date][], at = new Date()) {
  const from = new Date(Math.floor(Date.now() / 86400000) * 86400000);
  return { v: 1, member, at: at.toISOString(), from: minute(from), to: minute(new Date(from.getTime() + 90 * 86400000)), spans: spans.map(([a, b]) => [minute(a), minute(b)]) };
}

test("Booking says Inès is busy: the candidate is never offered that hour, nor lunch; the recruiter sees it as Booking's", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Office manager");
  const c = (await candidates.apply(sql, someone(job.slug))).candidate;
  const monday = nextMonday();
  // Her 10:00–11:00 showroom visit on Monday, in Booking.
  const visit: [Date, Date] = [instantOf(monday, "10:00", zone), instantOf(monday, "11:00", zone)];
  assert.equal(await chest.deliver({ type: "booking.busy", source: "booking", data: bookingBusy(ines.id, [visit]) }, events), 204);
  const sent = await selfSchedule.send(sql, asMember(camille), c.id, { people: [ines.id], minutes: 60, firstDay: monday, lastDay: monday, dayStart: 540, dayEnd: 1080 }, isTeam, "https://jobs.test");
  const offer = (await selfSchedule.offer(sql, tokenOf(sent.link)))!;
  // 09:00 (ends at 10:00), then 11:00; nothing across 12:00–14:00; 14:00 on.
  assert.deepEqual(offer.days[0]!.times, ["09:00", "11:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"]);
  await assert.rejects(selfSchedule.choose(sql, tokenOf(sent.link), { day: monday, time: "10:00" }, signer), { code: "taken" });
  // The recruiter planning by hand sees it, marked as Booking's.
  const busy = await interviews.busy(sql, asMember(camille), [ines.id], monday);
  assert.deepEqual(busy.map(b => [b.start, b.end, b.source]), [[visit[0].toISOString(), visit[1].toISOString(), "booking"]]);
  // An older snapshot arriving late changes nothing; a newer one replaces it.
  await chest.deliver({ type: "booking.busy", source: "booking", data: bookingBusy(ines.id, [], new Date(Date.now() - 3600000)) }, events);
  assert.equal((await interviews.busy(sql, asMember(camille), [ines.id], monday)).length, 1);
  await chest.deliver({ type: "booking.busy", source: "booking", data: bookingBusy(ines.id, [], new Date(Date.now() + 1000)) }, events);
  assert.equal((await interviews.busy(sql, asMember(camille), [ines.id], monday)).length, 0);
  // Something that is not a snapshot is dropped, whoever sends it.
  assert.equal(await chest.deliver({ type: "booking.busy", source: "booking", data: { v: 1, member: ines.id, spans: "all day" } }, events), 204);
  // Lunch asked for: offered.
  const c2 = (await candidates.apply(sql, someone(job.slug))).candidate;
  const withLunch = await selfSchedule.send(sql, asMember(camille), c2.id, { people: [hugo.id], minutes: 60, firstDay: monday, lastDay: monday, dayStart: 660, dayEnd: 900, skipLunch: false }, isTeam, "https://jobs.test");
  assert.deepEqual((await selfSchedule.offer(sql, tokenOf(withLunch.link)))!.days[0]!.times, ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00"]);
  // Hours chosen within lunch: the recruiter meant them.
  const c3 = (await candidates.apply(sql, someone(job.slug))).candidate;
  const atLunch = await selfSchedule.send(sql, asMember(camille), c3.id, { people: [hugo.id], minutes: 30, firstDay: monday, lastDay: monday, dayStart: 720, dayEnd: 810 }, isTeam, "https://jobs.test");
  assert.deepEqual((await selfSchedule.offer(sql, tokenOf(atLunch.link)))!.days[0]!.times, ["12:00", "12:30", "13:00"]);
  // Someone who leaves: what Booking said of them is forgotten.
  await chest.deliver({ type: "booking.busy", source: "booking", data: bookingBusy(hugo.id, [visit], new Date(Date.now() + 2000)) }, events);
  await lifecycle.leave(sql, hugo.id);
  assert.equal((await sql`select 1 from told_busy where member_id = ${hugo.id}`).length, 0);
});

test("Leave says Inès is off: no time is offered on her day off, the recruiter reads « off all day », a later snapshot gives the day back", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Workshop assistant");
  const monday = nextMonday();
  const tuesday = addDays(monday, 1), wednesday = addDays(monday, 2), thursday = addDays(monday, 3);
  // Leave's snapshot (the same shape as Booking's): Inès off all Tuesday;
  // Camille off on Wednesday morning (midnight to noon in the Chest's zone).
  const offInes: [Date, Date] = [instantOf(tuesday, "00:00", zone), instantOf(wednesday, "00:00", zone)];
  assert.equal(await chest.deliver({ type: "leave.busy", source: "leave", data: bookingBusy(ines.id, [offInes], new Date(Date.now() + 10000)) }, events), 204);
  assert.equal(await chest.deliver({ type: "leave.busy", source: "leave", data: bookingBusy(camille.id, [[instantOf(wednesday, "00:00", zone), instantOf(wednesday, "12:00", zone)]], new Date(Date.now() + 10000)) }, events), 204);
  const c = (await candidates.apply(sql, someone(job.slug))).candidate;
  const sent = await selfSchedule.send(sql, asMember(camille), c.id, { people: [ines.id, camille.id], minutes: 60, firstDay: monday, lastDay: wednesday, dayStart: 540, dayEnd: 1080 }, isTeam, "https://jobs.test");
  const byDay = new Map((await selfSchedule.offer(sql, tokenOf(sent.link)))!.days.map(d => [d.day, d.times]));
  assert.ok((byDay.get(monday) ?? []).length > 0, "Monday offered");
  assert.deepEqual(byDay.get(tuesday) ?? [], [], "never a time on Inès's day off");
  assert.deepEqual(byDay.get(wednesday), ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"], "Camille's afternoon only (lunch left out)");
  await assert.rejects(selfSchedule.choose(sql, tokenOf(sent.link), { day: tuesday, time: "10:00" }, signer), { code: "taken" });
  // The recruiter choosing the time sees it as Leave's: the whole day, times only.
  const busy = await interviews.busy(sql, asMember(camille), [ines.id], tuesday);
  assert.deepEqual(busy.map(b => b.source), ["leave"]);
  assert.equal(busy[0]!.start, offInes[0].toISOString());
  const w = catalogue("en").interview;
  assert.equal(format(w.busyLineLeaveDay, { name: "Inès Moreau" }), "Inès Moreau: off all day");
  assert.ok(!catalogue("fr").interview.busyLineLeave.includes("congé"), "never the kind of leave");
  // Booking's busy times are kept apart: Leave's snapshot replaces only Leave's.
  await chest.deliver({ type: "booking.busy", source: "booking", data: bookingBusy(ines.id, [[instantOf(thursday, "10:00", zone), instantOf(thursday, "11:00", zone)]], new Date(Date.now() + 20000)) }, events);
  // Her leave cancelled: Leave tells "now free"; Tuesday is offered again, Booking's hour still is not.
  await chest.deliver({ type: "leave.busy", source: "leave", data: bookingBusy(ines.id, [], new Date(Date.now() + 30000)) }, events);
  const c2 = (await candidates.apply(sql, someone(job.slug))).candidate;
  const again = await selfSchedule.send(sql, asMember(camille), c2.id, { people: [ines.id], minutes: 60, firstDay: tuesday, lastDay: thursday, dayStart: 540, dayEnd: 720 }, isTeam, "https://jobs.test");
  const days = new Map((await selfSchedule.offer(sql, tokenOf(again.link)))!.days.map(d => [d.day, d.times]));
  assert.ok((days.get(tuesday) ?? []).includes("10:00"), "Tuesday 10:00 offered again");
  assert.ok(!(days.get(thursday) ?? []).includes("10:00"), "Booking's hour still kept");
  assert.equal((await interviews.busy(sql, asMember(camille), [ines.id], tuesday)).length, 0);
});

test("Hiring tells Booking the interviews' times, only when they change, never what Booking told it", async () => {
  const { sql } = database;
  chest.published.length = 0;
  const job = await openJob(sql, asMember(camille), "Salesperson");
  const c = (await candidates.apply(sql, someone(job.slug))).candidate;
  const monday = nextMonday();
  const tuesday = addDays(monday, 1);
  await chest.deliver({ type: "booking.busy", source: "booking", data: bookingBusy(camille.id, [[instantOf(tuesday, "16:00", zone), instantOf(tuesday, "17:00", zone)]], new Date(Date.now() + 5000)) }, events);
  const done = await interviews.schedule(sql, asMember(camille), c.id, { day: tuesday, time: "09:30", minutes: 45, people: [camille.id], tell: false }, isTeam);
  assert.equal(await share.shareBusy(sql, done.interview.people), 1);
  const told = chest.published.filter(p => p.type === "hiring.busy");
  assert.equal(told.length, 1);
  assert.deepEqual(told[0]!.data["spans"], [[minute(instantOf(tuesday, "09:30", zone)), minute(instantOf(tuesday, "10:15", zone))]]);
  assert.ok(!JSON.stringify(told[0]!.data).includes(c.name) && !JSON.stringify(told[0]!.data).includes("Salesperson"), "times only");
  assert.equal(await share.shareBusy(sql, [camille.id]), 0, "unchanged: not told again");
  // Called off: told again, empty.
  const off = await interviews.cancel(sql, asMember(camille), done.interview.id, false);
  assert.equal(await share.shareBusy(sql, off.interview.people, Date.now() + 1000), 1);
  assert.deepEqual(chest.published.filter(p => p.type === "hiring.busy").at(-1)!.data["spans"], []);
  // The outbox schedule covers the others (Inès was never on one: nothing to say).
  assert.equal(await share.shareDueBusy(sql, Date.now() + 2000), 0);
});

test("sending a link to choose a time writes one history line, and the link speaks the candidate's language", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Customer support");
  const c = (await candidates.apply(sql, someone(job.slug))).candidate;
  const monday = nextMonday();
  const sent = await selfSchedule.send(sql, asMember(camille), c.id, { people: [ines.id], minutes: 30, firstDay: monday, lastDay: addDays(monday, 4), dayStart: 540, dayEnd: 1080 }, isTeam, "https://jobs.test");
  assert.ok(sent.link.endsWith("?lang=fr"), "she applied in French");
  assert.equal(await outbox.sendNow(sql, sent.message!), "sent");
  const lines = await sql<{ kind: string }[]>`select kind from activity where candidate_id = ${c.id} and kind in ('interview_link', 'wrote', 'emailed')`;
  assert.deepEqual(lines.map(l => l.kind), ["interview_link"]);
});

test("a photo of a CV is a CV: JPEG, PNG, HEIC by their first bytes", async () => {
  assert.equal(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])), "image/jpeg");
  assert.equal(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniff(new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0")), "image/heic");
  assert.equal(sniff(new TextEncoder().encode("GIF89a")), null);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const up = await cv.grant("public", "image/jpeg", jpeg.length);
  assert.equal((await chest.upload(up.url, jpeg, "image/jpeg")).status, 201);
  const kept = await cv.accept(up.ticket, "public", "IMG_2041.jpg");
  assert.match(kept.object, /^cv\/[0-9a-f]{20}\.jpg$/u);
  // A picture that says JPEG but is a PNG is refused.
  const liar = await cv.grant("public", "image/jpeg", 8);
  await chest.upload(liar.url, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/jpeg");
  await assert.rejects(cv.accept(liar.ticket, "public", "x.jpg"), { code: "cv_invalid" });
});

const pdf = "%PDF-1.4\n% offer\n%%EOF\n";
async function uploaded(name = "Offer letter.pdf", content: string | Uint8Array = pdf, type = "application/pdf") {
  const up = await cv.grant("team", type, typeof content === "string" ? content.length : content.byteLength);
  await chest.upload(up.url, content, type);
  return { ticket: up.ticket, name };
}

test("the offer letter: a file sent with an email, kept in the conversation, erased with the candidate", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Workshop assistant");
  const c = (await candidates.apply(sql, someone(job.slug))).candidate;
  await assert.rejects(messages.write(sql, asMember(ines), c.id, { subject: "Offer", text: "Hello", files: [await uploaded()] }), { code: "forbidden" });
  const id = await messages.write(sql, asMember(camille), c.id, { subject: "Our offer", text: "Please find our offer attached.", files: [await uploaded()] });
  assert.equal(await outbox.sendNow(sql, id), "sent");
  const mail = chest.outbox.at(-1)!;
  assert.deepEqual(mail.attachments.map(a => [a.name, a.type]), [["Offer letter.pdf", "application/pdf"]]);
  const [row] = await messages.conversation(sql, asMember(camille), c.id).then(list => list.filter(m => m.id === id));
  assert.deepEqual(row!.attachments.map(a => a.name), ["Offer letter.pdf"]);
  const file = await messages.fileOf(sql, asMember(camille), id, 0);
  assert.match(file.object, /^sent\/[0-9a-f]{20}\.pdf$/u);
  assert.ok(chest.files.has(file.object));
  // Refusals: too many, too large together, not a document.
  const six = await Promise.all(Array.from({ length: 6 }, () => uploaded()));
  await assert.rejects(messages.write(sql, asMember(camille), c.id, { subject: "S", text: "T", files: six }), { code: "too_many_files" });
  await assert.rejects(messages.write(sql, asMember(camille), c.id, { subject: "S", text: "T", files: [{ ticket: "public.x.pdf.1.y", name: "x.pdf" }] }), { code: "file_invalid" });
  const big = new Uint8Array(5 << 20);
  big.set(new TextEncoder().encode("%PDF-1.4\n"));
  await assert.rejects(messages.write(sql, asMember(camille), c.id, { subject: "S", text: "T", files: [await uploaded("a.pdf", big), await uploaded("b.pdf", big)] }), { code: "files_too_large" });
  assert.equal([...chest.files.keys()].filter(k => k.startsWith("sent/")).length, 1, "what was refused is not kept");
  // Erased with the candidate.
  const gone = await candidates.erase(sql, asMember(camille), c.id);
  await cv.remove(gone.objects);
  assert.ok(!chest.files.has(file.object));
});

test("a template carries its files: each email from it sends its own copy; files no template holds are swept", async () => {
  const { sql } = database;
  await assert.rejects(messages.saveTemplate(sql, asMember(ines), { name: "Offer", language: "en", subject: "S", body: "B", files: [] }), { code: "forbidden" });
  const tpl = await messages.saveTemplate(sql, asMember(camille), { name: "Offer with letter", language: "en", subject: "Our offer, {firstName}", body: "Attached.", files: [await uploaded("Offer letter template.pdf")] });
  assert.equal(tpl.attachments.length, 1);
  assert.match(tpl.attachments[0]!.file, /^templates\//u);
  await assert.rejects(messages.saveTemplate(sql, asMember(camille), { id: tpl.id, name: "X", language: "en", subject: "S", body: "B", keep: [{ file: "cv/0123456789abcdef0123.pdf", name: "x" }] }), { code: "invalid" });
  const job = await openJob(sql, asMember(camille), "Finisher");
  const c = (await candidates.apply(sql, someone(job.slug))).candidate;
  const id = await messages.write(sql, asMember(camille), c.id, { subject: "Our offer", text: "Attached.", template: tpl.id, templateFiles: [tpl.attachments[0]!.file] });
  const copy = await messages.fileOf(sql, asMember(camille), id, 0);
  assert.match(copy.object, /^sent\//u);
  assert.notEqual(copy.object, tpl.attachments[0]!.file);
  assert.equal(copy.name, "Offer letter template.pdf");
  // Saved without its file: the file stays until the nightly sweep.
  await messages.saveTemplate(sql, asMember(camille), { id: tpl.id, name: tpl.name, language: "en", subject: tpl.subject, body: tpl.body, keep: [] });
  assert.ok(chest.files.has(tpl.attachments[0]!.file));
  assert.equal(await messages.sweepTemplateFiles(sql, new Date(Date.now() + 2 * 86400000)), 1);
  assert.ok(!chest.files.has(tpl.attachments[0]!.file));
  assert.ok(chest.files.has(copy.object), "the email's own copy stays");
});

test("jobs to start from, in both languages, written in the editor's marks", () => {
  for (const l of locales) {
    for (const k of jobTemplateKeys) {
      const t = catalogue(l).jobTemplates.items[k];
      assert.ok(t.title && t.team);
      const blocks = parse(t.description);
      assert.ok(blocks.some(b => b.kind === "heading") && blocks.some(b => b.kind === "bullets"), `${l} ${k}`);
    }
  }
});
