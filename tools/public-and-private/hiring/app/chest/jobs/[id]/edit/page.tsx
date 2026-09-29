import { notFound } from "next/navigation";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { job as readJob, settings, type JobDetail } from "../../../../../lib/jobs.ts";
import { countryNames } from "../../../../../lib/countries.ts";
import { viewer } from "../../../../../lib/session.ts";
import { JobForm } from "../../job-form.tsx";

export default async function EditJob({ params }: { params: Promise<{ id: string }> }) {
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
      <div className="page-head"><h1>{t.jobForm.editTitle}</h1></div>
      <JobForm job={detail.job} defaultLanguage={locale} defaultCountry={(await settings(db())).country} countryNames={countryNames(locale)} t={{ jobForm: t.jobForm, facts: t.facts, errors: t.errors }} />
    </div>
  );
}
