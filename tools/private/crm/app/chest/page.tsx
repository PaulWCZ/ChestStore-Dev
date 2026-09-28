import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Building, Upload } from "../../components/icons.tsx";
import { can, canEditDeal } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { openByStage, wonThisMonth } from "../../lib/deals.ts";
import { format, formatDay, money, plural } from "../../lib/i18n/index.ts";
import { dueState, today } from "../../lib/model.ts";
import { formChoices } from "../../lib/page-data.ts";
import { viewer } from "../../lib/session.ts";
import { myDay } from "../../lib/steps.ts";
import { refreshBadges } from "../../lib/tell.ts";
import { NewCompanyButton } from "./ui/company-form.tsx";
import { emptyCompany } from "./ui/values.ts";
import { NewDealButton } from "./ui/deal-form.tsx";
import { DayList, type DayRow } from "./day-list.tsx";

// My day: what I promised to do (late and today first), then my open
// deals, stage by stage. The one obvious action: do the next thing, say
// "Done", plan the one after.
export default async function MyDay() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const now = today();
  const [steps, byStage, won, choices, counted] = await Promise.all([
    myDay(sql, member, now),
    openByStage(sql, member, member.id),
    wonThisMonth(sql, member, now),
    formChoices(sql, member, t),
    sql<{ n: number }[]>`select (select count(*) from companies)::int + (select count(*) from contacts)::int + (select count(*) from deals)::int as n`,
  ]);
  const records = counted[0]?.n ?? 0;
  // The tile's number may have gone stale overnight: set it right whenever
  // its owner comes home.
  await refreshBadges(sql, [member.id]);
  const rows: DayRow[] = steps.map(s => ({ ...s, canPlan: s.on.kind === "deal" ? canEditDeal(member, { owner: s.on.owner }) : can(member, "records.write"), state: dueState(s.due, now), dueLabel: formatDay(s.due, locale, { weekday: "short", day: "numeric", month: "short" }), valueLabel: s.on.value ? money(s.on.value, locale) : null }));
  const urgent = rows.filter(r => r.state === "late" || r.state === "today").length;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date()));
  const hello = hour < 12 ? t.home.hello : hour < 18 ? t.home.helloAfternoon : t.home.helloEvening;
  const open = choices.stages.filter(s => s.kind === "open").map(s => ({ stage: s, ...(byStage.find(b => b.stageId === s.id) ?? { count: 0, value: 0 }) }));
  const total = open.reduce((n, s) => n + s.value, 0);
  const weighted = open.reduce((n, s) => n + Math.round((s.value * s.stage.probability) / 100), 0);
  const count = open.reduce((n, s) => n + s.count, 0);
  const max = Math.max(1, ...open.map(s => s.value));
  const dealProps = { companies: choices.companies, contacts: choices.contacts, stages: choices.stageChoices.filter(s => choices.stages.find(x => x.id === s.id)?.kind === "open"), team: choices.team, me: member.id, canAssign: choices.canAssign, t };
  const newDeal = { title: "", company: null, contact: null, value: "", stage: choices.stageChoices[0]?.id ?? "", expectedClose: "", owner: member.id };

  if (records === 0) {
    return (
      <main className="page narrow">
        <div className="empty first">
          <Building />
          <h1>{t.home.firstTime.title}</h1>
          <p>{t.home.firstTime.body}</p>
          {can(member, "records.write") && (
            <div className="row center">
              <NewCompanyButton label={t.home.firstTime.addCompany} initial={emptyCompany(member.id)} team={choices.team} me={member.id} canAssign={choices.canAssign} t={t} />
              {can(member, "import") && <Link prefetch={false} className="button quiet" href="/chest/import"><Upload />{t.home.firstTime.import}</Link>}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="page day">
      <AutoRefresh seconds={60} />
      <div className="page-head">
        <div>
          <p className="label-mono">{formatDay(now, locale, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1>{format(hello, { name: member.firstName || member.name })}</h1>
          <p className="lede">{plural(t.home.summary, urgent, locale)}</p>
        </div>
        {can(member, "deals.create") && <NewDealButton label={t.home.newDeal} initial={newDeal} {...dealProps} />}
      </div>
      <div className="day-grid">
        <section aria-labelledby="steps-title" className="day-steps">
          <h2 id="steps-title" className="visually-hidden">{t.step.title}</h2>
          {rows.length === 0 ? (
            <div className="empty small">
              <h3>{t.home.nothing}</h3>
              <p>{t.home.nothingBody}</p>
              <Link prefetch={false} className="button quiet" href="/chest/deals">{t.shell.deals}</Link>
            </div>
          ) : (
            <DayList rows={rows} team={choices.team} me={member.id} canAssign={choices.canAssign} today={now} locale={locale} t={t} />
          )}
        </section>
        <aside className="day-side">
          <section className="panel" aria-labelledby="pipe-title">
            <div className="panel-head">
              <h2 id="pipe-title" className="label-mono">{t.home.pipeline}</h2>
              <Link prefetch={false} className="link-button" href="/chest/deals?owner=me">{t.shell.deals}</Link>
            </div>
            {count === 0 ? <p className="muted">{t.home.pipelineEmpty}</p> : (
              <>
                <p className="big-number num">{money(total, locale)}</p>
                <p className="muted small-text">{format(t.home.pipelineTotal, { value: money(total, locale), count: plural(t.deals.count, count, locale) })} · <span className="num">{format(t.home.weighted, { value: money(weighted, locale) })}</span></p>
                <ul className="bars">
                  {open.map(s => (
                    <li key={s.stage.id}>
                      <Link prefetch={false} href={`/chest/deals?view=list&owner=me&stage=${s.stage.id}`}>
                        <span className="bar-label">{choices.stageNames[s.stage.id]}</span>
                        <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${Math.round((s.value / max) * 100)}%` }} /></span>
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
    </main>
  );
}
