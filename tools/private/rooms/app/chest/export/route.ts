import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { bookingsCsv, occupancyCsv } from "../../../lib/export.ts";
import { viewer } from "../../../lib/session.ts";
import { zone } from "../../../lib/zone.ts";

// The admin's downloads: ?kind=bookings|occupancy&from=YYYY-MM-DD&to=YYYY-MM-DD,
// a CSV in the reader's words.
export async function GET(request: Request): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const q = new URL(request.url).searchParams;
  const kind = q.get("kind") === "occupancy" ? "occupancy" : "bookings";
  try {
    const csv = kind === "occupancy"
      ? await occupancyCsv(db(), v.member, q.get("from"), q.get("to"), v.t)
      : await bookingsCsv(db(), v.member, q.get("from"), q.get("to"), v.t, v.locale, zone());
    const name = `${v.t.export.file}-${kind === "occupancy" ? v.t.export.fileOccupancy : v.t.export.fileBookings}-${q.get("from")}-${q.get("to")}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/gu, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 400 });
    throw error;
  }
}
