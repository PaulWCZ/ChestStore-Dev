import { chest } from "@argentic/chest-sdk/chest";

// The public part's address, for the answer links in emails and on the
// team's pages: the Chest's word only (SDK 0.4: chest.tool.publicUrl — the
// company's own domain once connected, quotes.acme.com, else the public
// host), without its last slash. Null outside a Chest (it throws there),
// where no link can be given: the member is told the address is not known.
export function publicOrigin(): string | null {
  try {
    return chest.tool.publicUrl?.replace(/\/$/u, "") ?? null;
  } catch {
    return null;
  }
}

// A quote's answer link, as its client receives it (null when the public
// address is not known).
export function answerUrl(secret: string): string | null {
  const origin = publicOrigin();
  return origin ? `${origin}/q/${secret}` : null;
}
