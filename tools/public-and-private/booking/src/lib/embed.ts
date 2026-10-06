import { isOrigin } from "./booking.ts";
import { db, type Query } from "./db.ts";

// The websites an administrator allowed to show the public pages in a
// frame (Settings), read from the database for every public page's policy
// (proxy.ts), never kept in the process: Next.js runs proxy.ts in its own
// module instance, apart from the server actions, so a copy kept here could
// not be told of a change and a newly allowed website would be refused
// until it expired. One row by its key: as cheap as a query gets.
export async function embedOrigins(sql: Query = db()): Promise<string[]> {
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'embed_origins'`;
    const value = row?.value;
    return Array.isArray(value) ? value.filter((o): o is string => typeof o === "string" && isOrigin(o)) : [];
  } catch {
    // No database yet (a build, a Chest starting): nobody frames it.
    return [];
  }
}

// frameAncestors: nobody for the team's pages; the allowed websites for
// the public ones (none: nobody).
export function frameAncestors(origins: string[], team: boolean): string {
  return team || origins.length === 0 ? "frame-ancestors 'none'" : `frame-ancestors 'self' ${origins.join(" ")}`;
}
