import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { Filters } from "@argentic/chest-ui/components";
import { Back, Plus } from "../components/icons.tsx";
import { MapEmpty } from "../components/map-empty.tsx";
import { ObjectiveCard } from "../components/objective-card.tsx";
import { format, localeOf, plural } from "../i18n/index.ts";
import { mayCreate } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { groupsOf, readerFor } from "../lib/groups.ts";
import { context } from "../lib/page-data.ts";
import { cycleObjectives, defaultCycle } from "../lib/read.ts";
import { settings, team as readTeam } from "../lib/teams.ts";
import { idsOf, objectiveView } from "../lib/views.ts";
import { cycleGroup } from "./cycle-group.ts";

// A team's page: its objectives in the cycle shown, with their key
// results, and the personal objectives that support them.
export async function teamPage({ member, t, locale: language, param, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const id = param("id");
  if (!/^[1-9][0-9]{0,17}$/u.test(id)) notFound();
  const team = await readTeam(sql, id);
  if (!team) return notFound();
  const ctx = await context(sql, member);
  const asked = query("cycle");
  const cycle = ctx.cycles.find(c => c.id === asked) ?? (await defaultCycle(sql, locale));
  const all = cycle ? await cycleObjectives(sql, cycle.id, ctx.clock, await readerFor(member)) : [];
  const ours = all.filter(o => o.level === "team" && o.teamId === team.id);
  const ourIds = new Set(ours.map(o => o.id));
  const personal = all.filter(o => o.level === "personal" && o.parentId && ourIds.has(o.parentId));
  const who = await ctx.people(idsOf([...ours, ...personal]));
  const vctx = { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed: cycle?.closed ?? true, teams: ctx.teams };
  const canWrite = cycle && !cycle.closed && mayCreate(member, "team", team, (await settings(sql)).personal, await groupsOf(member));
  const cardWords = { progress: t.progress, confidence: t.confidence, objective: t.objective, checkIn: t.checkIn, levels: t.levels };
  const parentTitle = new Map(all.map(o => [o.id, o.title]));
  const newHref = cycle ? `/chest/objectives/new?cycle=${cycle.id}&level=team&team=${team.id}` : "";
  return {
    title: team.name,
    body: (
      <div className="page narrow">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        <a className="link-button" href="/chest/teams"><Back />{t.teams.title}</a>
        <div className="head">
          <div className="titles">
            <span className="eyebrow">{team.groupId ? t.teams.fromChest : t.levels.team}{team.archived ? ` · ${t.teams.archived}` : ""}</span>
            <h1>{team.name}</h1>
            {team.members && <p className="hint">{plural(t.teams.members, team.members.length, locale)}</p>}
          </div>
          <div className="actions">
            {canWrite && <a className="button" href={newHref}><Plus />{format(t.teams.newObjective, { team: team.name })}</a>}
          </div>
        </div>
        {cycle && <Filters path={`/chest/teams/${team.id}`} params={{ cycle: cycle.id }} groups={[cycleGroup(ctx.cycles, cycle.id, t)]} labels={t.filters} />}
        {ours.length === 0 ? (
          <MapEmpty title={format(t.teams.teamEmpty, { team: team.name, cycle: cycle?.name ?? "" })} body={format(t.teams.teamEmptyBody, { team: team.name })} action={canWrite ? <a className="button" href={newHref}><Plus />{format(t.teams.newObjective, { team: team.name })}</a> : null} />
        ) : (
          <div className="cards">
            {ours.map(o => (
              <div key={o.id} className="stack-s">
                {o.parentId && parentTitle.has(o.parentId) && <p className="hint"><a href={`/chest/objectives/${o.parentId}`}>{format(t.teams.supports, { title: parentTitle.get(o.parentId)! })}</a></p>}
                <ObjectiveCard o={objectiveView(o, vctx)} mine={member.id} t={cardWords} />
              </div>
            ))}
          </div>
        )}
        {personal.length > 0 && (
          <section className="section" aria-labelledby="personal">
            <div className="section-title"><h2 id="personal">{t.teams.personal}</h2></div>
            <div className="cards">{personal.map(o => <ObjectiveCard key={o.id} o={objectiveView(o, vctx)} mine={member.id} t={cardWords} />)}</div>
          </section>
        )}
      </div>
    ),
  };
}
