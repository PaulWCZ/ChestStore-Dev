import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { format } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { directory } from "../lib/directory.ts";
import { listFields } from "../lib/fields.ts";
import { people } from "../lib/people.ts";
import { choices } from "../lib/profiles.ts";
import { today } from "../lib/zone.ts";
import type { TableRow } from "../islands/TableEditor.tsx";
import { BackLink } from "./parts.tsx";

// HR's table: everyone on one screen, job title, team, office, manager,
// start date, phone and HR's extra fields as cells saved one by one — the
// way to set up fifty people without opening fifty profiles.
export async function tablePage({ member, t }: PageContext): Promise<View> {
  if (!can(member, "profile.job")) return notFound();
  const sql = db();
  const { entries } = await directory(sql, member);
  const fields = (await listFields(sql, member)).map(f => ({ id: f.id, label: f.label, editor: f.editor, seen: f.seen, kind: f.kind, options: f.options }));
  const known = await choices(sql, member);
  // Managers who left, still named above their reports (marked).
  const departed = [...new Set(entries.filter(e => e.managerLeft && e.managerId && !entries.some(x => x.id === e.managerId)).map(e => e.managerId!))];
  const gone = await people(departed);
  const rows: TableRow[] = entries.map(e => ({
    id: e.id, name: e.name, photo: e.photo, title: e.title, team: e.team, office: e.office, managerId: e.managerId ?? "", startDate: e.startDate ?? "", phone: e.phone, extras: e.extras,
  }));
  return {
    title: t.table.title,
    body: (
      <div className="page wide">
        <BackLink href="/chest">{t.profile.back}</BackLink>
        <PageHeader title={t.table.title} intro={t.table.lead} />
        {rows.length === 0 ? <EmptyState title={t.table.empty} /> : (
          <Island
            name="TableEditor"
            props={{
              rows,
              managers: [...entries.map(e => ({ id: e.id, name: e.name })), ...departed.map(id => ({ id, name: format(t.profile.managerLeft, { name: gone.get(id)?.name || t.people.erased }), left: true }))],
              fields,
              known,
              today: today(),
              t: { table: t.table, edit: t.edit, date: t.date },
            }}
          />
        )}
      </div>
    ),
  };
}
