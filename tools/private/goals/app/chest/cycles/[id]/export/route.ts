import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { cycleCsv, fileName } from "../../../../../lib/export.ts";
import { viewer } from "../../../../../lib/session.ts";
import { zone } from "../../../../../lib/time.ts";

// A cycle as a spreadsheet, in the reader's language.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const { id } = await params;
  try {
    const out = await cycleCsv(db(), v.member, id, v.t, v.locale, zone());
    return new Response(out.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName(out.name, "csv")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
