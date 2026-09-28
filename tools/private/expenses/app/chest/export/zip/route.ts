import { db } from "../../../../lib/db.ts";
import { exportZip } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";
import { memberId, month } from "../../../../lib/model.ts";

// The month's receipts and spreadsheet in one ZIP, streamed (lib/export.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const query = new URL(request.url).searchParams;
    const person = query.get("person") ? memberId(query.get("person")) : null;
    const { stream, fileName } = await exportZip(db(), who.actor, who.locale, { month: month(query.get("month")), person });
    return new Response(stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
