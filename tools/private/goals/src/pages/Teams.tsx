import type { PageContext, View } from "@argentic/chest-app";
import { Filters } from "@argentic/chest-ui/components";
import { Contours } from "../components/contours.tsx";
import { People } from "../components/icons.tsx";
import { MapEmpty } from "../components/map-empty.tsx";
import { Confidence, Progress } from "../components/progress.tsx";
import { localeOf, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { readerFor } from "../lib/groups.ts";
import { objectiveProgress, percent, worst } from "../lib/model.ts";
import { context } from "../lib/page-data.ts";
import { cycleObjectives, defaultCycle, type Objective } from "../lib/read.ts";
import { pctText } from "../lib/views.ts";
import { cycleGroup } from "./cycle-group.ts";

// The teams, each a tile: its progress in the cycle shown, its
// confidence, how many objectives and people.
export async function teamsPage({ member, t, locale: language, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  const asked = query("cycle");
  const cycle = ctx.cycles.find(c => c.id === asked) ?? (await defaultCycle(sql, locale));
  const objectives = cycle ? await cycleObjectives(sql, cycle.id, ctx.clock, await readerFor(member)) : [];
  const active = ctx.teamList.filter(x => !x.archived);
  // Each team's objectives, in one pass.
  const byTeam = new Map<string, Objective[]>();
  for (const o of objectives) {
    if (o.level !== "team" || o.teamId === null) continue;
    const list = byTeam.get(o.teamId);
    if (list) list.push(o);
    else byTeam.set(o.teamId, [o]);
  }
  return {
    title: t.teams.title,
    body: (
      <div className="page">
        <div className="head">
          <div className="titles"><h1>{t.teams.title}</h1></div>
        </div>
        {cycle && active.length > 0 && <Filters path="/chest/teams" params={{ cycle: cycle.id }} groups={[cycleGroup(ctx.cycles, cycle.id, t)]} labels={t.filters} />}
        {active.length === 0 ? (
          <MapEmpty icon={<People />} title={t.teams.empty} body={t.teams.emptyBody} action={can(member, "settings.manage") ? <a className="button" href="/chest/settings#teams">{t.teams.emptyAdmin}</a> : null} />
        ) : (
          <ul className="team-grid">
            {active.map(team => {
              const mine = byTeam.get(team.id) ?? [];
              const p = percent(objectiveProgress(mine.filter(o => o.progress !== null).map(o => ({ progress: o.progress!, weight: 1 }))));
              const confidence = worst(mine.map(o => o.confidence));
              return (
                <li key={team.id} id={`team-${team.id}`}>
                  <a className="card team-tile" href={`/chest/teams/${team.id}${cycle ? `?cycle=${cycle.id}` : ""}`}>
                    <Contours variant="small" />
                    <span className="eyebrow">{team.groupId ? t.teams.fromChest : t.levels.team}</span>
                    <h2>{team.name}</h2>
                    <Progress percent={p} text={pctText(t, p)} label={`${team.name}: ${pctText(t, p)}`} confidence={confidence} />
                    <span className="meta">
                      <span>{plural(t.teams.objectives, mine.length, locale)}</span>
                      {team.members && <span>· {plural(t.teams.members, team.members.length, locale)}</span>}
                      {mine.length > 0 && <Confidence value={confidence} words={t.confidence} />}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    ),
  };
}
