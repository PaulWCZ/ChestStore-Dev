import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import type { Member } from "@argentic/chest-sdk/member";
import { readerOf, type Reader } from "./access.ts";

// Every group of the Chest a member is in. With the capability
// "members.groups" (official since SDK 0.5, chest.json), member(request).groups
// holds every group of the Chest the member is in — Sales, Tech — even when
// Goals is open to everyone, the usual case. Without it (a Chest that has
// not approved it yet), the groups that give Goals: a member then writes
// for a group's team only when that group gives Goals. A member in more
// groups than an assertion carries (about 150) comes with groups null: read
// from the Chest then (members.get); none when it cannot say.
export async function groupsOf(actor: Member): Promise<readonly string[]> {
  if (actor.groups !== null) return actor.groups;
  try {
    return (await members.get(actor.id))?.groups ?? [];
  } catch (error) {
    if (error instanceof ChestError) return [];
    throw error;
  }
}

// What this member may read of confidential objectives (lib/read.ts).
export async function readerFor(actor: Member): Promise<Reader> {
  return readerOf(actor, await groupsOf(actor));
}
