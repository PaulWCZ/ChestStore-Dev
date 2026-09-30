import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { shareBusy } from "./busy.ts";
import type { Sql } from "./db.ts";
import { sync } from "./leave-calendar.ts";
import type { LeaveRequest } from "./requests.ts";

// What Leave tells the other tools of the Chest (Proposal (studio): events
// between tools; chest.proposals.json "emits"), once an admin linked them —
// Rooms shows the person "Off" those days and frees their desk. Who and
// which days, never the kind of leave nor the note: colleagues see
// "Away", as here. A courtesy: when the Chest cannot take it, the answer
// given in Leave still stands.
//
// data: { member, from, to, fromHalf, toHalf, request } — dates
// "YYYY-MM-DD"; fromHalf "pm" starts at noon, toHalf "am" ends at noon.
async function publish(type: "leave.approved" | "leave.cancelled", r: LeaveRequest, key: string): Promise<void> {
  try {
    await events.publish(type, { member: r.memberId, from: r.start, to: r.end, fromHalf: r.startHalf, toHalf: r.endHalf, request: r.id }, { key });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

// An approved leave (answered, or recorded at once like sick leave). The key
// carries the time of the answer: approved, taken back, approved again is
// two events.
export async function approved(r: LeaveRequest): Promise<void> {
  if (r.status !== "approved") return;
  await publish("leave.approved", r, `leave:${r.id}:approved:${Date.parse(r.decidedAt ?? r.createdAt)}`);
}

// A leave that no longer stands: cancelled, or its approval taken back.
export async function cancelled(r: LeaveRequest): Promise<void> {
  await publish("leave.cancelled", r, `leave:${r.id}:cancelled:${Date.now()}`);
}

// keepInLine brings what the other side of the Chest shows of the approved
// leave in line with it: each person's calendar feed (lib/leave-calendar.ts)
// and their busy times for Booking (lib/busy.ts). Run after every change,
// after the Chest's and People's events, and each morning (recheck: a
// Chest that refused the calendar is asked again). Never fails the change.
export async function keepInLine(sql: Sql, options: { recheck?: boolean } = {}): Promise<void> {
  try {
    await sync(sql, options.recheck ? { recheck: true, max: 2000 } : {});
    await shareBusy(sql);
  } catch (error) {
    console.error("calendar and busy times: not in line", error instanceof Error ? error.name : "error");
  }
}
