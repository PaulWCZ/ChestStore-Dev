import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { goesBy } from "../lib/company.ts";

// The name on pages and in emails is the one the admin entered here; the
// Chest's organization only stands in before the settings are filled in,
// and outside a Chest there is none.

test("the admin's names first, the Chest's organization only as a fallback", async () => {
  const chest = await fakeChest({ chest: { organization: "Atelier Martin" } });
  try {
    assert.equal(goesBy({ tradeName: "Martin Design", legalName: "Atelier Martin SARL" }), "Martin Design");
    assert.equal(goesBy({ tradeName: "", legalName: "Atelier Martin SARL" }), "Atelier Martin SARL");
    assert.equal(goesBy({ tradeName: "", legalName: "" }), "Atelier Martin");
  } finally {
    await chest.close();
  }
  assert.equal(goesBy({ tradeName: "", legalName: "" }), "");
});
