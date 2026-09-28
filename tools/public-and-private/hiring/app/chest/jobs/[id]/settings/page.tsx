import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { job as readJob, type JobDetail } from "../../../../../lib/jobs.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { viewer } from "../../../../../lib/session.ts";
import { teammates } from "../../../../../lib/team.ts";
import { JobSettingsView } from "./job-settings-view.tsx";

// A job's stages and interviewers, for a recruiter.
export default async function JobSettings({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { id } = await params;
  const sql = db();
  let detail: JobDetail;
  try {
    detail = await readJob(sql, v.member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  if (detail.access !== "manage") notFound();
  const { t, locale } = v;
  const [who, team] = await Promise.all([people(detail.interviewers), teammates()]);
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from candidates where job_id = ${detail.job.id}`;
  const stageCounts = await sql<{ stage_id: string; n: number }[]>`select stage_id, count(*)::int as n from candidates where job_id = ${detail.job.id} group by stage_id`;
  return (
    <div className="narrow">
      <Link className="back-link" href={`/chest/jobs/${detail.job.id}`}><Back />{detail.job.title}</Link>
      <div className="page-head"><h1>{t.jobSettings.title}</h1></div>
      <JobSettingsView
        jobId={detail.job.id}
        stages={detail.stages.map(s => ({ ...s, count: stageCounts.find(c => String(c.stage_id) === s.id)?.n ?? 0 }))}
        interviewers={detail.interviewers.map(m => ({ id: m, name: nameOf(who.get(m), locale), photo: who.get(m)?.photo ?? null }))}
        choices={team.filter(m => !detail.interviewers.includes(m.id)).map(m => ({ id: m.id, name: m.name, role: m.role === "recruiter" ? t.roles.recruiter : m.role === "interviewer" ? t.roles.interviewer : "" }))}
        deletable={(count?.n ?? 0) === 0}
        t={{ jobSettings: t.jobSettings, errors: t.errors, common: t.common }}
      />
    </div>
  );
}
