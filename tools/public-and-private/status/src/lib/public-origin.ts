import { chest } from "@argentic/chest-sdk/chest";

// The public part's address, for every link that leaves the tool — the
// public page in an email, a feed, the API's shortlinks, the banner, the
// heartbeat addresses an editor copies. The Chest's own word (SDK 0.4:
// chest.tool.publicUrl): the company's own domain once its owner connected
// one (https://status.acme.com), else the Chest's public host.
//
// Outside a Chest (chest.tool throws there: a unit test, a harness that
// does not set CHEST_PUBLIC_URL) it is derived from the request, as before
// 0.4: the team host is <tool>-chest.<chest>, the public one <tool>.<chest>.
// null when neither says.
export function chestPublicUrl(): string | null | undefined {
  try {
    const given = chest.tool.publicUrl;
    return given ? given.replace(/\/+$/u, "") : null;
  } catch {
    return undefined;
  }
}

export function publicOrigin(headers: Headers | null, tool = process.env["CHEST_TOOL"] ?? "status"): string | null {
  const given = chestPublicUrl();
  if (given !== undefined) return given;
  if (!headers) return null;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const team = tool + "-chest.";
  return `${proto}://${host.startsWith(team) ? tool + "." + host.slice(team.length) : host}`;
}
