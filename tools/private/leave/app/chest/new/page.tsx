import { balancesOf } from "../../../lib/balances.ts";
import { addDays, weekday } from "../../../lib/calendar.ts";
import { db } from "../../../lib/db.ts";
import { everyoneOrNone } from "../../../lib/directory.ts";
import { format } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { window } from "../../../lib/requests.ts";
import { answerers } from "../../../lib/routing.ts";
import { settings, types } from "../../../lib/rules.ts";
import { viewer } from "../../../lib/session.ts";
import { staffRow } from "../../../lib/staff.ts";
import { typeName } from "../../../lib/type-name.ts";
import { RequestForm, type FormType } from "./request-form.tsx";

// Asking for time off: the kind, the days, a note. What it costs is counted
// as the person picks the days, with the company's rules and holidays; the
// server counts again when it is sent.
export default async function NewRequest() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const [all, s, mine, me, dir] = await Promise.all([types(sql), settings(sql), balancesOf(sql, [member.id]), staffRow(sql, member.id), everyoneOrNone()]);
  const balances = mine.get(member.id) ?? [];
  const list: FormType[] = all.map(ty => {
    const b = balances.find(x => x.typeId === ty.id);
    return {
      id: ty.id, name: typeName(ty, t.types), color: ty.color, halfDays: ty.halfDays, calendar: ty.counting === "calendar", approval: ty.approval, notes: ty.notes,
      left: b && b.setUp ? b.left - b.pending : null,
    };
  });
  // The next working day, as a start.
  let first = addDays(today(), 1);
  while (weekday(first) === 0 || weekday(first) === 6) first = addDays(first, 1);
  const to = answerers({ memberId: member.id, approverId: me.approverId }, dir.people);
  const approver = to.length === 1 && to[0] !== member.id ? dir.people.find(p => p.id === to[0]) : undefined;
  const hrAnswers = approver ? approver.role === "hr" && me.approverId === null : true;
  const w = window(today());
  return (
    <main className="page narrow">
      <RequestForm
        types={list}
        rules={{ counting: s.counting, alsace: s.alsace, workedHolidays: s.workedHolidays }}
        first={first}
        earliest={w.earliest}
        latest={w.latest}
        locale={locale}
        answerer={hrAnswers ? t.form.approverHr : format(t.form.approver, { name: approver!.name })}
        t={{ form: t.form, units: t.units, holidays: t.holidays, errors: t.errors, span: t.span }}
      />
    </main>
  );
}
