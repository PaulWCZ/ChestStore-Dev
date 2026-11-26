import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { AppError } from "../src/shared/app-error.ts";
import { allowanceCents, checkScale, tripCents, type Scale } from "../src/shared/scale.ts";

// The scale the migration ships (2025 distances), read from the SQL itself.
const sql = readFileSync(join(import.meta.dirname, "..", "migrations", "0001_expenses.sql"), "utf8");
const scale: Scale = checkScale(JSON.parse(sql.slice(sql.indexOf("(2025, '") + 8, sql.indexOf("}', '") + 1)));

test("the allowance of a year's distance follows the official formulas, band by band", () => {
  // 5 CV car: d × 0.636 up to 5,000 km; d × 0.357 + 1,395 to 20,000; d × 0.427 beyond.
  assert.equal(allowanceCents(scale, "car", "5", false, 40_000), 254_400); // 4,000 km
  assert.equal(allowanceCents(scale, "car", "5", false, 50_000), 318_000); // 5,000 km: still the first band
  assert.equal(allowanceCents(scale, "car", "5", false, 100_000), 496_500); // 10,000 km: 3,570 + 1,395
  assert.equal(allowanceCents(scale, "car", "5", false, 250_000), 1_067_500); // 25,000 km
  assert.equal(allowanceCents(scale, "car", "3", false, 1), 5); // 0.1 km × 0.529 = 0.0529 €
  assert.equal(allowanceCents(scale, "moped", "50", false, 30_000), 94_500);
  assert.equal(allowanceCents(scale, "motorbike", "1-2", false, 40_000), 128_700); // 4,000 × 0.099 + 891
  // Electric: +20 %.
  assert.equal(allowanceCents(scale, "car", "5", true, 50_000), 381_600);
});

test("a trip is worth what it adds to the year: bands crossed mid-trip are counted right", () => {
  // 4,800 km done; a 400 km trip crosses 5,000 km.
  const trip = tripCents(scale, "car", "5", false, 48_000, 4_000);
  assert.equal(trip, allowanceCents(scale, "car", "5", false, 52_000) - allowanceCents(scale, "car", "5", false, 48_000));
  assert.equal(trip, 325_140 - 305_280);
  // The trips of a year add up exactly to the allowance of the total, whatever the cuts.
  for (const [kind, power] of [["car", "4"], ["car", "7"], ["motorbike", "3-5"], ["moped", "50"]] as const) {
    for (const electric of [false, true]) {
      let before = 0, sum = 0;
      for (const d of [1234, 45_000, 3, 99_999, 12_345, 67_890, 5]) {
        sum += tripCents(scale, kind, power, electric, before, d);
        before += d;
      }
      assert.equal(sum, allowanceCents(scale, kind, power, electric, before), `${kind} ${power} ${electric}`);
    }
  }
  // After 20,000 km, only the top rate.
  assert.equal(tripCents(scale, "car", "5", false, 210_000, 1000), 4_270);
});

test("an edited scale is checked: three whole bands per row, increasing limits, known vehicles", () => {
  const bad = (change: (s: Record<string, any>) => void) => {
    const copy = structuredClone(scale) as Record<string, any>;
    change(copy);
    assert.throws(() => checkScale(copy), (e: unknown) => e instanceof AppError && e.code === "scale_invalid");
  };
  bad(s => { s["car"].limits = [20000, 5000]; });
  bad(s => { s["car"].rows[0].bands.pop(); });
  bad(s => { s["car"].rows[0].bands[0][0] = 0.5; });
  bad(s => { s["car"].rows[0].bands[1][1] = -1; });
  bad(s => { s["car"].rows[1].power = s["car"].rows[0].power; });
  bad(s => { delete s["moped"]; });
  bad(s => { s["electricBonus"] = 150; });
  bad(s => { s["car"].rows[0].power = "<b>"; });
  assert.throws(() => allowanceCents(scale, "car", "12", false, 10), (e: unknown) => e instanceof AppError && e.code === "no_vehicle");
});
