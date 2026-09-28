import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can, jobAccess, roleOf, type JobAccess } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import {
  amount,
  clean,
  id,
  isContract,
  isCurrency,
  isJobState,
  isLanguage,
  isMemberId,
  isPeriod,
  isRemote,
  limits,
  retentionChoices,
  slugify,
  type Contract,
  type Currency,
  type JobState,
  type Language,
  type Period,
  type Remote,
} from "./model.ts";

// Jobs, their stages and their interviewers; the careers page's settings.
// Team functions take (sql, actor, …) and check the rights first; the
// public ones read only what the careers page shows. Codes, never sentences.

export type Job = {
  id: string;
  slug: string;
  title: string;
  team: string;
  place: string;
  contract: Contract;
  remote: Remote;
  description: string;
  language: Language;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: Currency;
  salaryPeriod: Period;
  salaryShown: boolean;
  state: JobState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  closedAt: string | null;
};
export type Stage = { id: string; name: string; position: number; hired: boolean };

type JobDb = {
  id: string; slug: string; title: string; team: string; place: string; contract: Contract; remote: Remote; description: string; language: Language;
  salary_min: number | null; salary_max: number | null; salary_currency: Currency; salary_period: Period; salary_shown: boolean; state: JobState;
  created_by: string; created_at: Date; updated_at: Date; opened_at: Date | null; closed_at: Date | null;
};
const iso = (d: Date | null) => (d ? d.toISOString() : null);
export const toJob = (r: JobDb): Job => ({
  id: String(r.id), slug: r.slug, title: r.title, team: r.team, place: r.place, contract: r.contract, remote: r.remote, description: r.description, language: r.language,
  salaryMin: r.salary_min, salaryMax: r.salary_max, salaryCurrency: r.salary_currency, salaryPeriod: r.salary_period, salaryShown: r.salary_shown, state: r.state,
  createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), openedAt: iso(r.opened_at), closedAt: iso(r.closed_at),
});
const toStage = (r: { id: string; name: string; position: number; hired: boolean }): Stage => ({ id: String(r.id), name: r.name, position: r.position, hired: r.hired });

// ---- Settings --------------------------------------------------------------

// companyName is what the careers page is signed with: the tool's own
// setting, or the company's name the Chest gives (chest.company()).
export type Settings = { companyName: string; ownName: string; intro: string; careersOpen: boolean; retentionMonths: number };
const defaults = { intro: "", careersOpen: true, retentionMonths: 24 };

export async function settings(sql: Query): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const found = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const own = typeof found["company_name"] === "string" ? found["company_name"] : "";
  return {
    companyName: own || chest.company(),
    ownName: own,
    intro: typeof found["intro"] === "string" ? found["intro"] : defaults.intro,
    careersOpen: typeof found["careers_open"] === "boolean" ? found["careers_open"] : defaults.careersOpen,
    retentionMonths: typeof found["retention_months"] === "number" && (retentionChoices as readonly number[]).includes(found["retention_months"]) ? found["retention_months"] : defaults.retentionMonths,
  };
}

async function setSetting(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

export async function saveSettings(sql: Sql, actor: Member | null, input: { companyName?: unknown; intro?: unknown; careersOpen?: unknown; retentionMonths?: unknown }): Promise<Settings> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const companyName = input.companyName === undefined ? undefined : clean(input.companyName, limits.companyName, { optional: true });
  const intro = input.intro === undefined ? undefined : clean(input.intro, limits.intro, { multiline: true, optional: true });
  if (input.careersOpen !== undefined && typeof input.careersOpen !== "boolean") throw new AppError("invalid");
  const months = input.retentionMonths === undefined ? undefined : Number(input.retentionMonths);
  if (months !== undefined && !(retentionChoices as readonly number[]).includes(months)) throw new AppError("invalid");
  await sql.begin(async tx => {
    if (companyName !== undefined) await setSetting(tx, "company_name", companyName);
    if (intro !== undefined) await setSetting(tx, "intro", intro);
    if (typeof input.careersOpen === "boolean") await setSetting(tx, "careers_open", input.careersOpen);
    if (months !== undefined) await setSetting(tx, "retention_months", months);
  });
  return settings(sql);
}

// ---- Reading jobs ----------------------------------------------------------

export type JobRow = Job & { stages: (Stage & { count: number })[]; active: number; rejected: number; unseen: number; waiting: number };

// jobs lists the jobs someone may see (a recruiter all, an interviewer
// those they are on), with how many candidates are at each stage, how many
// new ones the reader has not opened and how many wait for their feedback.
export async function listJobs(sql: Sql, actor: Member | null): Promise<JobRow[]> {
  const role = roleOf(actor);
  if (!actor || !role) throw new AppError("forbidden");
  const rows = await sql<JobDb[]>`
    select j.* from jobs j
    where ${role === "recruiter" ? sql`true` : sql`exists (select 1 from job_interviewers i where i.job_id = j.id and i.member_id = ${actor.id})`}
    order by case j.state when 'open' then 0 when 'draft' then 1 else 2 end, coalesce(j.opened_at, j.created_at) desc
    limit ${limits.jobs}`;
  if (rows.length === 0) return [];
  const ids = rows.map(r => String(r.id));
  const stages = await sql<{ id: string; job_id: string; name: string; position: number; hired: boolean; count: number }[]>`
    select s.id, s.job_id, s.name, s.position, s.hired, (select count(*)::int from candidates c where c.stage_id = s.id and c.status = 'active') as count
    from stages s where s.job_id in ${sql(ids)} order by s.job_id, s.position`;
  const counts = await sql<{ job_id: string; active: number; rejected: number; unseen: number }[]>`
    select c.job_id,
      count(*) filter (where c.status = 'active')::int as active,
      count(*) filter (where c.status = 'rejected')::int as rejected,
      count(*) filter (where c.status = 'active' and c.source = 'careers' and c.stage_id = (select s.id from stages s where s.job_id = c.job_id order by s.position, s.id limit 1) and not exists (select 1 from candidate_seen s where s.candidate_id = c.id and s.member_id = ${actor.id}))::int as unseen
    from candidates c where c.job_id in ${sql(ids)} group by c.job_id`;
  const waiting = await sql<{ job_id: string; n: number }[]>`
    select c.job_id, count(*)::int as n from feedback_requests r join candidates c on c.id = r.candidate_id
    where r.member_id = ${actor.id} and c.job_id in ${sql(ids)} group by c.job_id`;
  return rows.map(r => {
    const jobId = String(r.id);
    const c = counts.find(x => String(x.job_id) === jobId);
    return {
      ...toJob(r),
      stages: stages.filter(s => String(s.job_id) === jobId).map(s => ({ ...toStage(s), count: s.count })),
      active: c?.active ?? 0,
      rejected: c?.rejected ?? 0,
      unseen: role === "recruiter" ? c?.unseen ?? 0 : 0,
      waiting: waiting.find(w => String(w.job_id) === jobId)?.n ?? 0,
    };
  });
}

export async function stagesOf(sql: Query, jobId: string): Promise<Stage[]> {
  const rows = await sql<{ id: string; name: string; position: number; hired: boolean }[]>`select id, name, position, hired from stages where job_id = ${jobId} order by position, id`;
  return rows.map(toStage);
}

export async function interviewersOf(sql: Query, jobId: string): Promise<string[]> {
  return (await sql<{ member_id: string }[]>`select member_id from job_interviewers where job_id = ${jobId} order by added_at, member_id`).map(r => r.member_id);
}

export type JobDetail = { job: Job; access: JobAccess; stages: Stage[]; interviewers: string[] };

// job reads one job for the team: not_found when it does not exist for the
// reader (an interviewer not on it).
export async function job(sql: Sql, actor: Member | null, jobId: unknown): Promise<JobDetail> {
  const key = id(jobId);
  const access = await jobAccess(sql, actor, key);
  if (!access) throw new AppError("not_found");
  const [row] = await sql<JobDb[]>`select * from jobs where id = ${key}`;
  if (!row) throw new AppError("not_found");
  return { job: toJob(row), access, stages: await stagesOf(sql, key), interviewers: await interviewersOf(sql, key) };
}

// ---- Writing jobs ----------------------------------------------------------

export type JobInput = {
  title: unknown; team?: unknown; place?: unknown; contract: unknown; remote: unknown; description?: unknown; language?: unknown;
  salaryMin?: unknown; salaryMax?: unknown; salaryCurrency?: unknown; salaryPeriod?: unknown; salaryShown?: unknown;
};

function readJob(input: JobInput) {
  const title = clean(input.title, limits.title);
  if (!isContract(input.contract) || !isRemote(input.remote)) throw new AppError("invalid");
  const salaryMin = amount(input.salaryMin), salaryMax = amount(input.salaryMax);
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) throw new AppError("salary_order");
  const currency = input.salaryCurrency === undefined || input.salaryCurrency === "" ? "EUR" : input.salaryCurrency;
  const period = input.salaryPeriod === undefined || input.salaryPeriod === "" ? "year" : input.salaryPeriod;
  if (!isCurrency(currency) || !isPeriod(period)) throw new AppError("invalid");
  const language = input.language === undefined ? "en" : input.language;
  if (!isLanguage(language)) throw new AppError("invalid");
  if (input.salaryShown !== undefined && typeof input.salaryShown !== "boolean") throw new AppError("invalid");
  return {
    title,
    team: clean(input.team, limits.team, { optional: true }),
    place: clean(input.place, limits.place, { optional: true }),
    contract: input.contract,
    remote: input.remote,
    description: clean(input.description, limits.description, { multiline: true, optional: true }),
    language,
    salaryMin,
    salaryMax,
    salaryCurrency: currency,
    salaryPeriod: period,
    salaryShown: input.salaryShown ?? true,
  };
}

// A slug nobody else has: the title's, then -2, -3…
async function freeSlug(sql: Query, title: string, except: string | null): Promise<string> {
  const base = slugify(title);
  const taken = new Set((await sql<{ slug: string }[]>`select slug from jobs where (slug = ${base} or slug like ${base + "-%"}) and id <> ${except ?? "0"}`).map(r => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// createJob writes a draft with the default stages (their names in the
// writer's language: they are the team's words from then on).
export async function createJob(sql: Sql, actor: Member | null, input: JobInput, stageNames: readonly string[]): Promise<Job> {
  if (!actor || !can(actor, "jobs.manage")) throw new AppError("forbidden");
  const v = readJob(input);
  const names = stageNames.map(n => clean(n, limits.stageName));
  if (names.length < 2 || names.length > limits.stages) throw new AppError("invalid");
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from jobs`;
  if ((count?.n ?? 0) >= limits.jobs) throw new AppError("too_many", { max: limits.jobs });
  return sql.begin(async tx => {
    const slug = await freeSlug(tx, v.title, null);
    const [row] = await tx<JobDb[]>`
      insert into jobs (slug, title, team, place, contract, remote, description, language, salary_min, salary_max, salary_currency, salary_period, salary_shown, created_by)
      values (${slug}, ${v.title}, ${v.team}, ${v.place}, ${v.contract}, ${v.remote}, ${v.description}, ${v.language}, ${v.salaryMin}, ${v.salaryMax}, ${v.salaryCurrency}, ${v.salaryPeriod}, ${v.salaryShown}, ${actor.id})
      returning *`;
    const jobId = String(row!.id);
    for (const [i, name] of names.entries()) await tx`insert into stages (job_id, name, position, hired) values (${jobId}, ${name}, ${i}, ${i === names.length - 1})`;
    return toJob(row!);
  });
}

export async function updateJob(sql: Sql, actor: Member | null, jobId: unknown, input: JobInput): Promise<Job> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  const key = id(jobId);
  const v = readJob(input);
  return sql.begin(async tx => {
    const [current] = await tx<{ state: JobState; title: string }[]>`select state, title from jobs where id = ${key} for update`;
    if (!current) throw new AppError("not_found");
    // A draft's address follows its title; once published, it stays.
    const slug = current.state === "draft" && current.title !== v.title ? await freeSlug(tx, v.title, key) : null;
    const [row] = await tx<JobDb[]>`
      update jobs set title = ${v.title}, team = ${v.team}, place = ${v.place}, contract = ${v.contract}, remote = ${v.remote}, description = ${v.description}, language = ${v.language},
        salary_min = ${v.salaryMin}, salary_max = ${v.salaryMax}, salary_currency = ${v.salaryCurrency}, salary_period = ${v.salaryPeriod}, salary_shown = ${v.salaryShown},
        slug = coalesce(${slug}, slug), updated_at = now()
      where id = ${key} returning *`;
    return toJob(row!);
  });
}

// setJobState publishes a job (open), closes it, or takes it back to draft.
// A job opens only with a description: the careers page never shows an
// empty ad.
export async function setJobState(sql: Sql, actor: Member | null, jobId: unknown, state: unknown): Promise<{ job: Job; previous: JobState }> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  if (!isJobState(state)) throw new AppError("invalid");
  const key = id(jobId);
  return sql.begin(async tx => {
    const [current] = await tx<{ state: JobState; description: string }[]>`select state, description from jobs where id = ${key} for update`;
    if (!current) throw new AppError("not_found");
    if (state === "open" && current.description.trim() === "") throw new AppError("empty");
    const [row] = await tx<JobDb[]>`
      update jobs set state = ${state}, updated_at = now(),
        opened_at = case when ${state} = 'open' then coalesce(opened_at, now()) else opened_at end,
        closed_at = case when ${state} = 'closed' then now() when ${state} = 'open' then null else closed_at end
      where id = ${key} returning *`;
    return { job: toJob(row!), previous: current.state };
  });
}

// removeJob deletes a job nobody applied to (a draft written by mistake).
export async function removeJob(sql: Sql, actor: Member | null, jobId: unknown): Promise<void> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  const key = id(jobId);
  await sql.begin(async tx => {
    const [row] = await tx<{ n: number }[]>`select (select count(*)::int from candidates where job_id = j.id) as n from jobs j where j.id = ${key} for update`;
    if (!row) throw new AppError("not_found");
    if (row.n > 0) throw new AppError("has_candidates");
    await tx`delete from jobs where id = ${key}`;
  });
}

// ---- Stages ----------------------------------------------------------------

async function lockJob(sql: Query, jobId: string): Promise<void> {
  const [row] = await sql<{ id: string }[]>`select id from jobs where id = ${jobId} for update`;
  if (!row) throw new AppError("not_found");
}

// addStage puts a new stage just before "hired".
export async function addStage(sql: Sql, actor: Member | null, jobId: unknown, name: unknown): Promise<Stage> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  const key = id(jobId);
  const text = clean(name, limits.stageName);
  return sql.begin(async tx => {
    await lockJob(tx, key);
    const list = await stagesOf(tx, key);
    if (list.length >= limits.stages) throw new AppError("too_many", { max: limits.stages });
    const hired = list.find(s => s.hired);
    const at = hired ? hired.position : list.length;
    if (hired) await tx`update stages set position = position + 1 where job_id = ${key} and position >= ${at}`;
    const [row] = await tx<{ id: string; name: string; position: number; hired: boolean }[]>`insert into stages (job_id, name, position) values (${key}, ${text}, ${at}) returning id, name, position, hired`;
    return toStage(row!);
  });
}

async function stageOf(sql: Query, stageId: unknown): Promise<Stage & { jobId: string }> {
  const [row] = await sql<{ id: string; job_id: string; name: string; position: number; hired: boolean }[]>`select id, job_id, name, position, hired from stages where id = ${id(stageId)}`;
  if (!row) throw new AppError("not_found");
  return { ...toStage(row), jobId: String(row.job_id) };
}

export async function renameStage(sql: Sql, actor: Member | null, stageId: unknown, name: unknown): Promise<Stage> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  const text = clean(name, limits.stageName);
  const s = await stageOf(sql, stageId);
  await sql`update stages set name = ${text} where id = ${s.id}`;
  return { ...s, name: text };
}

// moveStage swaps a stage with its neighbour; "hired" stays last.
export async function moveStage(sql: Sql, actor: Member | null, stageId: unknown, direction: unknown): Promise<void> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  if (direction !== "up" && direction !== "down") throw new AppError("invalid");
  const s = await stageOf(sql, stageId);
  await sql.begin(async tx => {
    await lockJob(tx, s.jobId);
    const list = await stagesOf(tx, s.jobId);
    const at = list.findIndex(x => x.id === s.id);
    const other = list[direction === "up" ? at - 1 : at + 1];
    if (!other || other.hired || s.hired) throw new AppError("invalid");
    await tx`update stages set position = ${other.position} where id = ${s.id}`;
    await tx`update stages set position = ${list[at]!.position} where id = ${other.id}`;
  });
}

// removeStage deletes an empty stage; the job keeps at least one stage
// before "hired", which is never removed.
export async function removeStage(sql: Sql, actor: Member | null, stageId: unknown): Promise<void> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  const s = await stageOf(sql, stageId);
  if (s.hired) throw new AppError("invalid");
  await sql.begin(async tx => {
    await lockJob(tx, s.jobId);
    const [used] = await tx<{ n: number }[]>`select count(*)::int as n from candidates where stage_id = ${s.id}`;
    if ((used?.n ?? 0) > 0) throw new AppError("stage_not_empty");
    const list = await stagesOf(tx, s.jobId);
    if (list.filter(x => !x.hired).length <= 1) throw new AppError("last_stage");
    await tx`delete from stages where id = ${s.id}`;
  });
}

// ---- Interviewers ----------------------------------------------------------

// addInterviewer puts a member on a job (hasTool: the Chest says they have
// the tool). Says whether they were not on it yet.
export async function addInterviewer(sql: Sql, actor: Member | null, jobId: unknown, memberId: unknown, hasTool: (memberId: string) => Promise<boolean>): Promise<boolean> {
  if (!actor || !can(actor, "jobs.manage")) throw new AppError("forbidden");
  const key = id(jobId);
  if (!isMemberId(memberId) || !(await hasTool(memberId))) throw new AppError("invalid");
  return sql.begin(async tx => {
    await lockJob(tx, key);
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from job_interviewers where job_id = ${key}`;
    if ((count?.n ?? 0) >= limits.interviewers) throw new AppError("too_many", { max: limits.interviewers });
    const added = await tx`insert into job_interviewers (job_id, member_id, added_by) values (${key}, ${memberId}, ${actor.id}) on conflict do nothing`;
    return added.count > 0;
  });
}

// removeInterviewer takes a member off a job: what they wrote stays, the
// feedback still asked of them on its candidates is no longer asked.
export async function removeInterviewer(sql: Sql, actor: Member | null, jobId: unknown, memberId: unknown): Promise<void> {
  if (!can(actor, "jobs.manage")) throw new AppError("forbidden");
  const key = id(jobId);
  if (!isMemberId(memberId)) throw new AppError("invalid");
  await sql.begin(async tx => {
    await tx`delete from job_interviewers where job_id = ${key} and member_id = ${memberId}`;
    await tx`delete from feedback_requests r using candidates c where c.id = r.candidate_id and c.job_id = ${key} and r.member_id = ${memberId}`;
  });
}

// ---- The careers page ------------------------------------------------------

export type PublicJob = Pick<Job, "slug" | "title" | "team" | "place" | "contract" | "remote" | "description" | "language" | "state" | "openedAt"> & { salary: { min: number | null; max: number | null; currency: Currency; period: Period } | null };

const toPublic = (j: Job): PublicJob => ({
  slug: j.slug, title: j.title, team: j.team, place: j.place, contract: j.contract, remote: j.remote, description: j.description, language: j.language, state: j.state, openedAt: j.openedAt,
  salary: j.salaryShown && (j.salaryMin !== null || j.salaryMax !== null) ? { min: j.salaryMin, max: j.salaryMax, currency: j.salaryCurrency, period: j.salaryPeriod } : null,
});

// The open jobs, newest first: nothing else of the tool is public.
export async function publicJobs(sql: Query): Promise<PublicJob[]> {
  const rows = await sql<JobDb[]>`select * from jobs where state = 'open' order by opened_at desc, id desc limit ${limits.jobs}`;
  return rows.map(r => toPublic(toJob(r)));
}

// One job's page: open, or closed (the page says so); a draft does not exist.
export async function publicJob(sql: Query, slug: unknown): Promise<(PublicJob & { id: string }) | null> {
  if (typeof slug !== "string" || slug.length > 80) return null;
  const [row] = await sql<JobDb[]>`select * from jobs where slug = ${slug} and state <> 'draft'`;
  return row ? { ...toPublic(toJob(row)), id: String(row.id) } : null;
}
