import { forbidden, Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader, StatusBadge } from "@argentic/chest-ui/components";
import { Meter } from "../components/gauges.tsx";
import { Plus, Upload } from "../components/icons.tsx";
import { format, formatDay, localeOf, money, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { AppError } from "../lib/app-error.ts";
import { currency, today } from "../lib/clock.ts";
import { db } from "../lib/db.ts";
import { everyoneOrNone } from "../lib/directory.ts";
import { nameFor, people as lookup } from "../lib/people.ts";
import { budgetShare, listClients, listProjects, project, type Project } from "../lib/projects.ts";
import { origin, projectRates, rateLock, type RateStep } from "../lib/rates.ts";
import { settings } from "../lib/settings.ts";
import { formatDuration } from "../shared/duration.ts";

// Clients and their projects (/chest/projects; ?archived=1: the closed
// ones), for managers: what each costs so far against its budget, who
// records time on it.
export async function projectsPage({ member, locale: lang, t, query }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "projects.manage")) forbidden();
  const archived = query("archived") === "1";
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
        <Meter value={share} />
        <span className="small num">{format(t.projects.budget, { used, total })}</span>
        {state && <StatusBadge tone={state === "over" ? "danger" : "wait"} size="s" label={state === "over" ? t.projects.over : t.projects.near} />}
      </span>
    );
  };
  return {
    title: archived ? t.projects.archived : t.projects.title,
    body: (
      <div className="page wide">
        <PageHeader title={archived ? t.projects.archived : t.projects.title} action={(list.length > 0 || archived) && <a className="button" href="/chest/projects/new"><Plus />{t.projects.new}</a>} />
        {list.length === 0 && !archived ? (
          <EmptyState
            title={t.projects.empty.title}
            body={t.projects.empty.body}
            action={<><a className="button" href="/chest/projects/new"><Plus />{t.projects.new}</a><Island name="ExampleButton" props={{ label: t.projects.empty.example }} /></>}
            note={<a href="/chest/import"><Upload />{t.projects.importLink}</a>}
          />
        ) : (
          <div className="project-groups">
            {[...groups].map(([client, projects]) => (
              <section key={client} className="project-group" aria-labelledby={`client-${client || "none"}`}>
                <h2 id={`client-${client || "none"}`}>{client || t.projects.internal}</h2>
                <ul className="project-list">
                  {projects.map(p => (
                    <li key={p.id} id={`project-${p.id}`}>
                      <a className="project-row" href={`/chest/projects/${p.id}`}>
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
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {list.length === 0 && <p className="muted">{t.projects.empty.title}</p>}
          </div>
        )}
        <p className="row">
          <a className="button link" href={archived ? "/chest/projects" : "/chest/projects?archived=1"}>{archived ? t.projects.hideArchived : t.projects.showArchived}</a>
          {list.length > 0 && <a className="button link" href="/chest/import"><Upload />{t.projects.importLink}</a>}
        </p>
        {clients.length > 0 && (
          <section className="clients" aria-labelledby="clients-title">
            <h2 id="clients-title">{t.projects.clients}</h2>
            <Island name="ClientsView" props={{ clients: clients.map(c => ({ id: c.id, name: c.name, archived: c.archived, count: plural(t.projects.projectsCount, c.projects, locale) })), t: { projects: t.projects, errors: t.errors } }} />
          </section>
        )}
      </div>
    ),
  };
}

// A new project (/chest/projects/new): the form, three tasks proposed.
export async function newProjectPage({ member, locale: lang, t }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "projects.manage")) forbidden();
  const [clients, dir] = await Promise.all([listClients(db(), member), everyoneOrNone()]);
  return {
    title: t.project.newTitle,
    body: (
      <div className="page">
        <PageHeader title={t.project.newTitle} />
        <Island
          id="project-new"
          name="ProjectForm"
          props={{
            initial: { id: null, name: "", clientId: null, color: "teal", billable: true, rateCents: null, budget: { kind: "none" }, everyone: true, people: [], archived: false, tasks: [], lead: null },
            clients: clients.filter(c => !c.archived).map(c => ({ id: c.id, name: c.name })),
            people: dir.people.map(p => ({ id: p.id, name: p.name })),
            managers: dir.people.filter(p => p.role === "manager").map(p => ({ id: p.id, name: p.name })),
            currency: currency(),
            comma: locale === "fr",
            defaultTasks: [t.project.defaultTasks.design, t.project.defaultTasks.development, t.project.defaultTasks.meetings],
            t: { project: t.project, colors: t.colors, errors: t.errors, date: t.kit.date },
          }}
        />
      </div>
    ),
  };
}

// One project (/chest/projects/:id): its form, its tasks, the rates of
// some people on it.
export async function projectPage({ member, locale: lang, t, param }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "projects.manage")) forbidden();
  let p: Project;
  try {
    p = await project(db(), member, param("id"));
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") return notFound();
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
  const words = { project: t.project, colors: t.colors, errors: t.errors, date: t.kit.date };
  return {
    title: p.name,
    body: (
      <div className="page">
        <header className="page-head">
          <h1><span className={`swatch big c-${p.color}`} aria-hidden="true" />{p.name}</h1>
          <p className="used-line">
            <span className="label">{t.project.used}</span>
            <span className="num">{format(t.project.usedHours, { hours: formatDuration(p.used.minutes) })}</span>
            {p.rateCents !== null && <span className="num">{format(t.project.usedMoney, { amount: money(p.used.cents, code, locale) })}</span>}
          </p>
        </header>
        <Island
          id={`project-${p.id}-${p.archived ? "closed" : "open"}`}
          name="ProjectForm"
          props={{
            initial: { id: p.id, name: p.name, clientId: p.clientId, color: p.color, billable: p.billable, rateCents: p.rateCents, budget: p.budget, everyone: p.everyone, people: p.people, archived: p.archived, tasks: p.tasks, lead: p.lead },
            clients: clients.filter(c => !c.archived || c.id === p.clientId).map(c => ({ id: c.id, name: c.name })),
            people: everyoneNamed,
            managers: dir.people.filter(x => x.role === "manager").map(x => ({ id: x.id, name: x.name })),
            rates: { hasTime: p.used.minutes > 0, today: now, lock: rateLock(s.lockedUntil, locale, t), history: rates.project.length > 1 ? rates.project.map(step).join(" · ") : null },
            currency: code,
            comma: locale === "fr",
            defaultTasks: [],
            t: words,
          }}
        />
        <Island id={`tasks-${p.id}`} name="TasksEditor" props={{ projectId: p.id, tasks: p.tasks, t: words }} />
        {p.billable && (
          <Island
            id={`rates-${p.id}`}
            name="PersonRates"
            props={{
              projectId: p.id,
              rates: rates.people.map(r => ({ memberId: r.memberId, name: everyoneNamed.find(x => x.id === r.memberId)?.name ?? t.people.unknown, steps: r.steps.map(x => ({ from: x.from, label: step(x), removable: s.lockedUntil === null || x.from > s.lockedUntil })) })),
              people: everyoneNamed.filter(x => x.id.startsWith("mbr_")),
              hasTime: p.used.minutes > 0,
              today: now,
              origin,
              lock: rateLock(s.lockedUntil, locale, t),
              currency: code,
              t: { project: t.project, errors: t.errors, date: t.kit.date },
            }}
          />
        )}
      </div>
    ),
  };
}
