import { db } from "../../../../lib/db.ts";
import { selectionOf } from "../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../lib/http.ts";
import { journalText } from "../../../../lib/journal.ts";

// The month's accounting entries in the FEC layout, for the accountants
// (lib/journal.ts).
export async function GET(request: Request): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const { text, fileName } = await journalText(db(), who.actor, who.locale, selectionOf(new URL(request.url).searchParams));
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
