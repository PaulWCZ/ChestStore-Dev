import { notFound } from "next/navigation";
import { can, sightOf } from "../../../lib/access.ts";
import { balancesOf } from "../../../lib/balances.ts";
import { leftLine } from "../../../lib/balance-words.ts";
import { addDays, fullWeek, weekday } from "../../../lib/calendar.ts";
import { db } from "../../../lib/db.ts";
import { everyoneOrNone } from "../../../lib/directory.ts";
import { format } from "../../../lib/i18n/index.ts";
import { memberPattern } from "../../../lib/model.ts";
import { today } from "../../../lib/today.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { window } from "../../../lib/requests.ts";
import { answerers } from "../../../lib/routing.ts";
import { familyEvents, settings, types } from "../../../lib/rules.ts";
import { viewer } from "../../../lib/session.ts";
import { approvees, staffRow } from "../../../lib/staff.ts";
import { typeName } from "../../../lib/type-name.ts";
import { RequestForm, type FormType } from "./request-form.tsx";

// Asking for time off: the kind, the days, a note. What it costs is counted
// as the person picks the days, with the company's rules and holidays and
// the person's week; the server counts again when it is sent. HR, and an
// approver for their people, record leave for someone (?for=mbr_…):
// approved at once.
export default async function NewRequest({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const wanted = (await searchParams).for;
  const hr = can(member, "people.all");
  const [dir, mine] = await Promise.all([everyoneOrNone(), can(member, "approve") && !hr ? approvees(sql, member.id) : Promise.resolve([] as string[])]);
  // Whom the actor may record leave for: HR, anyone with the tool; an
  // approver, their people.
  const recordable = hr ? dir.people.filter(p => p.id !== member.id && p.role).map(p => p.id) : mine;
  let who = member.id;
  if (wanted && wanted !== member.id) {
    if (!memberPattern.test(wanted)) notFound();
    const sight = sightOf(member, { memberId: wanted, approverId: (await staffRow(sql, wanted)).approverId });
    if (sight !== "approver") notFound();
    who = wanted;
  }
  const forSomeone = who !== member.id;
  const [all, s, bal, me, names] = await Promise.all([types(sql), settings(sql), balancesOf(sql, [who]), staffRow(sql, who), people([who, ...recordable])]);
  const balances = bal.get(who) ?? [];
  const list: FormType[] = all.map(ty => {
    const b = balances.find(x => x.typeId === ty.id);
    return {
      id: ty.id, key: ty.key, name: typeName(ty, t.types), color: ty.color, halfDays: ty.halfDays, counting: ty.counting, approval: ty.approval, notes: ty.notes,
      overdraw: ty.overdraw || forSomeone,
      left: b && b.setUp ? { left: b.left, pending: b.pending, line: leftLine(b, locale, t) } : null,
    };
  });
  // The next day the person works, as a start.
  const week = me.workDays ?? fullWeek;
  let first = addDays(today(), 1);
  for (let i = 0; i < 7 && !week.includes(weekday(first)); i++) first = addDays(first, 1);
  const to = answerers({ memberId: who, approverId: me.approverId }, dir.people);
  const approver = to.length === 1 && to[0] !== who ? dir.people.find(p => p.id === to[0]) : undefined;
  const hrAnswers = approver ? approver.role === "hr" && me.approverId === null : true;
  const w = window(today());
  const choices = recordable.length > 0 ? [{ id: member.id, name: t.form.me }, ...recordable.map(id => ({ id, name: nameOf(names.get(id), locale) })).sort((a, b) => a.name.localeCompare(b.name, locale))] : null;
  return (
    <div className="page narrow">
      <RequestForm
        key={who}
        types={list}
        rules={{ counting: s.counting, alsace: s.alsace, workedHolidays: s.workedHolidays }}
        workDays={me.workDays}
        first={first}
        today={today()}
        earliest={w.earliest}
        latest={w.latest}
        locale={locale}
        answerer={hrAnswers ? t.form.approverHr : format(t.form.approver, { name: approver!.name })}
        people={choices}
        who={who}
        whoName={forSomeone ? nameOf(names.get(who), locale) : null}
        events={Object.entries(familyEvents).map(([key, days]) => ({ key, days, name: t.events[key as keyof typeof familyEvents] }))}
        t={{ form: t.form, units: t.units, holidays: t.holidays, errors: t.errors, span: t.span, date: t.date, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
