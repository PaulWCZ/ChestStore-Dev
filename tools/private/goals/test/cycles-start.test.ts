import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { firstCycleChoices } from "../lib/model.ts";
import { today } from "../lib/time.ts";
import { world, type World } from "./support/world.ts";

// The first cycle is chosen on the Chest's calendar, in its time zone —
// never the server's: the evening of 31 December in Paris is already the
// new year there, still the old one in Montreal.
let w: World;
before(async () => { w = await world(); });
after(async () => { await w.close(); });

function inZone<T>(zone: string, run: () => T): T {
  const was = process.env["CHEST_TIMEZONE"];
  process.env["CHEST_TIMEZONE"] = zone;
  try {
    return run();
  } finally {
    if (was === undefined) delete process.env["CHEST_TIMEZONE"];
    else process.env["CHEST_TIMEZONE"] = was;
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
