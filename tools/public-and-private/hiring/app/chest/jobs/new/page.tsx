import { notFound } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { viewer } from "../../../../lib/session.ts";
import { JobForm } from "../job-form.tsx";

export default async function NewJob() {
  const v = await viewer();
  if (!v || !can(v.member, "jobs.manage")) notFound();
  const { t, locale } = v;
  return (
    <div className="narrow">
      <div className="page-head"><h1>{t.jobForm.newTitle}</h1></div>
      <JobForm job={null} defaultLanguage={locale} t={{ jobForm: t.jobForm, facts: t.facts, errors: t.errors }} />
    </div>
  );
}
