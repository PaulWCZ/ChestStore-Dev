import type { Metadata } from "next";
import { Arrow, Back } from "../../components/icons.tsx";
import { IncidentRow } from "../../components/incident-card.tsx";
import { PublicShell } from "../../components/public-shell.tsx";
import { format, month } from "../../lib/i18n/index.ts";
import { historyPage } from "../../lib/incidents.ts";
import { publicContext } from "../../lib/public-page.ts";
import { impactOf } from "../../lib/status-view.ts";

export async function generateMetadata(): Promise<Metadata> {
  const { t, company } = await publicContext();
  return { title: `${t.history.title} — ${company ? format(t.meta.publicTitle, { company }) : t.meta.publicPlain}` };
}

// Past incidents and maintenance, month by month, three months a page.
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = (await searchParams).page;
  const page = raw && /^\d{1,4}$/u.test(raw) ? Number(raw) : 0;
  const { t, locale, sql, now, zone, company, offerMail } = await publicContext();
  const { months, older } = await historyPage(sql, page, zone, now);
  const words = { public: t.public, steps: t.steps, states: t.states, time: t.time, maintenance: t.maintenance };
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path={page ? `/history?page=${page}` : "/history"} offerMail={offerMail}>
      <p className="crumb"><a href="/"><Back />{t.public.back}</a></p>
      <h1 className="page-title">{t.history.title}</h1>
      {months.map(m => (
        <section key={m.month} className="section month" aria-labelledby={`m-${m.month}`}>
          <h2 id={`m-${m.month}`} className="section-title">{month(m.month, locale)}</h2>
          {m.incidents.length === 0 ? <p className="quiet-line">{t.history.emptyMonth}</p> : (
            <ul className="rows card">
              {m.incidents.map(i => <IncidentRow key={i.id} incident={i} impact={impactOf(i, now)} zone={zone} locale={locale} t={words} now={now} />)}
            </ul>
          )}
        </section>
      ))}
      <nav className="pager" aria-label={t.history.pageLabel}>
        {page > 0 ? <a className="button quiet" href={page === 1 ? "/history" : `/history?page=${page - 1}`}><Back />{t.history.newer}</a> : <span />}
        {older && <a className="button quiet" href={`/history?page=${page + 1}`}>{t.history.older}<Arrow /></a>}
      </nav>
    </PublicShell>
  );
}
