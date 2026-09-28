import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { calendar } from "../../../../../lib/ics.ts";
import { plain } from "../../../../../lib/markdown.ts";
import { eventFor } from "../../../../../lib/posts.ts";
import { currentMember } from "../../../../../lib/session.ts";

// "Add to my calendar": the event as an .ics file, for whoever sees it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const e = await eventFor(db(), await currentMember(), id);
    const text = calendar({
      uid: `news-post-${e.id}-${e.createdAt.getTime().toString(36)}@chest.tool`,
      title: e.title,
      description: plain(e.body).slice(0, 4000),
      place: e.event.place,
      day: e.event.day,
      start: e.event.start,
      end: e.event.end,
      stamp: new Date(),
    });
    return new Response(text, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="event-${e.id}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
