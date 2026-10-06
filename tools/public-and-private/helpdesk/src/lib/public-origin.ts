import { chest } from "@argentic/chest-sdk/chest";
import * as visitors from "@argentic/chest-sdk/visitors";

// The public host's address, for the follow-up links in emails and on the
// team's pages. The Chest's own word first (SDK 0.4: chest.tool.publicUrl,
// the company's own domain once connected — support.acme.com —, else the
// public host); outside a Chest (it throws there), derived from a request
// on either host (the team host is <tool>-chest.<chest>, the public one
// <tool>.<chest>).
export function publicOrigin(headers: Headers, tool = process.env["CHEST_TOOL"] ?? ""): string | null {
  const given = chestPublicUrl();
  if (given) return given;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const team = tool + "-chest.";
  return `${proto}://${host.startsWith(team) ? tool + "." + host.slice(team.length) : host}`;
}

// The Chest's public address of the tool, without its last slash; null
// outside a Chest (chest.tool throws there) or without a public part.
function chestPublicUrl(): string | null {
  try {
    return chest.tool.publicUrl?.replace(/\/$/u, "") ?? null;
  } catch {
    return null;
  }
}

// The team host's address, for a link to a ticket outside a page (a
// notice to Slack); null outside a Chest.
export function teamOrigin(): string | null {
  try {
    return chest.tool.teamUrl.replace(/\/$/u, "");
  } catch {
    return null;
  }
}

// visitorKey is what the form's own counters know of a visitor: the
// address the Chest's front saw (Proposal (studio): Chest-Visitor-Address,
// read by visitors.address()), else "unknown" — then every visitor counts
// together, under the counters' ceiling for everyone (lib/tickets.ts,
// guard). Never X-Forwarded-For: the Chest adds none, so it is whatever
// the visitor wrote.
export function visitorKey(headers: Headers): string {
  return visitors.address(headers)?.slice(0, 64) ?? "unknown";
}

// The start of a link to the public part, outside a request (an email
// received, an event from Forms): the Chest's word, else the last address
// seen.
export function publicBase(remembered: string | null): string {
  return chestPublicUrl() ?? remembered ?? "";
}
