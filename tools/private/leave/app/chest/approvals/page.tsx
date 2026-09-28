import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { can, roleOf } from "../../../lib/access.ts";
import { balancesOf } from "../../../lib/balances.ts";
import { overlaps } from "../../../lib/calendar.ts";
import { db } from "../../../lib/db.ts";
import { everyoneOrNone } from "../../../lib/directory.ts";
import { format, formatDays, plural, relative, spanText } from "../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { between, waiting } from "../../../lib/requests.ts";
import { answerers } from "../../../lib/routing.ts";
import { types } from "../../../lib/rules.ts";
import { viewer } from "../../../lib/session.ts";
import { typeName } from "../../../lib/type-name.ts";
import { Approvals, type Card } from "./approvals-view.tsx";

// What waits for the actor's answer: requests, and asks to cancel approved
// leave. HR sees theirs first, then those with a manager (HR may answer
// them too).
export default async function ApprovalsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "approve")) notFound();
  const sql = db();
  const list = await waiting(sql, member);
  const [all, dir, bal] = await Promise.all([types(sql, { archived: true }), everyoneOrNone(), balancesOf(sql, [...new Set(list.map(r => r.memberId))])]);
  const from = list.reduce((a, r) => (r.start < a ? r.start : a), "9999-12-31");
  const to = list.reduce((a, r) => (r.end > a ? r.end : a), "0000-01-01");
  const around = list.length > 0 ? await between(sql, member, from, to) : [];
  const who = await people([...list.map(r => r.memberId), ...list.flatMap(r => (r.approverId ? [r.approverId] : [])), ...around.map(e => e.memberId)]);
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const now = new Date();
  const hr = roleOf(member) === "hr";
  const cards: Card[] = list.map(r => {
    const ty = typeOf.get(r.typeId);
    const b = bal.get(r.memberId)?.find(x => x.typeId === r.typeId);
    const person = who.get(r.memberId);
    const also = [...new Set(around.filter(e => e.memberId !== r.memberId && e.status === "approved" && overlaps(e, r)).map(e => nameOf(who.get(e.memberId), locale)))];
    const mine = !hr || (dir.reached ? answerers({ memberId: r.memberId, approverId: r.approverId }, dir.people).includes(member.id) : r.approverId === null || r.approverId === member.id);
    return {
      id: r.id,
      name: nameOf(person, locale),
      firstName: person?.name.split(" ")[0] || nameOf(person, locale),
      photo: person?.photo ?? null,
      type: typeName(ty, t.types),
      color: ty?.color ?? "sky",
      when: spanText(r, locale, t.span),
      days: plural(t.units.days, r.days, locale),
      note: r.note,
      cancelAsked: r.cancelAsked,
      balance: b && b.setUp ? (r.cancelAsked ? format(t.approvals.now, { days: formatDays(b.left, locale) }) : format(t.approvals.after, { days: formatDays(b.left - r.days, locale) })) : null,
      short: b && b.setUp && !r.cancelAsked ? b.left - r.days < 0 : false,
      alsoAway: also.length > 0 ? format(t.approvals.alsoAway, { names: also.join(", ") }) : null,
      asked: format(t.approvals.asked, { when: relative(r.createdAt, locale, now) }),
      approver: r.approverId ? format(t.approvals.with, { name: nameOf(who.get(r.approverId), locale) }) : null,
      mine,
    };
  });
  return (
    <main className="page">
      <AutoRefresh seconds={30} />
      <h1>{t.approvals.title}</h1>
      <Approvals cards={cards} hr={hr} t={{ approvals: t.approvals, errors: t.errors, home: t.home }} />
    </main>
  );
}
