import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { groupMembers, groups } from "../src/lib/directory.ts";
import { everyone, fakeGroups, groups as ids, hugo, ines } from "./support/members.ts";

// The team calendar's filter by group. Leave open to everyone gets no
// group from the Chest: with the capability "members.groups" it sees them
// all; without, only the groups that give it.
test("open to everyone, with members.groups: every group, and who is in it", async () => {
  const chest = await fakeChest({ network: {}, members: everyone, groups: fakeGroups.map(g => ({ ...g, grants: false })), capabilities: ["members", "notifications", "members.groups"] });
  try {
    assert.deepEqual((await groups()).map(g => g.name).sort(), ["Office", "Sales", "Tech"]);
    assert.deepEqual((await groupMembers(ids.sales))?.sort(), [hugo.id, ines.id].sort());
    assert.equal(await groupMembers("grp_nosuchaaaaaaaaaaaaaaaaaaaaa"), null);
  } finally {
    await chest.close();
  }
});

test("without members.groups: only the groups that give Leave — none when it is open to everyone", async () => {
  let chest = await fakeChest({ network: {}, members: everyone, groups: fakeGroups.map(g => ({ ...g, grants: false })) });
  try {
    assert.deepEqual(await groups(), []);
    // A group that does not give Leave: nobody in it, as far as Leave sees.
    assert.deepEqual(await groupMembers(ids.sales), []);
  } finally {
    await chest.close();
  }
  chest = await fakeChest({ network: {}, members: everyone, groups: fakeGroups });
  try {
    assert.deepEqual((await groups()).map(g => g.name).sort(), ["Office", "Sales", "Tech"]);
    assert.deepEqual((await groupMembers(ids.sales))?.sort(), [hugo.id, ines.id].sort());
  } finally {
    await chest.close();
  }
});
