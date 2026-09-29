import type { Metadata } from "next";
import { Arrow } from "../components/icons.tsx";
import { PublicShell } from "../components/public-shell.tsx";
import { brandOf, retentionWords } from "../lib/careers.ts";
import { db } from "../lib/db.ts";
import { format, plural } from "../lib/i18n/index.ts";
import { introFor, publicJobs, settings } from "../lib/jobs.ts";
import { publicWords } from "../lib/session.ts";

// The careers page is for search engines too: indexed, with its feeds.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await publicWords();
  const s = await settings(db());
  return {
    title: s.companyName ? format(t.careers.title, { company: s.companyName }) : t.careers.titlePlain,
    robots: { index: true, follow: true },
    alternates: { types: { "application/rss+xml": "/feed.xml" } },
  };
}

// The careers page: the company, a few words, its photos, its open jobs —
// nothing else of the tool is public.
export default async function Careers() {
  const { t, locale } = await publicWords();
  const sql = db();
  const s = await settings(sql);
  const list = s.careersOpen ? await publicJobs(sql) : [];
  const company = s.companyName || t.careers.titlePlain;
  const brand = brandOf(s);
  const foot = <><span>{format(t.careers.footer, { company })}</span><span>{format(t.careers.privacy, { period: retentionWords(t, s.retentionMonths) })}</span></>;
  return (
    <PublicShell company={company} locale={locale} label={t.careers.language} back="/" foot={foot} brand={brand} website={t.careers.website}>
      <section className="hero">
        <p className="kicker">{t.careers.kicker}</p>
        <h1 className="display">{s.companyName ? format(t.careers.title, { company: s.companyName }) : t.careers.titlePlain}</h1>
        {/* Only what the company wrote: an empty careers page never speaks
            for it (critique round 2, N2). */}
        {introFor(s, locale) && <p className="lede">{introFor(s, locale)}</p>}
      </section>
      {brand.photos.length > 0 && (
        <div className={`photos n${brand.photos.length}`}>
          {brand.photos.map(src => <img key={src} src={src} alt="" loading="lazy" />)}
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
    </PublicShell>
  );
}
