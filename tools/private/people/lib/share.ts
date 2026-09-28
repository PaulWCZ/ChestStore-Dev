import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";

// What People tells the other tools of the Chest (Proposal (studio): events
// between tools; chest.proposals.json "emits"), once an admin linked them:
// someone is leaving, and on which last day — Equipment lists what they
// hold to take back before it. Who and when, nothing else: no reason, no
// checklist, no note. A courtesy: when the Chest cannot take it, the
// checklist in People still stands.
//
// A departure is what HR sets in People: a leaving checklist ("offboarding")
// started for a member, whose day is their last day. It is told again when
// it changes, and taken back when no leaving checklist runs any more
// (stopped; restarted, it is told again).
//
//   people.leaving           { member, lastDay }   — lastDay "YYYY-MM-DD"
//   people.leaving_cancelled { member }
//
// Keys carry the time of the change (leaving, cancelled, leaving again are
// three events; one change told twice is one).
async function publish(type: "people.leaving" | "people.leaving_cancelled", data: Record<string, unknown>, key: string): Promise<boolean> {
  try {
    await events.publish(type, data, { key });
    return true;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return false;
  }
}

// The person's last day as People knows it now: the latest last day of the
// leaving checklists running for them (null: not leaving).
export async function lastDay(sql: Query, memberId: string): Promise<string | null> {
  const [row] = await sql<{ last_day: string | null }[]>`
    select to_char(max(anchor), 'YYYY-MM-DD') as last_day from journeys
    where person_id = ${memberId} and kind = 'offboarding' and stopped_at is null`;
  return row?.last_day ?? null;
}

// around runs a change of this person's checklists (start, stop, restart)
// and tells what it changed of their departure: a new or moved last day,
// or none any more. A change that moves nothing (a welcome checklist, a
// second leaving checklist on an earlier day) tells nothing.
export async function around<T>(sql: Query, memberId: string | null, change: () => Promise<T>): Promise<T> {
  const person = memberId && /^mbr_[a-z2-7]{26}$/u.test(memberId) ? memberId : null;
  const before = person ? await lastDay(sql, person) : null;
  const done = await change();
  if (!person) return done;
  const after = await lastDay(sql, person);
  if (after === before) return done;
  const at = Date.now();
  if (after) await publish("people.leaving", { member: person, lastDay: after }, `people:${person}:leaving:${at}`);
  else await publish("people.leaving_cancelled", { member: person }, `people:${person}:stays:${at}`);
  return done;
}
