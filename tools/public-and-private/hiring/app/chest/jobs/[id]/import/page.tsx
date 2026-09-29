import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { job as readJob, type JobDetail } from "../../../../../lib/jobs.ts";
import { viewer } from "../../../../../lib/session.ts";
import { stageLabel } from "../../../../../lib/stages.ts";
import { ImportView } from "./import-view.tsx";

// Bringing candidates from the tool the company leaves (Teamtailor,
// Welcome to the Jungle, Workable, a spreadsheet): their export's CSV, the
// columns checked, the stages matched, then their CVs.
export default async function Import({ params }: { params: Promise<{ id: string }> }) {
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
      <div className="page-head"><h1>{t.importer.title}</h1></div>
      <p className="lede-s">{t.importer.intro}</p>
      <ImportView jobId={detail.job.id} language={detail.job.language} stages={detail.stages.map(s => ({ id: s.id, name: stageLabel(s, t.jobSettings.defaults), hired: s.hired }))} locale={locale}
        t={{ importer: t.importer, errors: t.errors, common: t.common, languages: t.addForm }} />
    </div>
  );
}
