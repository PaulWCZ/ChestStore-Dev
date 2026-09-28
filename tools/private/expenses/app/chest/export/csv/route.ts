import { db } from "../../../../lib/db.ts";
import { exportCsv } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";
import { memberId, month } from "../../../../lib/model.ts";

// The month's spreadsheet, for the accountants (lib/export.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const query = new URL(request.url).searchParams;
    const person = query.get("person") ? memberId(query.get("person")) : null;
    const { text, fileName } = await exportCsv(db(), who.actor, who.locale, { month: month(query.get("month")), person });
    return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
