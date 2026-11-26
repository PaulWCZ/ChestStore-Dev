import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";

// The careers page's address, as the Chest gives it (chest.tool.publicUrl):
// the company's own domain once connected (careers.acme.com), else the
// tool's public host. Every link the tool writes for someone outside —
// in an email, a feed, a job's structured data, the link to choose an
// interview time — starts with it, whichever host the request came on.
// null outside a Chest (a script, a test without the fake Chest).
export function publicOrigin(): string | null {
  try {
    const url = chest.tool.publicUrl;
    return url ? url.replace(/\/+$/u, "") : null;
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}

// The team's address (chest.tool.teamUrl): a link in a member's email.
export function teamOrigin(): string | null {
  try {
    return chest.tool.teamUrl.replace(/\/+$/u, "");
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}
