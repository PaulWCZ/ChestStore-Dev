import assert from "node:assert/strict";
import { test } from "node:test";
import { ChestError } from "../../src/errors.js";
import * as officialNotifications from "../../src/notifications.js";
import * as notifications from "../notifications.js";
import { fakeChest, shownTo } from "../testing.js";

// The studio's notifications (proposals announced for 0.5): translations on
// a notice — notify accepts them — and broadcast(notice, {to, except}).
// A member without a language (Cy) reads the Chest's.

const ada = { id: "mbr_" + "a".repeat(26), firstName: "Ada", lastName: "L", name: "Ada L", photo: null, role: "reader", isAdmin: false, isBuilder: false, groups: ["grp_" + "o".repeat(26)], language: "fr", timeZone: "Europe/Paris" };
const bo = { id: "mbr_" + "b".repeat(26), firstName: "Bo", lastName: "K", name: "Bo K", photo: null, role: "publisher", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" };
const cy = { id: "mbr_" + "c".repeat(26), firstName: "Cy", lastName: "M", name: "Cy M", photo: null, role: "reader", isAdmin: false, isBuilder: false, groups: [] };
const code = (c: string) => (e: unknown) => e instanceof ChestError && e.code === c;

test("notify takes translations: the Chest keeps them with the notice, each member sees their language", async () => {
  const fake = await fakeChest({ members: [ada, bo], capabilities: ["notifications"] });
  try {
    const delivered = await notifications.notify([ada.id, bo.id, "mbr_" + "z".repeat(26)], {
      title: "Camille assigned you “Order oak”", body: "Due Friday", path: "/chest/tasks/42", key: "task:42:assigned",
      translations: { fr: { title: "Camille vous a confié « Commander le chêne »", body: "Pour vendredi" } },
    });
    assert.deepEqual(delivered, { delivered: [ada.id, bo.id], skipped: ["mbr_" + "z".repeat(26)] });
    assert.deepEqual(fake.notifications.map(n => [n.member, n.title, n.translations?.fr?.title]), [
      [ada.id, "Camille assigned you “Order oak”", "Camille vous a confié « Commander le chêne »"],
      [bo.id, "Camille assigned you “Order oak”", "Camille vous a confié « Commander le chêne »"],
    ]);
    assert.deepEqual(shownTo(fake.notifications[0]!, ada.language), { title: "Camille vous a confié « Commander le chêne »", body: "Pour vendredi" });
    assert.deepEqual(shownTo(fake.notifications[1]!, bo.language), { title: "Camille assigned you “Order oak”", body: "Due Friday" });
    assert.deepEqual(shownTo(fake.notifications[0]!, "de-CH"), { title: "Camille assigned you “Order oak”", body: "Due Friday" }, "a language without a translation reads English");
    // The same key replaces (translations too); without translations notify is 0.4.1's.
    await notifications.notify([ada.id], { title: "Reassigned", path: "/chest/tasks/42", key: "task:42:assigned" });
    const now = fake.notifications.filter(n => n.member === ada.id);
    assert.deepEqual(now.map(n => [n.title, n.translations]), [["Reassigned", undefined]]);
    // Refusals before sending: a language the store does not speak, English as a translation, bad words.
    await assert.rejects(notifications.notify([ada.id], { title: "x", translations: { de: { title: "y" } } as never }), code("invalid_body"));
    await assert.rejects(notifications.notify([ada.id], { title: "x", translations: { en: { title: "y" } } as never }), code("invalid_body"));
    await assert.rejects(notifications.notify([ada.id], { title: "x", translations: { fr: { title: "" } } }), code("invalid_title"));
    await assert.rejects(notifications.notify([ada.id], { title: "x", translations: { fr: { title: "y", body: "z".repeat(281) } } }), code("invalid_text"));
    await assert.rejects(notifications.notify([ada.id], { title: "x", translations: { fr: { title: "y", extra: 1 } } as never }), code("invalid_body"));
    await assert.rejects(notifications.notify([], { title: "x", translations: { fr: { title: "y" } } }), code("invalid_body"));
    await assert.rejects(notifications.notify(["ada"], { title: "x", translations: { fr: { title: "y" } } }), code("invalid_id"));
    // The fake Chest refuses bad translations too (a tool that bypassed the SDK).
    const raw = await fetch(process.env["CHEST_API"] + "/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ members: [ada.id], title: "x", translations: { fr: { title: "" } } }) });
    assert.deepEqual([raw.status, await raw.json()], [400, { error: "invalid_title" }]);
    // Everything else of the module is 0.4.1's.
    assert.equal(notifications.withdraw, officialNotifications.withdraw);
    assert.equal(notifications.badge, officialNotifications.badge);
  } finally {
    await fake.close();
  }
});

test("broadcast(notice, {to, except}): everyone who has the tool, or some roles or groups, translations kept, once per key", async () => {
  const fake = await fakeChest({ members: [ada, bo, cy], capabilities: ["notifications"] });
  try {
    const notice = { title: "We move on 2 November", path: "/chest/posts/4", key: "post:4", translations: { fr: { title: "Nous déménageons le 2 novembre", body: "Lisez le détail." } } };
    assert.deepEqual(await notifications.broadcast(notice), { delivered: 3 });
    assert.deepEqual(fake.notifications.map(n => [n.member.slice(4, 5), n.title, n.path, n.key]), [["a", "We move on 2 November", "/chest/posts/4", "post:4"], ["b", "We move on 2 November", "/chest/posts/4", "post:4"], ["c", "We move on 2 November", "/chest/posts/4", "post:4"]]);
    assert.deepEqual(fake.notifications.map(n => shownTo(n, fake.members.find(m => m.id === n.member)!.language).title), ["Nous déménageons le 2 novembre", "We move on 2 November", "We move on 2 November"]);
    // The same key replaces, it does not add.
    await notifications.broadcast(notice);
    assert.equal(fake.notifications.length, 3);
    assert.deepEqual(await notifications.broadcast({ title: "Publishers only" }, { to: { roles: ["publisher"] } }), { delivered: 1 });
    assert.deepEqual(await notifications.broadcast({ title: "Not Bo" }, { except: [bo.id] }), { delivered: 2 });
    assert.deepEqual(await notifications.broadcast({ title: "Not Bo, from a set" }, { except: new Set([bo.id, bo.id]) }), { delivered: 2 });
    assert.deepEqual(await notifications.broadcast({ title: "The office group" }, { to: { groups: ["grp_" + "o".repeat(26)] } }), { delivered: 1 });
    assert.deepEqual(await notifications.broadcast({ title: "Readers or office" }, { to: { roles: ["reader"], groups: ["grp_" + "o".repeat(26)] } }), { delivered: 2 });
    assert.equal(fake.notifications.find(n => n.title === "Publishers only")?.translations, undefined);
    // No fixed cap on members: an except of 2,000 identifiers goes.
    const many = Array.from({ length: 2000 }, (_, i) => "mbr_" + i.toString(32).padStart(26, "k").replace(/[0189]/gu, "q"));
    assert.deepEqual(await notifications.broadcast({ title: "Almost nobody left out" }, { except: many }), { delivered: 3 });
  } finally {
    await fake.close();
  }
});

test("broadcast refuses the earlier shape and bad audiences before sending", async () => {
  const fake = await fakeChest({ members: [ada], capabilities: ["notifications"] });
  try {
    await assert.rejects(notifications.broadcast({ messages: { en: { title: "Old shape" } } } as never), (e: unknown) => code("invalid_body")(e) && /replaced broadcast\(\{messages/u.test((e as Error).message));
    await assert.rejects(notifications.broadcast({ title: "x", to: { roles: ["reader"] } } as never), code("invalid_body"));
    await assert.rejects(notifications.broadcast({ title: "" }), code("invalid_title"));
    await assert.rejects(notifications.broadcast({ title: "x", path: "/elsewhere" }), code("invalid_path"));
    await assert.rejects(notifications.broadcast({ title: "x", key: "Not A Key" }), code("invalid_key"));
    await assert.rejects(notifications.broadcast({ title: "x" }, { to: { groups: ["sales"] } }), code("invalid_body"));
    await assert.rejects(notifications.broadcast({ title: "x" }, { to: { roles: ["Bad Role"] } }), code("invalid_body"));
    await assert.rejects(notifications.broadcast({ title: "x" }, { except: ["ada"] }), code("invalid_id"));
    await assert.rejects(notifications.broadcast({ title: "x" }, { except: "mbr_" + "a".repeat(26) } as never), code("invalid_body"));
    await assert.rejects(notifications.broadcast({ title: "x" }, { everyone: true } as never), code("invalid_body"));
    // A to that names nobody is refused, never read as everyone (a setting left undefined).
    await assert.rejects(notifications.broadcast({ title: "x" }, { to: {} }), code("invalid_body"));
    await assert.rejects(notifications.broadcast({ title: "x" }, { to: { groups: undefined } } as never), code("invalid_body"));
    const raw = await fetch(process.env["CHEST_API"] + "/notifications/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "x", to: {} }) });
    assert.deepEqual([raw.status, await raw.json()], [400, { error: "invalid_body" }]);
    await assert.rejects(notifications.broadcast({ title: "x", translations: { fr: { title: "" } } }), code("invalid_title"));
    assert.equal(fake.notifications.length, 0);
  } finally {
    await fake.close();
  }
});

test("broadcast to a group: one the tool does not know tells nobody; with members.groups, every group", async () => {
  const sales = { id: "grp_" + "s".repeat(26), name: "Sales", members: [ada.id], grants: false };
  const without = await fakeChest({ members: [ada, bo], groups: [sales], capabilities: ["notifications", "members"] });
  try {
    assert.deepEqual(await notifications.broadcast({ title: "Sales" }, { to: { groups: [sales.id] } }), { delivered: 0 }, "Sales does not give the tool");
    assert.deepEqual(await notifications.broadcast({ title: "Sales or publishers" }, { to: { groups: [sales.id], roles: ["publisher"] } }), { delivered: 1 });
  } finally {
    await without.close();
  }
  const withGroups = await fakeChest({ members: [ada, bo], groups: [sales], capabilities: ["notifications", "members", "members.groups"] });
  try {
    assert.deepEqual(await notifications.broadcast({ title: "Sales" }, { to: { groups: [sales.id] } }), { delivered: 1 });
    assert.equal(withGroups.notifications[0]?.member, ada.id);
  } finally {
    await withGroups.close();
  }
});

test("broadcast on a Chest without it is a refusal the tool can fall back from", async () => {
  const fake = await fakeChest({ members: [], capabilities: ["notifications"], broadcast: false });
  try {
    await assert.rejects(notifications.broadcast({ title: "Hello" }), (e: unknown) => e instanceof ChestError);
  } finally {
    await fake.close();
  }
});
