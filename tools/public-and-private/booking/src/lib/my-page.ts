import type { MemberContext } from "@argentic/chest-app";
import { catalogue, locales } from "../i18n/index.ts";
import { can } from "./access.ts";
import { ensureHost, type Host } from "./booking.ts";
import { db } from "./db.ts";

// The viewer's own booking page, made the first time a host opens the tool
// (its first type named in their language), not public until they
// connect a calendar or confirm their hours; null for someone who does not
// host (an administrator without the host's role never is: admins host).
export async function myPage(v: Pick<MemberContext, "member" | "locale" | "t">): Promise<Host | null> {
  if (!can(v.member, "host")) return null;
  // The first type's name in every language: ready for a second one.
  const others = Object.fromEntries(locales.filter(l => l !== v.locale).map(l => [l, catalogue(l).types.first]));
  return ensureHost(db(), v.member, { title: v.t.types.first, slug: v.t.types.firstSlug, others });
}
