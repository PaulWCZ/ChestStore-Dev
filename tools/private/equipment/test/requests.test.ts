import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { onEvent, onSchedule } from "../src/lib/deliveries.ts";
import { AppError } from "@argentic/chest-app";
import { categoryCounts, listCategories } from "../src/lib/categories.ts";
import * as items from "../src/lib/items.ts";
import { approve, ask, cancel, fulfil, myRequests, refuse, waitingRequests } from "../src/lib/requests.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let cats: Awaited<ReturnType<typeof listCategories>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
  cats = await listCategories(database.sql, asMember(camille));
});
after(async () => {
  await chest.close();
  await database.close();
});
const of = (key: string) => cats.find(c => c.key === key)!.id;
const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
};
const M = asMember(camille), H = asMember(hugo), I = asMember(ines), L = asMember(lea), N = asMember(nora);

test("a member asks; the managers hear it and see it; their tile counts it", async () => {
  const { sql } = database;
  await refused(ask(sql, N, { body: "A laptop" }), "forbidden");
  await refused(ask(sql, H, { body: "  " }), "empty");
  await refused(ask(sql, H, { body: "x", categoryId: "999" }), "not_found");
  const r = await ask(sql, H, { body: "A second charger for home", categoryId: of("accessory") });
  assert.equal(r.status, "open");
  const bell = chest.notifications.filter(n => n.key === `request:${r.id}`);
  assert.deepEqual(bell.map(n => n.member).sort(), [camille.id, sofia.id].sort());
  assert.equal(shownTo(bell.find(n => n.member === camille.id)!, "fr").title, "Hugo demande du matériel");
  assert.equal(chest.badges.get(sofia.id), 1);
  await refused(waitingRequests(sql, H), "forbidden");
  assert.deepEqual((await waitingRequests(sql, M)).map(x => x.id), [r.id]);
  assert.deepEqual((await myRequests(sql, H)).map(x => x.id), [r.id]);
  assert.deepEqual(await myRequests(sql, I), []);
});

test("approved, then given from the stock: the item is theirs (waiting for their receipt), the request done", async () => {
  const { sql } = database;
  const [r] = await waitingRequests(sql, M);
  await refused(approve(sql, H, r!.id), "forbidden");
  const ok = await approve(sql, M, r!.id, "Ordered, arrives Friday");
  assert.equal(ok.status, "approved");
  assert.equal(chest.notifications.some(n => n.key === `request:${r!.id}`), false, "the managers' bell item went");
  const answer = chest.notifications.find(n => n.key === `request:${r!.id}:answer`);
  assert.equal(answer?.member, hugo.id);
  assert.equal(answer?.title, "Camille approved your request: A second charger for home");
  assert.equal(answer?.body, "Ordered, arrives Friday");
  await refused(approve(sql, M, r!.id), "not_open");
  assert.equal(chest.badges.get(sofia.id) ?? 0, 0, "approved is not waiting for an answer any more");
  const charger = await items.createItem(sql, M, { categoryId: of("accessory"), name: "USB-C charger 96 W" });
  const done = await fulfil(sql, M, r!.id, charger.id);
  assert.equal(done.status, "done");
  assert.equal(done.itemId, charger.id);
  const item = (await items.itemDetail(sql, M, charger.id));
  assert.equal(item.item.holder, hugo.id);
  assert.equal(item.receipt?.confirmedAt, null);
  // One word to Hugo, from the answer: no second "gave you" bell.
  assert.equal(chest.notifications.some(n => n.key === `item:${charger.id}:given`), false);
  assert.equal(chest.notifications.find(n => n.key === `request:${r!.id}:answer`)?.title, "Camille gave you USB-C charger 96 W for your request");
  await refused(fulfil(sql, M, r!.id, charger.id), "not_open");
});

test("refused with a reason; cancelled by the one who asked; at most 10 waiting per person", async () => {
  const { sql } = database;
  const a = await ask(sql, I, { body: "Un écran 32 pouces" });
  const refusedOne = await refuse(sql, M, a.id, "Les écrans de 27 pouces suffisent");
  assert.equal(refusedOne.status, "refused");
  assert.equal(refusedOne.answer, "Les écrans de 27 pouces suffisent");
  assert.equal(shownTo(chest.notifications.find(n => n.key === `request:${a.id}:answer`)!, "fr").title, "Camille a refusé votre demande : Un écran 32 pouces");
  const b = await ask(sql, I, { body: "Un casque" });
  await refused(cancel(sql, H, b.id), "not_found");
  assert.equal((await cancel(sql, I, b.id)).status, "cancelled");
  await refused(cancel(sql, I, b.id), "not_open");
  for (let k = 0; k < 10; k++) await ask(sql, L, { body: `Thing ${k}` });
  await refused(ask(sql, L, { body: "One more" }), "too_many");
});

test("a request answered with supplies (one handed out) or a licence seat", async () => {
  const { sql } = database;
  const cables = await items.createItem(sql, M, { categoryId: of("consumable"), name: "HDMI cable 2 m", quantity: "5", minQuantity: "2" });
  const r1 = await ask(sql, H, { body: "An HDMI cable" });
  await fulfil(sql, M, r1.id, cables.id);
  assert.equal((await items.itemDetail(sql, M, cables.id)).item.quantity, 4);
  const figma = await items.createItem(sql, M, { categoryId: of("licence"), name: "Figma", seats: "2" });
  const r2 = await ask(sql, H, { body: "Figma, for the mock-ups" });
  await fulfil(sql, M, r2.id, figma.id);
  assert.equal((await items.itemDetail(sql, M, figma.id)).item.seatsUsed, 1);
  const counts = await categoryCounts(sql, M);
  assert.equal(counts.find(c => c.key === "consumable")!.inStock, 4);
});

test("someone who leaves: what they asked for is cancelled, the managers' bell items go", async () => {
  const { sql } = database;
  const waiting = (await waitingRequests(sql, M)).filter(r => r.member === lea.id);
  assert.equal(waiting.length, 10);
  chest.members.splice(chest.members.findIndex(m => m.id === lea.id), 1);
  chest.former.push({ id: lea.id, name: "Léa Dubois" });
  assert.equal(await chest.emit({ type: "member.removed", id: "evt_" + "r".repeat(26), data: { id: lea.id } }, onEvent), 204);
  assert.equal((await waitingRequests(sql, M)).filter(r => r.member === lea.id).length, 0);
  for (const r of waiting) assert.equal(chest.notifications.some(n => n.key === `request:${r.id}`), false);
});
