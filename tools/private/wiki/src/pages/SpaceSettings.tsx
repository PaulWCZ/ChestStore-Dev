import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import { localeOf } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { AppError } from "../lib/errors.ts";
import { companyGroups, editorsOfTool } from "../lib/groups.ts";
import { colors } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { space, type Space } from "../lib/spaces.ts";

// A space's settings, for its editors: its name, what it holds, its
// colour, who reads it, who edits it; deleting it when it is empty.
export async function spaceSettingsPage({ member, locale: language, t, param }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  let s: Space;
  try {
    s = await space(db(), member, param("id"), "write");
  } catch (error) {
    if (error instanceof AppError) return notFound();
    throw error;
  }
  // "My pages" has no settings.
  if (s.visibility === "private") return notFound();
  const [known, writers] = await Promise.all([companyGroups(), editorsOfTool()]);
  // A group the space names that the Chest no longer lists stays shown, so
  // saving does not drop it silently; so does a person named among its
  // editors who no longer has the editor role (they read only, meanwhile).
  const named = [...s.groups, ...s.editors.filter(e => e.startsWith("grp_"))];
  const groups = [...known, ...[...new Set(named)].filter(g => !known.some(k => k.id === g)).map(g => ({ id: g, name: g }))];
  const others = s.editors.filter(e => e.startsWith("mbr_") && !writers.some(w => w.id === e));
  const found = await people(others);
  const editors = [...writers, ...others.map(e => ({ id: e, name: nameOf(found.get(e), locale) }))];
  return { title: t.settings.title, body: (
    <div className="page narrow">
      <a className="back" href={`/chest/spaces/${s.id}`}><Back />{t.settings.back}</a>
      <h1>{t.settings.title}</h1>
      <Island name="SpaceSettings" props={{
        space: { id: s.id, name: s.name, description: s.description, color: s.color, visibility: s.visibility, groups: s.groups, editing: s.editing, editors: s.editors, pages: s.pages },
        groups,
        people: editors,
        me: member.id,
        colors: [...colors],
        t: { settings: t.settings },
      }} />
    </div>
  ) };
}
