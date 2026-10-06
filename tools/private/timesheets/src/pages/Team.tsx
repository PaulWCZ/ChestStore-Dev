import { forbidden, Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { Back, Next, People, Send } from "../components/icons.tsx";
import { format, formatDay, localeOf, plural } from "../i18n/index.ts";
import type { TeamRow, WaitingItem } from "../islands/Team.tsx";
import { can } from "../lib/access.ts";
import { today } from "../lib/clock.ts";
import { db } from "../lib/db.ts";
import { everyoneOrNone } from "../lib/directory.ts";
import { compare } from "../i18n/index.ts";
import { nameFor, people } from "../lib/people.ts";
import { settings } from "../lib/settings.ts";
import { isShort, needsLook, teamWeeks, waiting, withRole, type Fullness } from "../lib/weeks.ts";
import { addDays, isDay, mondayOf } from "../shared/days.ts";
import { formatDuration } from "../shared/duration.ts";

// The team, for managers (/chest/team; ?until= a Monday): the weeks
// waiting for approval, and everyone's hours in the last four weeks
// against their usual week — who has not filled theirs, with a Remind that
// rings their bell.
export async function teamPage({ member, locale: lang, t, query }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "approve")) forbidden();
  const now = mondayOf(today());
  const thisYear = today().slice(0, 4);
  const asked = query("until");
  const until = isDay(asked) && mondayOf(asked) <= now ? mondayOf(asked) : now;
  const mondays = [addDays(until, -21), addDays(until, -14), addDays(until, -7), until];
  const lastWeek = addDays(now, -7);
  const sql = db();
  const [dir, list, s] = await Promise.all([everyoneOrNone(), waiting(sql, member), settings(sql)]);
  const team = withRole(dir.people).sort((a, b) => compare(locale)(a.name, b.name));
  const ids = [...new Set([...team.map(p => p.id), ...list.map(w => w.memberId)])];
  const [rows, last, who] = await Promise.all([teamWeeks(sql, member, team.map(p => p.id), mondays), teamWeeks(sql, member, team.map(p => p.id), [lastWeek]), people(ids)]);
  // Remind never counts the manager who presses it (their own week is said apart).
  const shortAll = last.filter(r => isShort(r.weeks[0]!, r.capacity)).map(r => r.memberId);
  const short = shortAll.filter(id => id !== member.id);
  const selfShort = shortAll.includes(member.id);
  // Nobody approves their own week: another manager does.
  const otherManagers = team.filter(p => p.role === "manager" && p.id !== member.id).length;
  const expected = last.some(r => !r.weeks[0]!.before);
  // A week waiting: said short or not over on its line; the bulk action
  // takes the complete ones only, and names those it leaves.
  const fullText = (f: Fullness) => [f.over ? "" : t.team.notOver, format(t.team.ofUsualShort, { hours: formatDuration(f.minutes), usual: formatDuration(f.capacity) })].filter(Boolean).join(" · ");
  const others = list.filter(w => !w.mine);
  const complete = others.filter(w => !needsLook(w.fullness));
  const leftOut = others.filter(w => needsLook(w.fullness));
  const weekLabel = (w: string) => formatDay(w, locale, { day: "numeric", month: "short" }, thisYear);
  const photo = (id: string) => who.get(id)?.photo ?? null;
  const words = { team: t.team, errors: t.errors };
  const tableRows: TeamRow[] = rows.map(r => {
    const name = nameFor(r.memberId, who, locale);
    return {
      memberId: r.memberId,
      name,
      photo: photo(r.memberId),
      capacity: r.capacity,
      capacityText: formatDuration(r.capacity),
      weeks: r.weeks.map(c => {
        const past = c.week < now;
        // Before the person's start: nothing was expected, nothing is said.
        if (c.before) return { week: c.week, minutes: 0, text: "—", state: "" as const, label: `${name}, ${format(t.team.weekOf, { date: weekLabel(c.week) })}: ${t.team.before}` };
        const state = c.status === "approved" ? "approved" : c.status === "submitted" ? "sent" : c.status === "returned" ? "returned" : past && c.minutes < r.capacity ? "short" : "";
        return { week: c.week, minutes: c.minutes, text: formatDuration(c.minutes), state, label: `${name}, ${format(t.team.weekOf, { date: weekLabel(c.week) })}: ${formatDuration(c.minutes)}${state ? ", " + t.team.states[state] : ""}` };
      }),
    };
  });
  const waitingRows: WaitingItem[] = list.map(w => ({
    memberId: w.memberId,
    week: w.week,
    name: nameFor(w.memberId, who, locale),
    photo: photo(w.memberId),
    label: format(t.team.weekOf, { date: weekLabel(w.week) }),
    hours: format(t.team.hours, { total: formatDuration(w.minutes), billable: formatDuration(w.billableMinutes) }),
    look: needsLook(w.fullness) ? fullText(w.fullness) : null,
    led: w.led,
    mine: w.mine ? (otherManagers > 0 ? t.team.yours : t.team.yoursAlone) : null,
  }));
  return {
    title: t.team.title,
    body: (
      <div className="page wide">
        <PageHeader title={t.team.title} secondary={<a className="button quiet" href="/chest/people"><People />{t.team.people}</a>} />

        {s.approvals && (
          <section className="panel" aria-labelledby="waiting-title">
            <div className="panel-head">
              <h2 id="waiting-title"><Send />{t.team.toApprove}{list.length > 0 && <span className="count num">{list.length}</span>}</h2>
              {complete.length > 0 && others.length > 1 && <Island name="ApproveAll" props={{ weeks: complete.map(w => ({ memberId: w.memberId, week: w.week })), label: leftOut.length ? plural(t.team.approveComplete, complete.length, locale) : plural(t.team.approveAll, complete.length, locale), locale, t: words }} />}
            </div>
            {list.length === 0 ? <p className="muted">{t.team.nothingToApprove}</p> : <Island name="WaitingList" props={{ rows: waitingRows, t: words }} />}
            {others.length > 1 && complete.length > 0 && leftOut.length > 0 && (
              <p className="small muted left-out">{plural(t.team.leftOut, leftOut.length, locale, { list: leftOut.map(w => `${nameFor(w.memberId, who, locale)} (${fullText(w.fullness)})`).join(", ") })}</p>
            )}
          </section>
        )}

        <section className="panel" aria-labelledby="weeks-title">
          <div className="panel-head">
            <h2 id="weeks-title">{t.team.weeks}</h2>
            <nav className="week-nav" aria-label={t.team.weeks}>
              <a className="button icon quiet" href={`/chest/team?until=${addDays(until, -28)}`} aria-label={t.team.earlier} title={t.team.earlier}><Back /></a>
              {until < now && <a className="button icon quiet" href={`/chest/team?until=${addDays(until, 28) > now ? now : addDays(until, 28)}`} aria-label={t.team.later} title={t.team.later}><Next /></a>}
            </nav>
          </div>
          {!dir.reached && <p className="notice small">{t.errors.unavailable}</p>}
          {team.length === 0 ? <p className="muted">{t.team.nobody}</p> : (
            <div className="team-weeks"><Island id={"team-" + until} name="TeamTable" props={{ rows: tableRows, heads: mondays.map(w => (w === now ? t.team.thisWeek : weekLabel(w))), t: words, labels: t.kit.table }} /></div>
          )}
          <div className="remind-bar">
            <p>{short.length ? plural(t.team.shortLast, short.length, locale) : expected ? (selfShort ? t.team.onlyYou : t.team.allFilled) : t.team.notStarted}{short.length > 0 && selfShort ? " " + t.team.youShort : ""}</p>
            {short.length > 0 && <Island name="RemindButton" props={{ memberIds: short, week: lastWeek, label: plural(t.team.remind, short.length, locale), locale, t: words }} />}
          </div>
        </section>
      </div>
    ),
  };
}
