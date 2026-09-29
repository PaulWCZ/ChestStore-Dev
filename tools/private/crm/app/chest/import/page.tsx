import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { fieldsByObject } from "../../../lib/fields.ts";
import { format, relative } from "../../../lib/i18n/index.ts";
import { recentImports } from "../../../lib/importers.ts";
import { directory } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { team as teamOf } from "../../../lib/team.ts";
import { Importer, RecentImports } from "./importer.tsx";

// Bring the clients from another tool: a spreadsheet (HubSpot, Pipedrive,
// Excel) of companies, contacts, deals or their history, with its columns
// matched, or an address book (vCard). The last imports can be undone.
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "import")) {
    return (
      <div className="page narrow">
        <div className="page-head"><div><h1>{t.importer.title}</h1></div></div>
        <p className="notice">{t.importer.readOnly}</p>
      </div>
    );
  }
  const sql = db();
  const [fields, people, recent] = await Promise.all([fieldsByObject(sql, t), teamOf(), recentImports(sql, member)]);
  const names = await directory([...recent.map(r => r.author), ...people.map(p => p.id)], locale);
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>{t.importer.title}</h1>
          <p className="lede">{t.importer.intro}</p>
        </div>
      </div>
      <Importer locale={locale} fields={fields} team={people.map(p => ({ id: p.id, name: p.name, photo: p.photo }))} me={member.id} canAssign={can(member, "assign")} mayCreateFields={can(member, "fields")}
        people={Object.fromEntries(Object.entries(names).map(([id, p]) => [id, p.name]))} t={t} />
      <RecentImports lines={recent.map(r => ({ id: r.id, count: r.created, undone: r.undone, undoable: r.undoable, line: format(t.importer.recentLine, { file: r.fileName || t.importer.noFile, who: r.author === member.id ? t.people.you : names[r.author]?.name ?? t.people.erased, when: relative(r.at, locale) }) }))} locale={locale} t={t} />
    </div>
  );
}
