import { forbidden, notFound } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { currency, today } from "../../../../lib/clock.ts";
import { db } from "../../../../lib/db.ts";
import { everyoneOrNone } from "../../../../lib/directory.ts";
import { formatDuration } from "../../../../lib/duration.ts";
import { format, formatDay, money } from "../../../../lib/i18n/index.ts";
import { origin, projectRates, rateLock, type RateStep } from "../../../../lib/rates.ts";
import { settings } from "../../../../lib/settings.ts";
import { nameFor, people as lookup } from "../../../../lib/people.ts";
import { listClients, project, type Project } from "../../../../lib/projects.ts";
import { viewer } from "../../../../lib/session.ts";
import { PersonRates } from "../person-rates.tsx";
import { ProjectForm, TasksEditor } from "../project-form.tsx";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "projects.manage")) forbidden();
  const { id } = await params;
  let p: Project;
  try {
    p = await project(db(), member, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const [clients, dir, rates, s] = await Promise.all([listClients(db(), member), everyoneOrNone(), projectRates(db(), member, p.id), settings(db())]);
  // Someone named on the project (or with a rate on it) who no longer has
  // the tool still shows.
  const missing = [...new Set([...p.people, ...rates.people.map(r => r.memberId)])].filter(x => !dir.people.some(d => d.id === x));
  const gone = missing.length ? await lookup(missing) : new Map();
  const code = currency();
  const now = today();
  const step = (x: RateStep) => format(x.from === origin ? t.people.since0 : t.people.since, { rate: x.cents === null ? t.people.none : money(x.cents, code, locale), date: formatDay(x.from, locale, { day: "numeric", month: "long", year: "numeric" }) });
  const everyoneNamed = [...dir.people.map(x => ({ id: x.id, name: x.name })), ...missing.map(x => ({ id: x, name: nameFor(x, gone, locale) }))];
  const words = { project: t.project, colors: t.colors, errors: t.errors, date: t.date };
  return (
    <div className="page">
      <header className="page-head">
        <h1><span className={`swatch big c-${p.color}`} aria-hidden="true" />{p.name}</h1>
        <p className="used-line">
          <span className="label">{t.project.used}</span>
          <span className="num">{format(t.project.usedHours, { hours: formatDuration(p.used.minutes) })}</span>
          {p.rateCents !== null && <span className="num">{format(t.project.usedMoney, { amount: money(p.used.cents, code, locale) })}</span>}
        </p>
      </header>
      <ProjectForm
        key={p.id + String(p.archived)}
        initial={{ id: p.id, name: p.name, clientId: p.clientId, color: p.color, billable: p.billable, rateCents: p.rateCents, budget: p.budget, everyone: p.everyone, people: p.people, archived: p.archived, tasks: p.tasks }}
        clients={clients.filter(c => !c.archived || c.id === p.clientId).map(c => ({ id: c.id, name: c.name }))}
        people={everyoneNamed}
        rates={{ hasTime: p.used.minutes > 0, today: now, lock: rateLock(s.lockedUntil, locale, t), history: rates.project.length > 1 ? rates.project.map(step).join(" · ") : null }}
        currency={code}
        comma={locale === "fr"}
        defaultTasks={[]}
        t={words}
      />
      <TasksEditor projectId={p.id} tasks={p.tasks} t={words} />
      {p.billable && (
        <PersonRates
          projectId={p.id}
          rates={rates.people.map(r => ({ memberId: r.memberId, name: everyoneNamed.find(x => x.id === r.memberId)?.name ?? t.people.unknown, steps: r.steps.map(x => ({ from: x.from, label: step(x), removable: s.lockedUntil === null || x.from > s.lockedUntil })) }))}
          people={everyoneNamed.filter(x => x.id.startsWith("mbr_"))}
          hasTime={p.used.minutes > 0}
          today={now}
          origin={origin}
          lock={rateLock(s.lockedUntil, locale, t)}
          currency={code}
          t={{ project: t.project, errors: t.errors, date: t.date }}
        />
      )}
    </div>
  );
}
