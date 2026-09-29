import { PageHeader } from "@argentic/chest-ui/components";
import { allComponents, tree } from "../../../lib/components.ts";
import { db } from "../../../lib/db.ts";
import { forTimeline, recent } from "../../../lib/incidents.ts";
import { viewer } from "../../../lib/session.ts";
import { currentStates } from "../../../lib/timeline.ts";
import { ComponentsView, type Row } from "./components-view.tsx";

// The components and groups of the page, in the order customers see them.
export default async function ComponentsPage() {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  const sql = db();
  const now = new Date();
  const [list, incidents] = await Promise.all([allComponents(sql), recent(sql, now, undefined, { team: true })]);
  const states = currentStates(forTimeline(incidents), now.getTime());
  const row = (c: (typeof list)[number]): Row => ({ id: c.id, kind: c.kind, name: c.name, description: c.description, hidden: c.hidden, teamOnly: c.teamOnly, parentId: c.parentId, state: states.get(c.id) ?? "operational" });
  const entries = tree(list).map(e => ({ ...row(e), children: e.children.map(row) }));
  return (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.components.title} intro={t.components.intro} />
      <ComponentsView entries={entries} t={{ components: t.components, states: t.states, errors: t.errors }} />
    </div>
  );
}
