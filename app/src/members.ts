import * as members from "@argentic/chest-sdk/members";
import { fill } from "./i18n.ts";

// The names of the member ids a page shows, resolved when it renders
// (names change; tables keep ids). Someone the tool no longer has keeps a
// name that says so. Needs "capabilities": ["members"].
export type PeopleWords = { readonly former: string; readonly noAccess: string; readonly erased: string };
export async function names(ids: Iterable<string>, words: PeopleWords): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)].filter(id => id.startsWith("mbr_"));
  const found = new Map<string, string>([["erased", words.erased]]);
  if (wanted.length === 0) return found;
  const { members: current, former } = await members.lookup(wanted);
  for (const m of current) found.set(m.id, m.name);
  for (const f of former) found.set(f.id, f.status === "erased" || !f.name ? words.erased : fill(f.status === "no_access" ? words.noAccess : words.former, { name: f.name }));
  return found;
}
