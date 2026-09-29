import { db } from "../../../../lib/db.ts";
import { exportCsv, selectionOf } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";

// The month's spreadsheet, for the accountants (lib/export.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const { text, fileName } = await exportCsv(db(), who.actor, who.locale, selectionOf(new URL(request.url).searchParams));
    return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
