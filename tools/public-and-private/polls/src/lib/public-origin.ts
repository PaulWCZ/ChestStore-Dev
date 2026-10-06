import { chest } from "@argentic/chest-sdk/chest";

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
