import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { myCsv } from "../../../lib/mine.ts";
import { viewer } from "../../../lib/session.ts";
import { zone } from "../../../lib/zone.ts";

// Everything Rooms keeps about me, as a CSV: my desks, my rooms (organised
// or invited to), where I said I would be.
export async function GET(): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const csv = await myCsv(db(), v.member, v.t, v.locale, zone());
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${(v.t.mine.file + ".csv").replace(/[^A-Za-z0-9._-]/gu, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 403 });
    throw error;
  }
}
