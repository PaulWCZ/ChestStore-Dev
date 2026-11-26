import type { Member } from "@argentic/chest-sdk/member";
import { roleOf } from "./access.ts";
import type { Query } from "./db.ts";
import { limits } from "../shared/model.ts";

// Who may join "job:<id>" (chest.json: the channel's "join"; migration
// 0010) is the Chest's to check, at every join, in the table job_live: an
// interviewer never hears of a job they are not on — when its candidates
// apply, move, are noted, written to or interviewed. admit writes the rows
// once Hiring has checked the member sees these jobs (jobs.readJob,
// candidates.readCandidate, visibleJobs below), and answers each job's
// mark: a job let in again after its row went (forget) gets a new one, and
// the page's live island joins its channel again (islands/LiveTeam.tsx).
export type Followed = { id: string; ticket: string };

export async function admit(sql: Query, jobIds: readonly string[], memberId: string): Promise<Followed[]> {
  const ids = [...new Set(jobIds)];
  if (ids.length === 0) return [];
  await sql`insert into job_live ${sql(ids.map(id => ({ job_id: id, member_id: memberId })))} on conflict do nothing`;
  const rows = await sql<{ job_id: string; since: Date }[]>`select job_id, since from job_live where member_id = ${memberId} and job_id in ${sql(ids)}`;
  const marks = new Map(rows.map(r => [String(r.job_id), String(r.since.getTime())]));
  return ids.flatMap(id => (marks.has(id) ? [{ id, ticket: marks.get(id)! }] : []));
}

// The jobs a page that is not one job's follows (the jobs, the search, the
// pool, the reports): a recruiter's every job, an interviewer's own — the
// same as jobs.listJobs, without its counts.
export async function visibleJobs(sql: Query, actor: Member): Promise<Followed[]> {
  const role = roleOf(actor);
  if (!role) return [];
  const rows = role === "recruiter"
    ? await sql<{ id: string }[]>`select id from jobs order by case state when 'open' then 0 when 'draft' then 1 else 2 end, coalesce(opened_at, created_at) desc limit ${limits.jobs}`
    : await sql<{ id: string }[]>`select job_id as id from job_interviewers where member_id = ${actor.id} order by job_id limit ${limits.jobs}`;
  return admit(sql, rows.map(r => String(r.id)), actor.id);
}

// forget takes the rows out wherever who sees a job may have changed: the
// Chest then takes those members out of the channels at once (their pages
// read themselves again, and are let in again if still allowed).
export async function forget(sql: Query, which: { job: string; member: string } | { member: string }): Promise<void> {
  if ("job" in which) await sql`delete from job_live where job_id = ${which.job} and member_id = ${which.member}`;
  else await sql`delete from job_live where member_id = ${which.member}`;
}
