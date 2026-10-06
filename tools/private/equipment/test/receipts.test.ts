import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { initials } from "@argentic/chest-ui/components/logic";
import { AppError } from "@argentic/chest-app";
import { listCategories } from "../src/lib/categories.ts";
import * as items from "../src/lib/items.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { confirm, currentCharter, handoverSheet, leftOnOf, remind, returnSheet, setCharter } from "../src/lib/receipts.ts";
import { remindReceipt } from "../src/lib/tell.ts";
import { unconfirmedReceipts } from "../src/lib/items.ts";
import { catalogue } from "../src/i18n/index.ts";
import { charterText } from "../src/shared/words.ts";
import { plainName } from "../src/lib/people.ts";
import { onEvent, onSchedule } from "../src/lib/deliveries.ts";
import { addField } from "../src/lib/fields.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let laptops: string, phones: string;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
  const cats = await listCategories(database.sql, asMember(camille));
  laptops = cats.find(c => c.key === "laptop")!.id;
  phones = cats.find(c => c.key === "phone")!.id;
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
};
const M = asMember(camille), S = asMember(sofia), H = asMember(hugo), I = asMember(ines);

test("given to Hugo, it waits for his “I received it”; his tile counts it; confirmed, the managers see when", async () => {
  const { sql } = database;
  const mac = await items.createItem(sql, M, { categoryId: laptops, name: "MacBook Pro 14", serial: "C02-RCPT" });
  await items.give(sql, M, mac.id, { to: { member: hugo.id }, note: "New, in its box" });
  const mine = await items.mine(sql, H);
  const receipt = mine.receipts.get(mac.id)!;
  assert.equal(receipt.confirmedAt, null);
  assert.equal(receipt.condition, "New, in its box");
  assert.equal(receipt.givenBy, camille.id);
  assert.equal(chest.badges.get(hugo.id), 1);
  // The bell leads to My equipment.
  assert.equal(chest.notifications.find(n => n.member === hugo.id && n.key === `item:${mac.id}:given`)?.path, "/chest/mine");

  // Only the holder confirms; someone else's is not theirs to see.
  await refused(confirm(sql, I, mac.id), "not_found");
  await refused(confirm(sql, M, mac.id), "not_yours");
  const done = await confirm(sql, H, mac.id);
  assert.ok(done.confirmedAt);
  await refused(confirm(sql, H, mac.id), "already_confirmed");
  assert.equal(chest.badges.has(hugo.id), false);
  assert.equal(chest.notifications.some(n => n.member === hugo.id && n.key === `item:${mac.id}:given`), false);

  const detail = await items.itemDetail(sql, M, mac.id);
  assert.ok(detail.full);
  assert.ok(detail.receipt?.confirmedAt);
  assert.equal(detail.history[0]!.kind, "received");
  assert.equal(detail.history[0]!.actor, hugo.id);
  // The member sees their own receipt on the short page.
  const brief = await items.itemDetail(sql, H, mac.id);
  assert.equal(brief.full, false);
  assert.ok(brief.receipt?.confirmedAt);
});

test("a remark when confirming reaches the managers; the rules in force must be the ones read", async () => {
  const { sql } = database;
  await refused(setCharter(sql, H, "Rules"), "forbidden");
  const charter = await setCharter(sql, M, "The equipment stays the company’s.\nReport a loss the same day.");
  assert.ok(charter);
  const phone = await items.createItem(sql, M, { categoryId: phones, name: "iPhone 15", serial: "F2L-RCPT" });
  await items.give(sql, S, phone.id, { to: { member: ines.id } });
  await refused(confirm(sql, I, phone.id, { remark: "x" }), "charter_changed");
  await refused(confirm(sql, I, phone.id, { charterId: "999" }), "charter_changed");
  const r = await confirm(sql, I, phone.id, { remark: "Small scratch on the back", charterId: charter.id });
  assert.equal(r.remark, "Small scratch on the back");
  assert.equal(r.charterId, charter.id);
  const told = chest.notifications.filter(n => n.key === `remark:${phone.id}`);
  assert.deepEqual(told.map(n => n.member).sort(), [camille.id, sofia.id].sort());
  // Saving the same text again is no new version; clearing it ends the rules.
  assert.equal((await setCharter(sql, M, "The equipment stays the company’s.\nReport a loss the same day."))?.id, charter.id);
  assert.equal(await setCharter(sql, M, ""), null);
  assert.equal(await currentCharter(sql), null);
});

test("taken back, the receipt closes; Undo of the take-back makes it count again, as it was", async () => {
  const { sql } = database;
  const [mac] = await items.listItems(sql, M, { q: "C02-RCPT" });
  const back = await items.takeBack(sql, M, mac!.id, { note: "Fine" });
  assert.equal((await items.mine(sql, H)).receipts.has(mac!.id), false);
  await items.give(sql, M, mac!.id, { to: back.from }, { quiet: true });
  const again = (await items.mine(sql, H)).receipts.get(mac!.id);
  assert.ok(again?.confirmedAt, "still confirmed after the undo");
  // A transfer to someone else starts a new receipt for them.
  await items.give(sql, M, mac!.id, { to: { member: ines.id } });
  assert.equal((await items.mine(sql, I)).receipts.get(mac!.id)?.confirmedAt, null);
  assert.equal((await items.mine(sql, H)).receipts.has(mac!.id), false);
  // Take everything back closes it; its Undo brings it back, still waiting.
  const taken = await items.takeEverythingBack(sql, M, ines.id);
  assert.ok(taken.items.includes(mac!.id));
  assert.equal((await items.mine(sql, I)).receipts.has(mac!.id), false);
  await items.giveBackEverything(sql, M, ines.id, taken);
  assert.equal((await items.mine(sql, I)).receipts.get(mac!.id)?.confirmedAt, null);
  // A place gets no receipt.
  await items.give(sql, M, mac!.id, { to: { place: "Meeting room" } });
  assert.equal((await items.mine(sql, I)).receipts.has(mac!.id), false);
});

test("held without a receipt (imported, or older), it can still be confirmed", async () => {
  const { sql } = database;
  const phone = await items.createItem(sql, M, { categoryId: phones, name: "Old phone" });
  await items.give(sql, M, phone.id, { to: { member: hugo.id } });
  await sql`delete from receipts where item_id = ${phone.id}`;
  const r = await confirm(sql, H, phone.id);
  assert.ok(r.confirmedAt);
  assert.equal(r.givenBy, camille.id);
});

test("the handover sheet: items, serials and fields, given on and by, condition, receipt, rules; the return sheet", async () => {
  const { sql } = database;
  const imei = await addField(sql, M, { categoryId: phones, name: "IMEI", type: "text" });
  const phone = await items.createItem(sql, M, { categoryId: phones, name: "Pixel 8", serial: "PX-1", extra: { [imei.id]: "356938035643809" } });
  await items.give(sql, M, phone.id, { to: { member: hugo.id }, note: "With its case" });
  const sheet = await handoverSheet(sql, M, hugo.id);
  const line = sheet.lines.find(l => l.item.id === phone.id)!;
  assert.equal(line.item.serial, "PX-1");
  assert.deepEqual(line.fields, [{ name: "IMEI", key: null, value: "356938035643809" }]);
  assert.equal(line.condition, "With its case");
  assert.equal(line.givenBy, camille.id);
  assert.equal(line.confirmedAt, null);
  // Only the items named, and the person themself may print theirs.
  assert.deepEqual((await handoverSheet(sql, H, hugo.id, [phone.id])).lines.map(l => l.item.id), [phone.id]);
  await refused(handoverSheet(sql, I, hugo.id), "not_found");
  // Returned: it moves to the return sheet's first part, with its condition.
  await items.takeBack(sql, M, phone.id, { note: "Screen cracked", status: "in_repair" });
  const ret = await returnSheet(sql, M, hugo.id);
  const back = ret.returned.find(l => l.item.id === phone.id)!;
  assert.equal(back.returnCondition, "Screen cracked");
  assert.equal(back.status, "in_repair");
  assert.equal(back.condition, "With its case");
  assert.ok(ret.kept.every(l => l.item.id !== phone.id));
  assert.ok(ret.kept.length > 0, "what Hugo still holds is listed as not returned");
});

test("the example rules speak each reader's language; saved unchanged in French they stay the example; reworded, a new version", async () => {
  const { sql } = database;
  const en = catalogue("en"), fr = catalogue("fr");
  const example = await setCharter(sql, M, fr.settings.rulesExample);
  assert.ok(example?.example);
  assert.equal(example!.body, en.settings.rulesExample);
  assert.deepEqual([charterText(example!, fr), charterText(example!, en)], [fr.settings.rulesExample, en.settings.rulesExample]);
  assert.equal((await setCharter(sql, M, en.settings.rulesExample))!.id, example!.id);
  const own = await setCharter(sql, M, "Nos règles : prenez-en soin.");
  assert.deepEqual([own!.example, charterText(own!, en)], [false, "Nos règles : prenez-en soin."]);
  await setCharter(sql, M, "");
});

test("remind them: the holder hears it in the bell (the same item, rung again, with the day it was given), never by a mail of the tool; once a day; managers only", async () => {
  const { sql } = database;
  const phone = await items.createItem(sql, M, { categoryId: phones, name: "Pixel 7" });
  await items.give(sql, M, phone.id, { to: { member: hugo.id } });
  await refused(remind(sql, H, phone.id), "forbidden");
  chest.notifications.length = 0;
  const r = await remind(sql, M, phone.id);
  assert.deepEqual([r.holder, r.item.id], [hugo.id, phone.id]);
  await remindReceipt(M!, r.holder, r.item, r.givenOn);
  const bell = chest.notifications.filter(n => n.member === hugo.id);
  assert.equal(bell.length, 1);
  assert.equal(bell[0]!.title, `${camille.firstName} asks: did you receive Pixel 7 ${phone.tag}?`);
  assert.match(bell[0]!.body ?? "", /^Given on \d+ \S+ \d{4}\. Open My equipment/u);
  assert.equal(shownTo(bell[0]!, "fr").title, `${camille.firstName} vous demande : avez-vous reçu Pixel 7 ${phone.tag} ?`);
  assert.match(shownTo(bell[0]!, "fr").body ?? "", /^Remis le \d+ \S+ \d{4}\. Ouvrez Mon matériel/u);
  assert.equal(bell[0]!.path, "/chest/mine");
  assert.equal(bell[0]!.key, `item:${phone.id}:given`);
  // A member is told by the Chest (their own choice of mail), never by the tool.
  assert.equal(chest.outbox.length, 0);
  await refused(remind(sql, M, phone.id), "reminded_today");
  assert.equal((await unconfirmedReceipts(sql, M, "2999-01-01")).find(u => u.item.id === phone.id)?.remindedToday, true);
  await confirm(sql, H, phone.id);
  await sql`update receipts set reminded_at = null where item_id = ${phone.id}`;
  await refused(remind(sql, M, phone.id), "already_confirmed");
});

test("a sheet writes a person who left by their name, with the day they left apart", async () => {
  const { sql } = database;
  const key = await items.createItem(sql, M, { categoryId: laptops, name: "Spare laptop" });
  await items.give(sql, M, key.id, { to: { member: sofia.id } });
  assert.equal(await leftOnOf(sql, M, sofia.id), null);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: sofia.id } }, onEvent), 204);
  const left = await leftOnOf(sql, M, sofia.id);
  assert.ok(left instanceof Date);
  await refused(leftOnOf(sql, H, sofia.id), "not_found");
  assert.equal(plainName({ id: sofia.id, name: "Sofia Rossi", photo: null, status: "former", locale: "en" }, "fr"), "Sofia Rossi");
});

test("an erasure keeps the receipts, without the person", async () => {
  const { sql } = database;
  await erase(sql, ines.id);
  const rows = await sql<{ member_id: string }[]>`select member_id from receipts where member_id = ${ines.id}`;
  assert.equal(rows.length, 0);
  assert.ok((await sql`select 1 from receipts where member_id = 'erased'`).length > 0);
});

// The avatars are the kit's: its initials() (fed by this tool's rule) must
// keep giving a former member their own initials.
test("initials leave out the note after a former member's name (HB, never HM)", () => {
  assert.equal(initials("Hugo Bernard (former member)"), "HB");
  assert.equal(initials("Hugo Bernard (ancien membre)"), "HB");
  assert.equal(initials("Hugo Bernard"), "HB");
  assert.equal(initials("Former member"), "FM");
  assert.equal(initials("Cher"), "C");
  assert.equal(initials(""), "·");
});
