import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale, Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { andList, catalogue, plural } from "../i18n/index.ts";

// The Chest's groups a post may be kept to, by name. With the capability
// "members.groups" (SDK 0.7.0) News sees every group of the Chest — Sales,
// Tech, the workshop — even when News is open to everyone, and the Chest
// names every group a member is in (member(request).groups, members.*'s
// groups): a reader's groups come with them, never asked again. Without
// it, only the groups that give News (the Chest shows a tool no other
// group). "unavailable" when the Chest could not be asked.
export type Group = { id: string; name: string; size: number | null };

// Kept a minute (the SDK's advice), per Chest API (tests start many). The
// Chest pages its groups (no count bounds a company): every page is read,
// up to maxGroupPages of 500.
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;
const maxGroupPages = 40;

// fresh: ask the Chest now (a group checked before a post is kept to it).
export async function chestGroups(options: { fresh?: boolean } = {}): Promise<Group[] | "unavailable"> {
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
    return "unavailable";
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  cached = { at: Date.now(), api: process.env["CHEST_API"], groups };
  return groups;
}

// forgetGroups: someone moved between groups (member.updated): read them
// again. SDK 0.7.0 sends no group events: a renamed group is read again
// within the minute.
export function forgetGroups(): void {
  cached = null;
}

// A member's groups. The request's assertion carries them, except for a
// member in more groups than it can hold (about 150: groups is null, SDK
// 0.7.0's "groups overage"): those are read from the Chest (members.get),
// kept a minute per member — createApp's complete() calls it on each
// /chest request, so every rule reads a full list. Where the Chest cannot
// answer, "in no group" (the safe answer: a post kept to a group is not
// shown, rather than shown to the wrong person).
const overage = new Map<string, { at: number; groups: string[] }>();
export async function completeGroups(who: Member): Promise<Member> {
  if (who.groups !== null) return who;
  const kept = overage.get(who.id);
  if (kept && Date.now() - kept.at < 60_000) return { ...who, groups: kept.groups };
  let groups: string[];
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

// groupNames names the groups of posts for a page: a group the Chest no
// longer has is left to the catalogue's words.
export async function groupNames(): Promise<Map<string, string>> {
  const list = await chestGroups();
  return new Map(list === "unavailable" ? [] : list.map(g => [g.id, g.name]));
}

// audienceLabel writes a post's audience for a reader: "Sales and Tech",
// "Sales and 2 people", "3 people"; null for everyone.
export function audienceLabel(audience: { groups: readonly string[]; people: readonly string[] }, names: Map<string, string>, locale: Locale): string | null {
  if (audience.groups.length === 0 && audience.people.length === 0) return null;
  const t = catalogue(locale);
  const written = [...new Set(audience.groups.map(g => names.get(g) ?? t.front.formerGroup))];
  if (audience.people.length > 0) written.push(plural(t.front.people, audience.people.length, locale));
  return andList(written, locale);
}

