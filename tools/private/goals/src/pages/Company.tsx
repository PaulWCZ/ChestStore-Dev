import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import type { FilterGroup } from "@argentic/chest-ui/components";
import { paramValues } from "@argentic/chest-ui/components/logic";
import { CycleChip } from "../components/cycle-chip.tsx";
import { Mountain, Plus, Upload } from "../components/icons.tsx";
import { MapEmpty } from "../components/map-empty.tsx";
import { Tree, type TreeNode } from "../components/tree.tsx";
import { format, localeOf, plural, relative } from "../i18n/index.ts";
import type { ChasePerson } from "../islands/ChaseList.tsx";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { readerFor } from "../lib/groups.ts";
import { memberPattern, objectiveProgress, percent, runsOn } from "../lib/model.ts";
import { context, cycleWords } from "../lib/page-data.ts";
import { noCycleWords } from "../lib/people.ts";
import { cycleObjectives, defaultCycle } from "../lib/read.ts";
import { remindedToday, waitingFor } from "../lib/remind.ts";
import { idsOf, objectiveView, pctText, personView, type ObjectiveView } from "../lib/views.ts";
import { cycleGroup } from "./cycle-group.ts";

const statuses = ["at_risk", "off_track", "quiet"] as const;
type Status = (typeof statuses)[number];

// The company's goals as a trail map: each company objective, and beneath
// it what supports it (team objectives, then personal ones), with their
// progress and confidence. What supports nothing is listed after. Filters
// (how it goes, a team, an owner) are kept in the address; who has not
// updated this week comes after the tree, for those who chase it.
export async function companyPage({ member, t, locale: language, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  const asked = query("cycle");
  const cycle = asked && /^[1-9][0-9]{0,17}$/u.test(asked) ? ctx.cycles.find(c => c.id === asked) : await defaultCycle(sql, locale);
  if (asked && !cycle) notFound();
  if (!cycle) {
    return {
      title: t.company.title,
      body: (
        <div className="page">
          <div className="head"><div className="titles"><h1>{t.company.title}</h1></div></div>
          <MapEmpty title={t.home.noCycle} body={can(member, "cycles.manage") ? t.home.noCycleBody : await noCycleWords(locale)} action={can(member, "cycles.manage") ? <a className="button" href="/chest/cycles">{t.cycles.new}</a> : null} />
        </div>
      ),
    };
  }
  const objectives = await cycleObjectives(sql, cycle.id, ctx.clock, await readerFor(member));
  const who = await ctx.people(idsOf(objectives));
  const views = objectives.map(o => objectiveView(o, { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed: cycle.closed, teams: ctx.teams }));
  const byId = new Map(views.map(o => [o.id, o]));
  const childrenOf = new Map<string, ObjectiveView[]>();
  for (const o of views) {
    if (!o.parentId || !byId.has(o.parentId)) continue;
    const list = childrenOf.get(o.parentId);
    if (list) list.push(o);
    else childrenOf.set(o.parentId, [o]);
  }
  const grow = (o: ObjectiveView): TreeNode => ({ o, children: (childrenOf.get(o.id) ?? []).map(grow) });
  const roots = views.filter(o => o.level === "company").map(grow);
  const loose = views.filter(o => o.level === "team" && !(o.parentId && byId.has(o.parentId))).map(grow);
  const alone = views.filter(o => o.level === "personal" && !(o.parentId && byId.has(o.parentId))).map(grow);
  const company = objectives.filter(o => o.level === "company");
  const overall = percent(objectiveProgress(company.filter(o => o.progress !== null).map(o => ({ progress: o.progress!, weight: 1 }))));
  const tally = { on_track: 0, at_risk: 0, off_track: 0, stale: 0 };
  for (const o of views) {
    if (o.confidence) tally[o.confidence]++;
    if (o.stale) tally.stale++;
  }
  const cw = cycleWords(cycle, ctx.clock.today, t, locale);
  const open = !cycle.closed;
  // Filters, in the address: how it goes (one or several), a team, an
  // owner. Unknown values are ignored.
  const team = query("team");
  const owner = query("owner");
  const filters = {
    status: paramValues({ status: query("status") }, "status").filter((x): x is Status => (statuses as readonly string[]).includes(x)),
    team: team && ctx.teams.has(team) ? team : "",
    owner: owner && memberPattern.test(owner) ? owner : "",
  };
  const filtering = filters.status.length > 0 || filters.team !== "" || filters.owner !== "";
  const onCount = filters.status.length + Number(filters.team !== "") + Number(filters.owner !== "");
  const isStatus = (o: ObjectiveView, st: Status) => (st === "quiet" ? o.stale : o.confidence === st);
  const byOwner = (o: ObjectiveView) => filters.owner === "" || o.owner.id === filters.owner || o.keyResults.some(k => k.owner.id === filters.owner);
  const byStatus = (o: ObjectiveView) => filters.status.length === 0 || filters.status.some(st => isStatus(o, st));
  const byTeam = (o: ObjectiveView) => filters.team === "" || o.teamId === filters.team;
  // Each choice counts what it would show with the other filters kept: one
  // pass over the objectives.
  const counts: Record<Status, number> = { at_risk: 0, off_track: 0, quiet: 0 };
  const perTeam = new Map<string, number>();
  for (const o of views) {
    if (!byOwner(o)) continue;
    if (byTeam(o)) for (const st of statuses) if (isStatus(o, st)) counts[st]++;
    if (o.teamId !== null && byStatus(o)) perTeam.set(o.teamId, (perTeam.get(o.teamId) ?? 0) + 1);
  }
  const found = views.filter(o => byStatus(o) && byTeam(o) && byOwner(o));
  const teamIds = new Set(views.map(o => o.teamId).filter((x): x is string => x !== null));
  const teamChoices = [...teamIds].map(id => ({ id, name: ctx.teams.get(id) ?? "", count: perTeam.get(id) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
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
  // Who has not updated this week: for the admins, everyone; for an
  // objective's owner, its key results. Only in the cycle running today.
  const running = open && runsOn(cycle, ctx.clock.today);
  const waiting = running ? await waitingFor(sql, member, ctx.clock) : [];
  const reminded = waiting.length > 0 ? await remindedToday(sql, ctx.clock) : new Set<string>();
  const waitingPeople = await ctx.people(waiting.map(w => w.owner));
  const chaseOf = new Map<string, ChasePerson>();
  for (const w of waiting) {
    let entry = chaseOf.get(w.owner);
    if (!entry) chaseOf.set(w.owner, (entry = { person: personView(waitingPeople, w.owner, locale), reminded: reminded.has(w.owner), items: [] }));
    entry.items.push({ id: w.keyResultId, title: w.title, objectiveId: w.objectiveId, last: w.lastCheckIn ? format(t.chase.last, { when: relative(w.lastCheckIn, locale, ctx.clock.now) }) : t.chase.never });
  }
  const chase = [...chaseOf.values()];
  const words = { progress: t.progress, confidence: t.confidence, objective: t.objective, company: t.company, levels: t.levels };
  const newHref = `/chest/objectives/new?cycle=${cycle.id}${can(member, "company.write") ? "&level=company" : "&level=team"}`;

  return {
    title: t.company.title,
    body: (
      <div className="page">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        <div className="head">
          <div className="titles">
            <h1>{t.company.title}</h1>
            <CycleChip name={cycle.name} dates={cw.dates} when={cw.when} elapsed={cw.elapsed} timeLabel={format(t.cycle.timeGone, { percent: pctText(t, cw.elapsed) })} />
          </div>
          {open && (
            <div className="actions">
              <a className="button" href={newHref}><Plus />{can(member, "company.write") ? t.company.newCompany : t.company.newTeam}</a>
            </div>
          )}
        </div>

        <Island name="CompanyTools" props={{
          path: "/chest/company",
          params,
          cycle: cycleGroup(ctx.cycles, cycle.id, t),
          menu: { label: t.company.spreadsheet, importHref: can(member, "any.write") && open ? `/chest/import?cycle=${cycle.id}` : null, importLabel: t.company.import, exportHref: `/chest/cycles/${cycle.id}/export`, exportLabel: t.company.export },
          overview: views.length === 0 ? null : { title: t.company.overall, percent: overall, percentText: pctText(t, overall), label: `${t.company.overall}: ${pctText(t, overall)}`, summary: plural(t.company.summary, views.length, locale), counts: t.company.counts, tally, words: { ...t.confidence, stale: t.progress.staleShort } },
          filters: views.length === 0 ? null : { groups, owners: ownerChoices, ownerChosen: chosenOwner !== null, ownerLabel: t.company.owner, picker: t.peoplePicker, lang: locale },
          fold: { label: t.company.filtersButton, on: onCount, onLabel: plural(t.company.filtersOn, onCount, locale) },
          labels: t.filters,
        }} />

        {views.length === 0 ? (
          <MapEmpty
            icon={<Mountain />}
            title={format(t.company.empty, { cycle: cycle.name })}
            body={can(member, "company.write") ? t.company.emptyBody : t.company.emptyMember}
            action={open ? (can(member, "company.write") ? (
              <>
                <a className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=company`}><Plus />{t.company.firstObjective}</a>
                <Island name="AddExample" props={{ cycleId: cycle.id, label: t.company.example }} />
                <a className="button quiet" href={`/chest/import?cycle=${cycle.id}`}><Upload />{t.company.import}</a>
              </>
            ) : <a className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=team`}><Plus />{t.company.newTeam}</a>) : null}
          />
        ) : (
          <>
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
            {/* Who has not updated: after the tree (the page is the tree). */}
            {chase.length > 0 && <Island name="ChaseList" props={{ people: chase, all: can(member, "any.write"), locale, t: { chase: t.chase, errors: t.errors, objective: t.objective } }} />}
          </>
        )}
      </div>
    ),
  };
}
