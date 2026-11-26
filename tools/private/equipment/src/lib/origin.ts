import { chest } from "@argentic/chest-sdk/chest";

// The address of the tool's team host, for links that leave the page (the
// QR code of a label): the Chest's own (chest.tool.teamUrl). Outside a
// Chest (a test without the fake, a server started by hand) it throws:
// then the host the request came to.
export function teamOrigin(request: Request): string {
  try {
    return chest.tool.teamUrl;
  } catch {
    return new URL(request.url).origin;
  }
}
