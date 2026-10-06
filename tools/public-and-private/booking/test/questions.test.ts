import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/lib/app-error.ts";
import * as b from "../src/lib/booking.ts";
import { email } from "../src/lib/guests.ts";
import { answerText, cleanAnswers, cleanQuestions, readQuestions, type Question } from "../src/lib/questions.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { openHost } from "./support/host.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// The host's own questions: what a host may ask, what a guest must answer,
// where the answers show, and that they leave with the guest.

function refuses(step: () => unknown, code: string, values?: Record<string, unknown>) {
  assert.throws(step, (e: unknown) => e instanceof AppError && e.code === code && (!values || Object.entries(values).every(([k, v]) => e.values[k] === v)));
}
async function rejects(step: Promise<unknown>, code: string) {
  await assert.rejects(step, (e: unknown) => e instanceof AppError && e.code === code);
}

const budget = { id: "budget01", label: "Your budget?", kind: "short", required: false, options: [] };
const room = { id: "room0001", label: "Which room?", kind: "choice", required: true, options: ["Kitchen", "Living room", "Bedroom"] };
const pro = { id: "pro00001", label: "Is it for a business?", kind: "yesno", required: true, options: [] };
const story = { id: "story001", label: "Tell us more", kind: "long", required: false, options: [] };

test("questions: at most five, each with a label and a kind; a choice needs two distinct choices", () => {
  const clean = cleanQuestions([budget, room, pro, story]);
  assert.deepEqual(clean.map(q => q.id), ["budget01", "room0001", "pro00001", "story001"]);
  assert.deepEqual(cleanQuestions(undefined), []);
  refuses(() => cleanQuestions([budget, room, pro, story, { ...budget, id: "x0000001" }, { ...budget, id: "x0000002" }]), "too_many_questions", { max: 5 });
  refuses(() => cleanQuestions([{ ...budget, label: "  " }]), "empty");
  refuses(() => cleanQuestions([{ ...budget, label: "x".repeat(201) }]), "too_long");
  refuses(() => cleanQuestions([{ ...budget, kind: "date" }]), "invalid");
  refuses(() => cleanQuestions("nope"), "invalid");
  refuses(() => cleanQuestions([{ ...room, options: ["Kitchen", " Kitchen ", ""] }]), "choices_needed", { question: "Which room?" });
  refuses(() => cleanQuestions([{ ...room, options: Array.from({ length: 11 }, (_, i) => `Room ${i}`) }]), "too_many_choices", { max: 10 });
  // Choices are trimmed and deduplicated; other kinds carry none.
  assert.deepEqual(cleanQuestions([{ ...room, options: [" Kitchen", "Kitchen", "Bedroom", ""] }])[0]!.options, ["Kitchen", "Bedroom"]);
  assert.deepEqual(cleanQuestions([{ ...budget, options: ["x", "y"] }])[0]!.options, []);
  // A missing, malformed or repeated id gets a new one; "required" is true only when said so.
  const ids = cleanQuestions([{ ...budget, id: "BAD ID" }, { ...budget, id: "budget01" }, { ...budget, id: "budget01", required: "yes" }]);
  assert.equal(new Set(ids.map(q => q.id)).size, 3);
  assert.ok(ids.every(q => /^[a-z0-9]{4,12}$/u.test(q.id)));
  assert.equal(ids[2]!.required, false);
  // What the database holds is read defensively.
  assert.deepEqual(readQuestions([{ id: "a" }, null, budget]).map(q => q.id), ["budget01"]);
  assert.deepEqual(readQuestions("x"), []);
});

test("answers: required ones given, lengths bounded, a choice among the options, yes or no", () => {
  const questions = cleanQuestions([budget, room, pro, story]) as Question[];
  const answers = cleanAnswers(questions, { budget01: "  5 000 € ", room0001: "Kitchen", pro00001: "no", story001: "", other: "ignored" });
  assert.deepEqual(answers, [
    { id: "budget01", label: "Your budget?", kind: "short", answer: "5 000 €" },
    { id: "room0001", label: "Which room?", kind: "choice", answer: "Kitchen" },
    { id: "pro00001", label: "Is it for a business?", kind: "yesno", answer: "no" },
  ]);
  refuses(() => cleanAnswers(questions, { pro00001: "yes" }), "answer_missing", { question: "Which room?" });
  refuses(() => cleanAnswers(questions, { room0001: "Kitchen" }), "answer_missing", { question: "Is it for a business?" });
  refuses(() => cleanAnswers(questions, { room0001: "Garage", pro00001: "yes" }), "invalid");
  refuses(() => cleanAnswers(questions, { room0001: "Kitchen", pro00001: "maybe" }), "invalid");
  refuses(() => cleanAnswers(questions, { room0001: ["Kitchen"], pro00001: "yes" }), "invalid");
  refuses(() => cleanAnswers(questions, { room0001: "Kitchen", pro00001: "yes", budget01: "x".repeat(301) }), "answer_too_long", { question: "Your budget?", max: 300 });
  refuses(() => cleanAnswers(questions, { room0001: "Kitchen", pro00001: "yes", story001: "x".repeat(2001) }), "answer_too_long", { max: 2000 });
  // A long answer keeps its lines; a short one is one line.
  assert.equal(cleanAnswers(questions, { room0001: "Kitchen", pro00001: "yes", story001: "Line one\r\nLine two", budget01: "a\nb" }).find(a => a.id === "story001")!.answer, "Line one\nLine two");
  assert.equal(cleanAnswers(questions, { room0001: "Kitchen", pro00001: "yes", budget01: "a\nb" })[0]!.answer, "a b");
  assert.equal(answerText({ kind: "yesno", answer: "yes" }, { yes: "Oui", no: "Non" }), "Oui");
  assert.equal(answerText({ kind: "short", answer: "yes" }, { yes: "Oui", no: "Non" }), "yes");
});

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["database", "members", "notifications", "mail"], mail: {} });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate hosts, bookings, settings, form_counts cascade`;
});

// Monday 5 October 2026, 08:00 in Paris.
const monday = Date.parse("2026-10-05T06:00:00Z");
const guest = { name: "Alex Doe", email: "Alex@Example.com", note: "Bring samples", zone: "Europe/Paris", language: "en" };
const typeInput = { title: "Project call", slug: "project-call", description: "", duration: 30, interval: 30, locationKind: "video", location: "", bufferBefore: 0, bufferAfter: 0, noticeMinutes: 0, windowDays: 30, color: "sky", active: true };

async function ready() {
  const sql = database.sql;
  const made = await openHost(sql, asMember(ines), { title: "Meeting", slug: "meeting" });
  // Inès reads French but writes her page in English.
  await b.saveHost(sql, asMember(ines), { slug: made.slug, zone: made.zone, welcome: "", listed: true, language: "en" });
  const host = (await b.hostOf(sql, ines.id))!;
  const type = await b.createType(sql, asMember(ines), { ...typeInput, questions: [budget, room, pro] });
  return { sql, host, type };
}

test("a host saves their questions on a type; the public page reads them in order", async () => {
  const { sql, type } = await ready();
  assert.deepEqual(type.questions.map(q => q.label), ["Your budget?", "Which room?", "Is it for a business?"]);
  // Reordered and one removed: saved as sent.
  await b.updateType(sql, asMember(ines), type.id, { ...typeInput, questions: [pro, budget] });
  const place = await b.publicType(sql, "ines-moreau", "project-call");
  assert.deepEqual(place!.type.questions.map(q => q.id), ["pro00001", "budget01"]);
  await rejects(b.updateType(sql, asMember(ines), type.id, { ...typeInput, questions: [{ ...room, options: ["Only one"] }] }), "choices_needed");
  // Another host cannot change them.
  await rejects(b.updateType(sql, asMember(hugo), type.id, { ...typeInput, questions: [] }), "not_found");
});

test("a booking keeps the guest's answers as they saw the questions; a missing required answer is refused", async () => {
  const { sql, host, type } = await ready();
  const start = "2026-10-06T07:00:00.000Z";
  await rejects(b.book(sql, host, type, { ...guest, start, answers: { room0001: "Kitchen" } }, monday), "answer_missing");
  // Nothing was booked by the refusal.
  assert.ok((await b.freeTimes(sql, host, type, "2026-10-06", "2026-10-06", monday)).some(s => s.start === start));
  const { booking } = await b.book(sql, host, type, { ...guest, start, answers: { room0001: "Kitchen", pro00001: "yes", budget01: "About 5 000 €" } }, monday);
  assert.deepEqual(booking.answers.map(a => [a.label, a.answer]), [["Your budget?", "About 5 000 €"], ["Which room?", "Kitchen"], ["Is it for a business?", "yes"]]);
  // The host renames a question later: the booking keeps what the guest saw.
  await b.updateType(sql, asMember(ines), type.id, { ...typeInput, questions: [{ ...budget, label: "Budget" }] });
  assert.equal((await b.bookingFor(sql, asMember(ines), booking.id)).answers[0]!.label, "Your budget?");
  // The questions checked are the type's as they are when booking, not the page's.
  const fresh = await b.book(sql, host, type, { ...guest, start: "2026-10-06T08:00:00.000Z", answers: { budget01: "Small" } }, monday);
  assert.deepEqual(fresh.booking.answers.map(a => a.label), ["Budget"]);
});

test("the answers reach the host's bell (in their language) and the guest's confirmation, and the export", async () => {
  const { sql, host, type } = await ready();
  const { booking } = await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z", answers: { room0001: "Living room", pro00001: "no" } }, monday);
  await tell.booked(booking, host.zone);
  const bell = chest.notifications.filter(n => n.member === ines.id).at(-1)!;
  // Inès reads French: yes/no in French, the host's own words as written.
  assert.equal(bell.body, "Project call — Bring samples — Which room?: Living room — Is it for a business?: Non");
  assert.equal(await email(sql, "confirmed", booking, "https://book.example.com"), "email");
  const mail = chest.outbox.filter(m => m.to.includes("Alex@Example.com")).at(-1)!;
  assert.ok(mail.text.includes("Your answers:\nWhich room?: Living room\nIs it for a business?: No\n"), mail.text);
  // Without questions, the confirmation is as before.
  const plain = await b.book(sql, host, (await b.typesOf(sql, ines.id))[0]!, { ...guest, start: "2026-10-07T07:00:00.000Z" }, monday);
  await email(sql, "confirmed", plain.booking, "https://book.example.com");
  assert.ok(!chest.outbox.at(-1)!.text.includes("Your answers"));
  const rows = await b.exportRows(sql, asMember(ines), false);
  assert.equal(rows.find(r => r.id === booking.id)!.answers.length, 2);
});

test("answers leave with the guest: erased on request, and deleted with the booking after the retention", async () => {
  const { sql, host, type } = await ready();
  await b.book(sql, host, type, { ...guest, start: "2026-10-06T07:00:00.000Z", answers: { room0001: "Kitchen", pro00001: "yes", budget01: "Secret budget" } }, monday);
  await b.book(sql, host, type, { ...guest, email: "sam@example.com", start: "2026-10-06T08:00:00.000Z", answers: { room0001: "Bedroom", pro00001: "no" } }, monday);
  assert.equal((await b.eraseGuest(sql, asMember(camille), "alex@example.com")).length, 1);
  const left = await sql<{ answers: unknown }[]>`select answers from bookings`;
  assert.equal(left.length, 1);
  assert.ok(!JSON.stringify(left).includes("Secret budget"));
  // Past the retention (24 months by default): gone, answers included.
  assert.equal(await b.cleanup(sql, Date.parse("2028-11-01T00:00:00Z")), 1);
  assert.equal((await sql`select 1 from bookings`).length, 0);
});
