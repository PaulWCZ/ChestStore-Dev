import { chest } from "@argentic/chest-sdk/chest";

// The tool's two addresses, for the links people share and the links a
// bell item, an email or a web address carries: the Chest's word only
// (chest.tool.publicUrl — the company's own domain once connected, else the
// public host — and chest.tool.teamUrl), read at each request, never from a
// request's Host (anyone may write one). Outside a Chest (a test without
// the fake), none: a link is then the path alone.
export function publicOrigin(): string | null {
  try {
    return chest.tool.publicUrl;
  } catch {
    return null;
  }
}

export function teamOrigin(): string | null {
  try {
    return chest.tool.teamUrl;
  } catch {
    return null;
  }
}

// The link to share for a form.
export function formLink(form: { slug: string; audience: "public" | "team" }): string {
  return form.audience === "public" ? `${publicOrigin() ?? ""}/${form.slug}` : `${teamOrigin() ?? ""}/chest/f/${form.slug}`;
}

// The company's name as the Chest gives it (the respondents answer the
// company, never "the Chest"); "" outside a Chest.
export function companyName(): string {
  try {
    return chest.organization.name;
  } catch {
    return "";
  }
}
