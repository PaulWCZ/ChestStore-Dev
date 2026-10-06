import { Island, notFound, type PageContext, type View, type VisitorContext } from "@argentic/chest-app";
import type { ReactNode } from "react";
import { Arrow, Back, Briefcase, Check, Coins, House, Pin } from "../components/icons.tsx";
import { RichText } from "../components/rich-text.tsx";
import { localeOf, type Catalogue, type Locale } from "../i18n/index.ts";
import { brandOf, retentionWords, type Brand } from "../lib/careers.ts";
import { db } from "../lib/db.ts";
import { introFor, publicJob, publicJobs, settings, takesApplications, type PublicJob, type Settings } from "../lib/jobs.ts";
import { companyOf, reachJob } from "../lib/public-feed.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { jobPosting, jsonLd } from "../lib/reach.ts";
import { plain } from "../shared/rich-text.ts";
import { salaryText } from "../shared/facts.ts";
import { format, formatDate, plural } from "../shared/format.ts";
import { sheetOf } from "../theme.ts";
import { PublicShell } from "./public-shell.tsx";

// The careers pages (public: anyone): the company's page with its open
// jobs, a job, nothing else of the tool. Each is drawn in the careers
// frame (public-shell.tsx) with the company's settings; the look is the
// company's brand, else Hiring's own in the company's colour.
export type Careers = { t: Catalogue; locale: Locale; s: Settings; brand: Brand; company: string; logo: { url: string; alt: string; dark?: string | null } | null };

export async function careersOf(ctx: PageContext<VisitorContext>): Promise<Careers> {
  const s = await settings(db());
  const look = (await sheetOf("public", s.accent)).look;
  return { t: ctx.t, locale: localeOf(ctx.locale), s, brand: brandOf(s), company: s.companyName || ctx.t.careers.titlePlain, logo: look.source === "brand" ? look.logo ?? null : null };
}

// The frame of a careers page, with its footer: who the company is, how
// long an application is kept.
export function Frame({ c, back, children }: { c: Careers; back: string; children: ReactNode }) {
  const foot = <><span>{format(c.t.careers.footer, { company: c.company })}</span><span>{format(c.t.careers.privacy, { period: retentionWords(c.t, c.s.retentionMonths) })}</span></>;
  return <PublicShell company={c.company} logo={c.logo} brand={c.brand} locale={c.locale} back={back} t={c.t} foot={foot}>{children}</PublicShell>;
}

const indexed = <meta name="robots" content="index, follow" />;

// The careers page: the company, a few words, its photos, its open jobs.
export async function careersPage(ctx: PageContext<VisitorContext>): Promise<View> {
  const c = await careersOf(ctx);
  const { t, locale, s } = c;
  const list = s.careersOpen ? await publicJobs(db()) : [];
  const title = s.companyName ? format(t.careers.title, { company: s.companyName }) : t.careers.titlePlain;
  const intro = introFor(s, locale);
  return {
    title,
    exactTitle: true,
    head: <>{indexed}<link rel="alternate" type="application/rss+xml" href="/feed.xml" /></>,
    body: (
      <Frame c={c} back="/">
        <section className="hero">
          <p className="kicker">{t.careers.kicker}</p>
          <h1 className="display">{title}</h1>
          {/* Only what the company wrote: an empty careers page never
              speaks for it. */}
          {intro && <p className="lede">{intro}</p>}
        </section>
        {c.brand.photos.length > 0 && (
          <div className={`photos n${c.brand.photos.length}`}>
            {c.brand.photos.map(src => <img key={src} src={src} alt="" loading="lazy" />)}
          </div>
        )}
        {!s.careersOpen ? (
          <section className="notice-block">
            <h2>{t.careers.closed}</h2>
            <p>{t.careers.closedBody}</p>
          </section>
        ) : list.length === 0 ? (
          <section className="notice-block">
            <h2>{t.careers.none}</h2>
            <p>{t.careers.noneBody}</p>
          </section>
        ) : (
          <section aria-labelledby="open-jobs" className="openings">
            <div className="openings-head">
              <h2 id="open-jobs">{t.careers.openJobs}</h2>
              <span className="count">{plural(t.careers.count, list.length, locale)}</span>
            </div>
            <ol className="job-list">
              {list.map((j, i) => (
                <li key={j.slug}>
                  <a className="job-row" href={`/${j.slug}`} lang={j.language}>
                    <span className="index" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                    <span className="job-row-main">
                      <span className="job-row-title">{j.title}</span>
                      <span className="job-row-facts" lang={locale}>
                        {[j.team, j.place, t.facts.contract[j.contract], t.facts.remote[j.remote]].filter(Boolean).map((f, k) => <span key={k}>{f}</span>)}
                      </span>
                    </span>
                    <span className="job-row-go" aria-hidden="true"><Arrow /></span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </Frame>
    ),
  };
}

// A job a visitor may see (open, or closed: its page says so), or 404.
async function jobFor(ctx: PageContext<VisitorContext>): Promise<PublicJob> {
  return (await publicJob(db(), ctx.param("slug"))) ?? notFound();
}

// One job, as a candidate reads it: what, where, how much, the
// description, and the one thing to do — apply. Google for Jobs reads it
// from its JobPosting data (JSON-LD), while it takes applications only (a
// closed job's page keeps no markup: Google's rule for expired jobs).
export async function jobPage(ctx: PageContext<VisitorContext>): Promise<View> {
  const job = await jobFor(ctx);
  const c = await careersOf(ctx);
  const { t, locale, s } = c;
  const salary = job.salary ? salaryText(job.salary, t.facts, locale) : "";
  const open = takesApplications(job) && s.careersOpen;
  const origin = publicOrigin() ?? "";
  const posting = open ? jsonLd(jobPosting(reachJob(job), companyOf(s, origin), `${origin}/${job.slug}`)) : null;
  const facts = [
    { icon: <Briefcase />, text: t.facts.contract[job.contract] },
    { icon: <Pin />, text: job.place },
    { icon: <House />, text: t.facts.remote[job.remote] },
    { icon: <Coins />, text: salary },
  ].filter(f => f.text);
  return {
    title: `${job.title} — ${c.company}`,
    exactTitle: true,
    head: (
      <>
        {indexed}
        <meta name="description" content={plain(job.description).slice(0, 300)} />
        {origin && <link rel="canonical" href={`${origin}/${job.slug}`} />}
        {/* Data for search engines, never run (CSP applies to scripts a
            browser runs; this type is data): the JSON is escaped so no
            "</script>" can end it (src/lib/reach.ts). */}
        {posting && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: posting }} />}
      </>
    ),
    body: (
      <Frame c={c} back={`/${job.slug}`}>
        <a className="back-link" href="/"><Back />{t.careers.allJobs}</a>
        <article className="job-page">
          <header className="job-hero">
            {job.team && <p className="kicker">{job.team}</p>}
            <h1 className="display" lang={job.language}>{job.title}</h1>
            <ul className="facts" aria-label={t.careers.facts}>
              {facts.map((f, i) => <li key={i}>{f.icon}<span>{f.text}</span></li>)}
            </ul>
            {job.openedAt && <p className="muted small">{format(t.careers.posted, { date: formatDate(job.openedAt, locale, ctx.f.timeZone, { day: "numeric", month: "long", year: "numeric" }) })}</p>}
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
      </Frame>
    ),
  };
}

const noIndex = <meta name="robots" content="noindex, nofollow" />;

// The application form: who you are, your CV, a few words, the job's
// questions, how long it is kept (information, not a condition), and an
// optional box to be kept in mind for other jobs. An island: the CV goes
// from the browser to the Chest as soon as it is chosen.
export async function applyPage(ctx: PageContext<VisitorContext>): Promise<View> {
  const job = await jobFor(ctx);
  const c = await careersOf(ctx);
  const { t, s } = c;
  const period = retentionWords(t, s.retentionMonths);
  const open = takesApplications(job) && s.careersOpen;
  return {
    title: format(t.apply.title, { job: job.title }),
    exactTitle: true,
    head: noIndex,
    body: (
      <Frame c={c} back={`/${job.slug}/apply`}>
        <a className="back-link" href={`/${job.slug}`}><Back />{job.title}</a>
        <div className="apply-head">
          <p className="kicker">{job.team || t.careers.kicker}</p>
          <h1 className="display small-display">{format(t.apply.title, { job: job.title })}</h1>
          <p className="lede">{t.apply.intro}</p>
        </div>
        {open ? (
          <section className="form-card">
            <Island name="ApplyForm" props={{
              slug: job.slug, locale: c.locale,
              kept: format(t.apply.kept, { company: c.company, period }), pool: format(t.apply.pool, { company: c.company, period }),
              questions: job.questions,
              t: { apply: t.apply, errors: { cv_missing: t.errors.cv_missing, cv_invalid: t.errors.cv_invalid, cv_too_large: t.errors.cv_too_large, unavailable: t.errors.unavailable, limit: t.errors.limit, cv_off: t.errors.cv_off }, files: t.kit.files },
            }} />
          </section>
        ) : (
          <section className="notice-block" role="status">
            <h2>{t.careers.jobClosed}</h2>
            <p>{t.careers.jobClosedBody}</p>
            <p><a className="button quiet" href="/">{t.careers.seeOthers}</a></p>
          </section>
        )}
      </Frame>
    ),
  };
}

// After applying: it arrived, the team will write. Nothing of the
// candidate is in the address or on the page.
export async function thanksPage(ctx: PageContext<VisitorContext>): Promise<View> {
  const job = await jobFor(ctx);
  const c = await careersOf(ctx);
  const { t } = c;
  const mailed = ctx.query("mailed") === "1";
  return {
    title: t.thanks.title,
    head: noIndex,
    body: (
      <Frame c={c} back={`/${job.slug}/thanks${mailed ? "?mailed=1" : ""}`}>
        <section className="thanks" role="status">
          <span className="thanks-mark" aria-hidden="true"><Check /></span>
          <h1 className="display">{t.thanks.title}</h1>
          <p className="lede">{format(t.thanks.body, { job: job.title })}</p>
          {mailed && <p>{t.thanks.emailed}</p>}
          <p>{t.thanks.next}</p>
          <p><a className="button quiet" href="/">{t.thanks.back}</a></p>
        </section>
      </Frame>
    ),
  };
}
