import { calendarWorks, reconcile } from "../../lib/step-calendar.ts";
import { EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Building, Chart, Meeting, Pipeline, Trophy, Upload } from "../../components/icons.tsx";
import { can, canEditDeal, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { openByStage, wonThisMonth } from "../../lib/deals.ts";
import { format, formatDay, money, plural, relative } from "../../lib/i18n/index.ts";
import { dueState, today } from "../../lib/model.ts";
import { dealFormProps, dueLabel, formChoices } from "../../lib/page-data.ts";
import { directory } from "../../lib/people.ts";
import { teamPipeline } from "../../lib/reports.ts";
import { viewer } from "../../lib/session.ts";
import { myDay } from "../../lib/steps.ts";
import { refreshBadges } from "../../lib/tell.ts";
import { NewCompanyButton } from "./ui/company-form.tsx";
import { NewDealButton } from "./ui/deal-form.tsx";
import { emptyCompany, emptyDeal } from "./ui/values.ts";
import { DayList, SelfStepButton, type DayRow } from "./day-list.tsx";
import { LeadsBox } from "./leads-box.tsx";
import { countFormLinesToCheck, leads } from "../../lib/leads.ts";
import { bookingLink, meetingTime, typeName, upcoming } from "../../lib/from-booking.ts";

// My day: what I promised to do (late and today first), then my open
// deals, stage by stage. The one obvious action: do the next thing, say
// "Done", plan the one after. Someone who only reads (a viewer) has no
// steps of their own: their home is the team's pipeline and latest wins.
export default async function MyDay() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  // Whether timed steps reach the Chest's calendar: found out once, at the
  // first visit, by publishing them (the morning schedule keeps it up).
  if ((await calendarWorks(sql)) === null) await reconcile(sql);
  const inCalendar = (await calendarWorks(sql)) === true;
  const now = today();
  const [choices, counted] = await Promise.all([
    formChoices(sql, member, t),
    sql<{ n: number }[]>`select exists (select 1 from companies) or exists (select 1 from contacts) or exists (select 1 from deals) as n`,
  ]);
  const hasRecords = Boolean(counted[0]?.n);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date()));
  const hello = hour < 5 ? t.home.helloNight : hour < 12 ? t.home.hello : hour < 18 ? t.home.helloAfternoon : t.home.helloEvening;
  const reads = roleOf(member) === "viewer";

  if (!hasRecords) {
    return (
      <div className="page narrow first">
        <EmptyState
          headingLevel={1}
          icon={<Building />}
          title={reads ? t.home.viewer.emptyTitle : t.home.firstTime.title}
          body={reads ? t.home.viewer.emptyBody : t.home.firstTime.body}
          action={can(member, "records.write") ? (
            <>
              <NewCompanyButton label={t.home.firstTime.addCompany} initial={emptyCompany(member.id)} fields={choices.fields.companies} team={choices.team} me={member.id} canAssign={choices.canAssign} today={now} locale={locale} t={t} />
              {can(member, "import") && <Link prefetch={false} className="button quiet" href="/chest/import"><Upload />{t.home.firstTime.import}</Link>}
            </>
          ) : undefined}
        />
      </div>
    );
  }

  if (reads) {
    const team = await teamPipeline(sql, member);
    const owners = await directory(team.recentWins.map(w => w.owner), locale);
    const open = choices.stages.filter(s => s.kind === "open").map(s => ({ stage: s, ...(team.stages.find(b => b.stageId === s.id) ?? { count: 0, value: 0 }) }));
    const total = open.reduce((n, s) => n + s.value, 0);
    const weighted = open.reduce((n, s) => n + Math.round((s.value * s.stage.probability) / 100), 0);
    const count = open.reduce((n, s) => n + s.count, 0);
    const max = Math.max(1, ...open.map(s => s.value));
    const won = await wonThisMonth(sql, member, now);
    return (
      <div className="page day">
        <AutoRefresh seconds={60} />
        <div className="page-head">
          <div>
            <p className="label-mono">{formatDay(now, locale, { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1>{format(hello, { name: member.firstName || member.name })}</h1>
            <p className="lede">{t.home.viewer.lede}</p>
          </div>
          <Link prefetch={false} className="button quiet" href="/chest/team"><Chart />{t.home.viewer.report}</Link>
        </div>
        <div className="day-grid">
          <section className="panel" aria-labelledby="team-open">
            <div className="panel-head">
              <h2 id="team-open" className="label-mono">{t.home.viewer.open}</h2>
              <Link prefetch={false} className="link-button" href="/chest/deals">{t.home.viewer.board}</Link>
            </div>
            <p className="big-number num">{money(total, locale)}</p>
            <p className="muted small-text num">{format(t.home.pipelineLine, { count: plural(t.deals.count, count, locale), value: money(weighted, locale) })}</p>
            <ul className="bars">
              {open.map(s => (
                <li key={s.stage.id}>
                  <Link prefetch={false} href={`/chest/deals?view=list&stage=${s.stage.id}`}>
                    <span className="bar-label">{choices.stageNames[s.stage.id]}</span>
                    <span className="bar-track" aria-hidden="true">{s.value > 0 && <span className="bar-fill" style={{ width: `${Math.round((s.value / max) * 100)}%` }} />}</span>
                    <span className="bar-value num">{s.count > 0 ? `${s.count} · ${money(s.value, locale, { compact: true })}` : "—"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <aside className="day-side">
            <section className="panel won-panel" aria-labelledby="won-title">
              <h2 id="won-title" className="label-mono">{t.home.wonMonth}</h2>
              <p className="big-number num won">{money(won.team, locale)}</p>
            </section>
            <section className="panel" aria-labelledby="wins-title">
              <h2 id="wins-title" className="label-mono">{t.home.viewer.wins}</h2>
              {team.recentWins.length === 0 ? <p className="muted">{t.home.viewer.noWins}</p> : (
                <ul className="mini-list">
                  {team.recentWins.map(w => (
                    <li key={w.id}>
                      <Link prefetch={false} href={`/chest/deals/${w.id}`}><Trophy />{w.title}</Link>
                      <span className="mini-meta"><span className="num">{money(w.value, locale)}</span><span className="muted">{[w.company, owners[w.owner ?? ""]?.name].filter(Boolean).join(" · ")}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    );
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
  // The tile's number may have gone stale overnight: set it right whenever
  // its owner comes home.
  await refreshBadges(sql, [member.id]);
  const rows: DayRow[] = steps.map(s => ({
    ...s,
    canPlan: s.on === null ? false : s.on.kind === "deal" ? canEditDeal(member, { owner: s.on.owner }) : can(member, "records.write"),
    state: dueState(s.due, now),
    dueLabel: dueLabel(s, now, locale, t),
    valueLabel: s.on?.value ? money(s.on.value, locale) : null,
  }));
  const urgent = rows.filter(r => r.state === "late" || r.state === "today").length;
  const open = choices.stages.filter(s => s.kind === "open").map(s => ({ stage: s, ...(byStage.find(b => b.stageId === s.id) ?? { count: 0, value: 0 }) }));
  const total = open.reduce((n, s) => n + s.value, 0);
  const weighted = open.reduce((n, s) => n + Math.round((s.value * s.stage.probability) / 100), 0);
  const count = open.reduce((n, s) => n + s.count, 0);
  const max = Math.max(1, ...open.map(s => s.value));
  const logs = can(member, "activities.log");

  return (
    <div className="page day">
      <AutoRefresh seconds={60} />
      <div className="page-head">
        <div>
          <p className="label-mono">{formatDay(now, locale, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1>{format(hello, { name: member.firstName || member.name })}</h1>
          <p className="lede">{plural(t.home.summary, urgent, locale)}</p>
        </div>
        {can(member, "deals.create") && <NewDealButton label={t.home.newDeal} initial={emptyDeal(member.id, choices.openStages[0]?.id ?? "")} {...dealFormProps(choices, member.id, t)} />}
      </div>
      <div className="day-grid">
        <section aria-labelledby="steps-title" className="day-steps">
          {toCheck > 0 && <p className="notice warn"><Link prefetch={false} href="/chest/settings/forms">{plural(t.check.notice, toCheck, locale)}</Link></p>}
          {inbox.rows.length > 0 && (
            <LeadsBox rows={inbox.rows.map(({ booking, ...l }) => ({ ...l, when: relative(l.since, locale), booked: booking ? format(t.booking.booked, { type: typeName(booking.type, locale) || t.booking.meeting, when: meetingTime(booking.start, locale) }) : "" }))} total={inbox.total} team={choices.team} me={member.id} canAssign={choices.canAssign} today={now} calendar={inCalendar} t={t} />
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
                      <Link prefetch={false} href={`/chest/contacts/${m.contact.id}`}><Meeting />{m.contact.name}</Link>
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
              <EmptyState headingLevel={3} title={t.home.nothing} body={t.home.nothingBody} action={<Link prefetch={false} className="button quiet" href="/chest/deals">{t.shell.deals}</Link>} />
            </div>
          ) : (
            <DayList rows={rows} team={choices.team} me={member.id} canAssign={choices.canAssign} today={now} locale={locale} calendar={inCalendar} t={t} />
          )}
          {logs && <SelfStepButton team={choices.team} me={member.id} canAssign={choices.canAssign} today={now} calendar={inCalendar} t={t} />}
        </section>
        <aside className="day-side">
          <section className="panel" aria-labelledby="pipe-title">
            <div className="panel-head">
              <h2 id="pipe-title" className="label-mono">{t.home.pipeline}</h2>
              <Link prefetch={false} className="link-button" href="/chest/deals?owner=me"><Pipeline />{t.shell.deals}</Link>
            </div>
            {count === 0 ? <p className="muted">{t.home.pipelineEmpty}</p> : (
              <>
                <p className="big-number num">{money(total, locale)}</p>
                <p className="muted small-text num">{format(t.home.pipelineLine, { count: plural(t.deals.count, count, locale), value: money(weighted, locale) })}</p>
                <ul className="bars">
                  {open.map(s => (
                    <li key={s.stage.id}>
                      <Link prefetch={false} href={`/chest/deals?view=list&owner=me&stage=${s.stage.id}`}>
                        <span className="bar-label">{choices.stageNames[s.stage.id]}</span>
                        <span className="bar-track" aria-hidden="true">{s.value > 0 && <span className="bar-fill" style={{ width: `${Math.round((s.value / max) * 100)}%` }} />}</span>
                        <span className="bar-value num">{s.count > 0 ? `${s.count} · ${money(s.value, locale, { compact: true })}` : "—"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className="panel won-panel" aria-labelledby="won-title">
            <h2 id="won-title" className="label-mono">{t.home.wonMonth}</h2>
            <p className="big-number num won">{money(won.mine, locale)}</p>
            <p className="muted small-text num">{format(t.home.wonTeam, { value: money(won.team, locale) })}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
