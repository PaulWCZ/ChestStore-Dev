import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted, ChestError } from "../src/errors.js";
import * as events from "../src/events.js";
import { member, type Member } from "../src/member.js";
import * as members from "../src/members.js";
import { fakeChest, withMember } from "../src/testing.js";

const gid = (name: string) => "grp_" + name + "a".repeat(26 - name.length);
const mid = (name: string) => "mbr_" + name + "a".repeat(26 - name.length);
const person = (name: string, groups: string[]): Member => ({ id: mid(name), firstName: name, lastName: "X", name: name + " X", photo: null, role: null, isAdmin: false, isBuilder: false, groups, locale: "en" });
// A tool open to everyone: no group gives it, as News or Polls usually are.
const sales = { id: gid("sales"), name: "Sales", members: [mid("ines"), mid("hugo"), mid("gone")], grants: false };
const tech = { id: gid("tech"), name: "Tech", members: [mid("lea")], grants: false };
const office = { id: gid("office"), name: "Office", members: [mid("camille")] };
const ines = person("ines", [sales.id]), hugo = person("hugo", [sales.id]), lea = person("lea", [tech.id]), camille = person("camille", [office.id]);

test("without \"groups\", a tool sees only the groups that give it (and a member's among them)", async () => {
  const chest = await fakeChest({ members: [ines, hugo, lea, camille], groups: [sales, tech, office], capabilities: ["members"] });
  try {
    assert.deepEqual((await members.groups.list()).map(g => g.name), ["Office"]);
    assert.deepEqual((await members.get(ines.id))?.groups, [], "Sales does not give the tool: unseen");
    assert.deepEqual((await members.get(camille.id))?.groups, [office.id]);
    await assert.rejects(members.groups.all(), CapabilityNotGranted);
    await assert.rejects(members.groups.members(sales.id), CapabilityNotGranted);
  } finally {
    await chest.close();
  }
});

test("with \"groups\": every group of the Chest, who is in one among those who have the tool, all of a member's groups", async () => {
  const chest = await fakeChest({ members: [ines, hugo, lea, camille], groups: [sales, tech, office], capabilities: ["members", "groups"] });
  try {
    assert.deepEqual(await members.groups.all(), [
      { id: office.id, name: "Office", size: 1 },
      { id: sales.id, name: "Sales", size: 2 },
      { id: tech.id, name: "Tech", size: 1 },
    ], "by name; the member without the tool is not counted");
    assert.deepEqual(await members.groups.members(sales.id), { members: [hugo.id, ines.id], next: null });
    const paged = await members.groups.members(sales.id, { limit: 1 });
    assert.deepEqual(paged, { members: [hugo.id], next: hugo.id });
    assert.deepEqual(await members.groups.members(sales.id, { after: paged!.next!, limit: 1 }), { members: [ines.id], next: null });
    assert.equal(await members.groups.members(gid("nothing")), null, "a group the Chest does not have");
    await assert.rejects(members.groups.members("sales"), (e: unknown) => e instanceof ChestError && e.code === "invalid_id");
    assert.deepEqual((await members.get(ines.id))?.groups, [sales.id], "all of a member's groups");
    assert.deepEqual((await members.list({ group: sales.id })).members.map(m => m.id), [hugo.id, ines.id]);
    // The assertion carries what the Chest gives: up to 64 groups.
    const many = person("many", Array.from({ length: 40 }, (_, i) => gid("g" + "abcdefghijklmnopqrstuvwxyz"[i % 26]! + "bc"[Math.floor(i / 26)]!)));
    assert.equal(member(withMember(new Request("http://tool.test/chest"), many))?.groups.length, 40);
  } finally {
    await chest.close();
  }
});

test("group events: a group renamed, changing members, or deleted, verified and handed once", async () => {
  const chest = await fakeChest({ members: [ines], groups: [sales], capabilities: ["members", "groups"], receives: ["member.*", "group.*"] });
  try {
    const told: string[] = [];
    const app = async (request: Request) => new Response(null, { status: await events.handle(request, {
      "group.changed": e => { told.push(`${e.data.id}:${e.data.changed.join("+")}`); },
      "group.removed": e => { told.push(`${e.data.id}:removed`); },
      "member.updated": e => { told.push(`${e.data.id}:${e.data.changed.join("+")}`); },
    }) });
    assert.equal(await chest.emit({ type: "group.changed", data: { id: sales.id, changed: ["members"] } }, app), 204);
    assert.equal(await chest.emit({ type: "member.updated", data: { id: ines.id, changed: ["groups"] } }, app), 204);
    assert.equal(await chest.emit({ type: "group.changed", data: { id: sales.id, changed: ["name", "members"] } }, app), 204);
    assert.equal(await chest.emit({ type: "group.removed", data: { id: sales.id }, id: "evt_" + "b".repeat(26) }, app), 204);
    assert.equal(await chest.emit({ type: "group.removed", data: { id: sales.id }, id: "evt_" + "b".repeat(26) }, app), 204, "the same event again");
    assert.deepEqual(told, [`${sales.id}:members`, `${ines.id}:groups`, `${sales.id}:name+members`, `${sales.id}:removed`]);
    // A group event naming a member, or an unknown change, is not the Chest's shape.
    const bad = await chest.emit({ type: "group.changed", data: { id: ines.id, changed: ["members"] } } as never, request => events.verify(request).then(e => new Response(null, { status: e ? 204 : 400 })));
    assert.equal(bad, 400);
  } finally {
    await chest.close();
  }
});
