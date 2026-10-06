import type { Member } from "@argentic/chest-sdk/member";
import { readerOf, type Reader } from "./access.ts";

// Every group of the Chest a member is in. With the capability
// "members.groups" (Proposal (studio), the name announced for the official
// 0.5; chest.proposals.json "capabilities"), member(request).groups holds
// every group of the Chest the member is in — Sales, Tech — even when Goals
// is open to everyone, the usual case. Without it (a Chest that has not
// approved it yet), the groups that give Goals: a member then writes for a
// group's team only when that group gives Goals. Known limit of the official
// 0.4.1: an assertion naming more than 16 groups is refused (the member is
// not read); 0.5 lifts it.
export async function groupsOf(actor: Member): Promise<readonly string[]> {
  return actor.groups;
}

// What this member may read of confidential objectives (lib/read.ts).
export async function readerFor(actor: Member): Promise<Reader> {
  return readerOf(actor, await groupsOf(actor));
}
