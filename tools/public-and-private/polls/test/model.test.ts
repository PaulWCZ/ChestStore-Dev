import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../lib/app-error.ts";
import { toCsv } from "../lib/csv.ts";
import { dates, optionText } from "../lib/dates.ts";
import { calendar, escape, fold } from "../lib/ics.ts";
import { checkOpening, clean, readAnswer, readPoll, type QuestionShape } from "../lib/model.ts";
import { best, fromAnswers, results, type QuestionRow } from "../lib/results.ts";

const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone: "Europe/Paris", now, today: "2026-10-05", known: ["grp_salesaaaaaaaaaaaaaaaaaaaaa"] as string[] | null };
const refuses = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("a choice poll: two to twenty answers, each once, trimmed; its settings", () => {
  const spec = readPoll({ kind: "choice", title: "  Lunch   on Friday? ", options: [" Pizza ", "Sushi", ""], multiple: true, other: true, anonymous: true, results: "closed", audience: { everyone: false, groups: ["grp_salesaaaaaaaaaaaaaaaaaaaaa"] }, closes: { day: "2026-10-09", time: "12:00" } }, ctx);
  assert.equal(spec.title, "Lunch on Friday?");
  assert.deepEqual(spec.questions[0]!.options.map(o => o.label), ["Pizza", "Sushi"]);
  assert.equal(spec.questions[0]!.multiple, true);
  assert.equal(spec.questions[0]!.other, true);
  assert.equal(spec.anonymous, true);
  assert.equal(spec.results, "closed");
  assert.deepEqual(spec.groups, ["grp_salesaaaaaaaaaaaaaaaaaaaaa"]);
  assert.equal(spec.everyone, false);
  // 12:00 in Paris in October (summer time) is 10:00 UTC.
  assert.equal(spec.closesAt!.toISOString(), "2026-10-09T10:00:00.000Z");
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: ["Only one"] }, ctx), refuses("too_few"));
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: ["Café", "cafe"] }, ctx), refuses("duplicate"));
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: Array.from({ length: 21 }, (_, i) => "o" + i) }, ctx), refuses("too_many"));
  assert.throws(() => readPoll({ kind: "choice", title: "", options: ["a", "b"] }, ctx), refuses("empty"));
  assert.throws(() => readPoll({ kind: "choice", title: "x".repeat(141), options: ["a", "b"] }, ctx), refuses("too_long"));
  assert.throws(() => readPoll({ kind: "poll", title: "Q" }, ctx), refuses("invalid"));
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: ["a", "b"], audience: { everyone: false, groups: [] } }, ctx), refuses("no_group"));
  // A group that does not give the tool, or not a group at all.
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: ["a", "b"], audience: { everyone: false, groups: ["grp_techaaaaaaaaaaaaaaaaaaaaaa"] } }, ctx), refuses("no_group"));
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: ["a", "b"], audience: { everyone: false, groups: ["sales"] } }, { ...ctx, known: null }), refuses("no_group"));
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: ["a", "b"], closes: { day: "2026-02-30", time: "12:00" } }, ctx), refuses("bad_date"));
  assert.throws(() => readPoll({ kind: "choice", title: "Q", options: ["a", "b"], closes: { day: "2026-10-09", time: "7pm" } }, ctx), refuses("bad_date"));
});

test("a date poll: days in order, times optional, the end after the start, each option once", () => {
  const spec = readPoll({ kind: "date", title: "Dinner", dates: [{ day: "2026-12-18", start: "19:00", end: "23:00" }, { day: "2026-12-11" }, { day: "2026-12-18", start: "12:00", end: null }] }, ctx);
  assert.deepEqual(spec.questions[0]!.options.map(o => [o.day, o.start, o.end]), [["2026-12-11", null, null], ["2026-12-18", "12:00", null], ["2026-12-18", "19:00", "23:00"]]);
  assert.throws(() => readPoll({ kind: "date", title: "D", dates: [] }, ctx), refuses("too_few"));
  assert.throws(() => readPoll({ kind: "date", title: "D", dates: [{ day: "2026-12-18", start: "19:00", end: "18:00" }] }, ctx), refuses("bad_times"));
  assert.throws(() => readPoll({ kind: "date", title: "D", dates: [{ day: "2026-12-18", end: "18:00" }] }, ctx), refuses("bad_times"));
  assert.throws(() => readPoll({ kind: "date", title: "D", dates: [{ day: "2026-12-18" }, { day: "2026-12-18" }] }, ctx), refuses("duplicate"));
  assert.throws(() => readPoll({ kind: "date", title: "D", dates: [{ day: "18/12/2026" }] }, ctx), refuses("bad_date"));
  assert.throws(() => readPoll({ kind: "date", title: "D", dates: Array.from({ length: 41 }, (_, i) => ({ day: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`, start: i < 28 ? null : "09:00" })) }, ctx), refuses("too_many"));
});

test("a survey: one to ten questions of three kinds", () => {
  const spec = readPoll({ kind: "survey", title: "Pulse", questions: [{ kind: "scale", text: "Your week?", low: "Bad", high: "Great" }, { kind: "text", text: "Anything else?" }, { kind: "choice", text: "Best day?", options: ["Mon", "Fri"], multiple: true }] }, ctx);
  assert.deepEqual(spec.questions.map(q => q.kind), ["scale", "text", "choice"]);
  assert.equal(spec.questions[0]!.low, "Bad");
  assert.equal(spec.questions[2]!.multiple, true);
  assert.throws(() => readPoll({ kind: "survey", title: "P", questions: [] }, ctx), refuses("too_few"));
  assert.throws(() => readPoll({ kind: "survey", title: "P", questions: Array.from({ length: 11 }, () => ({ kind: "text", text: "Q" })) }, ctx), refuses("too_many"));
  assert.throws(() => readPoll({ kind: "survey", title: "P", questions: [{ kind: "rating", text: "Q" }] }, ctx), refuses("invalid"));
  assert.throws(() => readPoll({ kind: "survey", title: "P", questions: [{ kind: "text", text: "" }] }, ctx), refuses("empty"));
});

test("sending a poll: it closes at least ten minutes ahead, and proposes no day already past", () => {
  const soon = new Date(now.getTime() + 5 * 60_000);
  assert.throws(() => checkOpening({ closesAt: soon, questions: [] }, { now, today: "2026-10-05" }), refuses("too_soon"));
  assert.throws(() => checkOpening({ closesAt: new Date(now.getTime() + 500 * 864e5), questions: [] }, { now, today: "2026-10-05" }), refuses("bad_date"));
  assert.throws(() => checkOpening({ closesAt: null, questions: [{ options: [{ day: "2026-10-04" }] }] }, { now, today: "2026-10-05" }), refuses("past"));
  checkOpening({ closesAt: null, questions: [{ options: [{ day: "2026-10-05" }] }] }, { now, today: "2026-10-05" });
});

test("an answer is checked against the poll's questions", () => {
  const qs: QuestionShape[] = [
    { id: "1", kind: "choice", multiple: false, other: true, options: [{ id: "10" }, { id: "11" }] },
    { id: "2", kind: "date", multiple: true, other: false, options: [{ id: "20" }, { id: "21" }] },
    { id: "3", kind: "scale", multiple: false, other: false, options: [] },
    { id: "4", kind: "text", multiple: false, other: false, options: [] },
  ];
  const a = readAnswer({ "1": { options: ["10"] }, "2": { dates: { "20": 2 } }, "3": { value: 4 }, "4": { text: "  Nice  " } }, qs);
  assert.deepEqual(a.get("1"), { kind: "choice", options: ["10"], other: "" });
  // A date left unanswered is a no.
  assert.deepEqual([...(a.get("2") as { values: Map<string, number> }).values], [["20", 2], ["21", 0]]);
  assert.deepEqual(a.get("3"), { kind: "scale", value: 4 });
  assert.deepEqual(a.get("4"), { kind: "text", text: "Nice" });
  // A blank question is skipped; but at least one answer.
  assert.equal(readAnswer({ "1": { options: [], other: "  Tacos " } }, qs).get("1")!.kind, "choice");
  assert.throws(() => readAnswer({ "4": { text: "   " } }, qs), refuses("no_answer"));
  assert.throws(() => readAnswer({}, qs), refuses("no_answer"));
  // Single choice: one answer only (an "other" counts).
  assert.throws(() => readAnswer({ "1": { options: ["10", "11"] } }, qs), refuses("invalid"));
  assert.throws(() => readAnswer({ "1": { options: ["10"], other: "Tacos" } }, qs), refuses("invalid"));
  // Options of another question, values out of range, unknown questions.
  assert.throws(() => readAnswer({ "1": { options: ["20"] } }, qs), refuses("invalid"));
  assert.throws(() => readAnswer({ "2": { dates: { "20": 3 } } }, qs), refuses("invalid"));
  assert.throws(() => readAnswer({ "2": { dates: { "10": 2 } } }, qs), refuses("invalid"));
  assert.throws(() => readAnswer({ "3": { value: 6 } }, qs), refuses("invalid"));
  assert.throws(() => readAnswer({ "3": { value: 2.5 } }, qs), refuses("invalid"));
  assert.throws(() => readAnswer({ "9": { value: 1 } }, qs), refuses("invalid"));
  assert.throws(() => readAnswer({ "4": { text: "x".repeat(1001) } }, qs), refuses("too_long"));
  assert.throws(() => readAnswer({ "1": { options: ["abc"] } }, qs), refuses("not_found"));
  // "Other" where the poll does not allow it.
  assert.throws(() => readAnswer({ "1": { other: "x" } }, [{ ...qs[0]!, other: false }]), refuses("invalid"));
});

test("clean keeps line breaks only where asked, drops control characters", () => {
  assert.equal(clean("a\u0000b\n c", 10), "ab c");
  assert.equal(clean("a\r\n\n\n\nb", 10, { multiline: true }), "a\n\nb");
  assert.equal(clean(undefined, 10, { optional: true }), "");
  assert.throws(() => clean(42, 10), refuses("invalid"));
});

const questions: QuestionRow[] = [
  { id: "1", kind: "choice", text: "", multiple: true, other: true, low: "", high: "", options: [{ id: "10", label: "Pizza", day: null, start: null, end: null }, { id: "11", label: "Sushi", day: null, start: null, end: null }] },
  { id: "2", kind: "date", text: "", multiple: true, other: false, low: "", high: "", options: [{ id: "20", label: "", day: "2026-12-11", start: null, end: null }, { id: "21", label: "", day: "2026-12-18", start: "19:00", end: "23:00" }] },
  { id: "3", kind: "scale", text: "Week?", multiple: false, other: false, low: "", high: "", options: [] },
];

test("results: counts, percents of those who answered, the top answer, who said what", () => {
  const rows = [
    { participant: "1", member: "mbr_a", question: "1", option: "10", value: null, text: null },
    { participant: "1", member: "mbr_a", question: "1", option: "11", value: null, text: null },
    { participant: "2", member: "mbr_b", question: "1", option: "10", value: null, text: null },
    { participant: "3", member: "mbr_c", question: "1", option: null, value: null, text: "Tacos" },
    { participant: "1", member: "mbr_a", question: "2", option: "20", value: 2, text: null },
    { participant: "1", member: "mbr_a", question: "2", option: "21", value: 1, text: null },
    { participant: "2", member: "mbr_b", question: "2", option: "20", value: 0, text: null },
    { participant: "2", member: "mbr_b", question: "2", option: "21", value: 2, text: null },
    { participant: "1", member: "mbr_a", question: "3", option: null, value: 4, text: null },
    { participant: "2", member: "mbr_b", question: "3", option: null, value: 5, text: null },
  ];
  const named = fromAnswers(questions, rows);
  const r = results(questions, named.counts, named);
  const choice = r[0]!;
  assert.equal(choice.kind, "choice");
  if (choice.kind !== "choice") return;
  assert.equal(choice.answered, 3);
  assert.deepEqual(choice.options.map(o => [o.label, o.count, o.percent, o.top, o.voters]), [["Pizza", 2, 67, true, ["mbr_a", "mbr_b"]], ["Sushi", 1, 33, false, ["mbr_a"]]]);
  assert.deepEqual(choice.other, { count: 1, percent: 33, texts: [{ question: "1", body: "Tacos", member: "mbr_c" }] });
  const date = r[1]!;
  if (date.kind !== "date") return assert.fail();
  // 11 Dec: 1 yes; 18 Dec: 1 yes + 1 if need be — the best.
  assert.deepEqual(date.options.map(o => [o.id, o.yes, o.maybe, o.no, o.best]), [["20", 1, 0, 1, false], ["21", 1, 1, 0, true]]);
  assert.equal(date.best, "21");
  assert.deepEqual(date.grid, [{ member: "mbr_a", values: { "20": 2, "21": 1 } }, { member: "mbr_b", values: { "20": 0, "21": 2 } }]);
  const scale = r[2]!;
  if (scale.kind !== "scale") return assert.fail();
  assert.equal(scale.average, 4.5);
  assert.deepEqual(scale.counts.map(c => c.count), [0, 0, 0, 1, 1]);
});

test("the best date: most who can make it, then most yes, then the earliest; none if nobody can", () => {
  assert.equal(best([{ id: "a", yes: 1, maybe: 2 }, { id: "b", yes: 3, maybe: 0 }]), "b");
  assert.equal(best([{ id: "a", yes: 2, maybe: 0 }, { id: "b", yes: 2, maybe: 0 }]), "a");
  assert.equal(best([{ id: "a", yes: 0, maybe: 0 }]), null);
  // Anonymous counts: no voters, no grid, the same numbers.
  const counts = new Map([["1", new Map([["n", 5], ["o10", 3], ["o11", 2]])]]);
  const r = results([questions[0]!], counts);
  assert.deepEqual(r[0]!.kind === "choice" && r[0]!.options.map(o => [o.count, o.percent, o.voters.length]), [[3, 60, 0], [2, 40, 0]]);
});

test("days and times in the reader's language, on the Chest's clock", () => {
  const en = dates("en", "Europe/Paris", now);
  const fr = dates("fr", "Europe/Paris", now);
  assert.equal(en.dayLong("2026-12-18"), "Friday 18 December");
  assert.equal(fr.dayLong("2026-12-18"), "vendredi 18 décembre");
  assert.match(en.dayLong("2027-01-08"), /^Friday,? 8 January 2027$/u);
  assert.equal(en.at("2026-10-09T16:00:00Z"), "Fri 9 Oct, 18:00");
  assert.equal(optionText({ day: "2026-12-18", start: "19:00", end: "23:00" }, "en", "Europe/Paris", { range: "{start} – {end}", dayAndTime: "{day} · {time}" }, now), "Friday 18 December · 19:00 – 23:00");
  assert.equal(en.weekdayNames()[0], "Mon");
  assert.equal(fr.monthNames()[11], "décembre");
});

test("the calendar file follows RFC 5545: escaped text, folded lines, whole days", () => {
  assert.equal(escape("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
  const long = "SUMMARY:" + "é".repeat(60);
  const folded = fold(long);
  for (const line of folded.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.split("\r\n").map((l, i) => (i === 0 ? l : l.slice(1))).join(""), long);
  const allDay = calendar({ uid: "u@x", sequence: 2, summary: "Party; bring food", day: "2026-12-18", start: null, end: null, stamp: now });
  assert.ok(allDay.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(allDay.includes("DTSTART;VALUE=DATE:20261218\r\nDTEND;VALUE=DATE:20261219\r\n"));
  assert.ok(allDay.includes("SUMMARY:Party\\; bring food\r\n"));
  assert.ok(allDay.includes("SEQUENCE:2\r\n"));
  const timed = calendar({ uid: "u@x", sequence: 0, summary: "Dinner", day: "2026-12-18", start: new Date("2026-12-18T18:00:00Z"), end: null, stamp: now });
  assert.ok(timed.includes("DTSTART:20261218T180000Z\r\nDTEND:20261218T200000Z\r\n"));
  assert.ok(timed.endsWith("END:VCALENDAR\r\n"));
});

test("CSV: quoted where needed, formulas defused, a byte-order mark", () => {
  assert.equal(toCsv([["a", "b,c"], ["=1+1", 'say "hi"']]), '\u{FEFF}a,"b,c"\r\n\'=1+1,"say ""hi"""\r\n');
});
