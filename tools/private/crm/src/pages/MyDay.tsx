import { after, Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { Bar } from "../components/bar.tsx";
import { Building, Chart, Meeting, Pipeline, Trophy, Upload } from "../components/icons.tsx";
import type { DayRow } from "../components/day-list.tsx";
import { emptyCompany, emptyDeal } from "../components/values.ts";
import { dateFormat, format, formatDay, money, plural, relative, localeOf } from "../i18n/index.ts";
import { can, canEditDeal, roleOf } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { openByStage, wonThisMonth } from "../lib/deals.ts";
import { bookingLink, meetingTime, typeName, upcoming } from "../lib/from-booking.ts";
import { countFormLinesToCheck, leads } from "../lib/leads.ts";
import { countryChoices, currency, dealFormProps, dueLabel, formChoices } from "../lib/page-data.ts";
import { directory } from "../lib/people.ts";
import { teamPipeline } from "../lib/reports.ts";
import { calendarWorks, reconcile } from "../lib/step-calendar.ts";
import { myDay } from "../lib/steps.ts";
import { refreshBadges } from "../lib/tell.ts";
import { today } from "../lib/zone.ts";
import { dueState } from "../shared/model.ts";
import { words } from "./words.ts";

// My day: what I promised to do (late and today first), then my open
// deals, stage by stage. The one obvious action: do the next thing, say
// "Done", plan the one after. Someone who only reads (a viewer) has no
// steps of their own: their home is the team's pipeline and latest wins.
export async function myDayPage({ member, locale: lang, t }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const sql = db();
  // Whether timed steps reach the Chest's calendar: found out once, at the
  // first visit, by publishing them (the morning schedule keeps it up).
  if ((await calendarWorks(sql)) === null) await reconcile(sql);
  const inCalendar = (await calendarWorks(sql)) === true;
  const now = today();
  const cur = currency();
  const [choices, counted] = await Promise.all([
    formChoices(sql, member, t),
    sql<{ n: boolean }[]>`select exists (select 1 from companies) or exists (select 1 from contacts) or exists (select 1 from deals) as n`,
  ]);
  const hasRecords = Boolean(counted[0]?.n);
  const hour = Number(dateFormat(locale, { hour: "numeric", hourCycle: "h23", timeZone: member.timeZone }).format(new Date()));
  const hello = hour < 5 ? t.home.helloNight : hour < 12 ? t.home.hello : hour < 18 ? t.home.helloAfternoon : t.home.helloEvening;
  const reads = roleOf(member) === "viewer";
  const day = formatDay(now, locale, { weekday: "long", day: "numeric", month: "long" });
  const title = format(hello, { name: member.firstName || member.name });

  if (!hasRecords) {
    return {
      title: t.shell.myDay,
      body: (
        <div className="page narrow first">
          <EmptyState
            headingLevel={1}
            icon={<Building />}
            title={reads ? t.home.viewer.emptyTitle : t.home.firstTime.title}
            body={reads ? t.home.viewer.emptyBody : t.home.firstTime.body}
            action={can(member, "records.write") ? (
              <>
                <Island name="NewCompanyButton" props={{ label: t.home.firstTime.addCompany, initial: emptyCompany(member.id), fields: choices.fields.companies, team: choices.team, me: member.id, canAssign: choices.canAssign, today: now, countries: countryChoices(locale), t: words.company(t) }} />
                {can(member, "import") && <a className="button quiet" href="/chest/import"><Upload />{t.home.firstTime.import}</a>}
              </>
            ) : undefined}
          />
        </div>
      ),
    };
  }

  // The bars of a pipeline: the stages in order, each its count and value.
  const pipeline = (byStage: { stageId: string; count: number; value: number }[], href: (stageId: string) => string) => {
    const open = choices.stages.filter(s => s.kind === "open").map(s => ({ stage: s, ...(byStage.find(b => b.stageId === s.id) ?? { count: 0, value: 0 }) }));
    const total = open.reduce((n, s) => n + s.value, 0);
    const weighted = open.reduce((n, s) => n + Math.round((s.value * s.stage.probability) / 100), 0);
    const count = open.reduce((n, s) => n + s.count, 0);
    const max = Math.max(1, ...open.map(s => s.value));
    return {
      count,
      total: money(total, locale, { currency: cur }),
      line: format(t.home.pipelineLine, { count: plural(t.deals.count, count, locale), value: money(weighted, locale, { currency: cur }) }),
      bars: (
        <ul className="bars">
          {open.map(s => (
            <li key={s.stage.id}>
              <a href={href(s.stage.id)}>
                <span className="bar-label">{choices.stageNames[s.stage.id]}</span>
                <Bar share={Math.round((s.value / max) * 100)} />
                <span className="bar-value num">{s.count > 0 ? `${s.count} · ${money(s.value, locale, { compact: true, currency: cur })}` : "—"}</span>
              </a>
            </li>
          ))}
        </ul>
      ),
    };
  };

  if (reads) {
    const team = await teamPipeline(sql, member);
    const [owners, won] = await Promise.all([directory(team.recentWins.map(w => w.owner), locale), wonThisMonth(sql, member, now)]);
    const p = pipeline(team.stages, id => `/chest/deals?view=list&stage=${id}`);
    return {
      title: t.shell.myDay,
      body: (
        <div className="page">
          <Island name="AutoRefresh" props={{ seconds: 60 }} />
          <div className="page-head">
            <div>
              <p className="label-mono">{day}</p>
              <h1>{title}</h1>
              <p className="lede">{t.home.viewer.lede}</p>
            </div>
            <a className="button quiet" href="/chest/team"><Chart />{t.home.viewer.report}</a>
          </div>
          <div className="day-grid">
            <section className="panel" aria-labelledby="team-open">
              <div className="panel-head">
                <h2 id="team-open" className="label-mono">{t.home.viewer.open}</h2>
                <a className="link-button" href="/chest/deals">{t.home.viewer.board}</a>
              </div>
              <p className="big-number num">{p.total}</p>
              <p className="muted small-text num">{p.line}</p>
              {p.bars}
            </section>
            <aside className="day-side">
              <section className="panel" aria-labelledby="won-title">
                <h2 id="won-title" className="label-mono">{t.home.wonMonth}</h2>
                <p className="big-number num won">{money(won.team, locale, { currency: cur })}</p>
              </section>
              <section className="panel" aria-labelledby="wins-title">
                <h2 id="wins-title" className="label-mono">{t.home.viewer.wins}</h2>
                {team.recentWins.length === 0 ? <p className="muted">{t.home.viewer.noWins}</p> : (
                  <ul className="mini-list">
                    {team.recentWins.map(w => (
                      <li key={w.id}>
                        <a href={`/chest/deals/${w.id}`}><Trophy />{w.title}</a>
                        <span className="mini-meta"><span className="num">{money(w.value, locale, { currency: w.currency })}</span><span className="muted">{[w.company, owners[w.owner ?? ""]?.name].filter(Boolean).join(" · ")}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </div>
      ),
    };
  }

  const writes = can(member, "records.write");
  const [steps, byStage, won, inbox, toCheck, meetings] = await Promise.all([
    myDay(sql, member, now), openByStage(sql, member, member.id), wonThisMonth(sql, member, now),
    // New contacts from forms, nobody's yet (lib/leads.ts), and — for a
    // manager — form answers that may sit in the wrong person's file.
    writes ? leads(sql, member) : Promise.resolve({ rows: [], total: 0 }),
    countFormLinesToCheck(sql, member),
    // Meetings guests booked in Booking (lib/from-booking.ts), for the week
    // to come: those I host, and those of my contacts.
    upcoming(sql, member.id),
  ]);
  const hosts = await directory(meetings.map(m => m.host), locale);
  // The tile's number may have gone stale overnight: set right whenever
  // its owner comes home (once the page is sent).
  after("badge", () => refreshBadges(sql, [member.id]));
  const rows: DayRow[] = steps.map(s => ({
    ...s,
    canPlan: s.on === null ? false : s.on.kind === "deal" ? canEditDeal(member, { owner: s.on.owner }) : can(member, "records.write"),
    state: dueState(s.due, now),
    dueLabel: dueLabel(s, now, locale, t),
    valueLabel: s.on?.value ? money(s.on.value, locale, { currency: cur }) : null,
  }));
  const urgent = rows.filter(r => r.state === "late" || r.state === "today").length;
  const p = pipeline(byStage, id => `/chest/deals?view=list&owner=me&stage=${id}`);
  const logs = can(member, "activities.log");
  const stepProps = { team: choices.team, me: member.id, canAssign: choices.canAssign, today: now, calendar: inCalendar };

  return {
    title: t.shell.myDay,
    body: (
      <div className="page">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        <div className="page-head">
          <div>
            <p className="label-mono">{day}</p>
            <h1>{title}</h1>
            <p className="lede">{plural(t.home.summary, urgent, locale)}</p>
          </div>
          {can(member, "deals.create") && <Island name="NewDealButton" props={{ label: t.home.newDeal, initial: emptyDeal(member.id, choices.openStages[0]?.id ?? ""), ...dealFormProps(choices, member.id, locale), t: words.deal(t) }} />}
        </div>
        <div className="day-grid">
          <section aria-labelledby="steps-title" className="day-steps">
            {toCheck > 0 && <p className="notice warn"><a href="/chest/settings/forms">{plural(t.check.notice, toCheck, locale)}</a></p>}
            {inbox.rows.length > 0 && (
              <Island name="LeadsBox" props={{ rows: inbox.rows.map(({ booking, ...l }) => ({ ...l, when: relative(l.since, locale), booked: booking ? format(t.booking.booked, { type: typeName(booking.type, locale) || t.booking.meeting, when: meetingTime(booking.start, locale) }) : "" })), total: inbox.total, ...stepProps, t: words.leads(t) }} />
            )}
            {meetings.length > 0 && (
              <section className="panel meetings" aria-labelledby="meetings-title">
                <h2 id="meetings-title" className="label-mono">{t.booking.upcoming}</h2>
                <ul className="mini-list">
                  {meetings.map(m => {
                    const link = bookingLink(m.path);
                    const host = m.host && m.host !== member.id ? hosts[m.host]?.name : null;
                    return (
                      <li key={m.booking}>
                        <span className="meeting-when num">{meetingTime(m.start, locale)}</span>
                        <a href={`/chest/contacts/${m.contact.id}`}><Meeting />{m.contact.name}</a>
                        <span className="mini-meta">
                          <span className="muted">{[typeName(m.type, locale), host ? format(t.booking.with, { host }) : ""].filter(Boolean).join(" · ")}</span>
                          {link && <a className="link-button" href={link} target="_blank" rel="noopener">{t.booking.open}</a>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <h2 id="steps-title" className="visually-hidden">{t.step.title}</h2>
            {rows.length === 0 ? inbox.rows.length > 0 ? null : (
              <div className="empty-box">
                <EmptyState headingLevel={3} title={t.home.nothing} body={t.home.nothingBody} action={<a className="button quiet" href="/chest/deals">{t.shell.deals}</a>} />
              </div>
            ) : (
              <Island name="DayList" props={{ rows, ...stepProps, locale, t: words.day(t) }} />
            )}
            {logs && <Island name="SelfStepButton" props={{ ...stepProps, t: words.day(t) }} />}
          </section>
          <aside className="day-side">
            <section className="panel" aria-labelledby="pipe-title">
              <div className="panel-head">
                <h2 id="pipe-title" className="label-mono">{t.home.pipeline}</h2>
                <a className="link-button" href="/chest/deals?owner=me"><Pipeline />{t.shell.deals}</a>
              </div>
              {p.count === 0 ? <p className="muted">{t.home.pipelineEmpty}</p> : (
                <>
                  <p className="big-number num">{p.total}</p>
                  <p className="muted small-text num">{p.line}</p>
                  {p.bars}
                </>
              )}
            </section>
            <section className="panel" aria-labelledby="won-title">
              <h2 id="won-title" className="label-mono">{t.home.wonMonth}</h2>
              <p className="big-number num won">{money(won.mine, locale, { currency: cur })}</p>
              <p className="muted small-text num">{format(t.home.wonTeam, { value: money(won.team, locale, { currency: cur }) })}</p>
            </section>
          </aside>
        </div>
      </div>
    ),
  };
}
