import { chest } from "@argentic/chest-sdk/chest";

// The public part's address, for the follow-up links in emails and on the
// team's pages: the Chest's word only (SDK 0.4: chest.tool.publicUrl — the
// company's own domain once connected, support.acme.com, else the public
// host), without its last slash; null outside a Chest (it throws there),
// where links are paths of the tool.
export function publicOrigin(): string | null {
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

// A follow-up link (its secret is shown once), as a customer receives it.
export const followUpLink = (secret: string) => `${publicOrigin() ?? ""}/t/${secret}`;
