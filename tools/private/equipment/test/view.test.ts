import assert from "node:assert/strict";
import { test } from "node:test";
import { db as packageDb } from "@argentic/chest-app/db";
import { catalogue } from "../src/i18n/index.ts";
import { db } from "../src/lib/db.ts";
import type { Item } from "../src/lib/items.ts";
import { cut } from "../src/lib/notify.ts";
import type { Person } from "../src/lib/people.ts";
import { endingOf, holderIds, isLow, rowOf } from "../src/lib/view.ts";

// What a list row shows of an item, already in words (lib/view.ts), and the
// small rules beside it.
const laptop = { id: "1", key: "laptop", name: null, icon: "laptop", kind: "asset", membersSee: true } as const;
const item = (over: Partial<Item> = {}): Item => ({
  id: "7", category: laptop, tag: "EQ-0007", name: "ThinkPad T14", serial: "PF-1", status: "in_use", purchasedOn: null, priceCents: null, supplier: null,
  warrantyUntil: null, notes: null, photo: null, seats: null, seatsUsed: 0, renewsOn: null, costCents: null, period: null, holder: null, place: null,
  heldSince: null, createdAt: "2026-01-01T00:00:00.000Z", openProblems: 0, extra: {}, quantity: null, minQuantity: null, invoice: null, holderHidden: false, ...over,
});
const hugo = "mbr_hugoaaaaaaaaaaaaaaaaaaaaaa";
const names = new Map<string, Person>([[hugo, { id: hugo, name: "Hugo Bernard", photo: null, status: "former", locale: "en" }]]);

test("a row: the holder in the reader's words (a former member said so), since when, its status", () => {
  const t = catalogue("en");
  const row = rowOf(item({ holder: hugo, heldSince: "2026-03-02" }), names, t, "en", "2026-10-06", "mbr_meaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(row.holderText, "Hugo Bernard (former member)");
  assert.deepEqual(row.holder.kind === "member" && row.holder.gone, true);
  assert.equal(row.statusText, "In use");
  assert.equal(row.category, "Laptops");
  assert.match(row.since ?? "", /2 Mar 2026/u);
  assert.equal(rowOf(item({ holder: hugo }), names, t, "en", "2026-10-06", hugo).holderText, "You");
  assert.equal(rowOf(item({ holderHidden: true }), names, t, "en", "2026-10-06", hugo).holder.kind, "hidden");
  assert.deepEqual(holderIds([item({ holder: hugo }), item({ holder: hugo }), item()]), [hugo]);
});

test("what ends: within 60 days or ended in the last 30, the nearest first; never for what is retired", () => {
  const t = catalogue("en");
  assert.equal(endingOf(item({ warrantyUntil: "2026-10-20" }), t, "en", "2026-10-06")?.state, "soon");
  assert.equal(endingOf(item({ warrantyUntil: "2026-09-20" }), t, "en", "2026-10-06")?.state, "past");
  assert.equal(endingOf(item({ warrantyUntil: "2026-08-01" }), t, "en", "2026-10-06"), null);
  assert.equal(endingOf(item({ warrantyUntil: "2027-10-20" }), t, "en", "2026-10-06"), null);
  assert.equal(endingOf(item({ warrantyUntil: "2026-10-20", status: "retired" }), t, "en", "2026-10-06"), null);
  assert.equal(isLow({ quantity: 2, minQuantity: 2, status: "in_stock" }), true);
  assert.equal(isLow({ quantity: 3, minQuantity: 2, status: "in_stock" }), false);
});

test("a bell's words are cut to their bound, in characters, with an ellipsis", () => {
  assert.equal(cut("  a   b  ", 10), "a b");
  assert.equal(cut("é".repeat(100), 80).length, 80);
  assert.ok(cut("x".repeat(100), 80).endsWith("…"));
});

test("the database is the package's own pool", () => {
  assert.equal(db, packageDb);
});
