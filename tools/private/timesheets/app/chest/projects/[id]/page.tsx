import { notFound } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { currency } from "../../../../lib/clock.ts";
import { db } from "../../../../lib/db.ts";
import { everyoneOrNone } from "../../../../lib/directory.ts";
import { formatDuration } from "../../../../lib/duration.ts";
import { format, money } from "../../../../lib/i18n/index.ts";
import { nameFor, people as lookup } from "../../../../lib/people.ts";
import { listClients, project, type Project } from "../../../../lib/projects.ts";
import { viewer } from "../../../../lib/session.ts";
import { Forbidden } from "../../forbidden.tsx";
import { ProjectForm, TasksEditor } from "../project-form.tsx";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "projects.manage")) return <Forbidden t={t} />;
  const { id } = await params;
  let p: Project;
  try {
    p = await project(db(), member, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const [clients, dir] = await Promise.all([listClients(db(), member), everyoneOrNone()]);
  // Someone named on the project who no longer has the tool still shows.
  const missing = p.people.filter(x => !dir.people.some(d => d.id === x));
  const gone = missing.length ? await lookup(missing) : new Map();
  const code = currency();
  const words = { project: t.project, colors: t.colors, errors: t.errors, undo: t.timer.undo };
  return (
    <main className="page">
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
        people={[...dir.people.map(x => ({ id: x.id, name: x.name })), ...missing.map(x => ({ id: x, name: nameFor(x, gone, locale) }))]}
        currency={code}
        comma={locale === "fr"}
        defaultTasks={[]}
        t={words}
      />
      <TasksEditor projectId={p.id} tasks={p.tasks} t={words} />
    </main>
  );
}
