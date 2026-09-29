import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { orphans } from "../../../lib/orphans.ts";
import { everyone, nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { chestGroups, settings, teams } from "../../../lib/teams.ts";
import { SettingsView } from "./settings-view.tsx";

// Admins only: personal objectives on or off, the teams, and what needs a
// new owner.
export default async function Settings() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "settings.manage")) notFound();
  const sql = db();
  const groups = await chestGroups();
  const [s, list, lost, owners] = await Promise.all([settings(sql), teams(sql, { archived: true, groups }), orphans(sql), everyone()]);
  const taken = new Set(list.filter(x => x.groupId && !x.archived).map(x => x.groupId));
  const who = await people(lost.map(o => o.owner));
  const byOwner = new Map<string, { owner: string; name: string; items: typeof lost }>();
  for (const o of lost) {
    const entry = byOwner.get(o.owner) ?? { owner: o.owner, name: nameOf(who.get(o.owner), locale), items: [] };
    entry.items.push(o);
    byOwner.set(o.owner, entry);
  }
  return (
    <div className="page narrow">
      <div className="head"><div className="titles"><h1>{t.settings.title}</h1></div></div>
      <SettingsView
        personal={s.personal}
        teams={list.map(x => ({ id: x.id, name: x.name, group: x.groupId !== null, archived: x.archived, members: x.members?.length ?? null }))}
        groups={groups.filter(g => !taken.has(g.id)).map(g => ({ id: g.id, name: g.name }))}
        orphans={[...byOwner.values()].map(g => ({ owner: g.owner, name: g.name, items: g.items.map(i => ({ kind: i.kind, id: i.id, title: i.title, objectiveTitle: i.objectiveTitle, objectiveId: i.objectiveId, cycle: i.cycle })) }))}
        owners={owners}
        locale={locale}
        t={{ settings: t.settings, errors: t.errors, teams: t.teams, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
