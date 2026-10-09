import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";

// Who may do what, in one place. Roles are chest.json's, strongest first;
// the owner, the admins and the tool's builders enter with the first.
//
// - recruiter: everything — jobs, stages, interviewers, candidates, moves,
//   rejections, emails, erasure, export, the careers page's settings;
// - interviewer: only the jobs they are on (a recruiter puts them there):
//   sees those jobs' candidates and CVs, reads the notes, gives feedback.
//   Never moves a candidate, never changes a setting.
export const roles = ["recruiter", "interviewer"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "jobs.manage"
  | "candidates.manage"
  | "candidates.erase"
  | "feedback.give"
  | "settings"
  | "export";

const grants: Record<Role, readonly Ability[]> = {
  recruiter: ["jobs.manage", "candidates.manage", "candidates.erase", "feedback.give", "settings", "export"],
  interviewer: ["feedback.give"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// What someone may do on one job: "manage" (a recruiter), "interview" (an
// interviewer on it), or null — then the job does not exist for them: a
// page or an action answers not_found, never forbidden.
export type JobAccess = "manage" | "interview";

export async function jobAccess(sql: Query, actor: Member | null, jobId: string): Promise<JobAccess | null> {
  const role = roleOf(actor);
  if (!actor || !role) return null;
  if (role === "recruiter") return "manage";
  const [row] = await sql<{ x: number }[]>`select 1 as x from job_interviewers where job_id = ${jobId} and member_id = ${actor.id}`;
  return row ? "interview" : null;
}

// The roles who hear of new applications (the bell and the tile).
export const recruiting: readonly Role[] = ["recruiter"];
