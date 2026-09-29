import Link from "next/link";
import { forbidden } from "next/navigation";
import { Avatar } from "../../../components/avatar.tsx";
import { Back, Check, Next, People, Send } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { today } from "../../../lib/clock.ts";
import { db } from "../../../lib/db.ts";
import { addDays, isDay, mondayOf } from "../../../lib/days.ts";
import { everyoneOrNone } from "../../../lib/directory.ts";
import { formatDuration } from "../../../lib/duration.ts";
import { format, formatDay, plural } from "../../../lib/i18n/index.ts";
import { nameFor, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { settings } from "../../../lib/settings.ts";
import { teamWeeks, waiting, withRole } from "../../../lib/weeks.ts";
import { ApproveAll, RemindButton, WaitingRow } from "./team-view.tsx";

// The team, for managers: the weeks waiting for approval, and everyone's
// hours in the last four weeks against their usual week — who has not
// filled theirs, with a Remind that rings their bell.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ until?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "approve")) forbidden();
  const q = await searchParams;
  const now = mondayOf(today());
  const until = isDay(q.until) && mondayOf(q.until) <= now ? mondayOf(q.until) : now;
  const mondays = [addDays(until, -21), addDays(until, -14), addDays(until, -7), until];
  const lastWeek = addDays(now, -7);
  const sql = db();
  const [dir, list, s] = await Promise.all([everyoneOrNone(), waiting(sql, member), settings(sql)]);
  const team = withRole(dir.people).sort((a, b) => a.name.localeCompare(b.name, locale));
  const ids = [...new Set([...team.map(p => p.id), ...list.map(w => w.memberId)])];
  const [rows, last, who] = await Promise.all([teamWeeks(sql, member, team.map(p => p.id), mondays), teamWeeks(sql, member, team.map(p => p.id), [lastWeek]), people(ids)]);
  const short = last.filter(r => r.weeks[0]!.status !== "submitted" && r.weeks[0]!.status !== "approved" && r.weeks[0]!.minutes < r.capacity).map(r => r.memberId);
  const weekLabel = (w: string) => formatDay(w, locale, { day: "numeric", month: "short" });
  const photo = (id: string) => who.get(id)?.photo ?? null;
  return (
    <main className="page wide">
      <header className="page-head">
        <h1>{t.team.title}</h1>
        <Link className="button quiet" href="/chest/people"><People />{t.team.people}</Link>
      </header>

      {s.approvals && (
        <section className="panel" aria-labelledby="waiting-title">
          <div className="panel-head">
            <h2 id="waiting-title"><Send />{t.team.toApprove}{list.length > 0 && <span className="count num">{list.length}</span>}</h2>
            {list.length > 1 && <ApproveAll weeks={list.map(w => ({ memberId: w.memberId, week: w.week }))} label={plural(t.team.approveAll, list.length, locale)} locale={locale} t={{ team: t.team, errors: t.errors }} />}
          </div>
          {list.length === 0 ? <p className="muted">{t.team.nothingToApprove}</p> : (
            <ul className="waiting">
              {list.map(w => (
                <WaitingRow
                  key={w.memberId + w.week}
                  memberId={w.memberId}
                  week={w.week}
                  name={nameFor(w.memberId, who, locale)}
                  photo={photo(w.memberId)}
                  label={format(t.team.weekOf, { date: weekLabel(w.week) })}
                  hours={format(t.team.hours, { total: formatDuration(w.minutes), billable: formatDuration(w.billableMinutes) })}
                  t={{ team: t.team, errors: t.errors }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="panel" aria-labelledby="weeks-title">
        <div className="panel-head">
          <h2 id="weeks-title">{t.team.weeks}</h2>
          <nav className="week-nav" aria-label={t.team.weeks}>
            <Link className="button icon quiet" href={`/chest/team?until=${addDays(until, -28)}`} aria-label={t.team.earlier} title={t.team.earlier}><Back /></Link>
            {until < now && <Link className="button icon quiet" href={`/chest/team?until=${addDays(until, 28) > now ? now : addDays(until, 28)}`} aria-label={t.team.later} title={t.team.later}><Next /></Link>}
          </nav>
        </div>
        {!dir.reached && <p className="notice small">{t.errors.unavailable}</p>}
        {team.length === 0 ? <p className="muted">{t.team.nobody}</p> : (
          <div className="team-scroll">
            <table className="team">
              <thead>
                <tr>
                  <th scope="col">{t.team.person}</th>
                  {mondays.map((w, i) => <th key={w} scope="col" className={`n${i < 2 ? " hide-phone" : ""}`}>{w === now ? t.team.thisWeek : weekLabel(w)}</th>)}
                  <th scope="col" className="n hide-phone">{t.team.usual}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.memberId}>
                    <th scope="row"><span className="who-cell"><Avatar name={nameFor(r.memberId, who, locale)} photo={photo(r.memberId)} size={28} /><span>{nameFor(r.memberId, who, locale)}</span></span></th>
                    {r.weeks.map((c, i) => {
                      const past = c.week < now;
                      const state = c.status === "approved" ? "approved" : c.status === "submitted" ? "sent" : c.status === "returned" ? "returned" : past && c.minutes < r.capacity ? "short" : "";
                      return (
                        <td key={c.week} className={`n${i < 2 ? " hide-phone" : ""}${state ? " " + state : ""}`}>
                          <Link href={`/chest/team/${r.memberId}?week=${c.week}`} className="week-cell" aria-label={`${nameFor(r.memberId, who, locale)}, ${format(t.team.weekOf, { date: weekLabel(c.week) })}: ${formatDuration(c.minutes)}${state ? ", " + t.team.states[state] : ""}`}>
                            <span className="num">{formatDuration(c.minutes)}</span>
                            {state && <span className="state-tag">{state === "approved" && <Check />}{t.team.states[state]}</span>}
                          </Link>
                        </td>
                      );
                    })}
                    <td className="n num hide-phone muted">{formatDuration(r.capacity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="remind-bar">
          <p>{short.length ? plural(t.team.shortLast, short.length, locale) : t.team.allFilled}</p>
          {short.length > 0 && <RemindButton memberIds={short} week={lastWeek} label={plural(t.team.remind, short.length, locale)} locale={locale} t={{ team: t.team, errors: t.errors }} />}
        </div>
      </section>
    </main>
  );
}
