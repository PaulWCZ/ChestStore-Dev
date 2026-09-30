import { chest } from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { IncidentCard } from "../../components/incident-card.tsx";
import { StateLabel } from "../../components/state.tsx";
import { db } from "../../lib/db.ts";
import type { Catalogue, Locale } from "../../lib/i18n/index.ts";
import { impactOf, statusView, touchedNames } from "../../lib/status-view.ts";

// The team's own status page: what a member without a role sees in the
// tool — every service, those for the team only included (the office
// network, the intranet), what is happening now and the maintenance ahead.
// Read only; editors post. It shows what the public page cannot: incidents
// about services only the team uses.
export async function TeamStatus({ locale, t }: { locale: Locale; t: Catalogue }) {
  const now = new Date();
  const zone = chest.timeZone;
  const view = await statusView(db(), zone, now, { team: true, locale });
  const words = { public: t.public, steps: t.steps, states: t.states, time: t.time, maintenance: t.maintenance };
  const current = [...view.open, ...view.maintenanceNow, ...view.maintenanceAhead];
  return (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.team.title} intro={t.team.intro} />
      {view.entries.length === 0 ? (
        <EmptyState title={t.public.setupTitle} body={t.public.setupBody} />
      ) : (
        <>
          <div className={`banner small s-${view.overall}`}>
            <StateLabel state={view.overall} word={t.banner[view.overall]} />
          </div>
          <section aria-labelledby="team-now" className="stack">
            <h2 id="team-now" className="section-title">{t.public.happening}</h2>
            {current.length === 0 ? <p className="quiet-line">{t.team.nothingOpen}</p> : current.map(i => (
              <IncidentCard key={i.id} incident={i} impact={impactOf(i, now)} affected={touchedNames(i, view.names)} zone={zone} locale={locale} t={words} now={now} link={false} />
            ))}
          </section>
          <section aria-labelledby="team-services" className="stack">
            <h2 id="team-services" className="section-title">{t.team.services}</h2>
            <ul className="mini card">
              {view.entries.flatMap(e => (e.kind === "group" ? [{ id: e.id, name: e.name, state: e.state, group: true, teamOnly: false, child: false }, ...e.children.map(c => ({ id: c.id, name: c.name, state: c.state, group: false, teamOnly: c.teamOnly, child: true }))] : [{ id: e.id, name: e.name, state: e.state, group: false, teamOnly: e.self?.teamOnly ?? false, child: false }])).map(row => (
                <li key={row.id} className={`mini-row${row.child ? " child" : ""}${row.group ? " group" : ""}`}>
                  <span>{row.name}{row.teamOnly && <span className="tag">{t.team.teamOnly}</span>}</span>
                  <StateLabel state={row.state} word={t.states[row.state]} quiet />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
