import { failure, asker, refuse } from "../../../../lib/http.ts";
import { grantLogo } from "../../../../lib/logo.ts";

// Authorises one upload of the company's logo from the admin's browser to
// the Chest; the browser PUTs the file, then saves it (actions.saveLogo,
// which checks what arrived).
export async function POST(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const body = (await request.json().catch(() => ({}))) as { type?: unknown; size?: unknown };
    return Response.json(await grantLogo(who.actor, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
