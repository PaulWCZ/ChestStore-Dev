import assert from "node:assert/strict";
import { test } from "node:test";
import { arriving, newcomers, tenure, thisMonth } from "../src/shared/calendar.ts";
import { AppError } from "../src/lib/errors.ts";
import { addDays, birthday, clean, day, dueState, fold, offset, phone, skills } from "../src/shared/model.ts";
import { orgChart } from "../src/shared/tree.ts";

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

test("texts are trimmed, bounded, and keep line breaks only where allowed", () => {
  assert.equal(clean("  a \n b  ", 10), "a b");
  assert.equal(clean("a\r\n\n\n\nb", 10, { multiline: true }), "a\n\nb");
  assert.equal(clean("", 10, { optional: true }), "");
  assert.throws(() => clean("", 10), refused("empty"));
  assert.throws(() => clean("x".repeat(11), 10), refused("too_long"));
  assert.throws(() => clean(3, 10), refused("invalid"));
});

test("phones, topics, birthdays and days are checked", () => {
  assert.equal(phone(" +33 (0)6 12.34-56/78 "), "+33 (0)6 12.34-56/78");
  assert.equal(phone(""), "");
  assert.throws(() => phone("call me"), refused("invalid"));
  assert.throws(() => phone("12"), refused("invalid"));
  assert.deepEqual(skills(["Excel", " excel ", "Éclairage", "eclairage", "", "Invoices"]), ["Excel", "Éclairage", "Invoices"]);
  assert.throws(() => skills(Array.from({ length: 13 }, (_, i) => "t" + i)), refused("too_many"));
  assert.throws(() => skills("Excel"), refused("invalid"));
  assert.equal(birthday({ month: 2, day: 29 }), "02-29");
  assert.equal(birthday({ month: "10", day: "4" }), "10-04");
  assert.equal(birthday(null), null);
  assert.throws(() => birthday({ month: 4, day: 31 }), refused("invalid"));
  assert.throws(() => birthday({ month: 13, day: 1 }), refused("invalid"));
  assert.throws(() => birthday("1990-04-01"), refused("invalid"));
  assert.equal(day("2024-02-29"), "2024-02-29");
  assert.equal(day("", { optional: true }), null);
  assert.throws(() => day("2023-02-29"), refused("invalid"));
  assert.throws(() => day("1900-01-01"), refused("invalid"));
  assert.equal(offset("-7"), -7);
  assert.throws(() => offset(400), refused("invalid"));
  assert.throws(() => offset(1.5), refused("invalid"));
  assert.equal(fold("  Inès  MOREAU "), "ines moreau");
  assert.equal(addDays("2026-02-27", 2), "2026-03-01");
  assert.equal(dueState("2026-09-01", "2026-09-02"), "late");
  assert.equal(dueState("2026-09-02", "2026-09-02"), "today");
  assert.equal(dueState("2026-09-09", "2026-09-02"), "soon");
  assert.equal(dueState("2026-09-10", "2026-09-02"), "later");
});

test("the org chart: trees of managers, people not placed, and loops cut", () => {
  const p = (id: string, managerId: string | null) => ({ id, managerId });
  const { roots, alone } = orgChart([p("a", null), p("b", "a"), p("c", "a"), p("d", "b"), p("e", null), p("f", "gone"), p("x", "y"), p("y", "x")]);
  assert.deepEqual(roots.map(r => r.person.id), ["a", "x"]);
  assert.equal(roots[0]!.size, 4);
  assert.deepEqual(roots[0]!.reports.map(r => r.person.id), ["b", "c"]);
  assert.deepEqual(roots[0]!.reports[0]!.reports.map(r => r.person.id), ["d"]);
  assert.deepEqual(alone.map(a => a.id), ["e", "f"]);
  assert.deepEqual(roots[1]!.reports.map(r => r.person.id), ["y"]);
});

test("newcomers, arrivals, this month's birthdays and anniversaries", () => {
  const p = (name: string, startDate: string | null, birthday: string | null = null) => ({ name, startDate, birthday });
  const people = [p("old", "2021-09-15", "09-03"), p("new", "2026-09-22"), p("month", "2026-08-30"), p("future", "2026-10-05"), p("leap", "2020-02-29", "02-29"), p("none", null)];
  assert.deepEqual(newcomers(people, "2026-09-28").map(x => x.name), ["new", "month"]);
  assert.deepEqual(arriving(people, "2026-09-28").map(x => x.name), ["future"]);
  const moments = thisMonth(people, "2026-09-28");
  assert.deepEqual(moments.map(m => [m.person.name, m.kind, m.date, m.years, m.past]), [["old", "birthday", "2026-09-03", 0, true], ["old", "anniversary", "2026-09-15", 5, true]]);
  assert.deepEqual(thisMonth(people, "2027-02-10").map(m => [m.person.name, m.kind, m.date]), [["leap", "anniversary", "2027-02-28"], ["leap", "birthday", "2027-02-28"]]);
  assert.deepEqual(tenure("2021-09-15", "2026-09-28"), { years: 5, months: 0, days: 1839 });
  assert.deepEqual(tenure("2026-09-22", "2026-09-28"), { years: 0, months: 0, days: 6 });
});

test("zones: a member's own day, the Chest's when they have none", async () => {
  const { todayOf, zoneOf } = await import("../src/lib/zone.ts");
  const { fakeChest } = await import("@argentic/chest-sdk/testing");
  const chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" } });
  try {
    assert.equal(zoneOf(null), "Europe/Paris");
    assert.equal(zoneOf({ timeZone: "America/Montreal" }), "America/Montreal");
    assert.equal(zoneOf({}), "Europe/Paris");
    // 03:30 UTC on 1 October: still 30 September in Montreal.
    const at = Date.parse("2026-10-01T03:30:00Z");
    assert.equal(todayOf({ timeZone: "America/Montreal" }, at), "2026-09-30");
    assert.equal(todayOf({ timeZone: "Europe/Paris" }, at), "2026-10-01");
    assert.equal(todayOf(null, at), "2026-10-01");
  } finally {
    await chest.close();
  }
  // Outside a Chest, no zone is guessed.
  assert.throws(() => zoneOf(null), (e: unknown) => (e as { code?: string }).code === "not_in_chest");
});
