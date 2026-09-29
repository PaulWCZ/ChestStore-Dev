import { Filters } from "@argentic/chest-ui/components";
import { Link } from "../../../../components/link.tsx";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Back, Plus } from "../../../../components/icons.tsx";
import { MapEmpty } from "../../../../components/map-empty.tsx";
import { ObjectiveCard } from "../../../../components/objective-card.tsx";
import { mayCreate, readerOf } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { format, plural } from "../../../../lib/i18n/index.ts";
import { context } from "../../../../lib/page-data.ts";
import { cycleObjectives, defaultCycle } from "../../../../lib/read.ts";
import { viewer } from "../../../../lib/session.ts";
import { settings, team as readTeam } from "../../../../lib/teams.ts";
import { idsOf, objectiveView } from "../../../../lib/views.ts";
import { cycleGroup } from "../../views/cycle-group.ts";

// A team's page: its objectives in the cycle shown, with their key
// results, and the personal objectives that support them.
export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cycle?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const { id } = await params;
  if (!/^[1-9][0-9]{0,17}$/u.test(id)) notFound();
  const team = await readTeam(sql, id);
  if (!team) notFound();
  const ctx = await context(sql, member);
  const asked = (await searchParams).cycle;
  const cycle = ctx.cycles.find(c => c.id === asked) ?? (await defaultCycle(sql, member.locale));
  const all = cycle ? await cycleObjectives(sql, cycle.id, ctx.clock, readerOf(member)) : [];
  const ours = all.filter(o => o.level === "team" && o.teamId === team.id);
  const ourIds = new Set(ours.map(o => o.id));
  const personal = all.filter(o => o.level === "personal" && o.parentId && ourIds.has(o.parentId));
  const who = await ctx.people(idsOf([...ours, ...personal]));
  const vctx = { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed: cycle?.closed ?? true, teams: ctx.teams };
  const canWrite = cycle && !cycle.closed && mayCreate(member, "team", team, (await settings(sql)).personal);
  const cardWords = { progress: t.progress, confidence: t.confidence, objective: t.objective, checkIn: t.checkIn, levels: t.levels };
  const parentTitle = new Map(all.map(o => [o.id, o.title]));
  return (
    <div className="page narrow">
      <AutoRefresh seconds={60} />
      <Link className="link-button" href="/chest/teams"><Back />{t.teams.title}</Link>
      <div className="head">
        <div className="titles">
          <span className="eyebrow">{team.groupId ? t.teams.fromChest : t.levels.team}{team.archived ? ` · ${t.teams.archived}` : ""}</span>
          <h1>{team.name}</h1>
          {team.members && <p className="hint">{plural(t.teams.members, team.members.length, locale)}</p>}
        </div>
        <div className="actions">
          {canWrite && <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=team&team=${team.id}`}><Plus />{format(t.teams.newObjective, { team: team.name })}</Link>}
        </div>
      </div>
      {cycle && <Filters link={Link} path={`/chest/teams/${team.id}`} params={{ cycle: cycle.id }} groups={[cycleGroup(ctx.cycles, cycle.id, t)]} labels={t.filters} />}
      {ours.length === 0 ? (
        <MapEmpty title={format(t.teams.teamEmpty, { team: team.name, cycle: cycle?.name ?? "" })} body={format(t.teams.teamEmptyBody, { team: team.name })} action={canWrite ? <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=team&team=${team.id}`}><Plus />{format(t.teams.newObjective, { team: team.name })}</Link> : null} />
      ) : (
        <div className="cards">
          {ours.map(o => {
            const view = objectiveView(o, vctx);
            return (
              <div key={o.id} className="stack-s">
                {o.parentId && parentTitle.has(o.parentId) && <p className="hint"><Link href={`/chest/objectives/${o.parentId}`}>{format(t.teams.supports, { title: parentTitle.get(o.parentId)! })}</Link></p>}
                <ObjectiveCard o={view} mine={member.id} t={cardWords} />
              </div>
            );
          })}
        </div>
      )}
      {personal.length > 0 && (
        <section className="section" aria-labelledby="personal">
          <div className="section-title"><h2 id="personal">{t.teams.personal}</h2></div>
          <div className="cards">{personal.map(o => <ObjectiveCard key={o.id} o={objectiveView(o, vctx)} mine={member.id} t={cardWords} />)}</div>
        </section>
      )}
    </div>
  );
}
