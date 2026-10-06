import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { EmptyState } from "@argentic/chest-ui/components";
import { Chevron, Lock } from "../components/icons.tsx";
import { PersonLine } from "../components/person.tsx";
import { Confidence, Progress } from "../components/progress.tsx";
import { format, formatDate, formatDay, localeOf, relative } from "../i18n/index.ts";
import type { ChangeEntry, HistoryEntry } from "../islands/KeyResultCard.tsx";
import { can, mayEdit } from "../lib/access.ts";
import { comments as readComments } from "../lib/comments.ts";
import { db } from "../lib/db.ts";
import { readerFor } from "../lib/groups.ts";
import { addDays, cycleTime, percent, undoMinutes } from "../lib/model.ts";
import { readObjective } from "../lib/objectives.ts";
import { context } from "../lib/page-data.ts";
import { everyone } from "../lib/people.ts";
import { checkIns, cycleObjectives, keyResultChanges, objectiveById, viewersOf } from "../lib/read.ts";
import { knownBoards } from "../lib/sources.ts";
import { objectiveView, pctText, personView } from "../lib/views.ts";
import { instantOf } from "../lib/zone.ts";
import { valueText } from "../shared/values.ts";

// One objective: why it matters, its key results with their history and
// updates, what supports it, and the conversation about it; once the
// cycle ends, its retrospective. ?checkin=<key result> opens that key
// result's update form.
export async function objectivePage({ member, t, locale: language, param, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  // Not found, or not one this member may see (a confidential objective):
  // the same 404 (readObjective refuses with not_found).
  const o = await readObjective(sql, member, param("id"), ctx.clock);
  const cycle = ctx.cycles.find(c => c.id === o.cycleId);
  if (!cycle) return notFound();
  const closed = cycle.closed;
  const time = cycleTime(cycle, ctx.clock.today);
  const ended = closed || time.phase === "after";
  const reader = await readerFor(member);
  const [siblings, history, notes, changes, viewers] = await Promise.all([
    cycleObjectives(sql, cycle.id, ctx.clock, reader),
    checkIns(sql, o.keyResults.map(k => k.id)),
    readComments(sql, o.id),
    keyResultChanges(sql, o.keyResults.map(k => k.id)),
    o.visibility === "people" ? viewersOf(sql, o.id) : Promise.resolve([] as string[]),
  ]);
  const siblingById = new Map(siblings.map(s => [s.id, s]));
  const parent = o.parentId ? siblingById.get(o.parentId) ?? null : null;
  const grandParent = parent?.parentId ? siblingById.get(parent.parentId) ?? null : null;
  const children = siblings.filter(s => s.parentId === o.id);
  const carriedFrom = o.carriedFrom ? await objectiveById(sql, o.carriedFrom, ctx.clock, reader, { archived: true }) : null;
  const carriedCycle = carriedFrom ? ctx.cycles.find(c => c.id === carriedFrom.cycleId) ?? null : null;
  const changeList = [...changes.values()].flat();
  const ids = [o.owner, o.retroBy ?? "", ...o.keyResults.map(k => k.owner), ...[...history.values()].flat().map(c => c.author), ...notes.map(c => c.author), ...children.map(c => c.owner), ...viewers, ...changeList.flatMap(c => [c.author, ...(c.field === "owner" ? [c.before, c.after] : [])])];
  const who = await ctx.people(ids.filter(Boolean));
  const vctx = { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed, teams: ctx.teams };
  const view = objectiveView(o, vctx);
  const childViews = children.map(c => objectiveView(c, vctx));
  const editable = !closed && mayEdit(member, o);
  // Tasks' boards Goals has heard of, for "Cards done on …" (lib/sources.ts);
  // everyone who may own a key result, for the forms of who may edit.
  const [boards, owners] = editable ? await Promise.all([knownBoards(sql), everyone()]) : [[], []];
  const from = instantOf(cycle.startsOn, 0, ctx.zone).getTime();
  const to = instantOf(addDays(cycle.endsOn, 1), 0, ctx.zone).getTime() - 1;
  const next = ctx.cycles.filter(c => !c.closed && c.id !== cycle.id).sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  const carryTarget = ended && mayEdit(member, o) ? next.find(c => c.startsOn > cycle.endsOn) ?? next[0] ?? null : null;
  const cardWords = { checkIn: t.checkIn, tools: t.tools, confidence: t.confidence, confidenceHelp: t.confidenceHelp, errors: t.errors, objective: t.objective, progress: t.progress, form: t.form, kinds: t.kinds, kindHints: t.kindHints, peoplePicker: t.peoplePicker, dialog: t.dialog, tables: t.tables };
  const levelLine = o.level === "team" ? view.teamName ?? t.levels.team : t.levels[o.level];
  const currency = chest.currency;
  const nameOf = (id: string) => personView(who, id, locale).name;
  const addProps = { objectiveId: o.id, owners, boards, defaultOwner: o.owner, locale, currency, t: cardWords };

  return {
    title: o.title,
    body: (
      <div className="page">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        <nav className="crumbs" aria-label={t.objective.breadcrumb}>
          <a href={`/chest/company?cycle=${cycle.id}`}>{t.company.title} · {cycle.name}</a>
          {grandParent && <><Chevron /><a href={`/chest/objectives/${grandParent.id}`}>{grandParent.title}</a></>}
          {parent && <><Chevron /><a href={`/chest/objectives/${parent.id}`}>{parent.title}</a></>}
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
                {carriedFrom && carriedCycle && <a href={`/chest/objectives/${carriedFrom.id}`}>{format(t.objective.carriedFrom, { cycle: carriedCycle.name })}</a>}
              </div>
              {closed && <p className="notice"><Lock />{t.objective.closedCycle}</p>}
            </section>

            {ended && (
              <Island id={`island-retro-${o.id}`} name="Retro" props={{
                objectiveId: o.id,
                canWrite: mayEdit(member, o),
                score: o.score,
                learned: o.learned,
                suggested: pctText(t, percent(o.progress)),
                scoreText: o.score === null ? null : format(t.retro.scoreValue, { percent: pctText(t, percent(o.score)) }),
                by: o.retroBy ? nameOf(o.retroBy) : null,
                t: { retro: t.retro },
              }} />
            )}

            <section aria-labelledby="krs" className="stack">
              <div className="section-title flush">
                <h2 id="krs">{t.objective.keyResults}</h2>
                {editable && <span className="end"><Island id={`island-add-kr-${o.id}`} name="AddKeyResult" props={addProps} /></span>}
              </div>
              {view.keyResults.length === 0 ? (
                <EmptyState title={t.objective.noKeyResults} body={t.objective.noKeyResultsBody} action={editable ? <Island id={`island-add-first-kr-${o.id}`} name="AddKeyResult" props={{ ...addProps, primary: true }} /> : null} />
              ) : view.keyResults.map((k, index) => {
                const raw = o.keyResults[index]!;
                const list = history.get(k.id) ?? [];
                const text = (value: number) => (raw.kind === "milestone" ? (value >= 1 ? t.checkIn.markDone : t.checkIn.notYet) : valueText(raw, value, locale));
                const said = (field: string, value: string) => {
                  if (field === "start" || field === "target") return text(Number(value));
                  if (field === "weight") return t.form.weights[value as "1" | "2" | "3"] ?? value;
                  if (field === "owner") return nameOf(value);
                  if (field === "kind") return t.kinds[value as "number"] ?? value;
                  return value;
                };
                const changed: ChangeEntry[] = (changes.get(k.id) ?? []).map(c => ({
                  id: c.id,
                  text: format(t.objective.changedBy, { what: format(t.objective.changed[c.field], { before: said(c.field, c.before), after: said(c.field, c.after) }), name: nameOf(c.author) }),
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
                  by: nameOf(c.author),
                  undoable: !closed && i === list.length - 1 && (c.author === member.id || can(member, "any.write")) && ctx.clock.now.getTime() - Date.parse(c.at) < undoMinutes * 60000,
                }));
                return (
                  <Island
                    key={k.id}
                    id={`island-kr-${k.id}`}
                    name="KeyResultCard"
                    props={{
                      boards,
                      kr: k,
                      history: entries,
                      changes: changed,
                      chart: {
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
                      },
                      openCheckIn: query("checkin") === k.id,
                      owners,
                      locale,
                      me: member.id,
                      t: cardWords,
                    }}
                  />
                );
              })}
            </section>

            {childViews.length > 0 && (
              <section aria-labelledby="supporting">
                <div className="section-title"><h2 id="supporting">{t.objective.supporting}</h2></div>
                <ul className="card rows">
                  {childViews.map(c => (
                    <li key={c.id} id={`supporting-${c.id}`}>
                      <div className="grow">
                        <span className="eyebrow">{c.teamName ?? c.levelText}</span>
                        <a href={`/chest/objectives/${c.id}`}>{c.title}</a>
                        <span className="meta"><PersonLine person={c.owner} /><Confidence value={c.confidence} words={t.confidence} /></span>
                      </div>
                      <div className="row-progress"><Progress percent={c.percent} text={c.percentText} label={`${c.title}: ${c.percentText}`} confidence={c.confidence} /></div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <Island id={`island-comments-${o.id}`} name="Comments" props={{
              objectiveId: o.id,
              isAdmin: can(member, "any.write"),
              comments: notes.map(c => ({ id: c.id, author: personView(who, c.author, locale, member.id), mine: c.author === member.id, body: c.body, when: relative(c.at, locale, ctx.clock.now), date: formatDate(c.at, locale, ctx.zone, { dateStyle: "full", timeStyle: "short" }), edited: c.edited })),
              t: { comments: t.comments, errors: t.errors },
            }} />
          </div>

          <aside className="aside">
            <dl className="card facts">
              <div><dt>{t.objective.owner}</dt><dd><PersonLine person={view.owner} />{view.owner.gone && <span className="tag gone">{t.objective.ownerLeft}</span>}</dd></div>
              <div><dt>{o.level === "team" ? t.objective.team : t.objective.level}</dt><dd>{o.level === "team" && o.teamId ? <a href={`/chest/teams/${o.teamId}?cycle=${cycle.id}`}>{levelLine}</a> : levelLine}</dd></div>
              {parent && <div><dt>{t.objective.supports}</dt><dd><a href={`/chest/objectives/${parent.id}`}>{parent.title}</a></dd></div>}
              <div><dt>{t.cycle.label}</dt><dd>{cycle.name}{closed ? ` · ${t.cycle.closed}` : ""}</dd></div>
              <div><dt>{t.objective.visibility}</dt><dd>{o.visibility === "everyone" ? t.objective.everyone : o.visibility === "team" ? format(t.objective.seenByTeam, { team: levelLine }) : viewers.length > 0 ? format(t.objective.seenByPeople, { names: viewers.map(nameOf).join(", ") }) : t.objective.seenByOwners}</dd></div>
            </dl>
            {(editable || carryTarget) && (
              <Island id={`island-actions-${o.id}`} name="ObjectiveActions" props={{
                objectiveId: o.id,
                canEdit: editable,
                carry: carryTarget ? { id: carryTarget.id, label: format(t.objective.carryOver, { cycle: carryTarget.name }) } : null,
                t: { objective: t.objective },
              }} />
            )}
          </aside>
        </div>
      </div>
    ),
  };
}
