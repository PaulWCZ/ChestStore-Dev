import { EmptyState } from "@argentic/chest-ui/components";
import type { Metadata } from "next";
import { Fill } from "../components/fill.tsx";
import { HistoryBar } from "../components/history-bar.tsx";
import { Arrow, StateIcon } from "../components/icons.tsx";
import { IncidentCard, IncidentRow, titleIn } from "../components/incident-card.tsx";
import { PublicShell } from "../components/public-shell.tsx";
import { StateLabel } from "../components/state.tsx";
import { When } from "../components/when.tsx";
import { day, format, percent } from "../lib/i18n/index.ts";
import { wall } from "../lib/zone.ts";
import { publicContext } from "../lib/public-page.ts";
import { impactOf, statusView, touchedNames } from "../lib/status-view.ts";

export async function generateMetadata(): Promise<Metadata> {
  const { t, company } = await publicContext();
  return { title: company ? format(t.meta.publicTitle, { company }) : t.meta.publicPlain, description: format(t.meta.publicDescription, { company: company || t.mail.team }), robots: { index: true, follow: true } };
}

// The status page: one line that says whether everything works, what is
// happening now, each component with its last 90 days, the maintenance
// ahead and the past week. Rendered on the server, readable without
// JavaScript, kept 30 seconds by caches (proxy.ts).
export default async function StatusPage() {
  const { t, locale, sql, now, zone, company, offerUpdates } = await publicContext();
  const view = await statusView(sql, zone, now, { locale });
  const titles = new Map([...view.incidents.values()].map(i => [i.id, titleIn(i, locale).text]));
  const words = { public: t.public, steps: t.steps, states: t.states, time: t.time, maintenance: t.maintenance };
  const current = [...view.open, ...view.maintenanceNow];
  // Where the Chest checks a service, the uptime it measured, beside the
  // declared one — each labelled for what it is.
  // A figure only once a full day of checks is in (lib/checks.ts
  // measuredSample); before that, the date the checks began.
  const measuredText = (m: { percent: number | null; since: Date } | null) => {
    if (!m) return null;
    const date = day(wall(m.since, zone).date, locale, { day: "numeric", month: "long" });
    return m.percent === null ? format(t.public.measuring, { date }) : format(t.public.measured, { percent: percent(m.percent, locale), date });
  };
  const anyMeasured = view.entries.some(e => (e.self ? [e.self] : e.children).some(c => c.measured?.percent != null));
  // Before any service is listed, the page says only that it is being set
  // up: never "All systems operational" about nothing.
  if (view.entries.length === 0) {
    return (
      <PublicShell company={company} locale={locale} zone={zone} t={t} path="/" offerMail={false}>
        <EmptyState headingLevel={1} title={t.public.setupTitle} body={t.public.setupBody} />
      </PublicShell>
    );
  }
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path="/" offerMail={offerUpdates}>
      <section className={`banner s-${view.overall}`} aria-labelledby="overall">
        <StateIcon state={view.overall} />
        <div>
          <h1 id="overall">{t.banner[view.overall]}</h1>
          {view.updatedAt && <p className="banner-sub"><Fill text={t.banner.checked} values={{ time: <When at={view.updatedAt} zone={zone} locale={locale} now={now} /> }} /></p>}
        </div>
      </section>

      {current.length > 0 && (
        <section className="section" aria-labelledby="now">
          <h2 id="now" className="section-title">{t.public.happening}</h2>
          <div className="stack">
            {current.map(i => <IncidentCard key={i.id} incident={i} impact={impactOf(i, now)} affected={touchedNames(i, view.names)} zone={zone} locale={locale} t={words} now={now} />)}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="components">
        <h2 id="components" className="visually-hidden">{t.public.now}</h2>
        <ul className="components card">
          {view.entries.map(e => (
            <li key={e.id} className={`entry entry-${e.kind}`}>
              {e.kind === "group" ? (
                <>
                  <div className="entry-head group-head">
                    <h3 lang={e.lang === locale ? undefined : e.lang}>{e.name}</h3>
                    <StateLabel state={e.state} word={t.states[e.state]} />
                  </div>
                  {e.description && <p className="entry-desc" lang={e.lang === locale ? undefined : e.lang}>{e.description}</p>}
                  <ul className="children">
                    {e.children.map(c => (
                      <li key={c.id} className="child">
                        <div className="entry-head">
                          <h4 lang={c.lang === locale ? undefined : c.lang}>{c.name}</h4>
                          <StateLabel state={c.state} word={t.states[c.state]} />
                        </div>
                        {c.description && <p className="entry-desc" lang={c.lang === locale ? undefined : c.lang}>{c.description}</p>}
                        <HistoryBar id={c.id} name={c.name} days={c.days} uptime={c.uptime} since={c.since} measured={measuredText(c.measured)} titles={titles} locale={locale} t={{ public: t.public, states: t.states }} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : e.self && (
                <>
                  <div className="entry-head">
                    <h3 lang={e.lang === locale ? undefined : e.lang}>{e.name}</h3>
                    <StateLabel state={e.state} word={t.states[e.state]} />
                  </div>
                  {e.description && <p className="entry-desc" lang={e.lang === locale ? undefined : e.lang}>{e.description}</p>}
                  <HistoryBar id={e.id} name={e.name} days={e.self.days} uptime={e.self.uptime} since={e.self.since} measured={measuredText(e.self.measured)} titles={titles} locale={locale} t={{ public: t.public, states: t.states }} />
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="fine">{t.public.howCounted} {anyMeasured ? t.public.measuredNote : t.public.notMeasured}</p>
      </section>

      {view.maintenanceAhead.length > 0 && (
        <section className="section" aria-labelledby="ahead">
          <h2 id="ahead" className="section-title">{t.public.upcoming}</h2>
          <div className="stack">
            {view.maintenanceAhead.map(i => <IncidentCard key={i.id} incident={i} impact="maintenance" affected={touchedNames(i, view.names)} zone={zone} locale={locale} t={words} now={now} />)}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="recent">
        <h2 id="recent" className="section-title">{t.public.recent}</h2>
        {view.recent.length === 0 ? <p className="quiet-line">{t.public.noRecent}</p> : (
          <ul className="rows card">
            {view.recent.map(i => <IncidentRow key={i.id} incident={i} impact={impactOf(i, now)} zone={zone} locale={locale} t={words} now={now} />)}
          </ul>
        )}
        <p className="more"><a href="/history">{t.public.allHistory}<Arrow /></a></p>
      </section>
    </PublicShell>
  );
}
