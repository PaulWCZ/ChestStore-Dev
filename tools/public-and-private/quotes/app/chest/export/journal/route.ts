import { db } from "../../../../lib/db.ts";
import { period } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";
import { exportJournal } from "../../../../lib/journal.ts";

// The period's accounting entries (lib/journal.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const query = new URL(request.url).searchParams;
    const { text, fileName } = await exportJournal(db(), who.actor, who.locale, period(query.get("from"), query.get("to")));
    return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
