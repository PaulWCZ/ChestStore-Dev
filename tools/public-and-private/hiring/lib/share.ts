import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { busyFingerprint, busySnapshot, readBusy, type Span } from "./busy-snapshot.ts";
import type { Query, Sql } from "./db.ts";
import { isMemberId } from "./model.ts";

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

async function publish(type: "hiring.hired" | "hiring.hire_cancelled" | "hiring.busy", data: Record<string, unknown>, key: string): Promise<boolean> {
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

// ---- Busy times, with Booking --------------------------------------------
//
// hiring.busy: the interviews a member is on, times only (never the
// candidate, the job or the place), as lib/busy-snapshot.ts writes them —
// so Booking never lets a customer take an hour a candidate chose. Heard:
// booking.busy — a host's bookings, times blocked and Google/Outlook/Apple
// calendars — so a candidate is never offered an hour the interviewer
// already gave away (lib/self-schedule.ts, lib/interviews.ts busy).

const day = 86_400_000;

// A member's own interviews between two instants (never what another tool
// told Hiring: no echo).
async function ownBusy(sql: Query, memberId: string, from: Date, to: Date): Promise<Span[]> {
  const rows = await sql<{ starts_at: Date; ends_at: Date }[]>`
    select i.starts_at, i.ends_at from interviews i join interview_people p on p.interview_id = i.id join candidates c on c.id = i.candidate_id
    where p.member_id = ${memberId} and i.cancelled_at is null and c.status = 'active' and i.ends_at > ${from} and i.starts_at < ${to}`;
  return rows.map(r => ({ start: r.starts_at.getTime(), end: r.ends_at.getTime() }));
}

// shareBusy tells the other tools the interviews of some members, when
// they changed since last told (and once a day, as the window moves on).
// Says how many were told; stops at the first refusal of the Chest.
export async function shareBusy(sql: Query, memberIds: string[], now = Date.now()): Promise<number> {
  const ids = [...new Set(memberIds.filter(isMemberId))];
  if (ids.length === 0) return 0;
  const known = new Map((await sql<{ member_id: string; hash: string }[]>`select member_id, hash from shared_busy where member_id in ${sql(ids)}`).map(r => [r.member_id, r.hash]));
  let told = 0;
  for (const member of ids) {
    const from = Math.floor(now / day) * day;
    const snapshot = busySnapshot(member, await ownBusy(sql, member, new Date(from), new Date(from + 90 * day)), now);
    const hash = createHash("sha256").update(busyFingerprint(snapshot)).digest("hex");
    if (known.get(member) === hash) continue;
    // A member never told and with no interview: nothing to say.
    if (!known.has(member) && snapshot.spans.length === 0) continue;
    if (!(await publish("hiring.busy", snapshot, `busy:${member}:${now}:${hash.slice(0, 8)}`))) return told;
    await sql`insert into shared_busy (member_id, hash, told_at) values (${member}, ${hash}, ${new Date(now)})
      on conflict (member_id) do update set hash = excluded.hash, told_at = excluded.told_at`;
    told++;
  }
  return told;
}

// shareDueBusy: the members on an interview to come, and those told
// before (the outbox schedule, every 15 minutes: only what changed).
export async function shareDueBusy(sql: Query, now = Date.now()): Promise<number> {
  const rows = await sql<{ member_id: string }[]>`
    select distinct p.member_id from interview_people p join interviews i on i.id = p.interview_id where i.ends_at > ${new Date(now)}
    union select member_id from shared_busy limit 2000`;
  return shareBusy(sql, rows.map(r => r.member_id), now);
}

// takeBusy keeps a member's busy times as another tool told them: the
// snapshot replaces that tool's earlier one, unless older. Says whether it
// was kept.
export async function takeBusy(sql: Sql, event: events.ToolEvent): Promise<boolean> {
  const source = event.source;
  if (typeof source !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(source) || source.length > 63 || source === "hiring") return false;
  const s = readBusy(event.data);
  if (!s) return false;
  return sql.begin(async tx => {
    const [kept] = await tx<{ member_id: string }[]>`
      insert into told_busy (source, member_id, taken_at, period) values (${source}, ${s.member}, ${s.at}, tstzrange(${s.from}, ${s.to}))
      on conflict (source, member_id) do update set taken_at = excluded.taken_at, period = excluded.period
      where told_busy.taken_at < excluded.taken_at
      returning member_id`;
    if (!kept) return false;
    await tx`delete from told_spans where source = ${source} and member_id = ${s.member}`;
    for (let i = 0; i < s.spans.length; i += 500) {
      const part = s.spans.slice(i, i + 500).map(x => ({ source, member_id: s.member, span: `[${new Date(x.start).toISOString()},${new Date(x.end).toISOString()})` }));
      await tx`insert into told_spans ${tx(part, "source", "member_id", "span")}`;
    }
    return true;
  });
}

// toldBusy: what other tools said of these members between two instants.
export async function toldBusy(sql: Query, memberIds: string[], from: Date, to: Date): Promise<{ member: string; start: Date; end: Date; source: string }[]> {
  if (memberIds.length === 0) return [];
  const rows = await sql<{ member_id: string; lo: Date; hi: Date; source: string }[]>`
    select member_id, lower(span) as lo, upper(span) as hi, source from told_spans
    where member_id in ${sql(memberIds)} and span && tstzrange(${from}, ${to}) order by lower(span)`;
  return rows.map(r => ({ member: r.member_id, start: r.lo, end: r.hi, source: r.source }));
}

// A member who leaves or is erased: what was told of them, and what
// Hiring last told, are forgotten.
export async function forget(sql: Query, memberId: string): Promise<void> {
  await sql`delete from told_busy where member_id = ${memberId}`;
  await sql`delete from shared_busy where member_id = ${memberId}`;
}
