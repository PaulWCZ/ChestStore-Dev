import { db } from "../../../../../lib/db.ts";
import { asker, attachment, failure, refuse } from "../../../../../lib/http.ts";
import { openArchive } from "../../../../../lib/monthly.ts";

// One month's archive (?part= when it was cut into parts), as it was kept
// in the Chest's files; the desk stops asking once a copy left.
export async function GET(request: Request, { params }: { params: Promise<{ period: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const { period } = await params;
    const { bytes, fileName } = await openArchive(db(), who.actor, period, new URL(request.url).searchParams.get("part") ?? "1");
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(fileName), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
