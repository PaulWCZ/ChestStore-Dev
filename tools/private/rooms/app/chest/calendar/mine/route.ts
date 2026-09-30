import { chest } from "@argentic/chest-sdk/chest";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { calendarHeaders, myIcs, origin } from "../../../../lib/mine.ts";
import { viewer } from "../../../../lib/session.ts";
import { zone } from "../../../../lib/zone.ts";

// All my coming room bookings and office days, as one .ics file.
export async function GET(): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const file = await myIcs(db(), v.member, v.locale, zone(), { ...origin(chest.teamUrl), name: v.t.meta.name });
    return new Response(file, { headers: calendarHeaders(`${v.t.mine.file}.ics`) });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 403 });
    throw error;
  }
}
