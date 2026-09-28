import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { addDays, daysBetween, today } from "./model.ts";
import { cancelDeskBookings } from "./places.ts";
import { presenceHorizon } from "./presence.ts";

// What Leave tells Rooms (Proposal (studio): events between tools, once an
// admin linked the two): a leave approved marks its whole days "Off" for
// that person and frees their desk those days; a leave cancelled takes back
// the days it marked (never what the person set themselves since). Half
// days change nothing: the person may come for the other half. The kind of
// leave never comes: colleagues see "Off", as in Leave.
//
// Data, as Leave publishes it: { member, from, to, fromHalf, toHalf, request }
// — dates "YYYY-MM-DD", halves "am" | "pm" | "day".
type Told = { member: string; from: string; to: string; fromHalf: string; toHalf: string; request: string };

function read(data: Record<string, unknown>): Told | null {
  const date = /^\d{4}-\d{2}-\d{2}$/u;
  const { member, from, to, fromHalf, toHalf, request } = data;
  if (typeof member !== "string" || !/^mbr_[a-z2-7]{26}$/u.test(member)) return null;
  if (typeof from !== "string" || typeof to !== "string" || !date.test(from) || !date.test(to) || to < from) return null;
  if (typeof request !== "string" || !/^[A-Za-z0-9._:-]{1,60}$/u.test(request)) return null;
  const half = (h: unknown) => (h === "am" || h === "pm" || h === "day" ? h : "day");
  return { member, from, to, fromHalf: half(fromHalf), toHalf: half(toHalf), request };
}

const ref = (t: Pick<Told, "request">) => `leave:${t.request}`;

// The whole days of a leave, from today to the presence horizon.
export function wholeDays(t: Pick<Told, "from" | "to" | "fromHalf" | "toHalf">, now: string): string[] {
  const days: string[] = [];
  const last = addDays(now, presenceHorizon);
  for (let d = t.from < now ? now : t.from; d <= t.to && d <= last && days.length < 400; d = addDays(d, 1)) {
    // A leave starting in the afternoon, or ending at noon, is half that day.
    if (d === t.from && t.fromHalf === "pm") continue;
    if (d === t.to && t.toHalf === "am") continue;
    days.push(d);
  }
  return days;
}

export async function leaveApproved(sql: Sql, event: ToolEvent, zone: string): Promise<number> {
  const t = read(event.data);
  if (!t) return 0;
  const days = wholeDays(t, today(zone));
  if (days.length === 0 || daysBetween(days[0]!, days.at(-1)!) > 400) return 0;
  await sql.begin(async tx => {
    for (const d of days) {
      await tx`
        insert into presence (member_id, day, status, office_id, leave_ref) values (${t.member}, ${d}, 'off', null, ${ref(t)})
        on conflict (member_id, day) do update set status = 'off', office_id = null, leave_ref = excluded.leave_ref`;
    }
    await cancelDeskBookings(tx, "chest", tx`b.member_id = ${t.member} and b.day in ${tx(days)} and upper(b.during) > now()`);
  });
  return days.length;
}

export async function leaveCancelled(sql: Sql, event: ToolEvent): Promise<number> {
  const request = event.data["request"];
  const member = event.data["member"];
  if (typeof request !== "string" || !/^[A-Za-z0-9._:-]{1,60}$/u.test(request) || typeof member !== "string") return 0;
  const done = await sql`delete from presence where member_id = ${member} and leave_ref = ${ref({ request })}`;
  return done.count;
}
