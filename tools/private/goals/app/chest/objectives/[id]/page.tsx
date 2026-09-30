import { knownBoards } from "../../../../lib/sources.ts";
import { chest } from "@argentic/chest-sdk/chest";
import { EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Chevron, Lock } from "../../../../components/icons.tsx";
import { PersonLine } from "../../../../components/person.tsx";
import { Confidence, Progress } from "../../../../components/progress.tsx";
import { can, mayEdit } from "../../../../lib/access.ts";
import { readerFor } from "../../../../lib/groups.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { comments as readComments } from "../../../../lib/comments.ts";
import { db } from "../../../../lib/db.ts";
import { format, formatDate, formatDay, relative } from "../../../../lib/i18n/index.ts";
import { addDays, cycleTime, percent, undoMinutes } from "../../../../lib/model.ts";
import { readObjective } from "../../../../lib/objectives.ts";
import { context } from "../../../../lib/page-data.ts";
import { everyone } from "../../../../lib/people.ts";
import { checkIns, cycleObjectives, keyResultChanges, objectiveById, viewersOf } from "../../../../lib/read.ts";
import { viewer } from "../../../../lib/session.ts";
import { valueText } from "../../../../lib/values.ts";
import { objectiveView, pctText, personView } from "../../../../lib/views.ts";
import { instantOf } from "../../../../lib/zone.ts";
import { Comments } from "./comments.tsx";
import { KeyResultCard, type ChangeEntry, type HistoryEntry } from "./key-result-card.tsx";
import { AddKeyResult } from "./key-result-dialog.tsx";
import { ObjectiveActions } from "./objective-actions.tsx";
import { Retro } from "./retro.tsx";

// One objective: why it matters, its key results with their history and
// check-ins, what supports it, and the conversation about it; once the
// cycle ends, its retrospective.
export default async function ObjectivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkin?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const { id } = await params;
  const { checkin } = await searchParams;
  let o;
  try {
    o = await readObjective(sql, member, id, ctx.clock);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const cycle = ctx.cycles.find(c => c.id === o.cycleId)!;
  const closed = cycle.closed;
  const time = cycleTime(cycle, ctx.clock.today);
  const ended = closed || time.phase === "after";
  const [siblings, history, notes, changes, viewers] = await Promise.all([
    cycleObjectives(sql, cycle.id, ctx.clock, await readerFor(member)),
    checkIns(sql, o.keyResults.map(k => k.id)),
    readComments(sql, o.id),
    keyResultChanges(sql, o.keyResults.map(k => k.id)),
    o.visibility === "people" ? viewersOf(sql, o.id) : Promise.resolve([] as string[]),
  ]);
  const parent = o.parentId ? siblings.find(s => s.id === o.parentId) ?? null : null;
  const grandParent = parent?.parentId ? siblings.find(s => s.id === parent.parentId) ?? null : null;
  const children = siblings.filter(s => s.parentId === o.id);
  const carriedFrom = o.carriedFrom ? await objectiveById(sql, o.carriedFrom, ctx.clock, await readerFor(member), { archived: true }) : null;
  const carriedCycle = carriedFrom ? ctx.cycles.find(c => c.id === carriedFrom.cycleId) ?? null : null;
  const changeList = [...changes.values()].flat();
  const ids = [o.owner, o.retroBy ?? "", ...o.keyResults.map(k => k.owner), ...[...history.values()].flat().map(c => c.author), ...notes.map(c => c.author), ...children.map(c => c.owner), ...viewers, ...changeList.flatMap(c => [c.author, ...(c.field === "owner" ? [c.before, c.after] : [])])];
  const who = await ctx.people(ids.filter(Boolean));
  const view = objectiveView(o, { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed, teams: ctx.teams });
  const childViews = children.map(c => objectiveView(c, { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed, teams: ctx.teams }));
  const editable = !closed && mayEdit(member, o);
  // Tasks' boards Goals has heard of, for "Cards done on …" (lib/sources.ts).
  const boards = await knownBoards(sql);
  const owners = editable ? await everyone() : [];
  const from = instantOf(cycle.startsOn, 0, ctx.zone).getTime();
  const to = instantOf(addDays(cycle.endsOn, 1), 0, ctx.zone).getTime() - 1;
  const next = ctx.cycles.filter(c => !c.closed && c.id !== cycle.id).sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  const carryTarget = ended && mayEdit(member, o) ? next.find(c => c.startsOn > cycle.endsOn) ?? next[0] ?? null : null;
  const cardWords = { checkIn: t.checkIn, tools: t.tools, confidence: t.confidence, confidenceHelp: t.confidenceHelp, errors: t.errors, objective: t.objective, progress: t.progress, form: t.form, kinds: t.kinds, kindHints: t.kindHints, peoplePicker: t.peoplePicker, dialog: t.dialog, tables: t.tables };
  const levelLine = o.level === "team" ? view.teamName ?? t.levels.team : t.levels[o.level];

  return (
    <div className="page">
      <AutoRefresh seconds={60} />
      <nav className="crumbs" aria-label={t.objective.breadcrumb}>
        <Link href={`/chest/company?cycle=${cycle.id}`}>{t.company.title} · {cycle.name}</Link>
        {grandParent && <><Chevron /><Link href={`/chest/objectives/${grandParent.id}`}>{grandParent.title}</Link></>}
        {parent && <><Chevron /><Link href={`/chest/objectives/${parent.id}`}>{parent.title}</Link></>}
      </nav>
      <div className="objective-page">
        <div className="stack">
          <section className="card summary" aria-labelledby="title">
            <span className="eyebrow">{levelLine}{o.visibility !== "everyone" && <span className="tag confidential"><Lock />{t.objective.confidential}</span>}</span>
            <h1 id="title">{o.title}</h1>
            {o.why ? <p className="why">{o.why}</p> : <p className="muted">{t.objective.noWhy}</p>}
            <Progress percent={view.percent} text={view.percentText} label={`${t.progress.label}: ${view.percentText}`} confidence={view.confidence} big />
            <div className="meta">
              <Confidence value={view.confidence} words={t.confidence} />
              <span>{view.keyResultsText}</span>
              {carriedFrom && carriedCycle && <Link href={`/chest/objectives/${carriedFrom.id}`}>{format(t.objective.carriedFrom, { cycle: carriedCycle.name })}</Link>}
            </div>
            {closed && <p className="notice"><Lock />{t.objective.closedCycle}</p>}
          </section>

          {ended && (
            <Retro
              objectiveId={o.id}
              canWrite={mayEdit(member, o)}
              score={o.score}
              learned={o.learned}
              suggested={pctText(t, percent(o.progress))}
              scoreText={o.score === null ? null : format(t.retro.scoreValue, { percent: pctText(t, percent(o.score)) })}
              by={o.retroBy ? personView(who, o.retroBy, locale).name : null}
              t={{ retro: t.retro, errors: t.errors }}
            />
          )}

          <section aria-labelledby="krs" className="stack">
            <div className="section-title flush">
              <h2 id="krs">{t.objective.keyResults}</h2>
              {editable && <span className="end"><AddKeyResult objectiveId={o.id} owners={owners} boards={boards} defaultOwner={o.owner} locale={locale} currency={chest.currency} t={cardWords} /></span>}
            </div>
            {view.keyResults.length === 0 ? (
              <EmptyState title={t.objective.noKeyResults} body={t.objective.noKeyResultsBody} action={editable ? <AddKeyResult objectiveId={o.id} owners={owners} boards={boards} defaultOwner={o.owner} locale={locale} currency={chest.currency} t={cardWords} primary /> : null} />
            ) : view.keyResults.map(k => {
              const raw = o.keyResults.find(x => x.id === k.id)!;
              const list = history.get(k.id) ?? [];
              const text = (value: number) => (raw.kind === "milestone" ? (value >= 1 ? t.checkIn.markDone : t.checkIn.notYet) : valueText(raw, value, locale));
              const said = (field: string, value: string) => {
                if (field === "start" || field === "target") return text(Number(value));
                if (field === "weight") return t.form.weights[value as "1" | "2" | "3"] ?? value;
                if (field === "owner") return personView(who, value, locale).name;
                if (field === "kind") return t.kinds[value as "number"] ?? value;
                return value;
              };
              const changed: ChangeEntry[] = (changes.get(k.id) ?? []).map(c => ({
                id: c.id,
                text: format(t.objective.changedBy, { what: format(t.objective.changed[c.field], { before: said(c.field, c.before), after: said(c.field, c.after) }), name: personView(who, c.author, locale).name }),
                when: relative(c.at, locale, ctx.clock.now),
                date: formatDate(c.at, locale, ctx.zone, { dateStyle: "medium", timeStyle: "short" }),
              }));
              const entries: HistoryEntry[] = list.map((c, i) => ({
                id: c.id,
                when: relative(c.at, locale, ctx.clock.now),
                date: formatDate(c.at, locale, ctx.zone, { dateStyle: "medium" }),
                value: text(c.value),
                confidence: c.confidence,
                note: c.note,
                by: personView(who, c.author, locale).name,
                undoable: !closed && i === list.length - 1 && (c.author === member.id || can(member, "any.write")) && ctx.clock.now.getTime() - Date.parse(c.at) < undoMinutes * 60000,
              }));
              return (
                <KeyResultCard
                  key={k.id}
                  boards={boards}
                  kr={k}
                  history={entries}
                  changes={changed}
                  chart={{
                    points: list.map(c => ({ at: Date.parse(c.at), value: c.value, confidence: c.confidence })),
                    start: raw.start,
                    target: raw.target,
                    from,
                    to,
                    today: ctx.clock.now.getTime(),
                    label: format(t.objective.chartLabel, { title: k.title, count: list.length, start: k.start, now: k.current, target: k.target }),
                    startText: k.start,
                    targetText: k.target,
                    fromText: formatDay(cycle.startsOn, locale, { day: "numeric", month: "short" }),
                    toText: formatDay(cycle.endsOn, locale, { day: "numeric", month: "short" }),
                    targetWord: t.objective.targetLine,
                  }}
                  openCheckIn={checkin === k.id}
                  owners={owners}
                  locale={locale}
                  me={member.id}
                  t={cardWords}
                />
              );
            })}
          </section>

          {childViews.length > 0 && (
            <section aria-labelledby="supporting">
              <div className="section-title"><h2 id="supporting">{t.objective.supporting}</h2></div>
              <ul className="card rows">
                {childViews.map(c => (
                  <li key={c.id}>
                    <div className="grow">
                      <span className="eyebrow">{c.teamName ?? c.levelText}</span>
                      <Link href={`/chest/objectives/${c.id}`}>{c.title}</Link>
                      <span className="meta"><PersonLine person={c.owner} /><Confidence value={c.confidence} words={t.confidence} /></span>
                    </div>
                    <div className="row-progress"><Progress percent={c.percent} text={c.percentText} label={`${c.title}: ${c.percentText}`} confidence={c.confidence} /></div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Comments
            objectiveId={o.id}
            me={member.id}
            isAdmin={can(member, "any.write")}
            comments={notes.map(c => ({ id: c.id, author: personView(who, c.author, locale, member.id), mine: c.author === member.id, body: c.body, when: relative(c.at, locale, ctx.clock.now), date: formatDate(c.at, locale, ctx.zone, { dateStyle: "full", timeStyle: "short" }), edited: c.edited }))}
            t={{ comments: t.comments, errors: t.errors }}
          />
        </div>

        <aside className="aside">
          <dl className="card facts">
            <div><dt>{t.objective.owner}</dt><dd><PersonLine person={view.owner} />{view.owner.gone && <span className="tag gone">{t.objective.ownerLeft}</span>}</dd></div>
            <div><dt>{o.level === "team" ? t.objective.team : t.objective.level}</dt><dd>{o.level === "team" && o.teamId ? <Link href={`/chest/teams/${o.teamId}?cycle=${cycle.id}`}>{levelLine}</Link> : levelLine}</dd></div>
            {parent && <div><dt>{t.objective.supports}</dt><dd><Link href={`/chest/objectives/${parent.id}`}>{parent.title}</Link></dd></div>}
            <div><dt>{t.cycle.label}</dt><dd>{cycle.name}{closed ? ` · ${t.cycle.closed}` : ""}</dd></div>
            <div><dt>{t.objective.visibility}</dt><dd>{o.visibility === "everyone" ? t.objective.everyone : <>{o.visibility === "team" ? format(t.objective.seenByTeam, { team: levelLine }) : viewers.length > 0 ? format(t.objective.seenByPeople, { names: viewers.map(id => personView(who, id, locale).name).join(", ") }) : t.objective.seenByOwners}</>}</dd></div>
          </dl>
          {(editable || carryTarget) && (
            <ObjectiveActions
              objectiveId={o.id}
              canEdit={editable}
              carry={carryTarget ? { id: carryTarget.id, label: format(t.objective.carryOver, { cycle: carryTarget.name }) } : null}
              t={{ objective: t.objective, errors: t.errors }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
