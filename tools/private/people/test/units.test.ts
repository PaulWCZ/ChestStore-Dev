import assert from "node:assert/strict";
import { test } from "node:test";
import { atLeast, checkSources } from "@argentic/chest-app/testing";
import { db, provide } from "../src/lib/db.ts";
import { cut } from "../src/lib/notify.ts";

// What a type cannot check, read in the sources (Node runs .ts as is).
atLeast(3);

test("the sources: no style={}, no server code in islands, no colour in CSS, known classes, capabilities used and declared, every rule tested", () => {
  checkSources({ requireTests: true });
});

test("a bell item is cut at its bound, on characters, with an ellipsis", () => {
  assert.equal(cut("  Lunch   with the team ", 80), "Lunch with the team");
  assert.equal(cut("é".repeat(100), 10), "é".repeat(9) + "…");
});

test("the database is opened on first use, never at import; the tests may hand it their connection", () => {
  const given = { end: async () => {} } as unknown as ReturnType<typeof db>;
  provide(given);
  assert.equal(db(), given);
  provide(undefined);
});
