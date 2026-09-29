import * as chest from "@argentic/chest-sdk/chest";

// The public host's address, from a request on either host — for the
// guest link an organiser copies, and the link in a guest's email. The
// team host is <tool>-chest.<chest>, the public one <tool>.<chest>
// (reference: Chest addresses). The Chest's own word first (Proposal
// (studio): chest.publicUrl()); else derived from the request, as Booking
// does (lib/public-origin.ts, the studio's, MIT).
export function publicOrigin(headers: Headers, tool = process.env["CHEST_TOOL"] ?? "polls"): string | null {
  const given = chest.publicUrl();
  if (given) return given;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const team = tool + "-chest.";
  return `${proto}://${host.startsWith(team) ? tool + "." + host.slice(team.length) : host}`;
}

// visitorKey is what the guest form's own counters know of a visitor: the
// first address of X-Forwarded-For (set by the Chest's front), else nothing.
export function visitorKey(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim().slice(0, 64) || "unknown";
}
