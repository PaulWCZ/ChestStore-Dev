import { chest } from "@argentic/chest-sdk/chest";
import { db } from "../../../../lib/db.ts";
import { exportCsv, period } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";

// The period's spreadsheet for the accountant (lib/export.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const query = new URL(request.url).searchParams;
    const { text, fileName } = await exportCsv(db(), who.actor, who.locale, period(query.get("from"), query.get("to")), chest.today());
    return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
