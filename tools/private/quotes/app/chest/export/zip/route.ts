import * as chest from "@argentic/chest-sdk/chest";
import { db } from "../../../../lib/db.ts";
import { exportZip, period } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";

// The period's PDFs and spreadsheet in one ZIP, streamed (lib/export.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const query = new URL(request.url).searchParams;
    const { stream, fileName } = await exportZip(db(), who.actor, who.locale, period(query.get("from"), query.get("to")), chest.today());
    return new Response(stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
