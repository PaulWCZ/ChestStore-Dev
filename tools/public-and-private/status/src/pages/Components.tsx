import { Island, type MemberContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import type { Row } from "../islands/ComponentsView.tsx";
import { localeOf, locales } from "../i18n/index.ts";
import { allComponents, inLocale, tree } from "../lib/components.ts";
import { db } from "../lib/db.ts";
import { forTimeline, recent } from "../lib/incidents.ts";
import { currentStates } from "../lib/timeline.ts";

// The components and groups of the page, in the order customers see them.
export async function componentsPage({ locale: language, t }: MemberContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const now = new Date();
  const [list, incidents] = await Promise.all([allComponents(sql), recent(sql, now, undefined, { team: true })]);
  const states = currentStates(forTimeline(incidents), now.getTime());
  // Each service as written (to edit), and as the editor reads it.
  const row = (c: (typeof list)[number]): Row => ({ id: c.id, kind: c.kind, name: c.name, description: c.description, language: c.language, nameSecond: c.nameSecond, descriptionSecond: c.descriptionSecond, shown: inLocale(c, locale).name, hidden: c.hidden, teamOnly: c.teamOnly, parentId: c.parentId, state: states.get(c.id) ?? "operational" });
  const entries = tree(list).map(e => ({ ...row(e), children: e.children.map(row) }));
  return { title: t.components.title, body: (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.components.title} intro={t.components.intro} />
      <Island name="ComponentsView" props={{ entries, languages: { main: locale, options: locales.map(code => ({ code, name: t.languages[code] })) }, t: { components: t.components, states: t.states, errors: t.errors } }} />
    </div>
  ) };
}
