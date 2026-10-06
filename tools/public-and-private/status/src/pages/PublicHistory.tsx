import type { View } from "@argentic/chest-app";
import { Arrow, Back } from "../components/icons.tsx";
import { month } from "../i18n/index.ts";
import { historyPage } from "../lib/incidents.ts";
import type { PublicContext } from "../lib/public-page.ts";
import { impactOf } from "../lib/status-view.ts";
import { IncidentRow } from "./parts/incident-card.tsx";
import { indexed, siteTitle } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";

// Past incidents and maintenance, month by month, three months a page.
export async function publicHistory(context: PublicContext, raw: string | undefined): Promise<View> {
  const page = raw && /^\d{1,4}$/u.test(raw) ? Number(raw) : 0;
  const { t, locale, sql, now, zone, offerUpdates } = context;
  const { months, older } = await historyPage(sql, page, zone, now);
  const words = { public: t.public, steps: t.steps, states: t.states, time: t.time, maintenance: t.maintenance };
  return { title: siteTitle(context, t.history.title), exactTitle: true, head: indexed(), body: (
    <PublicShell context={context} path={page ? `/history?page=${page}` : "/history"} offerMail={offerUpdates}>
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
  ) };
}
