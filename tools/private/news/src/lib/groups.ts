import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, intl, plural } from "../i18n/index.ts";

// The Chest's groups a post may be kept to, by name. With the "groups"
// permission (Proposal (studio): "groups": "read") News sees every group of
// the Chest — Sales, Tech, the workshop — even when News is open to
// everyone; without it, only the groups that give News (the Chest shows a
// tool no other group). "unavailable" when the Chest could not be asked.
export type Group = { id: string; name: string; size: number | null };

// Kept a minute (the SDK's advice), per Chest API (tests start many).
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;

// fresh: ask the Chest now (a group checked before a post is kept to it).
export async function chestGroups(options: { fresh?: boolean } = {}): Promise<Group[] | "unavailable"> {
  if (!options.fresh && cached && cached.api === process.env["CHEST_API"] && Date.now() - cached.at < 60_000) return cached.groups;
  let groups: Group[];
  try {
    groups = (await members.groups.all()).map(g => ({ id: g.id, name: g.name, size: g.size }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (!(error instanceof CapabilityNotGranted)) return "unavailable";
    try {
      groups = (await members.groups.list()).map(g => ({ id: g.id, name: g.name, size: g.members.length }));
    } catch (inner) {
      if (!(inner instanceof ChestError)) throw inner;
      return "unavailable";
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  cached = { at: Date.now(), api: process.env["CHEST_API"], groups };
  return groups;
}

// forgetGroups: a group changed or was removed, or someone moved between
// groups (events): read them again.
export function forgetGroups(): void {
  cached = null;
  ofMember.clear();
  listed = null;
}

// Who is in which group. A member's `groups` as the Chest asserts them
// (member(request), members.*) are only the groups that *give* News, 16 at
// most (SDK 0.3.0) — none for News open to everyone. A post kept to Sales
// needs every group of each reader: with the "groups" permission they are
// asked of the Chest — members.groups.of(id) for the person signed in, and
// for a list of readers every group's members (one call per group, not per
// person). Without the permission or an answer, the member's own groups
// (0.3.0's). Kept a minute, as the groups.
type Kept<T> = { at: number; api: string | undefined; value: T };
const fresh = <T>(kept: Kept<T> | null | undefined): kept is Kept<T> => !!kept && kept.api === process.env["CHEST_API"] && Date.now() - kept.at < 60_000;
const ofMember = new Map<string, Kept<string[] | null>>();
let listed: Kept<Map<string, string[]> | null> | null = null;

export async function withGroups<T extends { id: string; groups: string[] }>(who: T): Promise<T> {
  let kept = ofMember.get(who.id);
  if (!fresh(kept)) {
    let value: string[] | null;
    try {
      value = await members.groups.of(who.id);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      value = null;
    }
    kept = { at: Date.now(), api: process.env["CHEST_API"], value };
    ofMember.set(who.id, kept);
  }
  return kept.value ? { ...who, groups: [...new Set([...who.groups, ...kept.value])] } : who;
}

// Each member's groups, from every group's members; null without the
// permission or an answer.
async function directory(): Promise<Map<string, string[]> | null> {
  if (fresh(listed)) return listed.value;
  let value: Map<string, string[]> | null = new Map();
  try {
    for (const g of await members.groups.all()) {
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        const answer = await members.groups.members(g.id, { limit: 1000, ...(after ? { after } : {}) });
        if (!answer) break;
        for (const id of answer.members) value.set(id, [...(value.get(id) ?? []), g.id]);
        if (!answer.next) break;
        after = answer.next;
      }
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    value = null;
  }
  listed = { at: Date.now(), api: process.env["CHEST_API"], value };
  return value;
}

// These people with every group they are in.
export async function withAllGroups<T extends { id: string; groups: string[] }>(people: T[]): Promise<T[]> {
  if (people.length === 0) return people;
  const found = await directory();
  if (!found) return people;
  return people.map(p => (found.has(p.id) ? { ...p, groups: [...new Set([...p.groups, ...found.get(p.id)!])] } : p));
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
  return new Intl.ListFormat(intl(locale), { type: "conjunction" }).format(written);
}

