import { localeOf, type Member } from "@argentic/chest-sdk/member";
import { randomBytes, randomInt } from "node:crypto";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { open, openState, toForm, columns, versionOf, versions, type Form } from "./forms.ts";
import { allQuestions, answerIdPattern, clean, hiddenValues, isMemberId, limits, type Definition, type Question } from "../shared/model.ts";
import { check, filesIn, type Answers, type FileRef, type StoredFile } from "../shared/logic.ts";
import type { Stats } from "../shared/summary.ts";
import { answerStats, shuffledTexts } from "./stats.ts";
import { forgetHooks } from "./hooks.ts";

// Answers: taking one (the only door strangers use), reading them, the
// anonymity of anonymous forms, deleting, erasing, retention.

export const followStates = ["new", "doing", "done"] as const;
export type FollowState = (typeof followStates)[number];
export type Answer = { id: string; version: number; respondent: string | null; email: string | null; data: Answers; createdAt: string | null; month: string; language: string; status: FollowState; note: string; handledAt: string | null; sent: string[]; hidden: Record<string, string> };
type Row = { id: string; version: number; respondent: string | null; email: string | null; data: Answers; created_at: Date | null; month: Date | string; language: string; status: FollowState; note: string; handled_at: Date | null; sent?: string[] | null; hidden?: Record<string, string> | null };
const monthText = (m: Date | string) => (typeof m === "string" ? m.slice(0, 10) : m.toISOString().slice(0, 10));
const toAnswer = (r: Row): Answer => ({ id: r.id, version: r.version, respondent: r.respondent, email: r.email, data: r.data, createdAt: r.created_at ? r.created_at.toISOString() : null, month: monthText(r.month), language: r.language, status: r.status ?? "new", note: r.note ?? "", handledAt: r.handled_at ? r.handled_at.toISOString() : null, sent: r.sent ?? [], hidden: r.hidden ?? {} });
const answerColumns = "id, version, respondent, email, data, created_at, month, language, status, note, handled_at, sent, hidden";

const answerAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
export const newAnswerId = () => Array.from({ length: 16 }, () => answerAlphabet[randomInt(answerAlphabet.length)]).join("");

// shuffle: Fisher–Yates with the system's cryptographic random numbers.
export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---- Taking an answer -------------------------------------------------------

export type Submission = {
  form: Form;
  version: unknown;
  answers: unknown;
  // The member answering a team form (never for a public one).
  respondent: Member | null;
  language: string;
  // What the form's link gave for its hidden fields (form.hiddenFields).
  hidden?: unknown;
  // Turns a file sent with the answer into the tool's own object (claimed
  // and checked): lib/uploads.ts.
  files: (ref: FileRef, question: Question) => Promise<StoredFile>;
  // Deletes files already taken when the answer is refused after all.
  drop: (objects: string[]) => Promise<void>;
};

// submit checks an answer against the version it answered, takes the
// files, then — in one transaction holding the form — checks the form is
// still open, not full, not already answered by this member, and keeps it.
export async function submit(sql: Sql, s: Submission): Promise<{ answer: Answer; definition: Definition }> {
  const { form } = s;
  if (form.audience === "team" && (!s.respondent || !can(s.respondent, "forms.answer"))) throw new AppError("not_found");
  if (form.audience === "public" && s.respondent) throw new AppError("invalid");
  // The version the page answered — on an anonymous form, always the
  // latest (its versions differ only in words: lib/forms.ts publish), so
  // no answer says it came from a page opened before a change.
  const version = !form.anonymous && typeof s.version === "number" && Number.isInteger(s.version) && s.version >= 1 && s.version <= form.version ? s.version : form.version;
  const def = await versionOf(sql, form.id, version);
  if (!def) throw new AppError("not_found");
  if (!openState(form).open) throw new AppError(openState(form).reason === "full" ? "full" : "closed");
  if (JSON.stringify(s.answers ?? {}).length > limits.answerBytes) throw new AppError("too_long", { max: limits.answerBytes });
  const { answers, errors } = check(def, s.answers);
  if (Object.keys(errors).length > 0) throw new AppError("answers", errors);
  if (form.anonymous && allQuestions(def).some(q => q.kind === "file" && answers[q.id] !== undefined)) throw new AppError("anonymous_files");

  // Files: claimed and checked before the answer is kept.
  const taken: string[] = [];
  try {
    for (const q of allQuestions(def)) {
      const v = answers[q.id];
      if (q.kind !== "file" || v === undefined) continue;
      const kept: StoredFile[] = [];
      for (const ref of filesIn(v) as FileRef[]) {
        const stored = await s.files(ref, q);
        taken.push(stored.file);
        kept.push(stored);
      }
      answers[q.id] = Array.isArray(v) ? kept : kept[0]!;
    }
  } catch (error) {
    await s.drop(taken);
    throw error;
  }

  const email = form.anonymous ? null : firstEmail(def, answers);
  try {
    const answer = await sql.begin(async tx => {
      const [row] = await tx`select ${tx.unsafe(columns)} from forms where id = ${form.id} and deleted_at is null for update`;
      if (!row) throw new AppError("not_found");
      const now = toForm(row as never);
      const state = openState(now);
      if (!state.open) throw new AppError(state.reason === "full" ? "full" : "closed");
      const member = s.respondent?.id ?? null;
      if (now.audience === "team" && member && now.once) {
        const [done] = now.anonymous
          ? await tx`select 1 from participants where form_id = ${form.id} and member = ${member}`
          : await tx`select 1 from answers where form_id = ${form.id} and respondent = ${member} and deleted_at is null`;
        if (done) throw new AppError("already");
      }
      // The limit, counted in the same statement that takes the place.
      const [counted] = await tx`
        update forms set answer_count = answer_count + 1, bell_pending = true
        where id = ${form.id} and answer_count < least(coalesce(max_answers, ${limits.maxAnswers}), ${limits.maxAnswers})
        returning answer_count`;
      if (!counted) throw new AppError("full");
      await tx`update watchers set unseen = unseen + 1 where form_id = ${form.id}`;
      const id = newAnswerId();
      if (now.anonymous) {
        // The form's own language, never the reader's: a French answer
        // among English colleagues would name its author.
        const language = def.language ?? "en";
        await anonymous(tx, form.id, { id, version, data: answers, language }, member!);
        return { id, version, respondent: null, email: null, data: answers, createdAt: null, month: "", language, status: "new", note: "", handledAt: null, sent: [], hidden: {} } satisfies Answer;
      }
      const [kept] = await tx<Row[]>`
        insert into answers (id, form_id, version, respondent, email, data, created_at, month, language, hidden)
        values (${id}, ${form.id}, ${version}, ${now.audience === "team" ? member : null}, ${email}, ${tx.json(answers as never)}, now(), date_trunc('month', now())::date, ${s.language}, ${tx.json(hiddenValues(now.hiddenFields, s.hidden) as never)})
        returning ${tx.unsafe(answerColumns)}`;
      return toAnswer(kept!);
    });
    return { answer, definition: def };
  } catch (error) {
    await s.drop(taken);
    throw error;
  }
}

// The first email address of an answer, to find a person's answers later.
function firstEmail(def: Definition, answers: Answers): string | null {
  for (const q of allQuestions(def)) {
    const v = answers[q.id];
    if (q.kind === "email" && typeof v === "string") return v.toLowerCase();
  }
  return null;
}

// An anonymous answer: no member id, no time finer than the month; the
// member goes into participants. Both tables are rewritten for the form in
// a random order, in this one transaction: every row gets the same
// transaction stamp and a new place, so none says which answer came last.
// Each rewrite is one statement in the database (the rows never come to
// the tool): a form of thousands of answers takes one more in a blink.
async function anonymous(tx: Query, formId: string, a: { id: string; version: number; data: Answers; language: string }, member: string): Promise<void> {
  await tx`
    with gone as (delete from answers where form_id = ${formId} returning id, version, data, month, language, deleted_at)
    insert into answers (id, form_id, version, respondent, email, data, created_at, month, language, deleted_at)
    select id, ${formId}, version, null, null, data, null, month, ${a.language}::text, deleted_at from (
      select id, version, data, month, language, deleted_at from gone
      union all
      select ${a.id}::text, ${a.version}::int, ${tx.json(a.data as never)}::jsonb, date_trunc('month', now())::date, ${a.language}::text, null::timestamptz
    ) x order by gen_random_uuid()`;
  await tx`
    with gone as (delete from participants where form_id = ${formId} returning member)
    insert into participants (form_id, member)
    select ${formId}, member from (select member from gone union all select ${member}::text) x order by gen_random_uuid()`;
}

// ---- Reading answers ----------------------------------------------------------

// Anonymous answers stay hidden from everyone until there are five.
async function live(sql: Query, formId: string): Promise<number> {
  const { count } = (await sql<{ count: number }[]>`select count(*)::int as count from answers where form_id = ${formId} and deleted_at is null`)[0]!;
  return count;
}
function floor(form: Form, count: number): void {
  if (form.anonymous && count < limits.anonymousFloor) throw new AppError("too_few", { count, floor: limits.anonymousFloor });
}

// An anonymous form's answers are never shown one by one: a row that
// joins several answers of one person (a workload, a team, a free text)
// can name them among a few colleagues. Its pages show the summary and
// each free text on its own, shuffled (anonymousTexts).
function rows(form: Form): void {
  if (form.anonymous) throw new AppError("anonymous_rows");
}

export type Filter = { q?: unknown; question?: unknown; option?: unknown; page?: unknown; status?: unknown; from?: unknown; to?: unknown; sort?: unknown };
export type AnswerPage = { form: Form; total: number; matching: number; answers: Answer[]; page: number; versions: Map<number, Definition>; counts: Record<FollowState, number> };

const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;

// The conditions of a filter, shared by the list and an answer's
// previous/next: words anywhere in the answer, a choice or yes/no, a
// follow-up state, a range of days (the Chest's time zone).
function filtered(sql: Query, formId: string, filter: Filter, zone: string) {
  const q = typeof filter.q === "string" ? filter.q.trim().slice(0, 100) : "";
  const question = typeof filter.question === "string" && /^[a-z0-9]{6,12}$/u.test(filter.question) ? filter.question : null;
  const option = typeof filter.option === "string" && /^([a-z0-9]{6,12}|other|yes|no)$/u.test(filter.option) ? filter.option : null;
  const status = typeof filter.status === "string" && (followStates as readonly string[]).includes(filter.status) ? filter.status : null;
  const from = typeof filter.from === "string" && dayPattern.test(filter.from) ? filter.from : null;
  const to = typeof filter.to === "string" && dayPattern.test(filter.to) ? filter.to : null;
  const pattern = "%" + q.replace(/[\\%_]/gu, m => "\\" + m) + "%";
  const optionCondition =
    question && option === "yes" ? sql`and data->${question} = 'true'::jsonb`
    : question && option === "no" ? sql`and data->${question} = 'false'::jsonb`
    : question && option === "other" ? sql`and coalesce(data->${question}->>'other', '') <> ''`
    : question && option ? sql`and data->${question}->'ids' ? ${option}`
    : sql``;
  return sql`form_id = ${formId} and deleted_at is null ${q ? sql`and data::text ilike ${pattern}` : sql``} ${optionCondition}
    ${status ? sql`and status = ${status}` : sql``}
    ${from ? sql`and created_at >= (${from}::date)::timestamp at time zone ${zone}` : sql``}
    ${to ? sql`and created_at < ((${to}::date) + 1)::timestamp at time zone ${zone}` : sql``}`;
}
const oldestFirst = (filter: Filter) => filter.sort === "oldest";

export async function listAnswers(sql: Sql, actor: Member | null, formId: unknown, filter: Filter = {}, zone = "UTC"): Promise<AnswerPage> {
  const { form } = await open(sql, actor, formId, "viewer");
  rows(form);
  const total = await live(sql, form.id);
  const page = typeof filter.page === "string" && /^[1-9][0-9]{0,4}$/u.test(filter.page) ? Number(filter.page) : 1;
  const where = filtered(sql, form.id, filter, zone);
  const { matching } = (await sql<{ matching: number }[]>`select count(*)::int as matching from answers where ${where}`)[0]!;
  const found = await sql<Row[]>`
    select ${sql.unsafe(answerColumns)} from answers where ${where}
    order by ${oldestFirst(filter) ? sql`created_at asc nulls first, id` : sql`created_at desc nulls last, id`}
    limit ${limits.page} offset ${(page - 1) * limits.page}`;
  const counts = { new: 0, doing: 0, done: 0 } as Record<FollowState, number>;
  for (const r of await sql<{ status: FollowState; n: number }[]>`select status, count(*)::int as n from answers where form_id = ${form.id} and deleted_at is null group by status`) counts[r.status] = r.n;
  return { form, total, matching, answers: found.map(toAnswer), page, versions: await versions(sql, form.id), counts };
}

// The answers before and after one, in the list's order and filter: an
// answer's page steps through them.
export async function neighbours(sql: Sql, actor: Member | null, formId: unknown, answerId: string, filter: Filter = {}, zone = "UTC"): Promise<{ newer: string | null; older: string | null }> {
  const { form } = await open(sql, actor, formId, "viewer");
  rows(form);
  const where = filtered(sql, form.id, filter, zone);
  const order = oldestFirst(filter) ? sql`created_at asc nulls first, id` : sql`created_at desc nulls last, id`;
  const [row] = await sql<{ newer: string | null; older: string | null }[]>`
    select newer, older from (
      select id, lag(id) over (order by ${order}) as newer, lead(id) over (order by ${order}) as older from answers where ${where}
    ) x where id = ${answerId}`;
  return { newer: row?.newer ?? null, older: row?.older ?? null };
}

// Every answer of a form, newest first, a few hundred at a time (a
// cursor): an export writes them as they come, never all in memory.
export async function* answerBatches(sql: Query, formId: string, size = 500): AsyncGenerator<Answer[]> {
  for await (const rows of sql<Row[]>`select ${sql.unsafe(answerColumns)} from answers where form_id = ${formId} and deleted_at is null order by created_at desc nulls last, id`.cursor(size)) yield rows.map(toAnswer);
}

// The members who answered a form (named team forms): their names are
// asked of the Chest once, before an export is written.
export async function respondentsOf(sql: Query, formId: string): Promise<string[]> {
  return (await sql<{ respondent: string }[]>`select distinct respondent from answers where form_id = ${formId} and deleted_at is null and respondent is not null`).map(r => r.respondent);
}

// What the summary of a form shows: its versions and the database's
// counts (src/lib/stats.ts). For an anonymous form, from the floor on.
export async function summaryOf(sql: Sql, actor: Member | null, formId: unknown): Promise<{ form: Form; stats: Stats; versions: Map<number, Definition> }> {
  const { form } = await open(sql, actor, formId, "viewer");
  floor(form, await live(sql, form.id));
  const all = await versions(sql, form.id);
  return { form, stats: await answerStats(sql, form.id, all), versions: all };
}

// The written questions of a form, the latest wording first, then those
// removed since (marked).
export function writtenQuestions(all: Map<number, Definition>): { question: Question; removed: boolean }[] {
  const latest = [...all.entries()].sort((a, b) => b[0] - a[0]).map(([, d]) => d);
  const seen = new Map<string, { question: Question; removed: boolean }>();
  latest.forEach((d, i) => {
    for (const q of allQuestions(d)) if ((q.kind === "short" || q.kind === "long") && !seen.has(q.id)) seen.set(q.id, { question: q, removed: i > 0 && !allQuestions(latest[0]!).some(x => x.id === q.id) });
  });
  return [...seen.values()];
}

// anonymousTexts: an anonymous form's written answers, question by
// question, each list shuffled on its own — so no text is ever shown next
// to anything else its author answered. From the floor on; `cap` of each
// on a page (the summary's export has them all).
export const textsShown = 300;
export async function anonymousTexts(sql: Sql, actor: Member | null, formId: unknown, cap = textsShown): Promise<{ form: Form; total: number; texts: { question: Question; removed: boolean; count: number; texts: string[] }[] }> {
  const { form } = await open(sql, actor, formId, "viewer");
  const total = await live(sql, form.id);
  floor(form, total);
  const asked = writtenQuestions(await versions(sql, form.id));
  const found = await shuffledTexts(sql, form.id, asked.map(c => c.question.id), cap);
  return { form, total, texts: asked.map(c => ({ ...c, count: found.get(c.question.id)?.count ?? 0, texts: found.get(c.question.id)?.texts ?? [] })) };
}

export async function oneAnswer(sql: Sql, actor: Member | null, formId: unknown, answerId: unknown): Promise<{ form: Form; answer: Answer; definition: Definition; deleted: boolean }> {
  const { form } = await open(sql, actor, formId, "viewer");
  if (typeof answerId !== "string" || !answerIdPattern.test(answerId)) throw new AppError("not_found");
  if (form.anonymous) throw new AppError("not_found");
  const [row] = await sql<(Row & { deleted_at: Date | null })[]>`select ${sql.unsafe(answerColumns)}, deleted_at from answers where form_id = ${form.id} and id = ${answerId}`;
  if (!row) throw new AppError("not_found");
  const def = await versionOf(sql, form.id, row.version);
  return { form, answer: toAnswer(row), definition: def!, deleted: row.deleted_at !== null };
}

// ---- Following up (request forms) ------------------------------------------------

// follow: an editor marks an answer new, in progress or done, with a note —
// on a team form, the person who sent it reads both. Answers what changed,
// for the bell.
export async function follow(sql: Sql, actor: Member | null, formId: unknown, answerId: unknown, input: { status?: unknown; note?: unknown }): Promise<{ answer: Answer; form: Form; told: boolean }> {
  const { form } = await open(sql, actor, formId, "editor");
  if (form.anonymous || typeof answerId !== "string" || !answerIdPattern.test(answerId)) throw new AppError("not_found");
  const status = input.status === undefined ? undefined : (followStates as readonly unknown[]).includes(input.status) ? (input.status as FollowState) : (() => { throw new AppError("invalid"); })();
  const note = input.note === undefined ? undefined : clean(input.note, 2000, { multiline: true, optional: true });
  // Under the answer's row lock: two editors at once each see what the
  // other wrote, and the bell tells only of a real change.
  const { row, told } = await sql.begin(async tx => {
    const [before] = await tx<Row[]>`select ${tx.unsafe(answerColumns)} from answers where form_id = ${form.id} and id = ${answerId} and deleted_at is null for update`;
    if (!before) throw new AppError("not_found");
    const [row] = await tx<Row[]>`
      update answers set status = ${status ?? before.status}, note = ${note ?? before.note},
        handled_at = case when ${status ?? before.status} = 'done' then coalesce(handled_at, now()) else null end
      where form_id = ${form.id} and id = ${answerId} returning ${tx.unsafe(answerColumns)}`;
    return { row, told: (status !== undefined && status !== before.status) || (note !== undefined && note !== before.note && note !== "") };
  });
  return { answer: toAnswer(row!), form, told };
}

// What a member sent to the team's named forms: their answers, newest
// first, with where each stands. Never an anonymous form's (nothing ties
// those to them).
export type Sent = { id: string; formTitle: string; slug: string; createdAt: string; status: FollowState; note: string; open: boolean };
export async function sent(sql: Sql, actor: Member | null, limit = 50): Promise<Sent[]> {
  if (!actor || !can(actor, "forms.answer")) return [];
  const found = await sql<{ id: string; title: string; slug: string; created_at: Date; status: FollowState; note: string }[]>`
    select a.id, coalesce(case when v.definition->'alt'->>'language' = ${localeOf(actor.language)} then nullif(v.definition->'alt'->'texts'->>'title', '') end, v.definition->>'title', f.draft->>'title') as title, f.slug, a.created_at, a.status, a.note
    from answers a join forms f on f.id = a.form_id left join versions v on v.form_id = a.form_id and v.version = a.version
    where a.respondent = ${actor.id} and a.deleted_at is null and f.deleted_at is null and not f.anonymous
    order by a.created_at desc limit ${limit}`;
  return found.map(r => ({ id: r.id, formTitle: r.title ?? "", slug: r.slug, createdAt: r.created_at.toISOString(), status: r.status, note: r.note, open: r.status !== "done" }));
}

// One of the member's own answers, as they sent it (read only).
export async function sentOne(sql: Sql, actor: Member | null, answerId: unknown): Promise<{ answer: Answer; definition: Definition; formTitle: string; slug: string }> {
  if (!actor || typeof answerId !== "string" || !answerIdPattern.test(answerId)) throw new AppError("not_found");
  const [row] = await sql<(Row & { form_id: string; slug: string })[]>`
    select ${sql.unsafe(answerColumns.split(", ").map(c => "a." + c).join(", "))}, a.form_id, f.slug from answers a join forms f on f.id = a.form_id
    where a.id = ${answerId} and a.respondent = ${actor.id} and a.deleted_at is null and f.deleted_at is null and not f.anonymous`;
  if (!row) throw new AppError("not_found");
  const def = (await versionOf(sql, String(row.form_id), row.version))!;
  return { answer: toAnswer(row), definition: def, formTitle: def.title, slug: row.slug };
}

// ---- Deleting -------------------------------------------------------------------

// remove puts an answer aside (Undo brings it back); the nightly cleanup
// deletes it for good after a week, with its files. Its place under the
// form's limit is given back.
export async function removeAnswer(sql: Sql, actor: Member | null, formId: unknown, answerId: unknown): Promise<void> {
  const { form } = await open(sql, actor, formId, "editor");
  if (typeof answerId !== "string" || !answerIdPattern.test(answerId)) throw new AppError("not_found");
  await sql.begin(async tx => {
    const [row] = await tx`update answers set deleted_at = now() where form_id = ${form.id} and id = ${answerId} and deleted_at is null returning id`;
    if (!row) throw new AppError("not_found");
    await tx`update forms set answer_count = greatest(answer_count - 1, 0) where id = ${form.id}`;
  });
}

export async function restoreAnswer(sql: Sql, actor: Member | null, formId: unknown, answerId: unknown): Promise<void> {
  const { form } = await open(sql, actor, formId, "editor");
  if (typeof answerId !== "string" || !answerIdPattern.test(answerId)) throw new AppError("not_found");
  await sql.begin(async tx => {
    const [row] = await tx`update answers set deleted_at = null where form_id = ${form.id} and id = ${answerId} and deleted_at is not null returning id`;
    if (!row) throw new AppError("not_found");
    await tx`update forms set answer_count = answer_count + 1 where id = ${form.id}`;
  });
}

// The objects of the files an answer holds.
export function filesOf(data: Answers): string[] {
  return Object.values(data).flatMap(v => filesIn(v).flatMap(f => ("file" in f && typeof f.file === "string" ? [f.file] : [])));
}

// ---- A person's answers: finding and erasing them (GDPR) ------------------------

export type Found = { id: string; formId: string; formTitle: string; createdAt: string | null; email: string | null; respondent: string | null };

// find: the answers that hold this email address (given as the answer's
// address, or anywhere in it), or were given by this member. Managers only.
export async function findPerson(sql: Sql, actor: Member | null, query: unknown): Promise<Found[]> {
  if (!can(actor, "privacy.erase")) throw new AppError("forbidden");
  if (typeof query !== "string") throw new AppError("invalid");
  const text = query.trim().toLowerCase().slice(0, 254);
  if (text.length < 3) throw new AppError("too_few", { count: text.length, floor: 3 });
  const member = isMemberId(text) ? text : null;
  const pattern = "%" + text.replace(/[\\%_]/gu, m => "\\" + m) + "%";
  const rows = await sql<{ id: string; form_id: string; title: string; created_at: Date | null; email: string | null; respondent: string | null }[]>`
    select a.id, a.form_id, f.draft->>'title' as title, a.created_at, a.email, a.respondent
    from answers a join forms f on f.id = a.form_id
    where a.email = ${text} or a.respondent = ${member} or (a.respondent is null and a.created_at is not null and lower(a.data::text) like ${pattern})
    order by a.created_at desc nulls last
    limit 500`;
  return rows.map(r => ({ id: r.id, formId: String(r.form_id), formTitle: r.title, createdAt: r.created_at ? r.created_at.toISOString() : null, email: r.email, respondent: r.respondent }));
}

// erase deletes these answers for good, now (with their files, which the
// caller deletes from the Chest). Anonymous answers are never found here:
// nothing ties them to anyone.
export async function erase(sql: Sql, actor: Member | null, ids: unknown): Promise<{ erased: number; objects: string[] }> {
  if (!can(actor, "privacy.erase")) throw new AppError("forbidden");
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every(i => typeof i === "string" && answerIdPattern.test(i))) throw new AppError("invalid");
  return sql.begin(async tx => {
    const rows = await tx<{ form_id: string; data: Answers; deleted_at: Date | null }[]>`
      delete from answers where id = any(${ids as string[]}) and created_at is not null returning form_id, data, deleted_at`;
    for (const r of rows) if (!r.deleted_at) await tx`update forms set answer_count = greatest(answer_count - 1, 0) where id = ${r.form_id}`;
    return { erased: rows.length, objects: rows.flatMap(r => filesOf(r.data)) };
  });
}

// ---- Retention and cleanup (the nightly schedule) --------------------------------

// cleanup deletes: answers older than their form's retention (an anonymous
// one once its whole month is), answers put aside a week ago, forms put
// aside 30 days ago (with their answers). Answers the objects to delete.
export async function cleanup(sql: Sql, now = new Date()): Promise<{ answers: number; forms: number; objects: string[] }> {
  // The files of what goes, read by the database from each answer's JSON
  // (never the answers themselves: a form of 10,000 answers deleted for
  // good is a list of names).
  const old = await sql<{ files: string[] }[]>`
    delete from answers a using forms f
    where f.id = a.form_id and (
      (f.retention_months is not null and (
        (a.created_at is not null and a.created_at < ${now}::timestamptz - make_interval(months => f.retention_months))
        or (a.created_at is null and a.month + interval '1 month' <= ${now}::timestamptz - make_interval(months => f.retention_months))))
      or (a.deleted_at is not null and a.deleted_at < ${now}::timestamptz - interval '7 days'))
    returning jsonb_path_query_array(a.data, 'lax $.*.file') as files`;
  // Taken places are given back for answers the retention removed.
  await sql`update forms f set answer_count = (select count(*) from answers a where a.form_id = f.id and a.deleted_at is null) where f.retention_months is not null`;
  const goneForms = await sql<{ id: string }[]>`select id from forms where deleted_at is not null and deleted_at < ${now}::timestamptz - interval '30 days'`;
  const formObjects: string[] = [];
  for (const f of goneForms) {
    for await (const rows of sql<{ files: string[] }[]>`select jsonb_path_query_array(data, 'lax $.*.file') as files from answers where form_id = ${f.id} and data::text like '%"file"%'`.cursor(500)) formObjects.push(...rows.flatMap(r => r.files.filter(x => typeof x === "string")));
    // Its web addresses: the Chest forgets them too (lib/hooks.ts).
    await forgetHooks(sql, f.id);
    await sql`delete from forms where id = ${f.id}`;
  }
  // A form started from a template and never touched (no edit, no
  // setting) for a day was abandoned: it goes, so "Untitled form" drafts do
  // not pile up in everyone's list.
  await sql`delete from forms where version = 0 and revision = 1 and deleted_at is null and updated_at <= created_at + interval '1 second'
    and created_at < ${now}::timestamptz - interval '1 day' and not exists (select 1 from answers a where a.form_id = forms.id)`;
  await sql`delete from form_counts where hour < ${new Date(now.getTime() - 86400000)}`;
  return { answers: old.length, forms: goneForms.length, objects: [...old.flatMap(r => r.files.filter(x => typeof x === "string")), ...formObjects] };
}

// A random 16-byte value, hex (tests and uploads).
export const hex = (bytes = 10) => randomBytes(bytes).toString("hex");
