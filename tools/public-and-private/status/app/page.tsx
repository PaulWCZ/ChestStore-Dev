import type { Metadata } from "next";
import { Fill } from "../components/fill.tsx";
import { HistoryBar } from "../components/history-bar.tsx";
import { Arrow, StateIcon } from "../components/icons.tsx";
import { IncidentCard, IncidentRow } from "../components/incident-card.tsx";
import { PublicShell } from "../components/public-shell.tsx";
import { StateLabel } from "../components/state.tsx";
import { When } from "../components/when.tsx";
import { format } from "../lib/i18n/index.ts";
import { publicContext } from "../lib/public-page.ts";
import { impactOf, statusView, touchedNames } from "../lib/status-view.ts";

export async function generateMetadata(): Promise<Metadata> {
  const { t, company } = await publicContext();
  return { title: company ? format(t.meta.publicTitle, { company }) : t.meta.publicPlain, description: format(t.meta.publicDescription, { company: company || t.mail.team }) };
}

// The status page: one line that says whether everything works, what is
// happening now, each component with its last 90 days, the maintenance
// ahead and the past week. Rendered on the server, readable without
// JavaScript, kept 30 seconds by caches (proxy.ts).
export default async function StatusPage() {
  const { t, locale, sql, now, zone, company, offerMail } = await publicContext();
  const view = await statusView(sql, zone, now);
  const titles = new Map([...view.incidents.values()].map(i => [i.id, i.title]));
  const words = { public: t.public, steps: t.steps, states: t.states, time: t.time, maintenance: t.maintenance };
  const current = [...view.open, ...view.maintenanceNow];
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path="/" offerMail={offerMail}>
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
        {view.entries.length === 0 ? (
          <div className="empty"><h2>{t.public.noComponents}</h2><p>{t.public.noComponentsBody}</p></div>
        ) : (
          <ul className="components card">
            {view.entries.map(e => (
              <li key={e.id} className={`entry entry-${e.kind}`}>
                {e.kind === "group" ? (
                  <>
                    <div className="entry-head group-head">
                      <h3>{e.name}</h3>
                      <StateLabel state={e.state} word={t.states[e.state]} />
                    </div>
                    {e.description && <p className="entry-desc">{e.description}</p>}
                    <ul className="children">
                      {e.children.map(c => (
                        <li key={c.id} className="child">
                          <div className="entry-head">
                            <h4>{c.name}</h4>
                            <StateLabel state={c.state} word={t.states[c.state]} />
                          </div>
                          {c.description && <p className="entry-desc">{c.description}</p>}
                          <HistoryBar id={c.id} name={c.name} days={c.days} uptime={c.uptime} titles={titles} locale={locale} t={{ public: t.public, states: t.states }} />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : e.self && (
                  <>
                    <div className="entry-head">
                      <h3>{e.name}</h3>
                      <StateLabel state={e.state} word={t.states[e.state]} />
                    </div>
                    {e.description && <p className="entry-desc">{e.description}</p>}
                    <HistoryBar id={e.id} name={e.name} days={e.self.days} uptime={e.self.uptime} titles={titles} locale={locale} t={{ public: t.public, states: t.states }} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {view.entries.length > 0 && <p className="fine">{t.public.howCounted}</p>}
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
