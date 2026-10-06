import { chest } from "@argentic/chest-sdk/chest";
import * as visitors from "@argentic/chest-sdk/visitors";

// The public host's address — for the guest link an organiser copies, and
// the link in a guest's email. The Chest's own word first (SDK 0.4:
// chest.tool.publicUrl, the company's own domain once connected, else the
// public host); outside a Chest (it throws there), derived from the
// request as Booking does (lib/public-origin.ts, the studio's, MIT): the
// team host is <tool>-chest.<chest>, the public one <tool>.<chest>.
export function publicOrigin(headers: Headers, tool = process.env["CHEST_TOOL"] ?? "polls"): string | null {
  try {
    const given = chest.tool.publicUrl;
    if (given) return given.replace(/\/$/u, "");
  } catch {
    // Not in a Chest: the request says.
  }
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const team = tool + "-chest.";
  return `${proto}://${host.startsWith(team) ? tool + "." + host.slice(team.length) : host}`;
}

// visitorKey is what the guest form's own counters know of a visitor: the
// address the Chest's front saw (Proposal (studio): Chest-Visitor-Address,
// read by visitors.address()), else "unknown" — then every visitor counts
// together, under the counters' ceiling for everyone. Never
// X-Forwarded-For: the Chest adds none, so it is whatever the visitor
// wrote.
export function visitorKey(headers: Headers): string {
  return visitors.address(headers)?.slice(0, 64) ?? "unknown";
}
