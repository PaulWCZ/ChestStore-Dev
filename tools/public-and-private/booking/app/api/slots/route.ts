import { freeTimes, publicType } from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { isDate } from "../../../lib/zone.ts";

// The free times of a booking type between two dates of the host's
// calendar (at most six weeks): what the public calendar asks as the
// visitor moves between months. Public, read-only, never cached.
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const host = q.get("host") ?? "", type = q.get("type") ?? "", from = q.get("from"), to = q.get("to");
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  if (!isDate(from) || !isDate(to)) return new Response(JSON.stringify({ error: "invalid" }), { status: 400, headers });
  const sql = db();
  const place = await publicType(sql, host, type);
  if (!place) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers });
  try {
    const slots = await freeTimes(sql, place.host, place.type, from, to);
    return new Response(JSON.stringify({ slots: slots.map(s => s.start) }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "invalid" }), { status: 400, headers });
  }
}
