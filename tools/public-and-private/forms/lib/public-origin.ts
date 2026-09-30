import { chest } from "@argentic/chest-sdk/chest";

// The tool's two addresses, for the links people share. The Chest gives
// them (Proposal (studio): chest.publicUrl, chest.teamUrl); without
// them, they are derived from the request: the team host is
// <tool>-chest.<chest>, the public one <tool>.<chest>.
function host(headers: Headers): { proto: string; host: string } | null {
  const h = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(h)) return null;
  return { proto: headers.get("x-forwarded-proto") === "http" ? "http" : "https", host: h };
}

export function publicOrigin(headers: Headers, tool = process.env["CHEST_TOOL"] ?? ""): string | null {
  const given = chest.publicUrl;
  if (given) return given;
  const found = host(headers);
  if (!found) return null;
  const team = tool + "-chest.";
  return `${found.proto}://${found.host.startsWith(team) ? tool + "." + found.host.slice(team.length) : found.host}`;
}

export function teamOrigin(headers: Headers): string | null {
  const given = chest.teamUrl;
  if (given) return given;
  const found = host(headers);
  return found ? `${found.proto}://${found.host}` : null;
}

// The link to share for a form.
export function formLink(headers: Headers, form: { slug: string; audience: "public" | "team" }): string {
  return form.audience === "public" ? `${publicOrigin(headers) ?? ""}/${form.slug}` : `${teamOrigin(headers) ?? ""}/chest/f/${form.slug}`;
}
