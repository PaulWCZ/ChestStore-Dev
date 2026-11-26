import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/shared/app-error.ts";
import { spentOn } from "../src/shared/model.ts";
import { today } from "../src/lib/today.ts";

const utcDay = (): string => new Date().toISOString().slice(0, 10);
const addDays = (day: string, n: number): string => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

test("today is the Chest's day, whatever UTC's", async () => {
  for (const timeZone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Europe/Paris"]) {
    const chest = await fakeChest({ network: {}, chest: { timeZone } });
    try {
      const expected = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      assert.equal(today(), expected, timeZone);
      assert.ok(Math.abs(Date.parse(today()) - Date.parse(utcDay())) <= 86400000);
      // A receipt of the Chest's day, or of its tomorrow (someone further
      // east), is accepted; the day after is refused.
      assert.equal(spentOn(today(), today()), today());
      assert.equal(spentOn(addDays(today(), 1), today()), addDays(today(), 1));
      assert.throws(() => spentOn(addDays(today(), 2), today()), (e: unknown) => e instanceof AppError && e.code === "date_future");
    } finally {
      await chest.close();
    }
  }
});

test("outside a Chest, today refuses to guess a zone", () => {
  const saved = process.env["CHEST_TIME_ZONE"];
  delete process.env["CHEST_TIME_ZONE"];
  try {
    assert.throws(() => today(), /not_in_chest|not running in a Chest/);
  } finally {
    if (saved !== undefined) process.env["CHEST_TIME_ZONE"] = saved;
  }
});
