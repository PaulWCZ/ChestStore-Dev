import { PageHeader } from "@argentic/chest-ui/components";
import * as chest from "@argentic/chest-sdk/chest";
import { notFound } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { countryNames } from "../../../../lib/countries.ts";
import { db } from "../../../../lib/db.ts";
import { settings } from "../../../../lib/jobs.ts";
import { viewer } from "../../../../lib/session.ts";
import { dayOf } from "../../../../lib/time.ts";
import { JobForm } from "../job-form.tsx";

export default async function NewJob() {
  const v = await viewer();
  if (!v || !can(v.member, "jobs.manage")) notFound();
  const { t, locale } = v;
  return (
    <div className="narrow">
      <PageHeader title={t.jobForm.newTitle} />
      <JobForm job={null} defaultLanguage={locale} defaultCountry={(await settings(db())).country} countryNames={countryNames(locale)} today={dayOf(new Date(), chest.timeZone())} t={{ jobForm: t.jobForm, facts: t.facts, errors: t.errors, date: t.dates }} />
    </div>
  );
}
