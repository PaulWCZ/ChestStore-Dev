import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { icsForMember } from "../../../../../lib/interviews.ts";
import { viewer } from "../../../../../lib/session.ts";

// An interview as an .ics file, for whoever sees its candidate: the "Add to
// my calendar" of a Chest without calendars (its UID is the one the
// Chest's feed would give: a calendar that has both shows one event).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const { id } = await params;
    const body = await icsForMember(db(), v.member, id, v.locale);
    return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="interview.ics"', "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
