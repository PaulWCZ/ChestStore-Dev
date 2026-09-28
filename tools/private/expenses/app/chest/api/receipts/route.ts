import { db } from "../../../../lib/db.ts";
import { failure, asker, refuse } from "../../../../lib/http.ts";
import { grant } from "../../../../lib/receipts.ts";

// Authorises one receipt upload from the member's browser to the Chest:
// the tool names the object; the browser PUTs the file to the answer's url,
// then saves the expense with the object's name (the save checks it
// arrived: lib/receipts.ts inspect).
export async function POST(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const body = (await request.json().catch(() => ({}))) as { type?: unknown; size?: unknown };
    return Response.json(await grant(db(), who.actor, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
