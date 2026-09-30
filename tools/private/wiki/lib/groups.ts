import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { spaceAccess, type SpaceAudience } from "./access.ts";
import { orList } from "./i18n/format.ts";

// The Chest's groups the wiki offers — for a space kept to some of them,
// edited by some of them, or asked to confirm a page — by name. With the
// "groups" permission (Proposal (studio): "groups": "read", as News) the
// wiki sees every group of the Chest (Sales, Tech, the warehouse) even
// when it is open to everyone; without it, only the groups that give the
// wiki (the usual wiki, open to all, then has none). Without an answer
// from the Chest, none: the page still works. Kept a minute (the SDK's
// advice), per Chest API (the tests start many).
export type Group = { id: string; name: string };
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;

export async function companyGroups(): Promise<Group[]> {
  if (cached && cached.api === process.env["CHEST_API"] && Date.now() - cached.at < 60_000) return cached.groups;
  let groups: Group[];
  try {
    groups = (await members.groups.all()).map(g => ({ id: g.id, name: g.name }));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (!(error instanceof CapabilityNotGranted)) return [];
    try {
      groups = (await members.groups.list()).map(g => ({ id: g.id, name: g.name }));
    } catch (inner) {
      if (!(inner instanceof ChestError)) throw inner;
      return [];
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  cached = { at: Date.now(), api: process.env["CHEST_API"], groups };
  return groups;
}

// A group changed or was removed, or someone moved between groups
// (events): read them again.
export function forgetGroups(): void {
  cached = null;
  ofMember.clear();
  listed = null;
}

// Who is in which group. A member's `groups` as the Chest asserts them
// (member(request), members.*) are only the groups that *give* the wiki,
// 16 at most (SDK 0.3.0) — none for a wiki open to everyone. A space kept
// to Sales, or a page to confirm by Tech, needs every group of the member:
// with the "groups" permission they are asked of the Chest —
// members.groups.of(id) for the person signed in, and for a list of people
// every group's members (one call per group, not per person). Without the
// permission or an answer, the member's own groups (0.3.0's). Kept a
// minute, as the groups.
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

// The members who have the wiki (with a role, or none), by name: all of
// them, or those of one role, each with every group they are in. Without
// an answer from the Chest, none.
export async function membersOfTool(options: { role?: string } = {}): Promise<Member[]> {
  const found: Member[] = [];
  try {
    let after: string | undefined;
    do {
      const page = await members.list({ limit: 500, ...(options.role ? { role: options.role } : {}), ...(after ? { after } : {}) });
      found.push(...page.members);
      after = page.next ?? undefined;
    } while (after && found.length < 5000);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return withAllGroups(found);
}

// The people who have the editor role (the only ones a space can name as
// its editors), by name.
export async function editorsOfTool(): Promise<{ id: string; name: string }[]> {
  return (await membersOfTool({ role: "editor" })).map(m => ({ id: m.id, name: m.name }));
}

// Who a reader may ask to write: the editors who write the whole wiki, or
// one space (its editors when it names some), by name — at most three, the
// Chest's administrators last (they are rarely the ones to ask). Without
// an answer from the Chest, none (the page says it without names).
export async function whoWrites(space?: SpaceAudience): Promise<{ names: string[]; more: boolean }> {
  const writers = (await membersOfTool({ role: "editor" })).filter(m => !space || spaceAccess(m, space) === "write");
  writers.sort((a, b) => Number(a.isAdmin) - Number(b.isAdmin) || a.name.localeCompare(b.name));
  return { names: writers.slice(0, 3).map(m => m.name), more: writers.length > 3 };
}

// askWhom writes those names as a reader reads them ("Camille Martin, Tom
// Walker or another editor"), or null when the Chest named nobody.
export async function askWhom(locale: string, another: string, space?: SpaceAudience): Promise<string | null> {
  const { names, more } = await whoWrites(space);
  if (names.length === 0) return null;
  return orList(more ? [...names, another] : names, locale);
}
