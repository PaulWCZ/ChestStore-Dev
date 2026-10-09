import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { can, roleOf } from "../lib/access.ts";
import { balancesOf } from "../lib/balances.ts";
import { overlaps } from "../shared/calendar.ts";
import { db } from "../lib/db.ts";
import { everyoneOrNone } from "../lib/directory.ts";
import { format, formatDays, plural, relative, spanText } from "../i18n/index.ts";
import { nameOf, people } from "../lib/people.ts";
import { afterRequest } from "../shared/left.ts";
import { between, pendingOf, waiting } from "../lib/requests.ts";
import { answerers } from "../lib/routing.ts";
import { types } from "../lib/rules.ts";
import { typeName } from "../shared/type-name.ts";
import type { Card } from "../islands/Approvals.tsx";
import { today } from "../lib/today.ts";

// What waits for the actor's answer: requests, and asks to cancel approved
// leave. HR sees theirs first, then those with a manager (HR may answer
// them too).
export async function approvalsPage({ member, locale, t }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "approve")) return notFound();
  const sql = db();
  const list = await waiting(sql, member);
  const ids = [...new Set(list.map(r => r.memberId))];
  const [all, dir, bal, open] = await Promise.all([types(sql, { archived: true }), everyoneOrNone(), balancesOf(sql, ids), pendingOf(sql, ids)]);
  const from = list.reduce((a, r) => (r.start < a ? r.start : a), "9999-12-31");
  const to = list.reduce((a, r) => (r.end > a ? r.end : a), "0000-01-01");
  const around = list.length > 0 ? await between(sql, member, from, to) : [];
  const who = await people([...list.map(r => r.memberId), ...list.flatMap(r => (r.approverId ? [r.approverId] : [])), ...around.map(e => e.memberId)]);
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const now = new Date();
  const hr = roleOf(member) === "hr";
  const thisYear = today().slice(0, 4);
  const cards: Card[] = list.map(r => {
    const ty = typeOf.get(r.typeId);
    const b = bal.get(r.memberId)?.find(x => x.typeId === r.typeId);
    // The balance after this request and the person's other waiting
    // requests of the kind that come before it.
    const after = b && b.setUp && !r.cancelAsked ? afterRequest(b.left, open.filter(o => o.memberId === r.memberId && o.typeId === r.typeId), r) : null;
    const person = who.get(r.memberId);
    const also = [...new Set(around.filter(e => e.memberId !== r.memberId && e.status === "approved" && e.away && overlaps(e, r)).map(e => nameOf(who.get(e.memberId), locale)))];
    const mine = !hr || (dir.reached ? answerers({ memberId: r.memberId, approverId: r.approverId }, dir.people).includes(member.id) : r.approverId === null || r.approverId === member.id);
    return {
      id: r.id,
      name: nameOf(person, locale),
      avatarName: person?.name ?? "",
      firstName: person?.name.split(" ")[0] || nameOf(person, locale),
      photo: person?.photo ?? null,
      type: typeName(ty, t.types),
      color: ty?.color ?? "sky",
      when: spanText(r, locale, t.span, { thisYear }),
      days: plural(t.units.days, r.days, locale),
      note: r.note,
      cancelAsked: r.cancelAsked,
      balance: b && b.setUp ? (after ? format(t.approvals.after, { days: formatDays(after.after, locale) }) : format(t.approvals.now, { days: formatDays(b.left, locale) })) : null,
      balanceNote: after && after.before > 0 ? plural(t.approvals.counting, after.before, locale) : null,
      short: after ? after.after < 0 : false,
      alsoAway: also.length > 0 ? format(t.approvals.alsoAway, { names: also.join(", ") }) : null,
      asked: format(t.approvals.asked, { when: relative(r.createdAt, locale, now) }),
      approver: r.approverId ? format(t.approvals.with, { name: nameOf(who.get(r.approverId), locale) }) : null,
      mine,
    };
  });
  return {
    title: t.approvals.title,
    body: (
      <div className="page">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        <h1>{t.approvals.title}</h1>
        <Island name="Approvals" props={{ cards, hr, t: { approvals: t.approvals, home: t.home } }} />
      </div>
    ),
  };
}
