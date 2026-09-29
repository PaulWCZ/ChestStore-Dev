import { PageHeader } from "@argentic/chest-ui/components";
import * as chest from "@argentic/chest-sdk/chest";
import { notFound } from "next/navigation";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { job as readJob, settings, type JobDetail } from "../../../../../lib/jobs.ts";
import { countryNames } from "../../../../../lib/countries.ts";
import { viewer } from "../../../../../lib/session.ts";
import { dayOf } from "../../../../../lib/time.ts";
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
      <PageHeader title={t.jobForm.editTitle} />
      <JobForm job={detail.job} defaultLanguage={locale} defaultCountry={(await settings(db())).country} countryNames={countryNames(locale)} today={dayOf(new Date(), chest.timeZone())} t={{ jobForm: t.jobForm, facts: t.facts, errors: t.errors, date: t.dates }} />
    </div>
  );
}
