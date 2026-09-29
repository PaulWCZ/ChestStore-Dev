import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { directory } from "../../../lib/directory.ts";
import { listFields } from "../../../lib/fields.ts";
import { format } from "../../../lib/i18n/index.ts";
import { people } from "../../../lib/people.ts";
import { choices } from "../../../lib/profiles.ts";
import { viewer } from "../../../lib/session.ts";
import { TableEditor, type TableRow } from "./table-editor.tsx";

// HR's table: everyone on one screen, job title, team, office, manager,
// start date, phone and HR's extra fields as cells saved one by one — the
// way to set up fifty people without opening fifty profiles.
export default async function TablePage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "profile.job")) notFound();
  const sql = db();
  const { entries } = await directory(sql, member);
  const fields = await listFields(sql, member);
  const known = await choices(sql, member);
  // Managers who left, still named above their reports (marked).
  const departed = [...new Set(entries.filter(e => e.managerLeft && e.managerId && !entries.some(x => x.id === e.managerId)).map(e => e.managerId!))];
  const gone = await people(departed);
  const rows: TableRow[] = entries.map(e => ({
    id: e.id, name: e.name, photo: e.photo, title: e.title, team: e.team, office: e.office, managerId: e.managerId ?? "", startDate: e.startDate ?? "", phone: e.phone, extras: e.extras,
  }));
  return (
    <main className="page wide">
      <Link className="back" href="/chest"><Back />{t.profile.back}</Link>
      <div className="page-head">
        <div>
          <h1>{t.table.title}</h1>
          <p className="muted">{t.table.lead}</p>
        </div>
      </div>
      {rows.length === 0 ? <div className="empty"><p>{t.table.empty}</p></div> : (
        <TableEditor
          rows={rows}
          managers={[...entries.map(e => ({ id: e.id, name: e.name })), ...departed.map(id => ({ id, name: format(t.profile.managerLeft, { name: gone.get(id)?.name || t.people.erased }), left: true }))]}
          fields={fields}
          known={known}
          t={{ table: t.table, edit: t.edit, errors: t.errors }}
        />
      )}
    </main>
  );
}
