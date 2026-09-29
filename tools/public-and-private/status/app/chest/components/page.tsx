import { PageHeader } from "@argentic/chest-ui/components";
import { allComponents, inLocale, tree } from "../../../lib/components.ts";
import { locales } from "../../../lib/i18n/index.ts";
import { db } from "../../../lib/db.ts";
import { forTimeline, recent } from "../../../lib/incidents.ts";
import { viewer } from "../../../lib/session.ts";
import { currentStates } from "../../../lib/timeline.ts";
import { ComponentsView, type Row } from "./components-view.tsx";

// The components and groups of the page, in the order customers see them.
export default async function ComponentsPage() {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const sql = db();
  const now = new Date();
  const [list, incidents] = await Promise.all([allComponents(sql), recent(sql, now, undefined, { team: true })]);
  const states = currentStates(forTimeline(incidents), now.getTime());
  // Each service as written (to edit), and as the editor reads it.
  const row = (c: (typeof list)[number]): Row => ({ id: c.id, kind: c.kind, name: c.name, description: c.description, language: c.language, nameSecond: c.nameSecond, descriptionSecond: c.descriptionSecond, shown: inLocale(c, locale).name, hidden: c.hidden, teamOnly: c.teamOnly, parentId: c.parentId, state: states.get(c.id) ?? "operational" });
  const entries = tree(list).map(e => ({ ...row(e), children: e.children.map(row) }));
  return (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.components.title} intro={t.components.intro} />
      <ComponentsView entries={entries} languages={{ main: locale, options: locales.map(code => ({ code, name: t.languages[code] })) }} t={{ components: t.components, states: t.states, errors: t.errors }} />
    </div>
  );
}
