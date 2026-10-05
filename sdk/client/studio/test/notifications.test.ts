import assert from "node:assert/strict";
import { test } from "node:test";
import { ChestError } from "../../src/errors.js";
import * as notifications from "../notifications.js";
import { fakeChest } from "../testing.js";

// notifications.broadcast (Proposal (studio), not in 0.3.0). Ported from
// 0.3.0-studio.16's notifications.test.ts, whose official part is now
// 0.3.0's own. A member without a language (Cy) reads the Chest's.

test("broadcast (Proposal (studio)): everyone who has the tool, or some roles or groups, each in their language, once per key", async () => {
  const people = [
    { id: "mbr_" + "a".repeat(26), firstName: "Ada", lastName: "L", name: "Ada L", photo: null, role: "reader", isAdmin: false, isBuilder: false, groups: ["grp_" + "o".repeat(26)], language: "fr", timeZone: "Europe/Paris" },
    { id: "mbr_" + "b".repeat(26), firstName: "Bo", lastName: "K", name: "Bo K", photo: null, role: "publisher", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" },
    { id: "mbr_" + "c".repeat(26), firstName: "Cy", lastName: "M", name: "Cy M", photo: null, role: "reader", isAdmin: false, isBuilder: false, groups: [] },
  ];
  const fake = await fakeChest({ members: people, capabilities: ["notifications"] });
  try {
    const messages = { en: { title: "We move on 2 November" }, fr: { title: "Nous déménageons le 2 novembre", body: "Lisez le détail." } };
    assert.deepEqual(await notifications.broadcast({ messages, path: "/chest/posts/4", key: "post:4" }), { delivered: 3 });
    assert.deepEqual(fake.notifications.map((n: { member: string; title: string }) => [n.member.slice(4, 5), n.title]), [["a", "Nous déménageons le 2 novembre"], ["b", "We move on 2 November"], ["c", "We move on 2 November"]]);
    // The same key replaces, it does not add.
    await notifications.broadcast({ messages, path: "/chest/posts/4", key: "post:4" });
    assert.equal(fake.notifications.length, 3);
    assert.deepEqual(await notifications.broadcast({ messages: { en: { title: "Publishers only" } }, to: { roles: ["publisher"] } }), { delivered: 1 });
    assert.deepEqual(await notifications.broadcast({ messages: { en: { title: "Not Bo" } }, except: ["mbr_" + "b".repeat(26)] }), { delivered: 2 });
    assert.deepEqual(await notifications.broadcast({ messages: { en: { title: "The office group" } }, to: { groups: ["grp_" + "o".repeat(26)] } }), { delivered: 1 });
    await assert.rejects(notifications.broadcast({ messages: { fr: { title: "Sans anglais" } } } as never), (e: unknown) => e instanceof ChestError && e.code === "invalid_body");
    await assert.rejects(notifications.broadcast({ messages: { en: { title: "" } } }), (e: unknown) => e instanceof ChestError && e.code === "invalid_title");
  } finally {
    await fake.close();
  }
});

test("broadcast on a Chest without it is a refusal the tool can fall back from", async () => {
  const fake = await fakeChest({ members: [], capabilities: ["notifications"], broadcast: false });
  try {
    await assert.rejects(notifications.broadcast({ messages: { en: { title: "Hello" } } }), (e: unknown) => e instanceof ChestError);
  } finally {
    await fake.close();
  }
});
