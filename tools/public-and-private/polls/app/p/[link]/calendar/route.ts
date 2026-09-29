import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { byLink } from "../../../../lib/guests.ts";
import { calendar } from "../../../../lib/ics.ts";
import { publicOrigin } from "../../../../lib/public-origin.ts";
import { zoned } from "../../../../lib/time.ts";
import { chestZone } from "../../../../lib/zone.ts";

// "Add to my calendar" for a guest: the chosen date of the poll the link
// opens, as an .ics file (a guest has no Chest calendar). Its times are
// on the Chest's clock; the event links back to the guest page.
export async function GET(request: Request, { params }: { params: Promise<{ link: string }> }): Promise<Response> {
  try {
    const { link } = await params;
    const poll = await byLink(db(), link);
    const option = poll.status === "closed" ? poll.questions[0]?.options.find(o => o.id === poll.finalOption) : undefined;
    if (!option?.day || !poll.finalAt) return new Response(null, { status: 404 });
    const zone = chestZone();
    const start = option.start ? zoned(option.day, option.start, zone) : null;
    const end = option.start && option.end ? zoned(option.day, option.end, zone) : null;
    const origin = publicOrigin(request.headers);
    const text = calendar({
      uid: `polls-${poll.id}-final@chest.tool`,
      sequence: Math.max(0, Math.floor((new Date(poll.finalAt).getTime() - Date.UTC(2026, 0, 1)) / 60_000)),
      summary: poll.title,
      ...(poll.details ? { description: poll.details.slice(0, 4000) } : {}),
      ...(origin ? { url: `${origin}/p/${link}` } : {}),
      day: option.day,
      start,
      end,
      stamp: new Date(),
    });
    return new Response(text, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="poll-${poll.id}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
