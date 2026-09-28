import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Clipboard, Plus } from "../../../components/icons.tsx";
import { Portrait } from "../../../components/portrait.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDay, plural } from "../../../lib/i18n/index.ts";
import { listJourneys, listTemplates, type JourneySummary } from "../../../lib/journeys.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { ExamplesButton, NewTemplate } from "./template-buttons.tsx";

// HR's page: the arrivals and departures in progress, with their progress,
// and the templates they start from. The one obvious action: start a
// checklist.
export default async function ChecklistsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "checklists.manage")) notFound();
  const sql = db();
  const [journeys, templates, archived] = await Promise.all([listJourneys(sql, member), listTemplates(sql, member), listTemplates(sql, member, { archived: true })]);
  const who = await people(journeys.map(j => j.personId));
  const running = journeys.filter(j => !j.stopped && !j.completedAt);
  const completed = journeys.filter(j => !j.stopped && j.completedAt);
  const stopped = journeys.filter(j => j.stopped);
  const buttonWords = { newTemplate: t.checklists.newTemplate, examples: t.checklists.empty.examples, scratch: t.checklists.empty.scratch, template: t.template, kinds: t.checklists.kinds, errors: t.errors };
  const row = (j: JourneySummary) => {
    const person = who.get(j.personId);
    const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
    return (
      <li key={j.id}>
        <Link className="journey-card" href={`/chest/checklists/${j.id}`}>
          <Portrait name={nameOf(person, locale)} photo={person?.photo ?? null} size={52} />
          <span className="journey-main">
            <strong>{nameOf(person, locale)}</strong>
            <span className="muted">
              <span className={`kind ${j.kind}`}>{t.checklists.kinds[j.kind]}</span> {j.name} · {format(j.kind === "onboarding" ? t.checklists.firstDay : t.checklists.lastDay, { date: formatDay(j.anchor, locale, { day: "numeric", month: "short" }) })}
            </span>
          </span>
          <span className="journey-progress">
            <span className="meter" aria-hidden="true"><span style={{ width: pct + "%" }} /></span>
            <span className="small">{format(t.checklists.progress, { done: j.done, total: j.total })}{j.late !== 0 && !j.completedAt && !j.stopped ? <span className="late-count"> · {plural(t.checklists.late, j.late, locale)}</span> : null}</span>
          </span>
        </Link>
      </li>
    );
  };
  const nothing = journeys.length === 0 && templates.length === 0 && archived.length === 0;
  return (
    <main className="page narrow">
      <AutoRefresh seconds={60} />
      <div className="page-head">
        <h1>{t.checklists.title}</h1>
        {templates.length > 0 && <Link className="button" href="/chest/checklists/new"><Plus />{t.checklists.start}</Link>}
      </div>
      {nothing ? (
        <div className="empty">
          <Clipboard />
          <h2>{t.checklists.empty.title}</h2>
          <p>{t.checklists.empty.body}</p>
          <ExamplesButton t={buttonWords} />
          <NewTemplate t={buttonWords} quiet label={t.checklists.empty.scratch} />
        </div>
      ) : (
        <>
          <section aria-labelledby="running-title" className="section">
            <h2 id="running-title" className="eyebrow">{t.checklists.running}</h2>
            {running.length === 0 ? <p className="muted">{t.checklists.noneRunning}</p> : <ul className="journey-cards">{running.map(row)}</ul>}
          </section>
          {completed.length > 0 && (
            <section aria-labelledby="completed-title" className="section">
              <h2 id="completed-title" className="eyebrow">{t.checklists.completed}</h2>
              <ul className="journey-cards">{completed.map(row)}</ul>
            </section>
          )}
          {stopped.length > 0 && (
            <section aria-labelledby="stopped-title" className="section">
              <h2 id="stopped-title" className="eyebrow">{t.checklists.stopped}</h2>
              <ul className="journey-cards">{stopped.map(row)}</ul>
            </section>
          )}
          <section aria-labelledby="templates-title" className="section">
            <div className="section-title">
              <h2 id="templates-title" className="eyebrow">{t.checklists.templates}</h2>
              <NewTemplate t={buttonWords} quiet label={t.checklists.newTemplate} />
            </div>
            <ul className="template-list">
              {templates.map(x => (
                <li key={x.id}>
                  <Link href={`/chest/checklists/templates/${x.id}`} className="template-row">
                    <span className={`kind ${x.kind}`}>{t.checklists.kinds[x.kind]}</span>
                    <strong>{x.name}</strong>
                    <span className="muted small">{plural(t.checklists.steps, x.items.length, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {templates.length === 0 && <ExamplesButton t={buttonWords} />}
            {archived.length > 0 && (
              <details className="archived">
                <summary>{t.checklists.archived}</summary>
                <ul className="template-list">
                  {archived.map(x => (
                    <li key={x.id}>
                      <Link href={`/chest/checklists/templates/${x.id}`} className="template-row">
                        <span className={`kind ${x.kind}`}>{t.checklists.kinds[x.kind]}</span>
                        <strong>{x.name}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}
    </main>
  );
}
