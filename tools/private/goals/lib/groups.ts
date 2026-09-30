import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { readerOf, type Reader } from "./access.ts";

// Every group of the Chest a member is in. member(request).groups holds
// only the groups that give Goals (16 at most) — none when Goals is open to
// everyone, the usual case — so a team made from Sales would have nobody
// in it. With "groups": "read" (Proposal (studio)), members.groups.of says
// all of them. Without the permission, or when the Chest cannot be asked,
// the groups the assertion carries: a member then writes for a group's
// team only when that group gives Goals. Kept a minute per member, and
// forgotten when a group or a member changes (lib/lifecycle.ts).
const kept = new Map<string, { at: number; api: string | undefined; groups: readonly string[] }>();

export async function groupsOf(actor: Member): Promise<readonly string[]> {
  const api = process.env["CHEST_API"];
  const hit = kept.get(actor.id);
  if (hit && hit.api === api && Date.now() - hit.at < 60_000) return hit.groups;
  let groups: readonly string[];
  try {
    groups = (await members.groups.of(actor.id)) ?? [];
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    groups = actor.groups;
    if (!(error instanceof CapabilityNotGranted)) return groups; // unavailable: asked again next time
  }
  if (kept.size >= 5000) kept.clear();
  kept.set(actor.id, { at: Date.now(), api, groups });
  return groups;
}

export function forgetMemberGroups(): void {
  kept.clear();
}

// What this member may read of confidential objectives (lib/read.ts).
export async function readerFor(actor: Member): Promise<Reader> {
  return readerOf(actor, await groupsOf(actor));
}
