import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted } from "../../src/errors.js";
import * as events from "../events.js";
import { member, type Member } from "../member.js";
import * as members from "../members.js";
import { fakeChest, withMember } from "../testing.js";

const gid = (name: string) => "grp_" + name + "a".repeat(26 - name.length);
const mid = (name: string) => "mbr_" + name + "a".repeat(26 - name.length);
const person = (name: string, groups: string[]): Member => ({ id: mid(name), firstName: name, lastName: "X", name: name + " X", photo: null, role: null, isAdmin: false, isBuilder: false, groups, language: "en", timeZone: "Europe/Paris" });
// A tool open to everyone: no group gives it, as News or Polls usually are.
const sales = { id: gid("sales"), name: "Sales", members: [mid("ines"), mid("hugo"), mid("gone")], grants: false };
const tech = { id: gid("tech"), name: "Tech", members: [mid("lea")], grants: false };
const office = { id: gid("office"), name: "Office", members: [mid("camille")] };
const ines = person("ines", [sales.id]), hugo = person("hugo", [sales.id]), lea = person("lea", [tech.id]), camille = person("camille", [office.id]);

test("without \"members.groups\", a tool sees only the groups that give it (and a member's among them)", async () => {
  const chest = await fakeChest({ members: [ines, hugo, lea, camille], groups: [sales, tech, office], capabilities: ["members"] });
  try {
    assert.deepEqual((await members.groups.list()).map(g => g.name), ["Office"]);
    assert.deepEqual((await members.get(ines.id))?.groups, [], "Sales does not give the tool: unseen");
    assert.deepEqual((await members.get(camille.id))?.groups, [office.id]);
    assert.deepEqual((await members.list({ group: sales.id })).members, [], "a group that does not give the tool lists nobody");
    assert.deepEqual((await members.list({ group: office.id })).members.map(m => m.id), [camille.id]);
    await assert.rejects(members.groups.all(), CapabilityNotGranted);
    // The assertion agrees with the members API: a group that does not give
    // the tool is never in member(request).groups.
    const signed = (who: Member) => member(withMember(new Request("http://tool.test/chest"), who))?.groups;
    assert.deepEqual(signed(ines), []);
    assert.deepEqual(signed(camille), [office.id]);
    assert.deepEqual(signed({ ...ines, groups: [sales.id, office.id] }), [office.id]);
  } finally {
    await chest.close();
  }
  // Without a fake running, a test's member is signed as given.
  assert.deepEqual(member(withMember(new Request("http://tool.test/chest"), ines, { token: "t".repeat(43), tool: "tool" })), null, "no CHEST_TOKEN: nobody");
});

test("with \"members.groups\" (the 0.5 names): member.groups and members.*.groups carry every group, members.list({group}) any group, groups.all() every group", async () => {
  const chest = await fakeChest({ members: [ines, hugo, lea, camille], groups: [sales, tech, office], capabilities: ["members", "members.groups"] });
  try {
    assert.deepEqual(await members.groups.all(), [
      { id: office.id, name: "Office", size: 1 },
      { id: sales.id, name: "Sales", size: 2 },
      { id: tech.id, name: "Tech", size: 1 },
    ], "by name; the member without the tool is not counted");
    assert.deepEqual((await members.list({ group: sales.id })).members.map(m => m.id), [hugo.id, ines.id]);
    assert.deepEqual((await members.list({ group: sales.id, limit: 1 })).members.map(m => m.id), [hugo.id]);
    assert.deepEqual((await members.get(ines.id))?.groups, [sales.id]);
    assert.deepEqual(member(withMember(new Request("http://tool.test/chest"), ines))?.groups, [sales.id]);
    assert.deepEqual(member(withMember(new Request("http://tool.test/chest"), { ...ines, groups: [sales.id, office.id] }))?.groups, [sales.id, office.id]);
    // 0.4.1's groups.list() keeps its meaning: the groups that give the tool.
    assert.deepEqual((await members.groups.list()).map(g => g.name), ["Office"]);
    // What the proposal no longer has (studio.5): of and members.
    assert.equal("of" in members.groups, false);
    assert.equal("members" in members.groups, false);
  } finally {
    await chest.close();
  }
});

test("no fixed cap on groups: groups.all() lists 600 groups; 0.4.1's member() still reads 16 groups at most (official code, lifted in 0.5)", async () => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const many = Array.from({ length: 600 }, (_, i) => ({ id: gid("m" + letters[i % 26]! + letters[Math.floor(i / 26) % 26]!), name: `Team ${String(i).padStart(3, "0")}`, members: [ines.id], grants: false }));
  const chest = await fakeChest({ members: [ines], groups: many, capabilities: ["members", "members.groups"] });
  try {
    const all = await members.groups.all();
    assert.equal(all.length, 600);
    assert.equal(all[0]?.name, "Team 000");
    const groupsOf = (n: number) => many.slice(0, n).map(g => g.id);
    assert.equal(member(withMember(new Request("http://tool.test/chest"), person("many", groupsOf(16))))?.groups.length, 16);
    assert.equal(member(withMember(new Request("http://tool.test/chest"), person("many", groupsOf(17)))), null, "0.4.1's member() refuses more than 16 groups: reported in the SDK report");
  } finally {
    await chest.close();
  }
});

test("group events: a group renamed, changing members, or deleted, verified and handed once", async () => {
  const chest = await fakeChest({ members: [ines], groups: [sales], capabilities: ["members", "members.groups"], receives: ["member.*", "group.*"] });
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
