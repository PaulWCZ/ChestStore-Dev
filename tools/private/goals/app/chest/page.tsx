import Link from "next/link";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Contours } from "../../components/contours.tsx";
import { CycleChip } from "../../components/cycle-chip.tsx";
import { Alert, Mountain, Plus } from "../../components/icons.tsx";
import { ObjectiveCard } from "../../components/objective-card.tsx";
import { can } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { format, plural } from "../../lib/i18n/index.ts";
import { quarterOf, runsOn } from "../../lib/model.ts";
import { orphans } from "../../lib/orphans.ts";
import { context, cycleWords } from "../../lib/page-data.ts";
import { ownedBy } from "../../lib/read.ts";
import { viewer } from "../../lib/session.ts";
import { refreshBadges } from "../../lib/tell.ts";
import { idsOf, objectiveView, pctText } from "../../lib/views.ts";
import { StartCycle } from "./views/start-cycle.tsx";
import { WaitingList, type WaitingItem } from "./views/waiting-list.tsx";

// My goals: what waits for my check-in this week (the one obvious action),
// then everything I own in the cycles still open.
export default async function MyGoals() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const { clock } = ctx;
  // The tile's number may have gone stale (a new week began): set it right
  // whenever its owner comes home.
  await refreshBadges(sql, [member.id]);
  const current = ctx.cycles.find(c => c.current) ?? ctx.cycles.find(c => !c.closed) ?? null;

  if (ctx.cycles.length === 0) {
    return (
      <div className="narrow">
        <div className="head"><div className="titles"><h1>{t.home.title}</h1></div></div>
        <div className="empty">
          <Contours variant="small" />
          <span className="summit"><Mountain /></span>
          <h2>{t.home.noCycle}</h2>
          <p>{can(member, "cycles.manage") ? t.home.noCycleBody : t.home.noCycleMember}</p>
          {can(member, "cycles.manage") && <StartCycle label={format(t.home.startCycle, { name: quarterOf(clock.today).name })} errors={t.errors} />}
        </div>
      </div>
    );
  }

  const owned = await ownedBy(sql, member.id, clock);
  const who = await ctx.people(idsOf(owned));
  const byId = new Map(ctx.cycles.map(c => [c.id, c]));
  const views = owned.map(o => objectiveView(o, { actor: member, people: who, locale, t, zone: ctx.zone, now: clock.now, closed: byId.get(o.cycleId)?.closed ?? true, teams: ctx.teams }));
  // Waiting: mine, in a cycle running today, not reached, older than this
  // week, not checked in since Monday.
  const waiting: WaitingItem[] = [];
  for (const o of owned) {
    const cycle = byId.get(o.cycleId);
    if (!cycle || cycle.closed || !runsOn(cycle, clock.today)) continue;
    const view = views.find(x => x.id === o.id)!;
    for (const k of o.keyResults) {
      if (k.owner !== member.id || k.done || k.thisWeek || Date.parse(k.createdAt) >= clock.weekStart.getTime()) continue;
      const kv = view.keyResults.find(x => x.id === k.id)!;
      waiting.push({ ...kv, objectiveId: o.id, objectiveTitle: o.title, lastCheckIn: kv.lastCheckIn });
    }
  }
  const mineFirst = [...views].sort((a, b) => Number(b.owner.id === member.id) - Number(a.owner.id === member.id));
  const lost = can(member, "any.write") ? (await orphans(sql)).length : 0;
  const cw = current ? cycleWords(current, clock.today, t, locale) : null;
  const ownsAnyKr = owned.some(o => o.keyResults.some(k => k.owner === member.id));

  return (
    <div className="narrow">
      <AutoRefresh seconds={60} />
      <div className="head">
        <div className="titles">
          <h1>{t.home.title}</h1>
          {current && cw && <CycleChip name={current.name} dates={cw.dates} when={cw.when} elapsed={cw.elapsed} timeLabel={format(t.cycle.timeGone, { percent: pctText(t, cw.elapsed) })} />}
        </div>
        {current && !current.closed && <div className="actions"><Link className="button quiet" href={`/chest/objectives/new?cycle=${current.id}`}><Plus />{t.home.newObjective}</Link></div>}
      </div>

      {lost > 0 && (
        <div className="banner" role="status">
          <Alert />
          <strong>{plural(t.home.orphans, lost, locale)}</strong>
          <Link className="button small quiet" href="/chest/settings#owners">{t.home.orphansAction}</Link>
        </div>
      )}

      <section aria-labelledby="waiting">
        <div className="section-title">
          <h2 id="waiting">{t.home.waiting}</h2>
          {waiting.length > 0 && <span className="count">{plural(t.home.waitingCount, waiting.length, locale)}</span>}
        </div>
        {ownsAnyKr || waiting.length > 0 ? (
          <WaitingList items={waiting} t={{ checkIn: t.checkIn, confidence: t.confidence, confidenceHelp: t.confidenceHelp, errors: t.errors, home: t.home, objective: t.objective, progress: t.progress }} />
        ) : (
          <div className="empty">
            <Contours variant="small" />
            <h2>{t.home.nothingToCheck}</h2>
            <p>{t.home.nothingToCheckBody}</p>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="owned">
        <div className="section-title"><h2 id="owned">{t.home.owned}</h2></div>
        {mineFirst.length === 0 ? (
          <div className="empty">
            <Contours variant="small" />
            <span className="summit"><Mountain /></span>
            <h2>{t.home.ownedEmpty}</h2>
            <p>{t.home.ownedEmptyBody}</p>
            <div className="row">
              {current && !current.closed && <Link className="button" href={`/chest/objectives/new?cycle=${current.id}`}><Plus />{t.home.newObjective}</Link>}
              <Link className="button quiet" href="/chest/company">{t.home.seeCompany}</Link>
            </div>
          </div>
        ) : (
          <div className="cards">
            {mineFirst.map(o => <ObjectiveCard key={o.id} o={o} mine={member.id} t={{ progress: t.progress, confidence: t.confidence, objective: t.objective, checkIn: t.checkIn, levels: t.levels }} />)}
          </div>
        )}
      </section>
    </div>
  );
}
