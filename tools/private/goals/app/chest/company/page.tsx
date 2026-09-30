import { localeOf } from "@argentic/chest-sdk/member";
import { noCycleWords } from "../../../lib/people.ts";
import { Filters, Menu } from "@argentic/chest-ui/components";
import { Link } from "../../../components/link.tsx";
import type { FilterGroup } from "@argentic/chest-ui/components";
import { paramValues } from "@argentic/chest-ui/components/logic";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { CycleChip } from "../../../components/cycle-chip.tsx";
import { Download, Mountain, Plus, Shape, Upload } from "../../../components/icons.tsx";
import { FoldArea, FoldButton } from "../../../components/fold.tsx";
import { MapEmpty } from "../../../components/map-empty.tsx";
import { Progress } from "../../../components/progress.tsx";
import { can } from "../../../lib/access.ts";
import { readerFor } from "../../../lib/groups.ts";
import { db } from "../../../lib/db.ts";
import { format, plural, relative } from "../../../lib/i18n/index.ts";
import { objectiveProgress, percent, runsOn } from "../../../lib/model.ts";
import { remindedToday, waitingFor } from "../../../lib/remind.ts";
import { context, cycleWords } from "../../../lib/page-data.ts";
import { cycleObjectives, defaultCycle } from "../../../lib/read.ts";
import { viewer } from "../../../lib/session.ts";
import { idsOf, objectiveView, pctText, personView, type ObjectiveView } from "../../../lib/views.ts";
import { AddExample } from "../views/add-example.tsx";
import { ChaseList, type ChasePerson } from "../views/chase-list.tsx";
import { cycleGroup } from "../views/cycle-group.ts";
import { OwnerFilter } from "../views/company-filters.tsx";
import { Tree, type TreeNode } from "../views/tree.tsx";

// The company's goals as a trail map: each company objective, and beneath
// it what supports it (team objectives, then personal ones), with their
// progress and confidence. What supports nothing is listed after.
export default async function Company({ searchParams }: { searchParams: Promise<{ cycle?: string; status?: string; team?: string; owner?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const q = await searchParams;
  const asked = q.cycle;
  const cycle = asked && /^[1-9][0-9]{0,17}$/u.test(asked) ? ctx.cycles.find(c => c.id === asked) : await defaultCycle(sql, localeOf(member.language));
  if (asked && !cycle) notFound();
  if (!cycle) {
    return (
      <div className="page">
        <div className="head"><div className="titles"><h1>{t.company.title}</h1></div></div>
        <MapEmpty title={t.home.noCycle} body={can(member, "cycles.manage") ? t.home.noCycleBody : await noCycleWords(locale)} action={can(member, "cycles.manage") ? <Link className="button" href="/chest/cycles">{t.cycles.new}</Link> : null} />
      </div>
    );
  }
  const objectives = await cycleObjectives(sql, cycle.id, ctx.clock, await readerFor(member));
  const who = await ctx.people(idsOf(objectives));
  const views = objectives.map(o => objectiveView(o, { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed: cycle.closed, teams: ctx.teams }));
  const byId = new Map(views.map(o => [o.id, o]));
  const childrenOf = new Map<string, ObjectiveView[]>();
  for (const o of views) if (o.parentId && byId.has(o.parentId)) childrenOf.set(o.parentId, [...(childrenOf.get(o.parentId) ?? []), o]);
  const grow = (o: ObjectiveView): TreeNode => ({ o, children: (childrenOf.get(o.id) ?? []).map(grow) });
  const roots = views.filter(o => o.level === "company").map(grow);
  const loose = views.filter(o => o.level === "team" && !(o.parentId && byId.has(o.parentId))).map(grow);
  const alone = views.filter(o => o.level === "personal" && !(o.parentId && byId.has(o.parentId))).map(grow);
  const company = objectives.filter(o => o.level === "company");
  const overall = percent(objectiveProgress(company.filter(o => o.progress !== null).map(o => ({ progress: o.progress!, weight: 1 }))));
  const tally = (c: "on_track" | "at_risk" | "off_track") => views.filter(o => o.confidence === c).length;
  const stale = views.filter(o => o.stale).length;
  const cw = cycleWords(cycle, ctx.clock.today, t, locale);
  const open = !cycle.closed;
  // Filters, in the address: how it goes (one or several), a team, an
  // owner. Unknown values are ignored.
  const statuses = ["at_risk", "off_track", "quiet"] as const;
  type Status = (typeof statuses)[number];
  const filters = {
    status: paramValues({ status: q.status }, "status").filter((x): x is Status => (statuses as readonly string[]).includes(x)),
    team: q.team && ctx.teams.has(q.team) ? q.team : "",
    owner: q.owner && /^mbr_[a-z2-7]{26}$/u.test(q.owner) ? q.owner : "",
  };
  const filtering = filters.status.length > 0 || filters.team !== "" || filters.owner !== "";
  const onCount = filters.status.length + Number(filters.team !== "") + Number(filters.owner !== "");
  const isStatus = (o: ObjectiveView, st: Status) => (st === "quiet" ? o.stale : o.confidence === st);
  const byOwner = (o: ObjectiveView) => filters.owner === "" || o.owner.id === filters.owner || o.keyResults.some(k => k.owner.id === filters.owner);
  const matches = (o: ObjectiveView, ignore: "status" | "team" | null = null) =>
    (ignore === "status" || filters.status.length === 0 || filters.status.some(st => isStatus(o, st)))
    && (ignore === "team" || filters.team === "" || o.teamId === filters.team)
    && byOwner(o);
  const counts = Object.fromEntries(statuses.map(st => [st, views.filter(o => matches(o, "status") && isStatus(o, st)).length])) as Record<Status, number>;
  const found = views.filter(o => matches(o));
  const teamChoices = [...new Set(views.map(o => o.teamId).filter((x): x is string => x !== null))].map(id => ({ id, name: ctx.teams.get(id) ?? "", count: views.filter(o => o.teamId === id && matches(o, "team")).length })).sort((a, b) => a.name.localeCompare(b.name));
  const ownerChoices = [...new Map(views.flatMap(o => [o.owner, ...o.keyResults.map(k => k.owner)]).filter(p => p.id.startsWith("mbr_")).map(p => [p.id, { id: p.id, name: p.name, photo: p.photo }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const params = { cycle: cycle.id, status: filters.status.join(",") || undefined, team: filters.team || undefined, owner: filters.owner || undefined };
  // The owner, once chosen with the picker, is a chip like the others:
  // one tap, or "Clear filters", lets it go.
  const chosenOwner = ownerChoices.find(p => p.id === filters.owner) ?? null;
  const groups: FilterGroup[] = [
    { key: "status", label: t.company.status, all: true, multiple: true, options: statuses.map(st => ({ value: st, label: st === "quiet" ? t.progress.staleShort : t.confidence[st], count: counts[st] })) },
    ...(teamChoices.length > 0 ? [{ key: "team", label: t.company.team, all: true, options: teamChoices.map(x => ({ value: x.id, label: x.name, count: x.count })) }] : []),
    ...(chosenOwner ? [{ key: "owner", label: t.company.owner, options: [{ value: chosenOwner.id, label: chosenOwner.name }] }] : []),
  ];
  // Who has not checked in this week: for the admins, everyone; for an
  // objective's owner, its key results. Only in the cycle running today.
  const running = open && runsOn(cycle, ctx.clock.today);
  const waiting = running ? await waitingFor(sql, member, ctx.clock) : [];
  const reminded = waiting.length > 0 ? await remindedToday(sql, ctx.clock) : new Set<string>();
  const waitingPeople = await ctx.people(waiting.map(w => w.owner));
  const chase: ChasePerson[] = [...new Set(waiting.map(w => w.owner))].map(owner => ({
    person: personView(waitingPeople, owner, locale),
    reminded: reminded.has(owner),
    items: waiting.filter(w => w.owner === owner).map(w => ({ id: w.keyResultId, title: w.title, objectiveId: w.objectiveId, last: w.lastCheckIn ? format(t.chase.last, { when: relative(w.lastCheckIn, locale, ctx.clock.now) }) : t.chase.never })),
  }));
  const words = { progress: t.progress, confidence: t.confidence, objective: t.objective, company: t.company, levels: t.levels };

  return (
    <div className="page">
      <AutoRefresh seconds={60} />
      <div className="head">
        <div className="titles">
          <h1>{t.company.title}</h1>
          <CycleChip name={cycle.name} dates={cw.dates} when={cw.when} elapsed={cw.elapsed} timeLabel={format(t.cycle.timeGone, { percent: pctText(t, cw.elapsed) })} />
        </div>
        {open && (
          <div className="actions">
            <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}${can(member, "company.write") ? "&level=company" : "&level=team"}`}><Plus />{can(member, "company.write") ? t.company.newCompany : t.company.newTeam}</Link>
          </div>
        )}
      </div>

      <FoldArea>
      <div className="tree-tools">
        {/* On a phone the choices fold behind one button (components/fold.tsx). */}
        {views.length > 0 && <FoldButton label={t.company.filtersButton} on={onCount} onLabel={plural(t.company.filtersOn, onCount, locale)} />}
        <div className={views.length > 0 ? "foldable" : ""}><Filters link={Link} path="/chest/company" params={params} groups={[cycleGroup(ctx.cycles, cycle.id, t)]} labels={t.filters} /></div>
        {/* Rare actions, in one menu: the tree comes first on a phone. */}
        <div className="end">
          <Menu label={t.company.spreadsheet} showLabel items={[
            ...(can(member, "any.write") && open ? [{ label: t.company.import, href: `/chest/import?cycle=${cycle.id}`, icon: <Upload /> }] : []),
            { label: t.company.export, href: `/chest/cycles/${cycle.id}/export`, download: true, icon: <Download /> },
          ]} />
        </div>
      </div>

      {views.length === 0 ? (
        <MapEmpty
          icon={<Mountain />}
          title={format(t.company.empty, { cycle: cycle.name })}
          body={can(member, "company.write") ? t.company.emptyBody : t.company.emptyMember}
          action={open ? (can(member, "company.write") ? (
            <>
              <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=company`}><Plus />{t.company.firstObjective}</Link>
              <AddExample cycleId={cycle.id} label={t.company.example} errors={t.errors} />
              <Link className="button quiet" href={`/chest/import?cycle=${cycle.id}`}><Upload />{t.company.import}</Link>
            </>
          ) : <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=team`}><Plus />{t.company.newTeam}</Link>) : null}
        />
      ) : (
        <>
          <div className="overview">
            <div className="card">
              <span className="eyebrow">{t.company.overall}</span>
              <Progress percent={overall} text={pctText(t, overall)} label={`${t.company.overall}: ${pctText(t, overall)}`} big />
              <p className="hint">{plural(t.company.summary, views.length, locale)}</p>
              {/* On a phone, the confidence in one line under the progress. */}
              <ul className="tally compact phone-only" aria-label={t.company.counts}>
                {(["on_track", "at_risk", "off_track"] as const).map(c => <li key={c} className={`shape-${c}`}><Shape confidence={c} /><strong>{tally(c)}</strong><span>{t.confidence[c]}</span></li>)}
              </ul>
            </div>
            <div className="card">
              <span className="eyebrow">{t.company.counts}</span>
              <ul className="tally">
                {(["on_track", "at_risk", "off_track"] as const).map(c => <li key={c} className={`shape-${c}`}><Shape confidence={c} /><strong>{tally(c)}</strong><span>{t.confidence[c]}</span></li>)}
                {stale > 0 && <li><strong>{stale}</strong><span>{t.progress.staleShort}</span></li>}
              </ul>
            </div>
          </div>
          <div className="filters foldable">
            <Filters link={Link} path="/chest/company" params={params} groups={groups} labels={t.filters} />
            {!chosenOwner && <OwnerFilter path="/chest/company" params={params} owners={ownerChoices} label={t.company.owner} labels={t.peoplePicker} lang={locale} />}
          </div>
          {filtering ? (
            <section aria-labelledby="found">
              <h2 id="found" className="group-title" aria-live="polite">{plural(t.company.matches, found.length, locale)}</h2>
              {found.length > 0 && <Tree roots={found.map(o => ({ o, children: [] }))} t={words} label={plural(t.company.matches, found.length, locale)} />}
            </section>
          ) : <>
          <Tree roots={roots} t={words} label={t.company.title} />
          {loose.length > 0 && (
            <section aria-labelledby="loose">
              <h2 id="loose" className="group-title">{t.company.notAligned}</h2>
              <Tree roots={loose} t={words} label={t.company.notAligned} />
            </section>
          )}
          {alone.length > 0 && (
            <section aria-labelledby="alone">
              <h2 id="alone" className="group-title">{t.company.personalAlone}</h2>
              <Tree roots={alone} t={words} label={t.company.personalAlone} />
            </section>
          )}
          </>}
          {/* Who has not checked in: after the tree (the page is the tree). */}
          {chase.length > 0 && <ChaseList people={chase} all={can(member, "any.write")} locale={locale} t={{ chase: t.chase, errors: t.errors, objective: t.objective }} />}
        </>
      )}
      </FoldArea>
    </div>
  );
}
