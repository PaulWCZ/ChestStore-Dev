import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, intl, plural } from "./i18n/index.ts";

// The Chest's groups a post may be kept to, by name. With the "groups"
// permission (Proposal (studio): "groups": "read") News sees every group of
// the Chest — Sales, Tech, the workshop — even when News is open to
// everyone; without it, only the groups that give News (the Chest shows a
// tool no other group). "unavailable" when the Chest could not be asked.
export type Group = { id: string; name: string; size: number | null };

// Kept a minute (the SDK's advice), per Chest API (tests start many).
let cached: { at: number; api: string | undefined; groups: Group[] } | null = null;

export async function chestGroups(): Promise<Group[] | "unavailable"> {
  if (cached && cached.api === process.env["CHEST_API"] && Date.now() - cached.at < 60_000) return cached.groups;
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

// forgetGroups: a group changed or was removed (events): read them again.
export function forgetGroups(): void {
  cached = null;
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

