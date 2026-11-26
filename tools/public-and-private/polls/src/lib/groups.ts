import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";

// The Chest's groups, by name (adapted from the store's News tool). With
// the capability "members.groups" (SDK 0.7.0) Polls sees every group of the
// Chest — Sales, Tech, the workshop — even when Polls is open to everyone:
// a poll may ask one of them, and an anonymous survey's results may be read
// per group (lib/teams.ts). With it, the Chest names every group a member
// is in (member(request).groups, members.list's groups), so a member's
// groups are read from the Chest's own answers, never asked again. Without
// it, only the groups that give Polls (the Chest shows a tool no other
// group). Null when the Chest could not be asked.
export type Group = { id: string; name: string; size: number };

// Kept a minute (the SDK's advice), per Chest API (tests start many). The
// Chest pages its groups (no count bounds a company): every page is read,
// up to maxGroupPages of 500.
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;
const maxGroupPages = 40;

export async function chestGroups(options: { fresh?: boolean } = {}): Promise<Group[] | null> {
  if (!options.fresh && cached && cached.api === process.env["CHEST_API"] && Date.now() - cached.at < 60_000) return cached.groups;
  const groups: Group[] = [];
  try {
    let after: string | undefined;
    for (let i = 0; i < maxGroupPages; i++) {
      const page = await members.groups.list({ limit: 500, ...(after ? { after } : {}) });
      groups.push(...page.groups.map(g => ({ id: g.id, name: g.name, size: g.size })));
      if (!page.next) break;
      after = page.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  cached = { at: Date.now(), api: process.env["CHEST_API"], groups };
  return groups;
}

// forgetGroups: someone moved between groups (member.updated): names and
// sizes are read again, and theirs when the Chest could not carry them
// (overage). A renamed group is read at the next minute.
export function forgetGroups(memberId?: string): void {
  cached = null;
  if (memberId) overage.delete(memberId);
}

// groupMembers: who is in each of these groups now (among those who have
// Polls: members.list({group})), to tell a group inside another one apart
// (lib/teams.ts). Null when the Chest cannot say for one of them.
export async function groupMembers(ids: readonly string[]): Promise<Map<string, Set<string>> | null> {
  const out = new Map<string, Set<string>>();
  try {
    for (const id of ids) {
      const found = new Set<string>();
      let after: string | undefined;
      for (let i = 0; i < 20; i++) {
        const page = await members.list({ group: id, limit: 500, ...(after ? { after } : {}) });
        for (const m of page.members) found.add(m.id);
        if (!page.next) break;
        after = page.next;
      }
      out.set(id, found);
    }
    return out;
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}

// A member's groups. The request's assertion carries them, except for a
// member in more groups than it can hold (about 150: groups is null, SDK
// 0.7.0's "groups overage"): those are read once from the Chest
// (members.get), kept a minute per member — createApp's complete() calls it
// on each /chest request, so every rule below reads a full list. Where the
// Chest cannot answer, "in no group" (the safe answer: a poll to a group is
// not shown, rather than shown to the wrong person).
const overage = new Map<string, { at: number; groups: string[] }>();
export async function completeGroups(who: Member): Promise<Member> {
  if (who.groups !== null) return who;
  const kept = overage.get(who.id);
  if (kept && Date.now() - kept.at < 60_000) return { ...who, groups: kept.groups };
  let groups: string[] = [];
  try {
    groups = (await members.get(who.id))?.groups ?? [];
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { ...who, groups: [] };
  }
  if (overage.size > 1000) overage.clear();
  overage.set(who.id, { at: Date.now(), groups });
  return { ...who, groups };
}

// groupsOf: the groups to test a rule against ("is she in Sales?"): none
// when they were not completed.
export const groupsOf = (who: { groups: readonly string[] | null }): readonly string[] => who.groups ?? [];
