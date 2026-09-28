import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";

// What Hiring tells the other tools of the Chest (Proposal (studio): events
// between tools; chest.proposals.json "emits"), once an admin linked them:
// a hire becomes a newcomer in People. It carries the person's name and
// address — they are about to join the company — and nothing of the
// application (no CV, no notes, no feedback, no rating). A courtesy: when
// the Chest cannot take it, the move in Hiring still stands.
//
// hiring.hired:          { candidate, name, email, job, team, place, startDate, hiredBy }
// hiring.hire_cancelled: { candidate }
export type Hire = {
  candidate: string;
  name: string;
  email: string | null;
  job: string;
  team: string | null;
  place: string | null;
  startDate: string | null;
  hiredBy: string;
};

async function publish(type: "hiring.hired" | "hiring.hire_cancelled", data: Record<string, unknown>, key: string): Promise<boolean> {
  try {
    await events.publish(type, data, { key });
    return true;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return false;
  }
}

// hired: the key carries the time of the move, so hired, taken back, hired
// again is two events (the same move told twice is one).
export async function hired(h: Hire, at: string): Promise<boolean> {
  return publish("hiring.hired", { ...h, email: h.email || null, team: h.team || null, place: h.place || null }, `hiring:${h.candidate}:hired:${Date.parse(at)}`);
}

// hireCancelled: moved out of "hired", rejected after it, or erased.
export async function hireCancelled(candidate: string, at = new Date()): Promise<boolean> {
  return publish("hiring.hire_cancelled", { candidate }, `hiring:${candidate}:cancelled:${at.getTime()}`);
}
