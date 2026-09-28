import { can } from "./access.ts";
import { ensureHost, type Host } from "./booking.ts";
import { db } from "./db.ts";
import type { Viewer } from "./session.ts";

// The viewer's own booking page, made the first time a host opens the tool
// (its first type named in their language); null for someone who does not
// host (an administrator without the host's role never is: admins host).
export async function myPage(v: Viewer): Promise<Host | null> {
  if (!can(v.member, "host")) return null;
  return ensureHost(db(), v.member, { title: v.t.types.first, slug: v.t.types.firstSlug });
}
