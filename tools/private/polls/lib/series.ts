import type { Member } from "@argentic/chest-sdk/member";
import { manages, resultsState } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import type { Repeat } from "./model.ts";
import { closeDue, insertQuestions, load, rights, type Poll } from "./polls.ts";
import { results } from "./results.ts";
import { local, zoned } from "./time.ts";

// Pulse surveys that come back: every week or every month, the same
// questions for the same people, each round a poll of its own. The round
// is opened by the pass (lib/tell.ts), on the "pass" schedule or on a
// visit; a round closes when the next one opens, so there is always one
// round to answer. The results of the rounds are compared over time
// (trend) — each round's results showing only as its own rules allow (an
// anonymous round: once closed, from five answers).

// roundAt is when round k (0: the first) opens: k weeks or months after the
// first, at the same time on the Chest's clock. A month without that day
// (the 31st) takes its last day.
export function roundAt(firstDay: string, atTime: string, every: Repeat, k: number, zone: string): Date {
  const [y, m, d] = firstDay.split("-").map(Number) as [number, number, number];
  let day: string;
  if (every === "week") {
    const date = new Date(Date.UTC(y, m - 1, d + 7 * k));
    day = date.toISOString().slice(0, 10);
  } else {
    const month = m - 1 + k;
    const year = y + Math.floor(month / 12);
    const mo = ((month % 12) + 12) % 12;
    const last = new Date(Date.UTC(year, mo + 1, 0)).getUTCDate();
    day = new Date(Date.UTC(year, mo, Math.min(d, last))).toISOString().slice(0, 10);
  }
  return zoned(day, atTime, zone);
}

// nextAfter: the first round's opening strictly after `now` (rounds missed
// while nobody came are skipped, never opened in a burst).
export function nextAfter(s: { firstDay: string; atTime: string; every: Repeat }, now: Date, zone: string): { k: number; at: Date } {
  const first = roundAt(s.firstDay, s.atTime, s.every, 0, zone);
  const span = s.every === "week" ? 7 * 864e5 : 28 * 864e5;
  let k = Math.max(1, Math.floor((now.getTime() - first.getTime()) / span) - 1);
  while (roundAt(s.firstDay, s.atTime, s.every, k, zone).getTime() <= now.getTime()) k++;
  while (k > 1 && roundAt(s.firstDay, s.atTime, s.every, k - 1, zone).getTime() > now.getTime()) k--;
  return { k, at: roundAt(s.firstDay, s.atTime, s.every, k, zone) };
}

// startSeries: a repeating survey is sent — it becomes round 1 of a series
// and closes when round 2 opens.
export async function startSeries(tx: Query, pollId: string, organiser: string, every: Repeat, now: Date, zone: string): Promise<string> {
  const at = local(now, zone);
  const next = roundAt(at.day, at.time, every, 1, zone);
  const [row] = await tx<{ id: string }[]>`
    insert into series (organiser, every, first_day, at_time, next_at, created_at) values (${organiser}, ${every}, ${at.day}, ${at.time}, ${next}, ${now}) returning id`;
  const seriesId = String(row!.id);
  await tx`update polls set series_id = ${seriesId}, round = 1, closes_at = ${next}, repeat = ${every} where id = ${pollId}`;
  return seriesId;
}

type SeriesRow = { id: string; organiser: string; every: Repeat; first_day: Date | string; at_time: string; next_at: Date; stopped_at: Date | null };
const dayOf = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

// openRounds opens the rounds that are due: a copy of the latest round
// (its words as last edited, its questions, its audience), open until the
// next round; the rounds before it close. Answers the new polls' ids.
export async function openRounds(sql: Sql, zone: string, now = new Date()): Promise<string[]> {
  const opened: string[] = [];
  const due = await sql<{ id: string }[]>`select id from series where stopped_at is null and next_at <= ${now} order by next_at limit 20`;
  for (const { id } of due) {
    const made = await sql.begin(async tx => {
      const [s] = await tx<SeriesRow[]>`select * from series where id = ${id} and stopped_at is null and next_at <= ${now} for update`;
      if (!s) return null;
      const [last] = await tx<{ id: string; round: number }[]>`
        select id, round from polls where series_id = ${s.id} and deleted_at is null and status <> 'draft' order by round desc limit 1`;
      if (!last || s.organiser === "erased") {
        await tx`update series set stopped_at = ${now} where id = ${s.id}`;
        return null;
      }
      const next = nextAfter({ firstDay: dayOf(s.first_day), atTime: s.at_time, every: s.every }, now, zone).at;
      const from = await load(tx, last.id);
      await tx`update polls set status = 'closed', closed_at = ${now}, closed_by_date = true, updated_at = ${now} where series_id = ${s.id} and status = 'open'`;
      const [row] = await tx<{ id: string }[]>`
        insert into polls (kind, title, details, organiser, status, anonymous, results, everyone, groups, people, closes_at, repeat, series_id, round, opened_at, created_at, updated_at)
        values (${from.kind}, ${from.title}, ${from.details}, ${from.organiser}, 'open', ${from.anonymous}, ${from.results}, ${from.everyone}, ${from.groups}, ${from.people},
          ${next}, ${s.every}, ${s.id}, ${last.round + 1}, ${now}, ${now}, ${now})
        returning id`;
      const pollId = String(row!.id);
      await insertQuestions(tx, pollId, { questions: from.questions.map(q => ({ ...q, options: q.options.map(o => ({ label: o.label, day: o.day, start: o.start, end: o.end })) })) });
      await tx`insert into tellings (poll_id, kind, created_at) values (${pollId}, 'ask', ${now}) on conflict do nothing`;
      await tx`update series set next_at = ${next} where id = ${s.id}`;
      return pollId;
    });
    if (made) opened.push(made);
  }
  return opened;
}

// repeatSeries stops a series (no more rounds; the open one stays open
// until its time) or starts it again (the next round at its next time).
export async function repeatSeries(sql: Sql, actor: Member | null, pollId: unknown, on: boolean, zone: string, now = new Date()): Promise<Poll> {
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await load(tx, pollId, { lock: true });
    if (poll.deleted || !manages(actor, rights(poll))) throw new AppError("not_found");
    if (poll.seriesId === null) throw new AppError("invalid");
    const [s] = await tx<SeriesRow[]>`select * from series where id = ${poll.seriesId} for update`;
    if (!s) throw new AppError("not_found");
    if (on) {
      const next = nextAfter({ firstDay: dayOf(s.first_day), atTime: s.at_time, every: s.every }, now, zone).at;
      await tx`update series set stopped_at = null, next_at = ${next} where id = ${s.id}`;
      // The open round, if any, closes when the next one opens.
      await tx`update polls set closes_at = ${next} where series_id = ${s.id} and status = 'open' and (closes_at is null or closes_at > ${next})`;
    } else {
      await tx`update series set stopped_at = ${now} where id = ${s.id}`;
    }
    return load(tx, poll.id);
  });
}

export async function seriesState(sql: Query, seriesId: string | null): Promise<{ every: Repeat; stopped: boolean; nextAt: string | null } | null> {
  if (seriesId === null) return null;
  const [s] = await sql<SeriesRow[]>`select * from series where id = ${seriesId}`;
  if (!s) return null;
  return { every: s.every, stopped: s.stopped_at !== null, nextAt: s.stopped_at ? null : new Date(s.next_at).toISOString() };
}

// A trend: for each question of the series that gives a number (a 1–5
// scale: its average; eNPS: its score), one point per round — null for a
// round whose results do not show to this reader yet (open, or under five
// answers for an anonymous round). The last 12 rounds.
export type TrendPoint = { round: number; pollId: string; openedAt: string; value: number | null; answered: number; current: boolean; open: boolean };
export type Trend = { position: number; kind: "scale" | "enps"; text: string; points: TrendPoint[] }[];

export async function trend(sql: Query, actor: Member, poll: Poll): Promise<Trend> {
  if (poll.seriesId === null) return [];
  const ids = (await sql<{ id: string }[]>`
    select id from polls where series_id = ${poll.seriesId} and deleted_at is null and status <> 'draft' order by round desc limit 12`).map(r => String(r.id)).reverse();
  if (ids.length < 2) return [];
  const rounds: Poll[] = [];
  for (const i of ids) rounds.push(await load(sql, i));
  const counts = new Map((await sql<{ poll_id: string; n: number }[]>`
    select poll_id, count(*)::int as n from participants where poll_id = any(${ids}::bigint[]) group by poll_id`).map(r => [String(r.poll_id), r.n]));
  const out: Trend = [];
  for (const [position, q] of poll.questions.entries()) {
    if (q.kind !== "scale" && q.kind !== "enps") continue;
    out.push({ position, kind: q.kind, text: q.text, points: [] });
  }
  if (out.length === 0) return out;
  for (const round of rounds) {
    const answered = counts.get(round.id) ?? 0;
    const shown = resultsState(actor, rights(round), answered) === "shown";
    let computed: ReturnType<typeof results> = [];
    if (shown) {
      const tallies = new Map<string, Map<string, number>>(round.questions.map(q => [q.id, new Map<string, number>()]));
      if (round.anonymous) {
        for (const t of await sql<{ question_id: string; key: string; count: number }[]>`select question_id, key, count from tallies where poll_id = ${round.id}`) tallies.get(String(t.question_id))?.set(t.key, t.count);
      } else {
        for (const t of await sql<{ question_id: string; value: number; n: number }[]>`
          select a.question_id, a.value, count(*)::int as n from answers a join participants p on p.id = a.participant_id
          where p.poll_id = ${round.id} and a.value is not null and a.option_id is null group by a.question_id, a.value`) {
          const m = tallies.get(String(t.question_id));
          if (!m) continue;
          m.set("v" + t.value, t.n);
          m.set("n", (m.get("n") ?? 0) + t.n);
        }
      }
      computed = results(round.questions, tallies);
    }
    for (const line of out) {
      const q = round.questions[line.position];
      const r = shown && q && q.kind === line.kind ? computed.find(x => x.id === q.id) : undefined;
      const value = r?.kind === "scale" ? r.average : r?.kind === "enps" ? r.score : null;
      line.points.push({ round: round.round ?? 0, pollId: round.id, openedAt: round.openedAt ?? round.createdAt, value, answered, current: round.id === poll.id, open: round.status === "open" });
    }
  }
  return out;
}
