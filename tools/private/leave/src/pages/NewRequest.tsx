import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { can, sightOf } from "../lib/access.ts";
import { balancesOf } from "../lib/balances.ts";
import { leftLine } from "../lib/balance-words.ts";
import { addDays, fullWeek, weekday } from "../shared/calendar.ts";
import { db } from "../lib/db.ts";
import { everyoneOrNone } from "../lib/directory.ts";
import { compare, format } from "../i18n/index.ts";
import { memberPattern } from "../shared/model.ts";
import { today } from "../lib/today.ts";
import { nameOf, people } from "../lib/people.ts";
import { window } from "../lib/requests.ts";
import { answerers } from "../lib/routing.ts";
import { familyEvents, settings, types } from "../lib/rules.ts";
import { approvees, staffRow } from "../lib/staff.ts";
import { typeName } from "../shared/type-name.ts";
import type { FormType } from "../islands/RequestForm.tsx";

// Asking for time off: the kind, the days, a note. What it costs is counted
// as the person picks the days, with the company's rules and holidays and
// the person's week; the server counts again when it is sent. HR, and an
// approver for their people, record leave for someone (?for=mbr_…):
// approved at once.
export async function newRequestPage({ member, locale, t, query }: PageContext<MemberContext>): Promise<View> {
  const sql = db();
  const wanted = query("for");
  const hr = can(member, "people.all");
  const [dir, mine] = await Promise.all([everyoneOrNone(), can(member, "approve") && !hr ? approvees(sql, member.id) : Promise.resolve([] as string[])]);
  // Whom the actor may record leave for: HR, anyone with the tool; an
  // approver, their people.
  const recordable = hr ? dir.people.filter(p => p.id !== member.id && p.role).map(p => p.id) : mine;
  let who = member.id;
  if (wanted && wanted !== member.id) {
    if (!memberPattern.test(wanted)) return notFound();
    const sight = sightOf(member, { memberId: wanted, approverId: (await staffRow(sql, wanted)).approverId });
    if (sight !== "approver") return notFound();
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
  const choices = recordable.length > 0 ? [{ id: member.id, name: t.form.me }, ...recordable.map(id => ({ id, name: nameOf(names.get(id), locale) })).sort((a, b) => compare(locale)(a.name, b.name))] : null;
  return {
    title: forSomeone ? format(t.form.titleFor, { name: nameOf(names.get(who), locale) }) : t.form.title,
    body: (
      <div className="page narrow">
        <Island
          id={`ask-${who}`}
          name="RequestForm"
          props={{
            types: list,
            rules: { counting: s.counting, alsace: s.alsace, workedHolidays: s.workedHolidays },
            workDays: me.workDays,
            first,
            today: today(),
            earliest: w.earliest,
            latest: w.latest,
            locale,
            answerer: hrAnswers ? t.form.approverHr : format(t.form.approver, { name: approver!.name }),
            people: choices,
            who,
            whoName: forSomeone ? nameOf(names.get(who), locale) : null,
            events: Object.entries(familyEvents).map(([key, days]) => ({ key, days, name: t.events[key as keyof typeof familyEvents] })),
            t: { form: t.form, units: t.units, holidays: t.holidays, errors: t.errors, span: t.span, date: t.kit.date, peoplePicker: t.kit.peoplePicker },
          }}
        />
      </div>
    ),
  };
}
