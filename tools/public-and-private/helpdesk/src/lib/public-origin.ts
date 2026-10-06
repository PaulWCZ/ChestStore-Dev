import { chest } from "@argentic/chest-sdk/chest";

// The public host's address: the Chest gives it (chest.publicUrl,
// Proposal (studio)); without, derived from a request on either host (the
// team host is <tool>-chest.<chest>, the public one <tool>.<chest>), and
// the last one seen remembered for emails written outside a request.
export function publicOrigin(headers: Headers, tool = process.env["CHEST_TOOL"] ?? ""): string | null {
  const given = chest.publicUrl;
  if (given) return given;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const team = tool + "-chest.";
  return `${proto}://${host.startsWith(team) ? tool + "." + host.slice(team.length) : host}`;
}

// visitorKey is what the form's counters know of a visitor: the first
// address of X-Forwarded-For (set by the Chest's front), else nothing.
export function visitorKey(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim().slice(0, 64) || "unknown";
}

// The start of a link to the public part, outside a request (an email
// received): the Chest's word, else the last address seen.
export function publicBase(remembered: string | null): string {
  return chest.publicUrl ?? remembered ?? "";
}
