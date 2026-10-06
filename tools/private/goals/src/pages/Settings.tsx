import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { orphans } from "../lib/orphans.ts";
import { everyone, nameOf, people } from "../lib/people.ts";
import { chestGroups, settings, teams } from "../lib/teams.ts";

// Admins only: personal objectives on or off, the teams, and what needs a
// new owner.
export async function settingsPage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  if (!can(member, "settings.manage")) return notFound();
  const sql = db();
  const groups = await chestGroups();
  const [s, list, lost, owners] = await Promise.all([settings(sql), teams(sql, { archived: true, groups }), orphans(sql, locale), everyone()]);
  const taken = new Set(list.filter(x => x.groupId && !x.archived).map(x => x.groupId));
  const who = await people(lost.map(o => o.owner));
  const byOwner = new Map<string, { owner: string; name: string; items: typeof lost }>();
  for (const o of lost) {
    let entry = byOwner.get(o.owner);
    if (!entry) byOwner.set(o.owner, (entry = { owner: o.owner, name: nameOf(who.get(o.owner), locale), items: [] }));
    entry.items.push(o);
  }
  return {
    title: t.settings.title,
    body: (
      <div className="page narrow">
        <div className="head"><div className="titles"><h1>{t.settings.title}</h1></div></div>
        <Island id="settings" name="SettingsView" props={{
          personal: s.personal,
          teams: list.map(x => ({ id: x.id, name: x.name, group: x.groupId !== null, archived: x.archived, members: x.members?.length ?? null })),
          groups: groups.filter(g => !taken.has(g.id)).map(g => ({ id: g.id, name: g.name })),
          orphans: [...byOwner.values()].map(g => ({ owner: g.owner, name: g.name, items: g.items.map(i => ({ kind: i.kind, id: i.id, title: i.title, objectiveTitle: i.objectiveTitle, objectiveId: i.objectiveId, cycle: i.cycle })) })),
          owners,
          locale,
          t: { settings: t.settings, errors: t.errors, teams: t.teams, peoplePicker: t.peoplePicker },
        }} />
      </div>
    ),
  };
}
