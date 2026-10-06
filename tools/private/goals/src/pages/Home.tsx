import { Island, type PageContext, type View } from "@argentic/chest-app";
import type { ReactNode } from "react";
import { CycleChip } from "../components/cycle-chip.tsx";
import { Alert, Mountain, Plus } from "../components/icons.tsx";
import { MapEmpty } from "../components/map-empty.tsx";
import { ObjectiveCard } from "../components/objective-card.tsx";
import { format, formatDay, localeOf, plural } from "../i18n/index.ts";
import type { WaitingItem } from "../islands/WaitingList.tsx";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { emailOn, mailPreferenceOf, mailState } from "../lib/mail.ts";
import { daysBetween, firstCycleChoices, runsOn, type Suggestion } from "../lib/model.ts";
import { orphans } from "../lib/orphans.ts";
import { context, cycleWords, quarterName } from "../lib/page-data.ts";
import { noCycleWords } from "../lib/people.ts";
import { ownedBy } from "../lib/read.ts";
import { refreshBadges } from "../lib/tell.ts";
import { idsOf, objectiveView, pctText } from "../lib/views.ts";

// My goals: what waits for my update this week (the one obvious action),
// then everything I own in the cycles still open.
export async function homePage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  const { clock } = ctx;
  // The tile's number may have gone stale (a new week began): set it right
  // whenever its owner comes home.
  await refreshBadges(sql, [member.id]);
  const current = ctx.cycles.find(c => c.current) ?? ctx.cycles.find(c => !c.closed) ?? null;
  const head = (chip: ReactNode, actions: ReactNode) => (
    <div className="head">
      <div className="titles"><h1>{t.home.title}</h1>{chip}</div>
      {actions}
    </div>
  );

  if (ctx.cycles.length === 0) {
    const admin = can(member, "cycles.manage");
    let action: ReactNode = null;
    if (admin) {
      const choices = firstCycleChoices(clock.today);
      const label = (s: Suggestion, words: string) => format(words, { name: quarterName(t, s.quarter), dates: format(t.cycle.dates, { start: formatDay(s.quarter.startsOn, locale, { day: "numeric", month: "short" }), end: formatDay(s.quarter.endsOn, locale, { day: "numeric", month: "short" }) }), left: plural(t.cycle.daysLeft, daysBetween(clock.today, s.quarter.endsOn), locale) });
      action = (
        <div className="stack-s start-cycle">
          {choices.other && <p className="hint">{format(t.home.lateInQuarter, { name: quarterName(t, choices.other.quarter), left: plural(t.cycle.daysLeft, daysBetween(clock.today, choices.other.quarter.endsOn), locale) })}</p>}
          <Island name="StartCycle" props={{ main: { which: choices.main.which, label: label(choices.main, t.home.startCycle) }, other: choices.other ? { which: choices.other.which, label: label(choices.other, t.home.startCurrent) } : null, importLabel: format(t.home.startImport, { name: quarterName(t, choices.main.quarter) }) }} />
        </div>
      );
    }
    return {
      title: t.home.title,
      body: (
        <div className="narrow">
          {head(null, null)}
          <MapEmpty icon={<Mountain />} title={t.home.noCycle} body={admin ? t.home.noCycleBody : await noCycleWords(locale)} action={action} />
        </div>
      ),
    };
  }

  const owned = await ownedBy(sql, member.id, clock);
  const who = await ctx.people(idsOf(owned));
  const byId = new Map(ctx.cycles.map(c => [c.id, c]));
  const views = owned.map(o => objectiveView(o, { actor: member, people: who, locale, t, zone: ctx.zone, now: clock.now, closed: byId.get(o.cycleId)?.closed ?? true, teams: ctx.teams }));
  // Waiting: mine, in a cycle running today, not reached, older than this
  // week, not updated since Monday.
  const waiting: WaitingItem[] = [];
  for (const [index, o] of owned.entries()) {
    const cycle = byId.get(o.cycleId);
    if (!cycle || cycle.closed || !runsOn(cycle, clock.today)) continue;
    const view = views[index]!;
    for (const [i, k] of o.keyResults.entries()) {
      if (k.owner !== member.id || k.done || k.thisWeek || Date.parse(k.createdAt) >= clock.weekStart.getTime()) continue;
      const kv = view.keyResults[i]!;
      waiting.push({ id: kv.id, title: kv.title, kind: kv.kind, currentInput: kv.currentInput, current: kv.current, target: kv.target, unit: kv.unit, confidence: kv.confidence, done: kv.done, source: kv.source, objectiveId: o.id, objectiveTitle: o.title, percent: kv.percent, percentText: kv.percentText, stale: kv.stale, lastCheckIn: kv.lastCheckIn });
    }
  }
  const mineFirst = [...views].sort((a, b) => Number(b.owner.id === member.id) - Number(a.owner.id === member.id));
  const lost = can(member, "any.write") ? (await orphans(sql)).length : 0;
  const cw = current ? cycleWords(current, clock.today, t, locale) : null;
  const ownsAnyKr = owned.some(o => o.keyResults.some(k => k.owner === member.id));
  // The person's email choice in the Chest (mail.preference(); the
  // assertion never carries it), said under the switch.
  const [preference, state, emailing] = ownsAnyKr ? await Promise.all([mailPreferenceOf(member.id), mailState(), emailOn(sql, member)]) : ["all", "unknown", true] as const;
  const cardWords = { progress: t.progress, confidence: t.confidence, objective: t.objective, checkIn: t.checkIn, levels: t.levels };
  const chip = current && cw ? <CycleChip name={current.name} dates={cw.dates} when={cw.when} elapsed={cw.elapsed} timeLabel={format(t.cycle.timeGone, { percent: pctText(t, cw.elapsed) })} /> : null;
  const actions = current && !current.closed ? <div className="actions"><a className="button quiet" href={`/chest/objectives/new?cycle=${current.id}`}><Plus />{t.home.newObjective}</a></div> : null;

  return {
    title: t.home.title,
    body: (
      <div className="narrow">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        {head(chip, actions)}

        {lost > 0 && (
          <div className="banner" role="status">
            <Alert />
            <strong>{plural(t.home.orphans, lost, locale)}</strong>
            <a className="button small quiet" href="/chest/settings#owners">{t.home.orphansAction}</a>
          </div>
        )}

        <section aria-labelledby="waiting">
          <div className="section-title">
            <h2 id="waiting">{t.home.waiting}</h2>
            {waiting.length > 0 && <span className="count">{plural(t.home.waitingCount, waiting.length, locale)}</span>}
          </div>
          {ownsAnyKr || waiting.length > 0 ? (
            <Island name="WaitingList" props={{ items: waiting, t: { checkIn: t.checkIn, tools: t.tools, confidence: t.confidence, confidenceHelp: t.confidenceHelp, errors: t.errors, home: t.home, objective: t.objective, progress: t.progress } }} />
          ) : (
            <MapEmpty title={t.home.nothingToCheck} body={t.home.nothingToCheckBody} />
          )}
        </section>

        <section className="section" aria-labelledby="owned">
          <div className="section-title"><h2 id="owned">{t.home.owned}</h2></div>
          {mineFirst.length === 0 ? (
            <MapEmpty
              icon={<Mountain />}
              title={t.home.ownedEmpty}
              body={t.home.ownedEmptyBody}
              action={<>
                {current && !current.closed && <a className="button" href={`/chest/objectives/new?cycle=${current.id}`}><Plus />{t.home.newObjective}</a>}
                <a className="button quiet" href="/chest/company">{t.home.seeCompany}</a>
              </>}
            />
          ) : (
            <div className="cards">
              {mineFirst.map(o => <ObjectiveCard key={o.id} o={o} mine={member.id} t={cardWords} />)}
            </div>
          )}
        </section>

        {ownsAnyKr && (state === "off"
          ? <p className="email-note">{t.home.emailUnavailable}</p>
          : <Island name="EmailSwitch" props={{ on: emailing, note: preference === "none" ? t.home.emailNone : preference === "digest" ? t.home.emailDigest : null, t: { label: t.home.email, on: t.home.emailOn, off: t.home.emailOff } }} />)}
      </div>
    ),
  };
}
