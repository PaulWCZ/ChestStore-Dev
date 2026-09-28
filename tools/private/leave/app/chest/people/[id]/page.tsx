import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar.tsx";
import { Back } from "../../../../components/icons.tsx";
import { can, canBeApprover } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import * as balances from "../../../../lib/balances.ts";
import { db } from "../../../../lib/db.ts";
import { everyoneOrNone } from "../../../../lib/directory.ts";
import { format, formatDay, formatDays, plural, spanText } from "../../../../lib/i18n/index.ts";
import { memberPattern, today } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { ofPerson } from "../../../../lib/requests.ts";
import { types } from "../../../../lib/rules.ts";
import { viewer } from "../../../../lib/session.ts";
import { staffRow } from "../../../../lib/staff.ts";
import { typeName } from "../../../../lib/type-name.ts";
import { ApproverSelect } from "../people-controls.tsx";
import { BalanceForms, StartDate } from "./person-controls.tsx";

// One person, for HR (who changes their approver, start date and balances)
// or for their approver (who reads): balances, their history, requests.
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const id = (await params).id;
  if (!memberPattern.test(id)) notFound();
  const sql = db();
  let list: balances.Balance[];
  let lines: balances.Line[];
  try {
    [list, lines] = await Promise.all([balances.balances(sql, member, id), balances.ledger(sql, member, id)]);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const hr = can(member, "people.all");
  const [all, st, reqs, dir] = await Promise.all([types(sql, { archived: true }), staffRow(sql, id), ofPerson(sql, member, id), hr ? everyoneOrNone() : Promise.resolve({ people: [], reached: true })]);
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const who = await people([id, ...lines.map(l => l.createdBy)]);
  const person = who.get(id);
  const by = (x: string) => (x === "chest" ? t.people.chest : x === member.id ? t.people.you : nameOf(who.get(x), locale));
  const status = (r: (typeof reqs)[number]) => (r.cancelAsked ? "cancelAsked" : r.status === "approved" && r.decidedBy === "chest" ? "declared" : r.status);
  const counted = list.filter(b => !typeOf.get(b.typeId)?.archived);
  return (
    <main className="page">
      <Link className="back" href="/chest/people"><Back />{t.team.back}</Link>
      <header className="detail-head">
        <Avatar name={person?.name ?? ""} photo={person?.photo ?? null} size={56} />
        <div><h1>{nameOf(person, locale)}</h1></div>
      </header>

      {hr && (
        <div className="settings-row">
          <div className="field-group">
            <span className="field-label">{t.team.approver}</span>
            <ApproverSelect memberId={id} value={st.approverId ?? ""} options={dir.people.filter(p => canBeApprover(p.role) && p.id !== id).map(p => ({ id: p.id, name: p.name }))} label={t.team.approver} t={{ team: t.team, errors: t.errors }} />
          </div>
          <StartDate memberId={id} value={st.startDate ?? ""} max={today()} t={{ team: t.team, errors: t.errors }} />
        </div>
      )}

      <h2 className="section-title">{t.team.balances}</h2>
      <ul className="balances">
        {counted.map(b => {
          const ty = typeOf.get(b.typeId);
          return (
            <li key={b.typeId} className={`balance k-${ty?.color ?? "sky"}`}>
              <span className="balance-name">{typeName(ty, t.types)}</span>
              <span className="balance-figure"><strong>{b.setUp ? formatDays(b.left, locale) : "–"}</strong> <span>{t.units.left}</span></span>
              {b.since && b.perMonth !== 0 && <span className="balance-note">{format(t.team.earnedLine, { months: b.months, perMonth: formatDays(b.perMonth, locale), date: formatDay(b.since, locale, { day: "numeric", month: "short", year: "numeric" }) })}</span>}
              {b.pending > 0 && <span className="balance-note">{plural(t.home.waiting, b.pending, locale)}</span>}
            </li>
          );
        })}
      </ul>

      {hr && counted.length > 0 && (
        <BalanceForms memberId={id} types={counted.map(b => ({ id: b.typeId, name: typeName(typeOf.get(b.typeId), t.types) }))} today={today()} t={{ team: t.team, errors: t.errors }} />
      )}

      <h2 className="section-title">{t.team.ledger}</h2>
      {lines.length === 0 ? <p className="muted">{t.team.ledgerEmpty}</p> : (
        <div className="table-wrap">
          <table className="ledger">
            <thead><tr><th scope="col">{t.team.onDate}</th><th scope="col">{t.team.type}</th><th scope="col">{t.team.reason}</th><th scope="col" className="num">{t.team.days}</th></tr></thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id}>
                  <td>{formatDay(l.onDate, locale, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td><span className={`kind small k-${typeOf.get(l.typeId)?.color ?? "sky"}`}>{typeName(typeOf.get(l.typeId), t.types)}</span> {t.team.kinds[l.kind]}</td>
                  <td>{l.requestId ? <Link href={`/chest/requests/${l.requestId}`}>{t.request.title}</Link> : l.reason}<span className="muted small"> · {format(t.team.by, { name: by(l.createdBy) })}</span></td>
                  <td className={l.days < 0 ? "num minus" : "num plus"}>{l.days > 0 ? "+" : ""}{formatDays(l.days, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-title">{t.team.requests}</h2>
      {reqs.length === 0 ? <p className="muted">{t.team.noRequests}</p> : (
        <ul className="requests">
          {reqs.map(r => (
            <li key={r.id} className="request">
              <span className={`kind k-${typeOf.get(r.typeId)?.color ?? "sky"}`}>{typeName(typeOf.get(r.typeId), t.types)}</span>
              <span className="request-when"><Link href={`/chest/requests/${r.id}`}>{spanText(r, locale, t.span, { year: true })}</Link><span className="muted">{plural(t.units.days, r.days, locale)}</span></span>
              <span className={`status s-${status(r)}`}>{t.status[status(r)]}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
