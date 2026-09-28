import Link from "next/link";
import { Plus, Upload } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { currency } from "../../../lib/clock.ts";
import { db } from "../../../lib/db.ts";
import { formatDuration } from "../../../lib/duration.ts";
import { format, money, plural } from "../../../lib/i18n/index.ts";
import { budgetShare, listClients, listProjects, type Project } from "../../../lib/projects.ts";
import { viewer } from "../../../lib/session.ts";
import { Forbidden } from "../forbidden.tsx";
import { ClientsView, ExampleButton } from "./projects-view.tsx";

// Clients and their projects, for managers: what each costs so far against
// its budget, who records time on it; closed projects on demand.
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "projects.manage")) return <Forbidden t={t} />;
  const archived = (await searchParams).archived === "1";
  const sql = db();
  const [list, clients] = await Promise.all([listProjects(sql, member, { archived }), listClients(sql, member)]);
  const code = currency();
  const groups = new Map<string, Project[]>();
  for (const p of list) groups.set(p.clientName ?? "", [...(groups.get(p.clientName ?? "") ?? []), p]);
  const budget = (p: Project) => {
    const share = budgetShare(p);
    const b = p.budget;
    if (share === null || b.kind === "none") return <span className="muted small">{t.projects.noBudget}</span>;
    const used = b.kind === "hours" ? formatDuration(p.used.minutes) : money(p.used.cents, code, locale, { whole: true });
    const total = b.kind === "hours" ? formatDuration(b.minutes) : money(b.cents, code, locale, { whole: true });
    const state = share > 1 ? "over" : share >= 0.8 ? "near" : "";
    return (
      <span className={`budget ${state}`}>
        <span className="meter"><span style={{ width: `${Math.min(100, share * 100)}%` }} /></span>
        <span className="small num">{format(t.projects.budget, { used, total })}</span>
        {state && <span className={`tag ${state}`}>{state === "over" ? t.projects.over : t.projects.near}</span>}
      </span>
    );
  };
  return (
    <main className="page wide">
      <header className="page-head">
        <h1>{archived ? t.projects.archived : t.projects.title}</h1>
        <Link className="button" href="/chest/projects/new"><Plus />{t.projects.new}</Link>
      </header>
      {list.length === 0 && !archived ? (
        <div className="empty">
          <h2>{t.projects.empty.title}</h2>
          <p>{t.projects.empty.body}</p>
          <div className="row">
            <Link className="button" href="/chest/projects/new"><Plus />{t.projects.new}</Link>
            <ExampleButton label={t.projects.empty.example} errors={t.errors} />
          </div>
          <Link href="/chest/import" className="small"><Upload />{t.projects.importLink}</Link>
        </div>
      ) : (
        <div className="project-groups">
          {[...groups].map(([client, projects]) => (
            <section key={client} className="project-group" aria-labelledby={`client-${client || "none"}`}>
              <h2 id={`client-${client || "none"}`}>{client || t.projects.internal}</h2>
              <ul className="project-list">
                {projects.map(p => (
                  <li key={p.id}>
                    <Link className="project-row" href={`/chest/projects/${p.id}`}>
                      <span className={`swatch big c-${p.color}`} aria-hidden="true" />
                      <span className="project-main">
                        <span className="p">{p.name}</span>
                        <span className="meta small">
                          <span>{plural(t.projects.tasks, p.tasks.filter(k => !k.archived).length, locale)}</span>
                          <span>{p.everyone ? t.projects.everyone : plural(t.projects.people, p.people.length, locale)}</span>
                          {p.billable ? (p.rateCents !== null && <span>{format(t.projects.rate, { rate: money(p.rateCents, code, locale) })}</span>) : <span>{t.projects.nonBillable}</span>}
                        </span>
                      </span>
                      <span className="project-used num">{formatDuration(p.used.minutes)}</span>
                      <span className="project-budget">{budget(p)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {list.length === 0 && <p className="muted">{t.projects.empty.title}</p>}
        </div>
      )}
      <p className="row">
        <Link className="button link" href={archived ? "/chest/projects" : "/chest/projects?archived=1"}>{archived ? t.projects.hideArchived : t.projects.showArchived}</Link>
        {list.length > 0 && <Link className="button link" href="/chest/import"><Upload />{t.projects.importLink}</Link>}
      </p>
      {clients.length > 0 && (
        <section className="clients" aria-labelledby="clients-title">
          <h2 id="clients-title">{t.projects.clients}</h2>
          <ClientsView clients={clients.map(c => ({ id: c.id, name: c.name, archived: c.archived, count: plural(t.projects.projectsCount, c.projects, locale) }))} t={{ projects: t.projects, errors: t.errors, undo: t.timer.undo }} />
        </section>
      )}
    </main>
  );
}
