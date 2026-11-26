import assert from "node:assert/strict";
import { test } from "node:test";
import { atLeast } from "@argentic/chest-app/testing";
import type { Member } from "@argentic/chest-sdk/member";
import { catalogue } from "../src/i18n/index.ts";
import { cycleName, generatedName, periodName } from "../src/lib/cycle-names.ts";
import { objectiveProgress, percent } from "../src/lib/model.ts";
import { cut } from "../src/lib/notify.ts";
import { cycleWords, quarterName } from "../src/lib/page-data.ts";
import type { Person } from "../src/lib/people.ts";
import type { KeyResult, Objective } from "../src/lib/read.ts";
import { objectiveView, pctText, personView } from "../src/lib/views.ts";
import { addDays, instantOf, isDate, wall, weekdayOf } from "../src/lib/zone.ts";

// What the pages are made of, written on the server: names, dates, values,
// percentages — the same everywhere a page shows them.
atLeast(6);
const en = catalogue("en"), fr = catalogue("fr");
const plain = (s: string) => s.replace(/[  ]/gu, " ");

test("a cycle's dates say the year at the end, and at the start when it crosses a year; a day not this year says its year", () => {
  const cycle = (startsOn: string, endsOn: string, closed = false) => ({ id: "1", name: "x", generated: false, startsOn, endsOn, current: true, closed, closedAt: null });
  assert.equal(cycleWords(cycle("2026-10-01", "2026-12-31"), "2026-10-06", en, "en").dates, "1 Oct – 31 Dec 2026");
  assert.equal(cycleWords(cycle("2026-11-02", "2027-02-26"), "2026-12-01", en, "en").dates, "2 Nov 2026 – 26 Feb 2027");
  assert.equal(plain(cycleWords(cycle("2026-11-02", "2027-02-26"), "2026-12-01", fr, "fr").dates), "2 nov. 2026 – 26 févr. 2027");
  assert.equal(cycleWords(cycle("2027-01-01", "2027-03-31"), "2026-12-20", en, "en").when, "Starts 1 January 2027");
  assert.equal(cycleWords(cycle("2026-12-01", "2026-12-31"), "2026-11-20", en, "en").when, "Starts 1 December");
  assert.equal(cycleWords(cycle("2026-10-01", "2026-12-31"), "2026-10-06", en, "en").when, "Week 1 of 14 · 86 days left");
  assert.equal(cycleWords(cycle("2026-07-01", "2026-09-30", true), "2026-10-06", en, "en").when, "Closed");
  assert.equal(cycleWords(cycle("2025-10-01", "2025-12-31"), "2026-01-10", en, "en").when, "Ended 31 December 2025");
  assert.equal(quarterName(fr, { name: "", quarter: 1, year: 2027, startsOn: "2027-01-01", endsOn: "2027-03-31" }), "T1 2027");
});

test("a cycle the tool named reads in each language; across a year end its months say both years", () => {
  assert.equal(periodName("2026-11-02", "2027-02-26", "en"), "Nov 2026 – Feb 2027");
  assert.equal(periodName("2026-10-01", "2026-12-31", "fr"), "T4 2026");
  assert.equal(generatedName("Q4 2026", "2026-10-01", "2026-12-31"), true);
  assert.equal(cycleName({ name: "T4 2026", generated: true, startsOn: "2026-10-01", endsOn: "2026-12-31" }, "en"), "Q4 2026");
  assert.equal(cycleName({ name: "Autumn push", generated: false, startsOn: "2026-10-01", endsOn: "2026-12-31" }, "fr"), "Autumn push");
});

test("wall clocks and days in a zone, across daylight saving and year ends", () => {
  // Paris goes back an hour on 25 October 2026: Monday 00:00 is still one instant.
  assert.equal(instantOf("2026-10-26", 0, "Europe/Paris").toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(instantOf("2026-03-29", 150, "Europe/Paris").toISOString(), "2026-03-29T01:30:00.000Z", "a time the clock skips is read after the change");
  assert.deepEqual(wall(new Date("2026-12-31T23:30:00Z"), "Europe/Paris"), { date: "2027-01-01", minutes: 30, weekday: 5 });
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekdayOf("2027-01-04"), 1);
  assert.equal(isDate("2026-02-29"), false);
  assert.equal(isDate("2028-02-29"), true);
});

const member = (id: string): Member => ({ id, firstName: "A", lastName: "B", name: "A B", photo: null, role: "admin", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" });
const kr = (id: string, progress: number, weight: number, extra: Partial<KeyResult> = {}): KeyResult => ({
  id, objectiveId: "1", cycleId: "1", title: "KR " + id, kind: "number", unit: "", currency: null, start: 0, target: 3, current: progress * 3, weight, owner: "mbr_" + "a".repeat(26),
  source: null, sourceMine: false, sourceScope: null, unitLocale: null, createdAt: "2026-10-01T08:00:00.000Z", progress, done: progress >= 1, confidence: null, lastCheckIn: null, stale: false, thisWeek: false, ...extra,
});

test("an objective's percentage is its key results' weighted mean, rounded once: the same in a list and on its page", () => {
  const keyResults = [kr("1", 1 / 3, 1), kr("2", 2 / 3, 2), kr("3", 0.005, 3)];
  const progress = objectiveProgress(keyResults)!;
  const o: Objective = { id: "1", cycleId: "1", level: "company", teamId: null, parentId: null, carriedFrom: null, owner: "mbr_" + "a".repeat(26), title: "Grow", why: "", visibility: "everyone", score: null, learned: "", retroBy: null, retroAt: null, createdBy: "x", createdAt: "x", keyResults, progress, confidence: null, stale: false };
  const people = new Map<string, Person>();
  const ctx = { actor: member("mbr_" + "a".repeat(26)), people, locale: "en" as const, t: en, zone: "Europe/Paris", now: new Date("2026-10-06T10:00:00Z"), closed: false, teams: new Map<string, string>() };
  const view = objectiveView(o, ctx);
  // (1/3·1 + 2/3·2 + 0.005·3) / 6 = 0.2803 → 28 %, from the parts as they
  // are, never from their rounded percentages ((33 + 134 + 3) / 6 = 28.3).
  assert.equal(view.percent, 28);
  assert.equal(view.percentText, "28%");
  assert.deepEqual(view.keyResults.map(k => k.percent), [33, 67, 1]);
  assert.equal(percent(progress), view.percent);
  assert.equal(plain(pctText(fr, view.percent)), "28 %");
  assert.equal(pctText(en, null), "–");
});

test("people as pages write them: someone who left, someone who lost access, someone erased", () => {
  const p = (id: string, status: Person["status"], name: string): [string, Person] => [id, { id, name, photo: null, status, locale: "en" }];
  const people = new Map<string, Person>([p("mbr_a", "member", "Léa Dubois"), p("mbr_b", "former", "Paul Lefèvre"), p("mbr_c", "no_access", "Inès Moreau"), p("mbr_d", "erased", "")]);
  assert.deepEqual(["mbr_a", "mbr_b", "mbr_c", "mbr_d", "mbr_e", "erased"].map(id => personView(people, id, "en").name), ["Léa Dubois", "Paul Lefèvre (former member)", "Inès Moreau (no access)", "Former member", "Former member", "Former member"]);
  assert.equal(personView(people, "mbr_c", "fr").name, "Inès Moreau (sans accès)");
  assert.deepEqual(["mbr_a", "mbr_b", "mbr_c"].map(id => personView(people, id, "en").gone), [false, true, true]);
});

test("the bell's words are cut at the Chest's bounds, in characters", () => {
  assert.equal(cut("é".repeat(100), 80).length, 80);
  assert.equal(cut("  a \n b  ", 80), "a b");
  assert.ok(cut("x".repeat(300), 280).endsWith("…"));
});
