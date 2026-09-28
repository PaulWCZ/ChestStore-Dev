import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Back } from "../../../components/icons.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { retentionWords } from "../../../lib/careers.ts";
import { db } from "../../../lib/db.ts";
import { formToken } from "../../../lib/guard.ts";
import { format } from "../../../lib/i18n/index.ts";
import { publicJob, settings } from "../../../lib/jobs.ts";
import { publicWords } from "../../../lib/session.ts";
import { ApplyForm } from "./apply-form.tsx";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const job = await publicJob(db(), slug);
  const { t } = await publicWords();
  return { title: job ? format(t.apply.title, { job: job.title }) : t.notFound.title };
}

// The application form: who you are, your CV, a few words, the consent.
export default async function Apply({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, locale } = await publicWords();
  const sql = db();
  const job = await publicJob(sql, slug);
  if (!job) notFound();
  const s = await settings(sql);
  const company = s.companyName || t.careers.titlePlain;
  const period = retentionWords(t, s.retentionMonths);
  const open = job.state === "open" && s.careersOpen;
  const foot = <><span>{format(t.careers.footer, { company })}</span><span>{format(t.careers.privacy, { period })}</span></>;
  return (
    <PublicShell company={company} locale={locale} label={t.careers.language} back={`/${job.slug}/apply`} foot={foot}>
      <a className="back-link" href={`/${job.slug}`}><Back />{job.title}</a>
      <div className="apply-head">
        <p className="kicker">{job.team || t.careers.kicker}</p>
        <h1 className="display small-display">{format(t.apply.title, { job: job.title })}</h1>
        <p className="lede">{t.apply.intro}</p>
      </div>
      {open ? (
        <section className="form-card">
          <ApplyForm slug={job.slug} started={formToken()} consent={format(t.apply.consent, { company, period })} t={{ apply: t.apply, errors: t.errors }} locale={locale} />
        </section>
      ) : (
        <section className="notice-block" role="status">
          <h2>{t.careers.jobClosed}</h2>
          <p>{t.careers.jobClosedBody}</p>
          <p><a className="button quiet" href="/">{t.careers.seeOthers}</a></p>
        </section>
      )}
    </PublicShell>
  );
}
