import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { boardCsv, boardJson, fileName } from "../../../../../lib/export.ts";
import { viewer } from "../../../../../lib/session.ts";

// A board as a file: ?format=csv (a spreadsheet, in the reader's words) or
// ?format=json (everything).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const { id } = await params;
  const json = new URL(request.url).searchParams.get("format") === "json";
  try {
    const out = json ? await boardJson(db(), v.member, id) : await boardCsv(db(), v.member, id, v.t, v.locale);
    const name = fileName(out.name, json ? "json" : "csv");
    return new Response("csv" in out ? out.csv : out.json, {
      headers: {
        "Content-Type": json ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
