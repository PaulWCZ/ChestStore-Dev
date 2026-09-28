import type { Member } from "@argentic/chest-sdk/member";
import type { Sql } from "../../lib/db.ts";
import * as jobs from "../../lib/jobs.ts";

// A job as a recruiter writes it: open, with the default stages.
export const stageNames = ["New", "Screening", "Interview", "Offer", "Hired"];

export async function openJob(sql: Sql, actor: Member, title = "Senior furniture designer"): Promise<jobs.Job> {
  const job = await jobs.createJob(sql, actor, { title, team: "Workshop", place: "Lyon", contract: "permanent", remote: "hybrid", description: "## The job\n- Draw **beautiful** chairs", salaryMin: "42 000", salaryMax: "50000" }, stageNames);
  return (await jobs.setJobState(sql, actor, job.id, "open")).job;
}

export const application = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug, name: "Lucie Garnier", email: "lucie@example.com", phone: "+33 6 12 34 56 78", link: "linkedin.com/in/lucie", coverLetter: "I love wood.", consent: true, language: "fr", cv: null, ...extra,
});
