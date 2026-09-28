import { notFound } from "next/navigation";
import { Check } from "../../../components/icons.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { retentionWords } from "../../../lib/careers.ts";
import { db } from "../../../lib/db.ts";
import { format } from "../../../lib/i18n/index.ts";
import { publicJob, settings } from "../../../lib/jobs.ts";
import { publicWords } from "../../../lib/session.ts";

// After applying: it arrived, the team will write. Nothing of the
// candidate is in the address or on the page.
export default async function Thanks({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ mailed?: string }> }) {
  const { slug } = await params;
  const { mailed } = await searchParams;
  const { t, locale } = await publicWords();
  const sql = db();
  const job = await publicJob(sql, slug);
  if (!job) notFound();
  const s = await settings(sql);
  const company = s.companyName || t.careers.titlePlain;
  const foot = <><span>{format(t.careers.footer, { company })}</span><span>{format(t.careers.privacy, { period: retentionWords(t, s.retentionMonths) })}</span></>;
  return (
    <PublicShell company={company} locale={locale} label={t.careers.language} back={`/${job.slug}/thanks${mailed ? "?mailed=1" : ""}`} foot={foot}>
      <section className="thanks" role="status">
        <span className="thanks-mark" aria-hidden="true"><Check /></span>
        <h1 className="display">{t.thanks.title}</h1>
        <p className="lede">{format(t.thanks.body, { job: job.title })}</p>
        {mailed && <p>{t.thanks.emailed}</p>}
        <p>{t.thanks.next}</p>
        <p><a className="button quiet" href="/">{t.thanks.back}</a></p>
      </section>
    </PublicShell>
  );
}
