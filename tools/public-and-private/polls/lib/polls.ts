import type { Member } from "@argentic/chest-sdk/member";
import { asked, can, companySurvey, edits, surveys, manages, resultsState, sees, settles, namesShown, type PollRights, type Policy, type ResultsState } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { checkOpening, clean, id, limits, readPoll, type Kind, type PollSpec, type Repeat } from "./model.ts";
import { fromAnswers, results, type AnswerRow, type Counts, type QuestionResult, type QuestionRow, type TextRow } from "./results.ts";
import { withAllGroups, withGroupsOf } from "./groups.ts";
import { startSeries } from "./series.ts";
import { day as readDay, time as readTime, zoned } from "./time.ts";

// The polls: written, sent, answered, closed, deleted. Every function takes
// the database, the member acting (from the Chest's assertion, never from
// what a browser sends) and what they send; it checks their rights first
// and answers data or throws an AppError code.

export type Status = "draft" | "open" | "closed";

export type Poll = {
  id: string;
  kind: Kind;
  title: string;
  details: string;
  organiser: string;
  status: Status;
  anonymous: boolean;
  results: "live" | "closed";
  everyone: boolean;
  groups: string[];
  people: string[];
  closesAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  closedByDate: boolean;
  finalOption: string | null;
  finalAt: string | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  // A sign-up sheet: places per answer.
  slots: number | null;
  // A pulse survey: how often it comes back, its series and round.
  repeat: Repeat | null;
  seriesId: string | null;
  round: number | null;
  // Its words were changed after this many people had answered.
  editedAfter: number | null;
  nudgedAt: string | null;
  questions: QuestionRow[];
};

export type Context = { zone: string; now?: Date; today?: string; known?: readonly string[] | null; knownPeople?: readonly string[] | null };

type PollRow = {
  id: string; kind: Kind; title: string; details: string; organiser: string; status: Status; anonymous: boolean; results: "live" | "closed";
  everyone: boolean; groups: string[]; people: string[]; closes_at: Date | null; opened_at: Date | null; closed_at: Date | null; closed_by_date: boolean;
  final_option: string | null; final_at: Date | null; deleted_at: Date | null; created_at: Date; updated_at: Date;
  slots: number | null; repeat: Repeat | null; series_id: string | null; round: number | null; edited_after: number | null; nudged_at: Date | null;
};

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

export const rights = (p: Pick<Poll, "organiser" | "status" | "everyone" | "groups" | "people" | "deleted" | "anonymous" | "results">): PollRights => p;

function toPoll(r: PollRow, questions: QuestionRow[]): Poll {
  return {
    id: String(r.id), kind: r.kind, title: r.title, details: r.details, organiser: r.organiser, status: r.status, anonymous: r.anonymous, results: r.results,
    everyone: r.everyone, groups: r.groups ?? [], people: r.people ?? [], closesAt: iso(r.closes_at), openedAt: iso(r.opened_at), closedAt: iso(r.closed_at), closedByDate: r.closed_by_date,
    finalOption: r.final_option === null ? null : String(r.final_option), finalAt: iso(r.final_at), deleted: r.deleted_at !== null,
    createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
    slots: r.slots, repeat: r.repeat, seriesId: r.series_id === null ? null : String(r.series_id), round: r.round, editedAfter: r.edited_after, nudgedAt: iso(r.nudged_at),
    questions,
  };
}

const dayText = (d: Date | string | null): string | null => {
  if (d === null) return null;
  if (typeof d === "string") return d.slice(0, 10);
  // A date column arrives as midnight UTC of that day.
  return d.toISOString().slice(0, 10);
};

async function questionsOf(sql: Query, pollIds: string[]): Promise<Map<string, QuestionRow[]>> {
  const found = new Map<string, QuestionRow[]>();
  if (pollIds.length === 0) return found;
  const qs = await sql<{ id: string; poll_id: string; kind: QuestionRow["kind"]; text: string; multiple: boolean; other: boolean; low: string; high: string }[]>`
    select id, poll_id, kind, text, multiple, other, low, high from questions where poll_id = any(${pollIds}::bigint[]) order by poll_id, position`;
  const os = await sql<{ id: string; question_id: string; label: string; day: Date | string | null; start_time: string | null; end_time: string | null }[]>`
    select o.id, o.question_id, o.label, o.day, o.start_time, o.end_time from options o join questions q on q.id = o.question_id
    where q.poll_id = any(${pollIds}::bigint[]) order by o.question_id, o.position`;
  for (const q of qs) {
    const row: QuestionRow = {
      id: String(q.id), kind: q.kind, text: q.text, multiple: q.multiple, other: q.other, low: q.low, high: q.high,
      options: os.filter(o => String(o.question_id) === String(q.id)).map(o => ({ id: String(o.id), label: o.label, day: dayText(o.day), start: o.start_time, end: o.end_time })),
    };
    found.set(String(q.poll_id), [...(found.get(String(q.poll_id)) ?? []), row]);
  }
  return found;
}

// closeDue closes the polls whose closing time has passed: evaluated on
// every read, so nothing waits for a schedule. What follows a closing (bell
// items, badges, the organiser told) is lib/tell.ts's settle().
export async function closeDue(sql: Query, now = new Date()): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    update polls set status = 'closed', closed_at = closes_at, closed_by_date = true, updated_at = ${now}
    where status = 'open' and closes_at <= ${now} and deleted_at is null returning id`;
  return rows.map(r => String(r.id));
}

// load reads one poll (deleted or not) with its questions, or not_found.
export async function load(sql: Query, pollId: unknown, options: { lock?: boolean } = {}): Promise<Poll> {
  const key = id(pollId);
  const [row] = options.lock
    ? await sql<PollRow[]>`select * from polls where id = ${key} for update`
    : await sql<PollRow[]>`select * from polls where id = ${key}`;
  if (!row) throw new AppError("not_found");
  return toPoll(row, (await questionsOf(sql, [key])).get(key) ?? []);
}

// visible reads a poll the actor may see, or not_found.
async function visible(sql: Query, actor: Member | null, pollId: unknown, options: { lock?: boolean } = {}): Promise<Poll> {
  const poll = await load(sql, pollId, options);
  if (!sees(actor, rights(poll))) throw new AppError("not_found");
  return poll;
}

export async function insertQuestions(sql: Query, pollId: string, spec: Pick<PollSpec, "questions">): Promise<void> {
  for (const [position, q] of spec.questions.entries()) {
    const [row] = await sql<{ id: string }[]>`
      insert into questions (poll_id, position, kind, text, multiple, other, low, high)
      values (${pollId}, ${position}, ${q.kind}, ${q.text}, ${q.multiple}, ${q.other}, ${q.low}, ${q.high}) returning id`;
    for (const [i, o] of q.options.entries()) {
      await sql`insert into options (question_id, position, label, day, start_time, end_time) values (${row!.id}, ${i}, ${o.label}, ${o.day}, ${o.start}, ${o.end})`;
    }
  }
}

function context(ctx: Context): { zone: string; now: Date; today: string; known: readonly string[] | null; knownPeople: readonly string[] | null } {
  const now = ctx.now ?? new Date();
  const today = ctx.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: ctx.zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { zone: ctx.zone, now, today, known: ctx.known ?? null, knownPeople: ctx.knownPeople ?? null };
}

// The admin's choice of who starts polls (one row, created by the migration).
export async function policy(sql: Query): Promise<Policy> {
  const [row] = await sql<{ members_create: boolean; members_surveys: boolean }[]>`select members_create, members_surveys from settings where id`;
  return { membersCreate: row?.members_create ?? true, membersSurveys: row?.members_surveys ?? false };
}

// setPolicy: an admin lets every member start polls, or organisers only
// (membersCreate); lets members start company surveys too — repeating ones
// and eNPS — or keeps them to organisers (membersSurveys, off by default).
// Polls members already started stay theirs.
export async function setPolicy(sql: Sql, actor: Member | null, choice: unknown): Promise<Policy> {
  if (!settles(actor)) throw new AppError("forbidden");
  const o = choice && typeof choice === "object" ? choice as Record<string, unknown> : null;
  if (!o || Object.keys(o).length === 0 || Object.entries(o).some(([k, v]) => !["membersCreate", "membersSurveys"].includes(k) || typeof v !== "boolean")) throw new AppError("invalid");
  const now = await policy(sql);
  const next: Policy = { membersCreate: (o["membersCreate"] as boolean | undefined) ?? now.membersCreate, membersSurveys: (o["membersSurveys"] as boolean | undefined) ?? now.membersSurveys };
  await sql`insert into settings (id, members_create, members_surveys) values (true, ${next.membersCreate}, ${next.membersSurveys})
    on conflict (id) do update set members_create = excluded.members_create, members_surveys = excluded.members_surveys`;
  return next;
}

export async function mayCreate(sql: Query, actor: Member | null): Promise<boolean> {
  return can(actor, "create", await policy(sql));
}

// createPoll writes a poll: a draft, or sent at once (open: true). A sent
// poll is queued to be told to those asked (lib/tell.ts); a repeating
// survey starts its series (lib/series.ts).
export async function createPoll(sql: Sql, actor: Member | null, input: unknown, ctx: Context): Promise<{ id: string; status: Status }> {
  const rules = await policy(sql);
  if (!can(actor, "create", rules)) throw new AppError("forbidden");
  const c = context(ctx);
  const spec = readPoll(input, c);
  if (companySurvey(spec) && !surveys(actor, rules)) throw new AppError("forbidden");
  const open = (input as { open?: unknown }).open === true;
  if (open) checkOpening(spec, c);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into polls (kind, title, details, organiser, status, anonymous, results, everyone, groups, people, closes_at, slots, repeat, opened_at, created_at, updated_at)
      values (${spec.kind}, ${spec.title}, ${spec.details}, ${actor!.id}, ${open ? "open" : "draft"}, ${spec.anonymous}, ${spec.results}, ${spec.everyone}, ${spec.groups}, ${spec.people}, ${spec.closesAt}, ${spec.slots}, ${spec.repeat}, ${open ? c.now : null}, ${c.now}, ${c.now})
      returning id`;
    const pollId = String(row!.id);
    await insertQuestions(tx, pollId, spec);
    if (open) {
      if (spec.repeat) await startSeries(tx, pollId, actor!.id, spec.repeat, c.now, c.zone);
      await tx`insert into tellings (poll_id, kind) values (${pollId}, 'ask') on conflict do nothing`;
    }
    return { id: pollId, status: open ? "open" : "draft" };
  });
}

// updateDraft rewrites a draft entirely, and sends it when asked to.
export async function updateDraft(sql: Sql, actor: Member | null, pollId: unknown, input: unknown, ctx: Context): Promise<{ id: string; status: Status }> {
  const c = context(ctx);
  const spec = readPoll(input, c);
  const open = (input as { open?: unknown }).open === true;
  return sql.begin(async tx => {
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!edits(actor, rights(poll))) throw new AppError("forbidden");
    if (poll.status !== "draft") throw new AppError("locked");
    if (companySurvey(spec) && !surveys(actor, await policy(tx))) throw new AppError("forbidden");
    if (open) checkOpening(spec, c);
    await tx`delete from questions where poll_id = ${poll.id}`;
    await tx`
      update polls set kind = ${spec.kind}, title = ${spec.title}, details = ${spec.details}, anonymous = ${spec.anonymous}, results = ${spec.results},
        everyone = ${spec.everyone}, groups = ${spec.groups}, people = ${spec.people}, closes_at = ${spec.closesAt}, slots = ${spec.slots}, repeat = ${spec.repeat},
        status = ${open ? "open" : "draft"}, opened_at = ${open ? c.now : null}, updated_at = ${c.now}
      where id = ${poll.id}`;
    await insertQuestions(tx, poll.id, spec);
    if (open) {
      if (spec.repeat) await startSeries(tx, poll.id, poll.organiser, spec.repeat, c.now, c.zone);
      await tx`insert into tellings (poll_id, kind) values (${poll.id}, 'ask') on conflict do nothing`;
    }
    return { id: poll.id, status: open ? "open" : "draft" };
  });
}

// editOpen changes what may change once a poll is sent: its words and its
// closing time. Its questions and settings stay as people answered them.
export async function editOpen(sql: Sql, actor: Member | null, pollId: unknown, input: unknown, ctx: Context): Promise<Poll> {
  const c = context(ctx);
  const o = input && typeof input === "object" ? input as Record<string, unknown> : null;
  if (!o) throw new AppError("invalid");
  const title = clean(o["title"], limits.title);
  const details = clean(o["details"], limits.details, { multiline: true, optional: true });
  let closesAt: Date | null = null;
  if (o["closes"] !== undefined && o["closes"] !== null) {
    const closes = o["closes"] as Record<string, unknown>;
    closesAt = zoned(readDay(closes["day"]), readTime(closes["time"]), c.zone);
  }
  return sql.begin(async tx => {
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!edits(actor, rights(poll))) throw new AppError("forbidden");
    if (poll.status !== "open") throw new AppError("locked");
    // A round of a pulse survey closes when the next one opens: its closing
    // time is the series'.
    if (poll.seriesId !== null) closesAt = poll.closesAt ? new Date(poll.closesAt) : null;
    const closeChanged = (closesAt?.getTime() ?? null) !== (poll.closesAt ? new Date(poll.closesAt).getTime() : null);
    if (closeChanged && closesAt) checkOpening({ closesAt, questions: [] }, c);
    // A later closing time: the day-before reminder is due again.
    const remindAgain = closeChanged && (closesAt === null || closesAt.getTime() - c.now.getTime() > 864e5);
    // New words over answers already given: the poll says so ("Edited after
    // 3 answers"), so nobody reads old answers under new words unawares.
    const wordsChanged = title !== poll.title || details !== poll.details;
    const answers = wordsChanged ? (await tx<{ n: number }[]>`select count(*)::int as n from participants where poll_id = ${poll.id}`)[0]!.n : 0;
    const editedAfter = answers > 0 ? Math.max(answers, poll.editedAfter ?? 0) : poll.editedAfter;
    await tx`update polls set title = ${title}, details = ${details}, closes_at = ${closesAt}, edited_after = ${editedAfter}, updated_at = ${c.now}${remindAgain ? tx`, reminded_at = null` : tx``} where id = ${poll.id}`;
    if (remindAgain) await tx`delete from tellings where poll_id = ${poll.id} and kind = 'remind'`;
    return load(tx, poll.id);
  });
}

// sendDraft sends a draft as it is.
export async function sendDraft(sql: Sql, actor: Member | null, pollId: unknown, ctx: Context): Promise<Poll> {
  const c = context(ctx);
  return sql.begin(async tx => {
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!edits(actor, rights(poll))) throw new AppError("forbidden");
    if (poll.status !== "draft") throw new AppError("locked");
    checkOpening({ closesAt: poll.closesAt ? new Date(poll.closesAt) : null, questions: poll.questions }, c);
    await tx`update polls set status = 'open', opened_at = ${c.now}, updated_at = ${c.now} where id = ${poll.id}`;
    if (poll.repeat) await startSeries(tx, poll.id, poll.organiser, poll.repeat, c.now, c.zone);
    await tx`insert into tellings (poll_id, kind) values (${poll.id}, 'ask') on conflict do nothing`;
    return load(tx, poll.id);
  });
}

// closePoll closes an open poll by hand; reopenPoll undoes it (while no
// date was chosen). A closing time already past is removed on reopening.
export async function closePoll(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<Poll> {
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    if (poll.status === "closed") throw new AppError("closed");
    if (poll.status !== "open") throw new AppError("locked");
    await tx`update polls set status = 'closed', closed_at = ${now}, closed_by_date = false, settled_at = null, updated_at = ${now} where id = ${poll.id}`;
    await tx`delete from tellings where poll_id = ${poll.id} and kind in ('ask', 'remind', 'nudge')`;
    return load(tx, poll.id);
  });
}

export async function reopenPoll(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<Poll> {
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    if (poll.status !== "closed") throw new AppError("not_closed");
    if (poll.finalOption !== null) throw new AppError("locked");
    // An anonymous poll, once closed, has shown its results: reopening it
    // and closing it again would let anyone compare the two and read the
    // answers given in between.
    if (poll.anonymous) throw new AppError("anonymous_final");
    // A round of a pulse survey: the next round is the way on.
    if (poll.seriesId !== null) throw new AppError("locked");
    const past = poll.closesAt !== null && new Date(poll.closesAt).getTime() <= now.getTime();
    await tx`
      update polls set status = 'open', closed_at = null, closed_by_date = false, settled_at = null, updated_at = ${now}${past ? tx`, closes_at = null, reminded_at = null` : tx``}
      where id = ${poll.id}`;
    return load(tx, poll.id);
  });
}

// deletePoll puts a poll aside (restorePoll brings it back); it is purged
// after limits.purgeDays.
export async function deletePoll(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<Poll> {
  return sql.begin(async tx => {
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    await tx`update polls set deleted_at = ${now}, updated_at = ${now} where id = ${poll.id}`;
    await tx`delete from tellings where poll_id = ${poll.id}`;
    return { ...poll, deleted: true };
  });
}

export async function restorePoll(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<Poll> {
  return sql.begin(async tx => {
    const poll = await load(tx, pollId, { lock: true });
    if (!poll.deleted || !manages(actor, rights(poll))) throw new AppError("not_found");
    await tx`update polls set deleted_at = null, updated_at = ${now} where id = ${poll.id}`;
    // Its items left every bell when it was deleted: an open poll asks again.
    if (poll.status === "open") await tx`insert into tellings (poll_id, kind, created_at) values (${poll.id}, 'ask', ${now}) on conflict do nothing`;
    if (poll.status === "closed" && poll.finalOption !== null) await tx`insert into tellings (poll_id, kind, created_at) values (${poll.id}, 'final', ${now}) on conflict do nothing`;
    return load(tx, poll.id);
  });
}

// purge removes for good what was deleted long ago.
export async function purge(sql: Query, now = new Date()): Promise<number> {
  const rows = await sql`delete from polls where deleted_at is not null and deleted_at < ${now}::timestamptz - make_interval(days => ${limits.purgeDays}) returning id`;
  await sql`delete from comments where deleted_at is not null and deleted_at < ${now}::timestamptz - make_interval(days => ${limits.purgeDays})`;
  return rows.length;
}

// chooseFinal: the organiser of a closed date poll picks the date (null
// takes the choice back). Everyone asked is then told (lib/tell.ts).
export async function chooseFinal(sql: Sql, actor: Member | null, pollId: unknown, optionId: unknown, now = new Date()): Promise<Poll> {
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    if (poll.kind !== "date") throw new AppError("invalid");
    if (poll.status !== "closed") throw new AppError("not_closed");
    if (optionId === null) {
      await tx`update polls set final_option = null, final_at = null, updated_at = ${now} where id = ${poll.id}`;
      await tx`delete from tellings where poll_id = ${poll.id} and kind = 'final'`;
      return load(tx, poll.id);
    }
    const option = id(optionId);
    if (!poll.questions[0]?.options.some(o => o.id === option)) throw new AppError("invalid");
    await tx`update polls set final_option = ${option}, final_at = ${now}, updated_at = ${now} where id = ${poll.id}`;
    await tx`insert into tellings (poll_id, kind) values (${poll.id}, 'final') on conflict (poll_id, kind) do update set after = null, lease = null, created_at = ${now}`;
    return load(tx, poll.id);
  });
}

// What a list shows of a poll.
export type Card = {
  id: string;
  kind: Kind;
  title: string;
  organiser: string;
  status: Status;
  anonymous: boolean;
  everyone: boolean;
  groups: string[];
  people: string[];
  repeat: Repeat | null;
  seriesId: string | null;
  round: number | null;
  closesAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  answered: boolean;
  answers: number;
  final: { day: string; start: string | null; end: string | null } | null;
  mine: boolean;
};

export type Home = { toAnswer: Card[]; mine: Card[]; answered: Card[]; closed: Card[] };

// home: the polls waiting for the actor's answer (closing soonest first),
// the polls they asked (open, drafts, and closed in the last
// limits.recentDays), the open ones they answered, and the others closed
// in the last limits.recentDays.
export async function home(sql: Sql, actor: Member | null, now = new Date()): Promise<Home> {
  if (!actor || !can(actor, "answer")) throw new AppError("forbidden");
  await closeDue(sql, now);
  const rows = await sql<(PollRow & { answered: boolean; answers: number; final_day: Date | string | null; final_start: string | null; final_end: string | null })[]>`
    select p.*, exists (select 1 from participants x where x.poll_id = p.id and x.member = ${actor.id}) as answered,
      (select count(*)::int from participants x where x.poll_id = p.id and x.member <> 'guest') as answers,
      o.day as final_day, o.start_time as final_start, o.end_time as final_end
    from polls p left join options o on o.id = p.final_option
    where p.deleted_at is null
      and (p.status <> 'closed' or p.closed_at > ${now}::timestamptz - make_interval(days => ${limits.recentDays}))
    order by coalesce(p.closes_at, 'infinity'::timestamptz), p.id desc
    limit 500`;
  const cards: Card[] = [];
  for (const r of rows) {
    const poll = toPoll(r, []);
    if (!sees(actor, rights(poll))) continue;
    cards.push({
      id: poll.id, kind: poll.kind, title: poll.title, organiser: poll.organiser, status: poll.status, anonymous: poll.anonymous, everyone: poll.everyone, groups: poll.groups, people: poll.people,
      repeat: poll.repeat, seriesId: poll.seriesId, round: poll.round,
      closesAt: poll.closesAt, closedAt: poll.closedAt, updatedAt: poll.updatedAt, answered: r.answered, answers: r.answers,
      final: r.final_day ? { day: dayText(r.final_day)!, start: r.final_start, end: r.final_end } : null, mine: poll.organiser === actor.id,
    });
  }
  const isAsked = (c: Card) => asked(actor, { everyone: c.everyone, groups: c.groups, people: c.people });
  // A pulse survey shows once: its open round, or else its latest; the
  // earlier rounds are on its page, over time.
  const latest = new Map<string, Card>();
  for (const c of cards) {
    if (c.seriesId === null) continue;
    const had = latest.get(c.seriesId);
    if (!had || (c.round ?? 0) > (had.round ?? 0)) latest.set(c.seriesId, c);
  }
  const shown = cards.filter(c => c.seriesId === null || latest.get(c.seriesId) === c);
  // What the actor asked is in one list of its own (open first, closing
  // soonest; drafts; then those closed lately), not mixed into "To answer".
  const order = (c: Card) => (c.status === "open" ? 0 : c.status === "draft" ? 1 : 2);
  const cmp = (x: string | null, y: string | null) => { const a = x ?? "\uffff"; const b = y ?? "\uffff"; return a < b ? -1 : a > b ? 1 : 0; };
  return {
    toAnswer: shown.filter(c => c.status === "open" && isAsked(c) && !c.answered && !c.mine),
    mine: shown.filter(c => c.mine).sort((a, b) => order(a) - order(b)
      || (a.status === "open" ? cmp(a.closesAt, b.closesAt) : a.status === "closed" ? cmp(b.closedAt, a.closedAt) : cmp(b.updatedAt, a.updatedAt))),
    answered: shown.filter(c => c.status === "open" && !c.mine && c.answered),
    closed: shown.filter(c => c.status === "closed" && !c.mine).sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")),
  };
}

// A poll as its page shows it to the actor.
export type PollView = {
  poll: Poll;
  asked: boolean;
  manages: boolean;
  edits: boolean;
  answered: boolean;
  // A named poll: the actor's own answer, to show and change.
  mine: Record<string, { options: string[]; other: string; value: number | null; text: string; dates: Record<string, number> }> | null;
  answers: number;
  // Guests from outside the Chest who answered (a date poll: lib/guests.ts).
  guests: number;
  state: ResultsState;
  results: QuestionResult[] | null;
  names: boolean;
  // Named polls, for those who see the names: who answered.
  participants: string[];
  // A sign-up sheet: places taken per option (a date: its "yes").
  taken: Record<string, number> | null;
};

async function counts(sql: Query, poll: Poll): Promise<{ counts: Counts; voters?: Map<string, string[]>; texts: TextRow[]; grid?: Map<string, { member: string; values: Record<string, number> }[]> }> {
  if (poll.anonymous) {
    const tallies = await sql<{ question_id: string; key: string; count: number }[]>`select question_id, key, count from tallies where poll_id = ${poll.id}`;
    const c: Counts = new Map(poll.questions.map(q => [q.id, new Map<string, number>()]));
    for (const t of tallies) c.get(String(t.question_id))?.set(t.key, t.count);
    const texts = await sql<{ question_id: string; body: string; shuffle: number }[]>`select question_id, body, shuffle from texts where poll_id = ${poll.id} order by shuffle`;
    return { counts: c, texts: texts.map(t => ({ question: String(t.question_id), body: t.body, member: null, at: Number(t.shuffle) })) };
  }
  const rows = await answerRows(sql, poll.id);
  const named = fromAnswers(poll.questions, rows);
  return { counts: named.counts, voters: named.voters, texts: named.texts, grid: named.grid };
}

// A guest's rows name them "guest:<participant>" (lib/guests.ts): never a
// member id; guestNames gives the names they typed.
export const guestKey = (participant: string) => `guest:${participant}`;

export async function answerRows(sql: Query, pollId: string): Promise<AnswerRow[]> {
  const rows = await sql<{ participant: string; member: string; question: string; option: string | null; value: number | null; text: string | null }[]>`
    select p.id as participant, p.member, a.question_id as question, a.option_id as option, a.value, a.text
    from answers a join participants p on p.id = a.participant_id where p.poll_id = ${pollId} order by p.id, a.question_id, a.option_id`;
  return rows.map(r => ({ participant: String(r.participant), member: r.member === "guest" ? guestKey(String(r.participant)) : r.member, question: String(r.question), option: r.option === null ? null : String(r.option), value: r.value, text: r.text }));
}

// guestNames: "guest:<participant>" → the name a guest typed.
export async function guestNames(sql: Query, pollId: string): Promise<Map<string, string>> {
  const rows = await sql<{ id: string; guest_name: string }[]>`select id, guest_name from participants where poll_id = ${pollId} and member = 'guest'`;
  return new Map(rows.map(r => [guestKey(String(r.id)), r.guest_name]));
}

export async function view(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<PollView> {
  await closeDue(sql, now);
  const poll = await visible(sql, actor, pollId);
  const r = rights(poll);
  const answers = (await sql<{ answers: number }[]>`select count(*)::int as answers from participants where poll_id = ${poll.id} and member <> 'guest'`)[0]!.answers;
  const guests = (await sql<{ n: number }[]>`select count(*)::int as n from participants where poll_id = ${poll.id} and member = 'guest'`)[0]!.n;
  const [me] = await sql<{ id: string }[]>`select id from participants where poll_id = ${poll.id} and member = ${actor!.id}`;
  let mine: PollView["mine"] = null;
  if (me && !poll.anonymous) {
    mine = {};
    const rows = await sql<{ question_id: string; option_id: string | null; value: number | null; text: string | null }[]>`select question_id, option_id, value, text from answers where participant_id = ${me.id}`;
    for (const q of poll.questions) mine[q.id] = { options: [], other: "", value: null, text: "", dates: {} };
    for (const a of rows) {
      const entry = mine[String(a.question_id)];
      if (!entry) continue;
      const q = poll.questions.find(x => x.id === String(a.question_id))!;
      if (q.kind === "choice") {
        if (a.option_id !== null) entry.options.push(String(a.option_id));
        else entry.other = a.text ?? "";
      } else if (q.kind === "date" && a.option_id !== null) entry.dates[String(a.option_id)] = a.value ?? 0;
      else if (q.kind === "scale") entry.value = a.value;
      else if (q.kind === "text") entry.text = a.text ?? "";
    }
  }
  const state = poll.status === "draft" ? "after_close" : resultsState(actor, r, answers + guests);
  let shown: QuestionResult[] | null = null;
  let participants: string[] = [];
  const names = poll.status !== "draft" && namesShown(actor, r, answers);
  if (state === "shown") {
    const c = await counts(sql, poll);
    shown = results(poll.questions, c.counts, { ...(names && c.voters ? { voters: c.voters } : {}), texts: names ? c.texts : c.texts.map(t => ({ ...t, member: null })), ...(names && c.grid ? { grid: c.grid } : {}) });
  }
  if (names || (manages(actor, r) && !poll.anonymous)) {
    participants = (await sql<{ member: string }[]>`select member from participants where poll_id = ${poll.id} and member <> 'guest' order by id`).map(p => p.member);
  }
  const taken = poll.slots === null ? null : await placesTaken(sql, poll);
  return { poll, asked: asked(actor, r), manages: manages(actor, r), edits: edits(actor, r), answered: Boolean(me), mine, answers, guests, state, results: shown, names, participants, taken };
}

// placesTaken counts a sign-up sheet's places per option: those who chose
// it (a choice poll), those who said yes (a date poll). Everyone who can
// answer sees how many are left, whatever the results setting.
export async function placesTaken(sql: Query, poll: Pick<Poll, "id" | "kind" | "questions">, except: string | null = null): Promise<Record<string, number>> {
  const q = poll.questions[0];
  const taken: Record<string, number> = Object.fromEntries((q?.options ?? []).map(o => [o.id, 0]));
  if (!q) return taken;
  const rows = await sql<{ option_id: string; n: number }[]>`
    select a.option_id, count(*)::int as n from answers a join participants p on p.id = a.participant_id
    where p.poll_id = ${poll.id} and a.question_id = ${q.id} and a.option_id is not null
      and (${poll.kind === "date"} = false or a.value = 2) and (${except}::bigint is null or p.id <> ${except}::bigint)
    group by a.option_id`;
  for (const r of rows) taken[String(r.option_id)] = r.n;
  return taken;
}

// nudge: the organiser reminds those who have not answered (a bell item,
// and an email where the Chest sends them — lib/tell.ts), at most every 12
// hours. The organiser never learns who is reminded in an anonymous poll.
export async function nudge(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<Poll> {
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await visible(tx, actor, pollId, { lock: true });
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    if (poll.status !== "open") throw new AppError("closed");
    if (poll.nudgedAt && now.getTime() - new Date(poll.nudgedAt).getTime() < limits.nudgeHours * 3600_000) throw new AppError("nudged", { hours: limits.nudgeHours });
    await tx`update polls set nudged_at = ${now} where id = ${poll.id}`;
    await tx`insert into tellings (poll_id, kind, created_at) values (${poll.id}, 'nudge', ${now}) on conflict (poll_id, kind) do update set after = null, lease = null, created_at = ${now}`;
    return { ...poll, nudgedAt: now.toISOString() };
  });
}

// For a download: the poll and its answers, for those who manage it.
export async function exportData(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<{ poll: Poll; rows: AnswerRow[]; results: QuestionResult[]; answers: number; guests: Map<string, { name: string; email: string | null }> }> {
  await closeDue(sql, now);
  const poll = await visible(sql, actor, pollId);
  if (!manages(actor, rights(poll)) || poll.status === "draft") throw new AppError("forbidden");
  const answers = (await sql<{ answers: number }[]>`select count(*)::int as answers from participants where poll_id = ${poll.id}`)[0]!.answers;
  if (poll.anonymous && resultsState(actor, rights(poll), answers) !== "shown") throw new AppError("forbidden");
  const c = await counts(sql, poll);
  const guests = new Map((await sql<{ id: string; guest_name: string; guest_email: string | null }[]>`
    select id, guest_name, guest_email from participants where poll_id = ${poll.id} and member = 'guest'`).map(g => [guestKey(String(g.id)), { name: g.guest_name, email: g.guest_email }]));
  return { poll, rows: poll.anonymous ? [] : await answerRows(sql, poll.id), results: results(poll.questions, c.counts, c), answers, guests };
}

// The polls waiting for these members' answer: the number on their tile.
export async function pendingCounts(sql: Query, people: { id: string; groups: readonly string[]; role: string | null }[], now = new Date()): Promise<Map<string, number>> {
  const counts = new Map<string, number>(people.map(p => [p.id, 0]));
  if (people.length === 0) return counts;
  const open = await sql<{ id: string; everyone: boolean; groups: string[]; people: string[] }[]>`
    select id, everyone, groups, people from polls where status = 'open' and deleted_at is null and (closes_at is null or closes_at > ${now})`;
  if (open.length === 0) return counts;
  const done = await sql<{ poll_id: string; member: string }[]>`
    select poll_id, member from participants where poll_id = any(${open.map(o => o.id)}::bigint[]) and member = any(${people.map(p => p.id)})`;
  const answered = new Set(done.map(d => `${d.poll_id}/${d.member}`));
  // Their groups among the open polls' (the Chest names only those that
  // give Polls with a member: lib/groups.ts) — one question for one person,
  // one per group for many.
  const targeted = open.flatMap(o => o.groups ?? []);
  const given = people.map(p => ({ ...p, groups: [...p.groups] }));
  const withGroups = targeted.length === 0 ? given : given.length === 1 ? [await withAllGroups(given[0]!)] : await withGroupsOf(given, targeted);
  for (const p of withGroups) {
    const actor = { id: p.id, role: p.role, isAdmin: false, groups: p.groups };
    counts.set(p.id, open.filter(o => asked(actor, { everyone: o.everyone, groups: o.groups ?? [], people: o.people ?? [] }) && !answered.has(`${o.id}/${p.id}`)).length);
  }
  return counts;
}

// Who answered a poll (ids), for tellings: those not to remind.
export async function answeredBy(sql: Query, pollId: string): Promise<Set<string>> {
  return new Set((await sql<{ member: string }[]>`select member from participants where poll_id = ${pollId}`).map(r => r.member));
}
