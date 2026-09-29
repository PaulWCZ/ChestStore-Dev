import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Back, Briefcase, Coins, House, Pin } from "../../components/icons.tsx";
import { PublicShell } from "../../components/public-shell.tsx";
import { RichText } from "../../components/rich-text.tsx";
import { brandOf, retentionWords } from "../../lib/careers.ts";
import { db } from "../../lib/db.ts";
import { salaryText } from "../../lib/facts.ts";
import { format, formatDate } from "../../lib/i18n/index.ts";
import { publicJob, settings, takesApplications } from "../../lib/jobs.ts";
import { companyOf, reachJob } from "../../lib/public-feed.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { jobPosting, jsonLd } from "../../lib/reach.ts";
import { plain } from "../../lib/rich-text.ts";
import { nonceOf, publicWords } from "../../lib/session.ts";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const job = await publicJob(db(), slug);
  const { t } = await publicWords();
  const s = await settings(db());
  // A job's page is for search engines too: indexed, with its canonical
  // address on the careers page's host.
  const origin = publicOrigin(await headers());
  return job
    ? { title: `${job.title} — ${s.companyName || t.careers.titlePlain}`, description: plain(job.description), robots: { index: true, follow: true }, ...(origin ? { alternates: { canonical: `${origin}/${job.slug}` } } : {}) }
    : { title: t.notFound.title };
}

// One job, as a candidate reads it: what, where, how much, the description,
// and the one thing to do — apply.
export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, locale } = await publicWords();
  const sql = db();
  const job = await publicJob(sql, slug);
  if (!job) notFound();
  const s = await settings(sql);
  const company = s.companyName || t.careers.titlePlain;
  // The ad is written in its own language; the page's words follow the
  // visitor's.
  const salary = job.salary ? salaryText(job.salary, t.facts, locale) : "";
  const open = takesApplications(job) && s.careersOpen;
  // Google for Jobs reads the job from its JobPosting data, while it takes
  // applications only (a closed job's page keeps no markup: Google's rule
  // for expired jobs).
  const h = await headers();
  const origin = publicOrigin(h) ?? "";
  const posting = open ? jsonLd(jobPosting(reachJob(job), companyOf(s, origin), `${origin}/${job.slug}`)) : null;
  const facts = [
    { icon: <Briefcase />, text: t.facts.contract[job.contract] },
    { icon: <Pin />, text: job.place },
    { icon: <House />, text: t.facts.remote[job.remote] },
    { icon: <Coins />, text: salary },
  ].filter(f => f.text);
  const foot = <><span>{format(t.careers.footer, { company })}</span><span>{format(t.careers.privacy, { period: retentionWords(t, s.retentionMonths) })}</span></>;
  return (
    <PublicShell company={company} locale={locale} label={t.careers.language} back={`/${job.slug}`} foot={foot} brand={brandOf(s)} website={t.careers.website}>
      {posting && <script type="application/ld+json" nonce={nonceOf(h)} dangerouslySetInnerHTML={{ __html: posting }} />}
      <a className="back-link" href="/"><Back />{t.careers.allJobs}</a>
      <article className="job-page">
        <header className="job-hero">
          {job.team && <p className="kicker">{job.team}</p>}
          <h1 className="display" lang={job.language}>{job.title}</h1>
          <ul className="facts" aria-label={t.careers.facts}>
            {facts.map((f, i) => <li key={i}>{f.icon}<span>{f.text}</span></li>)}
          </ul>
          {job.openedAt && <p className="muted small">{format(t.careers.posted, { date: formatDate(job.openedAt, locale, { day: "numeric", month: "long", year: "numeric" }) })}</p>}
          {open && <div className="hero-actions"><a className="button big" href={`/${job.slug}/apply`}>{t.careers.apply}</a></div>}
        </header>
        {!open && (
          <section className="notice-block" role="status">
            <h2>{t.careers.jobClosed}</h2>
            <p>{t.careers.jobClosedBody}</p>
            <p><a className="button quiet" href="/">{t.careers.seeOthers}</a></p>
          </section>
        )}
        <div className="job-body">
          <div lang={job.language}><RichText source={job.description} className="prose" /></div>
          {open && (
            <aside className="apply-card" aria-labelledby="apply-card">
              <h2 id="apply-card">{t.careers.applyNow}</h2>
              <p>{t.apply.intro}</p>
              <a className="button big" href={`/${job.slug}/apply`}>{t.careers.apply}</a>
            </aside>
          )}
        </div>
        {open && <div className="apply-bar"><a className="button big" href={`/${job.slug}/apply`}>{t.careers.apply}</a></div>}
      </article>
    </PublicShell>
  );
}
