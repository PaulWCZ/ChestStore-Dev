import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { firstCycleChoices } from "../src/lib/model.ts";
import { today } from "../src/lib/time.ts";
import { world, type World } from "./support/world.ts";

// The first cycle is chosen on the Chest's calendar, in its time zone —
// never the server's: the evening of 31 December in Paris is already the
// new year there, still the old one in Montreal.
let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

function inZone<T>(zone: string, run: () => T): T {
  const was = process.env["CHEST_TIME_ZONE"];
  process.env["CHEST_TIME_ZONE"] = zone;
  try {
    return run();
  } finally {
    if (was === undefined) delete process.env["CHEST_TIME_ZONE"];
    else process.env["CHEST_TIME_ZONE"] = was;
  }
}

test("around a quarter's end, the Chest's time zone decides which quarter is offered", () => {
  // 30 September 2026, 22:30 UTC: 1 October in Paris, still 30 September in Montreal.
  const evening = new Date("2026-09-30T22:30:00Z");
  const paris = inZone("Europe/Paris", () => firstCycleChoices(today(evening)));
  assert.deepEqual([paris.main.which, paris.main.quarter.name, paris.other], ["current", "Q4 2026", null]);
  const montreal = inZone("America/Montreal", () => firstCycleChoices(today(evening)));
  assert.deepEqual([montreal.main.which, montreal.main.quarter.name, montreal.other?.quarter.name], ["next", "Q4 2026", "Q3 2026"]);
  // 29 September at noon in Paris: Q4 first, never Q3 with 1 day left.
  const critic = inZone("Europe/Paris", () => firstCycleChoices(today(new Date("2026-09-29T10:00:00Z"))));
  assert.deepEqual([critic.main.which, critic.main.quarter.startsOn, critic.main.quarter.endsOn], ["next", "2026-10-01", "2026-12-31"]);
  // New year's eve, 23:30 UTC: 1 January in Paris (Q1 2027, current), 31 December in Montreal (Q1 2027 next, or Q4).
  const eve = new Date("2026-12-31T23:30:00Z");
  assert.deepEqual(inZone("Europe/Paris", () => [firstCycleChoices(today(eve)).main.which, firstCycleChoices(today(eve)).main.quarter.name]), ["current", "Q1 2027"]);
  assert.deepEqual(inZone("America/Montreal", () => [firstCycleChoices(today(eve)).main.which, firstCycleChoices(today(eve)).other?.quarter.name]), ["next", "Q4 2026"]);
  void w;
});

test("a cycle the tool named reads in each reader's language; one an admin named keeps its words", async () => {
  const { createCycle, readCycle, updateCycle, deleteCycle } = await import("../src/lib/cycles.ts");
  const { periodName, generatedName } = await import("../src/lib/cycle-names.ts");
  const { asMember } = await import("./support/member.ts");
  const { camille, hugo } = await import("./support/members.ts");
  const { sql } = w.database;
  assert.equal(periodName("2027-01-01", "2027-03-31", "en"), "Q1 2027");
  assert.equal(periodName("2027-01-01", "2027-03-31", "fr"), "T1 2027");
  assert.equal(periodName("2026-08-22", "2026-11-20", "en"), "Aug – Nov 2026");
  assert.equal(periodName("2026-08-22", "2026-11-20", "fr"), "août – nov. 2026");
  assert.equal(periodName("2026-11-02", "2027-02-26", "en"), "Nov 2026 – Feb 2027");
  assert.equal(generatedName("T1 2027", "2027-01-01", "2027-03-31"), true);
  assert.equal(generatedName("Winter push", "2027-01-01", "2027-03-31"), false);
  // Camille (French) keeps the suggestion "T1 2027": Hugo reads "Q1 2027".
  const admin = { ...asMember(camille), locale: "fr" as const };
  const made = await createCycle(sql, admin, { name: "T1 2027", startsOn: "2027-01-01", endsOn: "2027-03-31" });
  assert.equal(made.generated, true);
  assert.equal((await readCycle(sql, asMember(hugo), made.id)).name, "Q1 2027");
  assert.equal((await readCycle(sql, admin, made.id)).name, "T1 2027");
  // Its dates change, its name not typed again: still the tool's, for the new dates.
  await updateCycle(sql, admin, made.id, { name: "T1 2027", endsOn: "2027-04-30" });
  assert.equal((await readCycle(sql, asMember(hugo), made.id)).name, "Jan – Apr 2027");
  // Renamed: the admin's words, for everyone.
  await updateCycle(sql, admin, made.id, { name: "Poussée d’hiver" });
  const renamed = await readCycle(sql, asMember(hugo), made.id);
  assert.deepEqual([renamed.name, renamed.generated], ["Poussée d’hiver", false]);
  await deleteCycle(sql, admin, made.id);
});
