import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { job as readJob, type JobDetail } from "../../../../../lib/jobs.ts";
import { viewer } from "../../../../../lib/session.ts";
import { AddForm } from "./add-form.tsx";

// Adding someone the team met: a referral, a CV received by email.
export default async function AddCandidate({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { id } = await params;
  let detail: JobDetail;
  try {
    detail = await readJob(db(), v.member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  if (detail.access !== "manage") notFound();
  const { t, locale } = v;
  return (
    <div className="narrow">
      <Link className="back-link" href={`/chest/jobs/${detail.job.id}`}><Back />{detail.job.title}</Link>
      <div className="page-head"><h1>{t.addForm.title}</h1></div>
      <p className="lede-s">{t.addForm.intro}</p>
      <AddForm jobId={detail.job.id} stages={detail.stages.map(s => ({ id: s.id, name: s.name }))} language={detail.job.language} locale={locale}
        t={{ addForm: t.addForm, apply: t.apply, candidate: t.candidate, errors: t.errors }} />
    </div>
  );
}
