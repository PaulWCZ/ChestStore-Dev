import { chest } from "@argentic/chest-sdk/chest";

// The address people reach the wiki at (the Chest's team host), for the
// links an export writes back to it: the Chest says it (SDK 0.4:
// chest.tool.teamUrl, read per request). Outside a Chest, the request's
// own origin.
export function origin(request: Request): string {
  try {
    return chest.tool.teamUrl;
  } catch {
    return new URL(request.url).origin;
  }
}
