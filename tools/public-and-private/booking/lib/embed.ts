import { settings } from "./booking.ts";
import { db } from "./db.ts";

// The websites an administrator allowed to show the public pages in a
// frame (Settings), read for every public page's policy: kept for 30
// seconds in the process, so a page does not ask the database each time.
let cached: { at: number; origins: string[] } | null = null;

export async function embedOrigins(now = Date.now()): Promise<string[]> {
  if (cached && now - cached.at < 30_000) return cached.origins;
  try {
    cached = { at: now, origins: (await settings(db())).embedOrigins };
  } catch {
    // No database yet (a build, a Chest starting): nobody frames it.
    cached = { at: now, origins: [] };
  }
  return cached.origins;
}

// frameAncestors: nobody for the team's pages; the allowed websites for
// the public ones (none: nobody).
export function frameAncestors(origins: string[], team: boolean): string {
  return team || origins.length === 0 ? "frame-ancestors 'none'" : `frame-ancestors 'self' ${origins.join(" ")}`;
}
