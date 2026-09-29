import { hostTimes } from "../../../../lib/booking.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { viewer } from "../../../../lib/session.ts";

// The free times a host sees when booking for a guest (?type=) or moving a
// meeting (?except=<booking>): the type's rules, the notice aside. Behind
// the Chest's sign-in; the service checks the right.
export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  const v = await viewer();
  if (!v) return new Response(JSON.stringify({ error: "forbidden" }), { status: 401, headers });
  const q = new URL(request.url).searchParams;
  try {
    const slots = await hostTimes(db(), v.member, q.get("type"), q.get("from") ?? "", q.get("to") ?? "", q.get("except"));
    return new Response(JSON.stringify({ slots: slots.map(s => s.start) }), { headers });
  } catch (error) {
    if (error instanceof AppError) return new Response(JSON.stringify({ error: error.code }), { status: error.code === "invalid" ? 400 : 404, headers });
    throw error;
  }
}
