import { teamUrl } from "@argentic/chest-sdk/chest";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { bookingIcs, calendarHeaders, origin } from "../../../../../lib/mine.ts";
import { viewer } from "../../../../../lib/session.ts";

// One room booking as an .ics file ("Add to my calendar"), in the reader's
// language: for any member who sees the booking.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const bookingId = (await params).id;
  try {
    const file = await bookingIcs(db(), v.member, bookingId, v.locale, origin(teamUrl()));
    return new Response(file, { headers: calendarHeaders(`${v.t.mail.file}-${bookingId}.ics`) });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}

