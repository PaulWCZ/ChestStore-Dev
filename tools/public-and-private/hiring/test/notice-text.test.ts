import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, shownTo, type FakeChest } from "@argentic/chest-sdk/testing";
import { cut, cutLines, notify } from "../src/lib/notify.ts";
import { camille, everyone } from "./support/members.ts";

// French typography carries no-break spaces on purpose: U+00A0 before « : »
// in an amount (« 20,50 € », « 85 % ») and inside guillemets, U+202F (the
// narrow one) before « : ». A notice keeps them, and keeps the line breaks
// of its body (the Chest shows them); only ordinary white space folds.
const nb = "\u00a0";
const thin = "\u202f";
const fr = { title: `Note «${nb}Déplacement${nb}» :  20,50${nb}€`, body: `Budget${thin}: 85${nb}%\r\n   Reste${thin}:\t20,50${nb}€  \n\n\n«${nb}À valider${nb}»` };
const en = { title: "Expense “Travel”: €20.50", body: "Budget: 85%\nLeft: €20.50" };

test("cut keeps the French no-break spaces and folds the rest; cutLines keeps a body's line breaks", () => {
  assert.equal(cut(fr.title, 80), `Note «${nb}Déplacement${nb}» : 20,50${nb}€`);
  assert.equal(cut(`budget${thin}: 85${nb}%\nsuite`, 80), `budget${thin}: 85${nb}% suite`, "a title is one line");
  assert.equal(cutLines(fr.body, 280), `Budget${thin}: 85${nb}%\nReste${thin}: 20,50${nb}€\n«${nb}À valider${nb}»`);
  assert.equal(cutLines(`${"é".repeat(10)}\n${"a".repeat(10)}`, 15), `${"é".repeat(10)}\naaa…`, "counted in characters, the line break included");
  assert.equal(cutLines(" \n \t\n", 280), "");
});

let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "notifications"] });
});
after(async () => {
  await chest.close();
});

test("a French notice reaches the Chest with its no-break spaces and its line breaks", async () => {
  await notify([camille.id], (_t, locale) => (locale === "fr" ? fr : en), { path: "/chest", key: "typography" });
  const sent = chest.notifications.find(n => n.key === "typography");
  assert.ok(sent);
  assert.deepEqual(shownTo(sent, "fr"), { title: `Note «${nb}Déplacement${nb}» : 20,50${nb}€`, body: `Budget${thin}: 85${nb}%\nReste${thin}: 20,50${nb}€\n«${nb}À valider${nb}»` });
  assert.deepEqual(shownTo(sent, "en"), en);
});
