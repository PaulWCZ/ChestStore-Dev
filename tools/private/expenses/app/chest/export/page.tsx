import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { exportMonths, exportPeople } from "../../../lib/expenses.ts";
import { formatDate, plural } from "../../../lib/i18n/index.ts";
import { month as checkMonth, monthRange } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { ExportView } from "./export-view.tsx";

// Export: pick a month (and a person, or everyone), download the
// spreadsheet or the receipts. For the company's accountant.
export default async function Export({ searchParams }: { searchParams: Promise<{ month?: string; person?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "export")) return <main className="page"><div className="empty"><h1>{t.noAccess.title}</h1><p>{t.errors.forbidden}</p></div></main>;
  const sql = db();
  const query = await searchParams;
  const months = await exportMonths(sql, member);
  let chosen = months[0]?.month ?? null;
  try {
    if (query.month) chosen = checkMonth(query.month);
  } catch {
    // An unknown month: the latest one.
  }
  const label = (m: string) => formatDate(m + "-15T12:00:00Z", locale, { month: "long", year: "numeric" });
  const owners = chosen ? (await exportPeople(sql, member, monthRange(chosen))).map(o => ({ member_id: o.member, n: o.count })) : [];
  const who = await people(owners.map(o => o.member_id));
  const person = query.person && owners.some(o => o.member_id === query.person) ? query.person : "";
  const count = person ? owners.find(o => o.member_id === person)?.n ?? 0 : owners.reduce((n, o) => n + o.n, 0);
  const qs = chosen ? `?month=${chosen}${person ? `&person=${person}` : ""}` : "";
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t.export.title}</h1>
          <p>{t.export.intro}</p>
        </div>
      </div>
      <ExportView
        months={[...new Set([...(chosen ? [chosen] : []), ...months.map(m => m.month)])].sort().reverse().map(m => ({ value: m, label: label(m) }))}
        month={chosen}
        people={owners.map(o => ({ value: o.member_id, label: nameOf(who.get(o.member_id), locale) })).sort((a, b) => a.label.localeCompare(b.label, locale))}
        person={person}
        summary={chosen && count > 0 ? plural(t.export.count, count, locale, { month: label(chosen) }) : null}
        csv={chosen && count > 0 ? "/chest/export/csv" + qs : null}
        zip={chosen && count > 0 ? "/chest/export/zip" + qs : null}
        t={t.export}
      />
    </main>
  );
}
