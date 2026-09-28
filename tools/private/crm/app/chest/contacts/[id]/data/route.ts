import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { contactJson, fileName } from "../../../../../lib/export.ts";
import { viewer } from "../../../../../lib/session.ts";

// Everything held about one person (their right of access, GDPR art. 15),
// as a JSON file to send them.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const { id } = await params;
  try {
    const out = await contactJson(db(), v.member, id, v.locale, v.t);
    return new Response(out.json, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(out.name, "json")}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
