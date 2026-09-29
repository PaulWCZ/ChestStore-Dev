import { Avatar, StatusBadge } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Info, Plus } from "../../../../components/icons.tsx";
import { can, canBeApprover } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import * as balances from "../../../../lib/balances.ts";
import { balanceNotes } from "../../../../lib/balance-words.ts";
import { fullWeek } from "../../../../lib/calendar.ts";
import { db } from "../../../../lib/db.ts";
import { everyoneOrNone } from "../../../../lib/directory.ts";
import { format, formatDay, formatDays, plural, spanText } from "../../../../lib/i18n/index.ts";
import { memberPattern, today } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { ofPerson } from "../../../../lib/requests.ts";
import { types } from "../../../../lib/rules.ts";
import { viewer } from "../../../../lib/session.ts";
import { staffRow } from "../../../../lib/staff.ts";
import { toneOf } from "../../../../lib/status.ts";
import { typeName } from "../../../../lib/type-name.ts";
import { ApproverPicker } from "../people-controls.tsx";
import { BalanceForms, DayField, NumberField, WorkWeek } from "./person-controls.tsx";

// One person, for HR (who changes their approver, dates, week, number and
// balances, and records leave for them) or for their approver (who reads,
// and records leave for them): balances, their history, requests.
export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
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
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "short", year: "numeric" });
  const done = (await searchParams).done;
  const words = { team: t.team, errors: t.errors, date: t.date };
  // The history: the lines, and the ends of years computed when read (days
  // carried over or lost), the latest first.
  const history = [
    ...lines.map(l => ({ key: "l" + l.id, on: l.onDate, order: Number(l.id), line: l, close: null as balances.Close | null })),
    ...counted.flatMap(b => b.closes).map((c, i) => ({ key: "c" + i, on: c.on, order: 0, line: null, close: c })),
  ].sort((a, b) => (a.on !== b.on ? (a.on < b.on ? 1 : -1) : a.close && !b.close ? -1 : b.close && !a.close ? 1 : b.order - a.order));
  const days = [1, 2, 3, 4, 5, 6, 0].map(d => ({ value: d, name: formatDay(`2026-06-${String(7 + (d === 0 ? 7 : d)).padStart(2, "0")}`, locale, { weekday: "short" }) }));
  return (
    <div className="page">
      <Link className="back" href="/chest/people"><Back />{t.team.back}</Link>
      {done === "recorded" && <p className="notice ok" role="status">{t.team.recorded}</p>}
      <header className="detail-head">
        <Avatar name={person?.name ?? ""} photo={person?.photo ?? null} size="l" />
        <div>
          <h1>{nameOf(person, locale)}</h1>
          {st.endDate && <p className="muted small">{format(t.team.leftOn, { date: long(st.endDate) })}</p>}
        </div>
        {(!st.endDate || st.endDate >= today()) && <Link className="button" href={`/chest/new?for=${id}`}><Plus />{t.team.record}</Link>}
      </header>

      {hr && (
        <div className="settings-row">
          <div className="field-group approver-field">
            <ApproverPicker memberId={id} value={st.approverId} options={dir.people.filter(p => canBeApprover(p.role) && p.id !== id).map(p => ({ id: p.id, name: p.name, photo: p.photo ?? null }))} label={t.team.approver} locale={locale} t={{ team: t.team, errors: t.errors, peoplePicker: t.peoplePicker }} />
          </div>
          <DayField kind="start" memberId={id} value={st.startDate} label={t.team.startDate} today={today()} t={words} />
          <DayField kind="end" memberId={id} value={st.endDate} label={t.team.lastDay} today={today()} locale={locale} t={words} />
          <NumberField memberId={id} value={st.employeeNumber ?? ""} t={words} />
          <WorkWeek memberId={id} value={st.workDays ?? [...fullWeek]} days={days} t={words} />
        </div>
      )}
      {hr && st.fromPeople && <p className="muted small from-people"><Info /> {t.team.fromPeople}</p>}
      {!hr && st.workDays && <p className="muted">{format(t.team.worksOn, { days: days.filter(d => st.workDays!.includes(d.value)).map(d => d.name).join(", ") })}</p>}

      <h2 className="section-title">{t.team.balances}</h2>
      <ul className="balances">
        {counted.map(b => {
          const ty = typeOf.get(b.typeId);
          return (
            <li key={b.typeId} className={`balance k-${ty?.color ?? "sky"}`}>
              <span className="balance-name">{typeName(ty, t.types)}</span>
              <span className="balance-figure"><strong>{b.setUp ? formatDays(b.left, locale) : "–"}</strong> <span>{t.units.left}</span></span>
              {b.setUp && balanceNotes(b, ty?.period ?? "running", locale, t, { perMonth: false }).map(n => <span key={n} className="balance-note">{n}</span>)}
              {b.since && b.perMonth !== 0 && (
                <span className="balance-note">
                  {format(b.sinceOpening ? t.team.earnedSinceOpening : t.team.earnedSinceStart, { months: b.months, perMonth: formatDays(b.perMonth, locale), date: long(b.since) })}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {hr && counted.length > 0 && (
        <BalanceForms memberId={id} types={counted.map(b => ({ id: b.typeId, name: typeName(typeOf.get(b.typeId), t.types), split: typeOf.get(b.typeId)?.period === "acquired" }))} today={today()} t={words} />
      )}

      <h2 className="section-title">{t.team.ledger}</h2>
      {history.length === 0 ? <p className="muted">{t.team.ledgerEmpty}</p> : (
        <div className="table-wrap">
          <table className="ledger">
            <thead><tr><th scope="col">{t.team.onDate}</th><th scope="col">{t.team.type}</th><th scope="col">{t.team.reason}</th><th scope="col" className="num">{t.team.days}</th></tr></thead>
            <tbody>
              {history.map(h => {
                const ty = typeOf.get(h.line?.typeId ?? h.close!.typeId);
                const chip = <span className={`kind small k-${ty?.color ?? "sky"}`}>{typeName(ty, t.types)}</span>;
                if (h.close) {
                  return (
                    <tr key={h.key} className="computed">
                      <td>{long(h.close.on)}</td>
                      <td>{chip} {t.team.kinds.close}</td>
                      <td>{plural(h.close.lost ? t.team.closeLost : t.team.closeCarried, h.close.days, locale)}</td>
                      <td className={h.close.lost ? "num minus" : "num"}>{h.close.lost ? "−" + formatDays(h.close.days, locale) : ""}</td>
                    </tr>
                  );
                }
                const l = h.line!;
                return (
                  <tr key={h.key}>
                    <td>{long(l.onDate)}</td>
                    <td>{chip} {t.team.kinds[l.kind]}{l.bucket === "earning" ? ` · ${t.team.bucketEarning}` : l.bucket === "acquired" ? ` · ${t.team.bucketAcquired}` : ""}</td>
                    <td>{l.requestId ? <Link href={`/chest/requests/${l.requestId}`}>{l.reasonKey ? t.team.reasonKeys[l.reasonKey] : l.kind === "adjustment" ? t.team.alreadyCounted : t.request.title}</Link> : l.reasonKey ? t.team.reasonKeys[l.reasonKey] : l.reason}<span className="muted small"> · {format(t.team.by, { name: by(l.createdBy) })}</span></td>
                    <td className={l.days < 0 ? "num minus" : "num plus"}>{l.days > 0 ? "+" : ""}{formatDays(l.days, locale)}</td>
                  </tr>
                );
              })}
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
              <StatusBadge tone={toneOf(status(r))} label={t.status[status(r)]} size="s" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
