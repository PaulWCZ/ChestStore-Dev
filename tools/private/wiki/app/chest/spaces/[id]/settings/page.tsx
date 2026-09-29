import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { editorsOfTool, companyGroups } from "../../../../../lib/groups.ts";
import { colors } from "../../../../../lib/model.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { viewer } from "../../../../../lib/session.ts";
import { space, type Space } from "../../../../../lib/spaces.ts";
import { SpaceSettings } from "./settings.tsx";

// A space's settings, for its editors: its name, what it holds, its
// colour, who reads it, who edits it; deleting it when it is empty.
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  let s: Space;
  try {
    s = await space(db(), member, id, "write");
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  // "My pages" has no settings.
  if (s.visibility === "private") notFound();
  const [known, writers] = await Promise.all([companyGroups(), editorsOfTool()]);
  // A group the space names that the Chest no longer lists stays shown, so
  // saving does not drop it silently; so does a person named among its
  // editors who no longer has the editor role (they read only, meanwhile).
  const named = [...s.groups, ...s.editors.filter(e => e.startsWith("grp_"))];
  const groups = [...known, ...[...new Set(named)].filter(g => !known.some(k => k.id === g)).map(g => ({ id: g, name: g }))];
  const others = s.editors.filter(e => e.startsWith("mbr_") && !writers.some(w => w.id === e));
  const found = await people(others);
  const editors = [...writers, ...others.map(e => ({ id: e, name: nameOf(found.get(e), locale) }))];
  return (
    <div className="page narrow">
      <Link className="back" href={`/chest/spaces/${s.id}`}><Back />{t.settings.back}</Link>
      <h1>{t.settings.title}</h1>
      <SpaceSettings
        space={{ id: s.id, name: s.name, description: s.description, color: s.color, visibility: s.visibility, groups: s.groups, editing: s.editing, editors: s.editors, pages: s.pages }}
        groups={groups}
        people={editors}
        me={member.id}
        colors={[...colors]}
        t={{ settings: t.settings, errors: t.errors }}
      />
    </div>
  );
}
