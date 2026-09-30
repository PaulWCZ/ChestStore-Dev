import { chest } from "@argentic/chest-sdk/chest";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { calendar } from "../../../../../lib/ics.ts";
import { view } from "../../../../../lib/polls.ts";
import { currentMember } from "../../../../../lib/session.ts";
import { zoned } from "../../../../../lib/time.ts";
import { chestZone } from "../../../../../lib/zone.ts";

// "Add to my calendar": a date poll's chosen date as an .ics file, for
// whoever sees the poll. Its times are on the Chest's clock.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const { poll } = await view(db(), await currentMember(), id);
    const option = poll.kind === "date" && poll.status === "closed" ? poll.questions[0]?.options.find(o => o.id === poll.finalOption) : undefined;
    if (!option?.day || !poll.finalAt) return new Response(null, { status: 404 });
    const zone = chestZone();
    const start = option.start ? zoned(option.day, option.start, zone) : null;
    const end = option.start && option.end ? zoned(option.day, option.end, zone) : null;
    const team = chest.teamUrl;
    const text = calendar({
      uid: `polls-${poll.id}-final@chest.tool`,
      // A later choice replaces the event in the calendar that has it.
      sequence: Math.max(0, Math.floor((new Date(poll.finalAt).getTime() - Date.UTC(2026, 0, 1)) / 60_000)),
      summary: poll.title,
      ...(poll.details ? { description: poll.details.slice(0, 4000) } : {}),
      ...(team ? { url: `${team}/chest/polls/${poll.id}` } : {}),
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
