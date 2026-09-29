import { PageHeader } from "@argentic/chest-ui/components";
import { forbidden } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { currency } from "../../../../lib/clock.ts";
import { db } from "../../../../lib/db.ts";
import { everyoneOrNone } from "../../../../lib/directory.ts";
import { listClients } from "../../../../lib/projects.ts";
import { viewer } from "../../../../lib/session.ts";
import { ProjectForm } from "../project-form.tsx";

export default async function NewProjectPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "projects.manage")) forbidden();
  const [clients, dir] = await Promise.all([listClients(db(), member), everyoneOrNone()]);
  return (
    <div className="page">
      <PageHeader title={t.project.newTitle} />
      <ProjectForm
        initial={{ id: null, name: "", clientId: null, color: "teal", billable: true, rateCents: null, budget: { kind: "none" }, everyone: true, people: [], archived: false, tasks: [] }}
        clients={clients.filter(c => !c.archived).map(c => ({ id: c.id, name: c.name }))}
        people={dir.people.map(p => ({ id: p.id, name: p.name }))}
        currency={currency()}
        comma={locale === "fr"}
        defaultTasks={[t.project.defaultTasks.design, t.project.defaultTasks.development, t.project.defaultTasks.meetings]}
        t={{ project: t.project, colors: t.colors, errors: t.errors, date: t.date }}
      />
    </div>
  );
}
