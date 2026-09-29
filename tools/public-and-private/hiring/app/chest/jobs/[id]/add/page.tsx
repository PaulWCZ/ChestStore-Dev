import { PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { job as readJob, type JobDetail } from "../../../../../lib/jobs.ts";
import { stageLabel } from "../../../../../lib/stages.ts";
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
  const { t } = v;
  return (
    <div className="narrow">
      <Link className="back-link" href={`/chest/jobs/${detail.job.id}`}><Back />{detail.job.title}</Link>
      <PageHeader title={t.addForm.title} intro={t.addForm.intro} />
      <AddForm jobId={detail.job.id} stages={detail.stages.map(s => ({ id: s.id, name: stageLabel(s, t.jobSettings.defaults) }))} language={detail.job.language}
        t={{ addForm: t.addForm, apply: t.apply, candidate: t.candidate, errors: t.errors, files: t.files }} />
    </div>
  );
}
