import { db } from "../../../../lib/db.ts";
import { exportZip, selectionOf } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";

// The month's receipts and spreadsheet in one ZIP, streamed (lib/export.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const { stream, fileName } = await exportZip(db(), who.actor, who.locale, selectionOf(new URL(request.url).searchParams));
    return new Response(stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
