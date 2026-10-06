import { chest } from "@argentic/chest-sdk/chest";
import { Island, log, type MemberContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { Info, Plus } from "../components/icons.tsx";
import { StateLabel } from "../components/state.tsx";
import { format, localeOf, relative, stamp } from "../i18n/index.ts";
import { checkError } from "../lib/check-words.ts";
import { statuses } from "../lib/checks.ts";
import { db } from "../lib/db.ts";
import { listHeartbeats } from "../lib/heartbeats.ts";
import { pass } from "../lib/jobs.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { impactOf, statusView, touchedNames } from "../lib/status-view.ts";
import { refreshBadge } from "../lib/tell.ts";
import { phaseOf, stepOf, titleIn } from "./parts/incident-card.tsx";
import { incidentTone, stepClass, tone } from "../components/classes.ts";

// Now: what is open, what is planned, and the page as customers see it,
// with the one thing an editor comes for — "Post an incident" — first.
export async function overview({ member, locale: language, t, request }: MemberContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const zone = chest.timeZone;
  const now = new Date();
  // A visit does what the schedule would (Chest without schedules): the
  // maintenance posts due, a few emails.
  await pass(sql, now, 25).catch(error => log.error("catch-up failed", error));
  await refreshBadge(sql, member.id);
  // Editors see every incident (those about services for the team only
  // too); "What your customers see" is the public page's own view.
  const [view, customers] = await Promise.all([statusView(sql, zone, now, { team: true, locale }), statusView(sql, zone, now, { locale })]);
  // Titles in the editor's language when the incident has them (N4).
  const title = (i: Parameters<typeof titleIn>[0]) => { const p = titleIn(i, locale); return <span lang={p.lang === locale ? undefined : p.lang}>{p.text}</span>; };
  const down = [...(await statuses(sql)).values()].filter(s => s.downSince);
  const silent = (await listHeartbeats(sql)).filter(b => b.downSince);
  const componentName = (id: string) => view.entries.flatMap(e => (e.self ? [e.self] : e.children)).find(c => c.id === id)?.name ?? "";
  const publicHome = publicOrigin(request.headers) ?? "";
  const when = (d: Date) => stamp(d, zone, locale, now);
  const noComponents = view.entries.length === 0;
  const upcoming = [...view.maintenanceNow, ...view.maintenanceAhead];
  return { title: t.overview.title, body: (
    <div className="wide stack-l">
      <Island name="AutoRefresh" props={{ seconds: 30 }} />
      <PageHeader
        size="m"
        className="overview-head"
        title={t.overview.title}
        secondary={noComponents ? null : <a className="button quiet" href="/chest/maintenance/new">{t.overview.plan}</a>}
        action={noComponents ? null : <a className="button" href="/chest/incidents/new"><Plus />{t.overview.post}</a>}
      />

      {noComponents ? (
        <Island name="SetupEmpty" props={{ title: t.overview.setup, body: t.overview.setupBody, example: t.components.example, setup: t.overview.setupAction }} />
      ) : (
        <>
          {down.length + silent.length > 0 && (
            <section aria-labelledby="checks-title" className="stack">
              <h2 id="checks-title" className="section-title">{t.checks.nowTitle}</h2>
              {silent.map(b => (
                <div key={`h-${b.componentId}`} id={`heartbeat-${b.componentId}`} className="alert" role="status">
                  <strong>{format(t.heartbeats.nowDown, { component: componentName(b.componentId), time: stamp(b.downSince!, zone, locale, now) })}</strong>
                  <p className="muted">{t.checks.nowHint}</p>
                  <div className="actions"><a className="button" href={`/chest/incidents/new?component=${b.componentId}`}>{t.checks.openIncident}</a></div>
                </div>
              ))}
              {down.map(d => (
                <div key={d.componentId} id={`check-${d.componentId}`} className="alert" role="status">
                  <strong>{format(t.checks.nowDown, { component: componentName(d.componentId), time: stamp(d.downSince!, zone, locale, now), error: checkError(t.checks, d.last?.error ?? null, d.last?.status ?? null, d.last?.ms ?? 0) })}</strong>
                  <p className="muted">{t.checks.nowHint}</p>
                  <div className="actions"><a className="button" href={`/chest/incidents/new?component=${d.componentId}`}>{t.checks.openIncident}</a></div>
                </div>
              ))}
            </section>
          )}

          <section aria-labelledby="open" className="stack">
            <h2 id="open" className="section-title">{t.overview.open}</h2>
            {view.open.length === 0 ? (
              <div className="all-good">
                <StateLabel state="operational" word={t.overview.allGood} />
                <p>{t.overview.allGoodBody}</p>
              </div>
            ) : (
              <ul className="open-list">
                {view.open.map(i => {
                  const impact = impactOf(i, now);
                  const last = i.updates.find(u => u.removedAt === null);
                  return (
                    <li key={i.id} className={`card open-item ${tone(impact)}`}>
                      <div className="open-main">
                        <a className="open-title" href={`/chest/incidents/${i.id}`}>{title(i)}</a>
                        <p className="muted">
                          <span className={`chip ${stepClass(i.status)}`}>{t.steps[stepOf(i, now)]}</span>{" "}
                          {touchedNames(i, view.names).join(", ")}
                        </p>
                        {last && <p className="muted small">{format(t.overview.lastUpdate, { time: relative(last.postedAt, locale, now) })}</p>}
                      </div>
                      <a className="button quiet" href={`/chest/incidents/${i.id}#update`}>{t.overview.addUpdate}</a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming" className="stack">
              <h2 id="upcoming" className="section-title">{t.overview.upcoming}</h2>
              <ul className="rows card">
                {upcoming.map(m => (
                  <li key={m.id} className="row-incident s-maintenance">
                    <div className="row-head">
                      <a href={`/chest/incidents/${m.id}`}>{title(m)}</a>
                      <span className={`chip ${stepClass(phaseOf(m, now))}`}>{t.steps[phaseOf(m, now)]}</span>
                    </div>
                    <p className="row-meta">{format(t.time.range, { from: when(m.startedAt), to: m.endsAt ? when(m.endsAt) : "" })} · {touchedNames(m, view.names).join(", ")}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="sees" className="stack">
            <div className="section-head">
              <h2 id="sees" className="section-title">{t.overview.publicSees}</h2>
              <a href={`${publicHome}/?fresh=${Math.floor(now.getTime() / 1000)}`} target="_blank" rel="noopener">{t.shell.publicPage}</a>
            </div>
            {customers.entries.length === 0 ? <p className="quiet-line">{t.public.setupTitle}</p> : (
            <>
            <div className={`banner small ${tone(customers.overall)}`}>
              <StateLabel state={customers.overall} word={t.banner[customers.overall]} />
            </div>
            <ul className="mini card">
              {customers.entries.flatMap(e => (e.kind === "group" ? [{ id: e.id, name: e.name, state: e.state, group: true }, ...e.children.map(c => ({ id: c.id, name: c.name, state: c.state, group: false, child: true }))] : [{ id: e.id, name: e.name, state: e.state, group: false }])).map(row => (
                <li key={row.id} className={`mini-row${"child" in row ? " child" : ""}${row.group ? " group" : ""}`}>
                  <span>{row.name}</span>
                  <StateLabel state={row.state} word={t.states[row.state]} quiet />
                </li>
              ))}
            </ul>
            </>
            )}
          </section>

          {view.recent.length > 0 && (
            <section aria-labelledby="recent" className="stack">
              <h2 id="recent" className="section-title">{t.overview.recent}</h2>
              <ul className="rows card">
                {view.recent.map(i => (
                  <li key={i.id} className={`row-incident ${incidentTone(i.kind, impactOf(i, now))}`}>
                    <div className="row-head">
                      <a href={`/chest/incidents/${i.id}`}>{title(i)}</a>
                      <span className={`chip ${stepClass(stepOf(i, now))}`}>{t.steps[stepOf(i, now)]}</span>
                    </div>
                    <p className="row-meta">{when(i.startedAt)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="note"><Info /><span>{t.overview.noChecks}</span></p>
        </>
      )}
    </div>
  ) };
}
