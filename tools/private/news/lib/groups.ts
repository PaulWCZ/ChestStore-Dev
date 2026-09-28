import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { catalogue, intl } from "./i18n/index.ts";

// The Chest's groups a post may be kept to: those that give News (the
// Chest shows a tool only the groups that hold an access to it), by name.
// "unavailable" when the Chest could not be asked.
export type Group = { id: string; name: string };

export async function groupsOfTool(): Promise<Group[] | "unavailable"> {
  try {
    return (await members.groups.list()).map(g => ({ id: g.id, name: g.name })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return "unavailable";
  }
}

// groupNames names the groups of posts for a page: a group the Chest no
// longer lists (it stopped giving News) is left to the catalogue's words.
export async function groupNames(): Promise<Map<string, string>> {
  const list = await groupsOfTool();
  return new Map(list === "unavailable" ? [] : list.map(g => [g.id, g.name]));
}

// audienceLabel writes a post's groups for a reader: "Sales and Tech".
export function audienceLabel(groups: readonly string[], names: Map<string, string>, locale: Locale): string | null {
  if (groups.length === 0) return null;
  const t = catalogue(locale);
  const written = [...new Set(groups.map(g => names.get(g) ?? t.front.formerGroup))];
  return new Intl.ListFormat(intl(locale), { type: "conjunction" }).format(written);
}
