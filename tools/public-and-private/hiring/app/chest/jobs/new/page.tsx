import { PageHeader } from "@argentic/chest-ui/components";
import { chest } from "@argentic/chest-sdk/chest";
import { notFound } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { countryNames } from "../../../../lib/countries.ts";
import { db } from "../../../../lib/db.ts";
import { isJobTemplate, settings } from "../../../../lib/jobs.ts";
import { viewer } from "../../../../lib/session.ts";
import { dayOf } from "../../../../lib/time.ts";
import { JobForm } from "../job-form.tsx";

// A new job, blank or from a template (?template=officeManager: the first
// screen's jobs to start from), in the recruiter's language.
export default async function NewJob({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v || !can(v.member, "jobs.manage")) notFound();
  const { t, locale } = v;
  const key = (await searchParams)["template"];
  const start = isJobTemplate(key) ? t.jobTemplates.items[key] : undefined;
  return (
    <div className="narrow">
      <PageHeader title={t.jobForm.newTitle} />
      <JobForm job={null} {...(start ? { start: { title: start.title, team: start.team, description: start.description } } : {})} defaultLanguage={locale} defaultCountry={(await settings(db())).country} countryNames={countryNames(locale)} today={dayOf(new Date(), chest.timeZone)} t={{ jobForm: t.jobForm, facts: t.facts, errors: t.errors, date: t.dates }} />
    </div>
  );
}
