import { exportRows, settings } from "../../../lib/booking.ts";
import { toCsv } from "../../../lib/csv.ts";
import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";

// The bookings as a spreadsheet (the host's, or everyone's for an
// administrator), headers in the reader's language, times in the
// company's zone as "YYYY-MM-DD HH:MM" (sortable, read by every sheet).
export async function GET(request: Request): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const all = new URL(request.url).searchParams.get("who") === "all";
    const sql = db();
    const rows = await exportRows(sql, v.member, all);
    const zone = (await settings(sql)).defaultZone;
    const who = await people(rows.map(r => r.memberId));
    const stamp = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
    const h = v.t.export.headers;
    const csv = toCsv([
      [h.start, h.end, h.type, h.host, h.guest, h.email, h.phone, h.status, h.note, h.created],
      ...rows.map(r => [stamp(r.startsAt), stamp(r.endsAt), r.title, nameOf(who.get(r.memberId), v.locale), r.guestName, r.guestEmail, r.guestPhone, v.t.export.statuses[r.status], r.guestNote, stamp(r.createdAt)]),
    ]);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bookings.csv"', "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 403 });
    throw error;
  }
}
