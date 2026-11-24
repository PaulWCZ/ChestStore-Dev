import { chest } from "@argentic/chest-sdk/chest";
import * as visitors from "@argentic/chest-sdk/visitors";

// The Chest's own addresses of the tool (SDK 0.4: chest.tool): the team
// host, and the public one — the company's own domain once connected, else
// the public host. Null outside a Chest (they throw there: a test without a
// fake, a build) — never read at a module's top level.
export function chestPublicUrl(): string | null {
  try {
    return chest.tool.publicUrl?.replace(/\/$/u, "") ?? null;
  } catch {
    return null;
  }
}
export function chestTeamUrl(): string | null {
  try {
    return chest.tool.teamUrl.replace(/\/$/u, "");
  } catch {
    return null;
  }
}

// The public host's address, from a request on either host: the Chest's
// own word first; outside a Chest, derived from the request — the team host
// is <tool>-chest.<chest>, the public one <tool>.<chest> (reference: Chest
// addresses). The last one seen is remembered for emails written outside a
// request (a schedule; lib/booking.ts rememberPublicOrigin).
export function publicOrigin(headers: Headers, tool = process.env["CHEST_TOOL"] ?? ""): string | null {
  const given = chestPublicUrl();
  if (given) return given;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const team = tool + "-chest.";
  return `${proto}://${host.startsWith(team) ? tool + "." + host.slice(team.length) : host}`;
}

// visitorKey is what the form's own counters know of a visitor: the Chest's
// opaque key for them (Proposal (studio): Chest-Visitor, an HMAC of their
// address under a key only the Chest holds, read by visitors.visitor()),
// else "unknown" — then every visitor counts together, under the counters'
// ceiling for everyone and the database's daily cap (lib/booking.ts guard).
// Never the address itself, never X-Forwarded-For: the Chest adds none, so
// it is whatever the visitor wrote. (On a 0.7.0 Chest, which sets no such
// header, every visitor is "unknown": README "Needs from the SDK".)
export function visitorKey(headers: Headers): string {
  return visitors.visitor(headers);
}
