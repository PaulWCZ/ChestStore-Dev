import { Island, type PageContext, type View } from "@argentic/chest-app";
import { format, relative, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { fieldsByObject } from "../lib/fields.ts";
import { recentImports } from "../lib/importers.ts";
import { directory } from "../lib/people.ts";
import { team as teamOf } from "../lib/team.ts";
import { words } from "./words.ts";

// Bring the clients from another tool: a spreadsheet (HubSpot, Pipedrive,
// Excel) of companies, contacts, deals or their history, with its columns
// matched, or an address book (vCard). The last imports can be undone.
export async function importPage({ member, locale: lang, t }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "import")) {
    return {
      title: t.importer.title,
      body: (
        <div className="page narrow">
          <div className="page-head"><div><h1>{t.importer.title}</h1></div></div>
          <p className="notice">{t.importer.readOnly}</p>
        </div>
      ),
    };
  }
  const sql = db();
  const [fields, people, recent] = await Promise.all([fieldsByObject(sql, t), teamOf(), recentImports(sql, member)]);
  const names = await directory([...recent.map(r => r.author), ...people.map(p => p.id)], locale);
  return {
    title: t.importer.title,
    body: (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1>{t.importer.title}</h1>
            <p className="lede">{t.importer.intro}</p>
          </div>
        </div>
        <Island name="Importer" props={{ locale, fields, team: people.map(p => ({ id: p.id, name: p.name, photo: p.photo })), me: member.id, canAssign: can(member, "assign"), mayCreateFields: can(member, "fields"), people: Object.fromEntries(Object.entries(names).map(([id, p]) => [id, p.name])), t: words.importer(t) }} />
        <Island name="RecentImports" props={{ lines: recent.map(r => ({ id: r.id, count: r.created, undone: r.undone, undoable: r.undoable, line: format(t.importer.recentLine, { file: r.fileName || t.importer.noFile, who: r.author === member.id ? t.people.you : names[r.author]?.name ?? t.people.erased, when: relative(r.at, locale) }) })), locale, t: words.importer(t) }} />
      </div>
    ),
  };
}
