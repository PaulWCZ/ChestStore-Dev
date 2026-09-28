import Link from "next/link";
import { Contours } from "../../../components/contours.tsx";
import { People } from "../../../components/icons.tsx";
import { Confidence, Progress } from "../../../components/progress.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { objectiveProgress, percent, worst } from "../../../lib/model.ts";
import { context } from "../../../lib/page-data.ts";
import { cycleObjectives, defaultCycle } from "../../../lib/read.ts";
import { viewer } from "../../../lib/session.ts";
import { pctText } from "../../../lib/views.ts";
import { CyclePicker } from "../views/cycle-picker.tsx";

// The teams, each a tile: its progress in the cycle shown, its
// confidence, how many objectives and people.
export default async function Teams({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const asked = (await searchParams).cycle;
  const cycle = ctx.cycles.find(c => c.id === asked) ?? (await defaultCycle(sql));
  const objectives = cycle ? await cycleObjectives(sql, cycle.id, ctx.clock) : [];
  const active = ctx.teamList.filter(x => !x.archived);
  return (
    <div className="page">
      <div className="head">
        <div className="titles"><h1>{t.teams.title}</h1></div>
        {cycle && <div className="actions"><CyclePicker cycles={ctx.cycles.map(c => ({ id: c.id, name: c.name, closed: c.closed, current: c.current }))} value={cycle.id} t={{ label: t.cycle.label, show: t.cycle.show, closed: t.cycle.closed, current: t.cycle.current }} /></div>}
      </div>
      {active.length === 0 ? (
        <div className="empty">
          <Contours variant="small" />
          <span className="summit"><People /></span>
          <h2>{t.teams.empty}</h2>
          <p>{t.teams.emptyBody}</p>
          {can(member, "settings.manage") && <Link className="button" href="/chest/settings#teams">{t.teams.emptyAdmin}</Link>}
        </div>
      ) : (
        <ul className="team-grid">
          {active.map(team => {
            const mine = objectives.filter(o => o.level === "team" && o.teamId === team.id);
            const p = percent(objectiveProgress(mine.filter(o => o.progress !== null).map(o => ({ progress: o.progress!, weight: 1 }))));
            return (
              <li key={team.id}>
                <Link className="card team-tile" href={`/chest/teams/${team.id}${cycle ? `?cycle=${cycle.id}` : ""}`}>
                  <Contours variant="small" />
                  <span className="eyebrow">{team.groupId ? t.teams.fromChest : t.levels.team}</span>
                  <h2>{team.name}</h2>
                  <Progress percent={p} text={pctText(t, p)} label={`${team.name}: ${pctText(t, p)}`} />
                  <span className="meta">
                    <span>{plural(t.teams.objectives, mine.length, locale)}</span>
                    {team.members && <span>· {plural(t.teams.members, team.members.length, locale)}</span>}
                    {mine.length > 0 && <Confidence value={worst(mine.map(o => o.confidence))} words={t.confidence} />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
