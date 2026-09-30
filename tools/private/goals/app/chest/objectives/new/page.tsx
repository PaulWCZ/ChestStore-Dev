import { knownBoards } from "../../../../lib/sources.ts";
import { Filters } from "@argentic/chest-ui/components";
import { Link } from "../../../../components/link.tsx";
import { chest } from "@argentic/chest-sdk/chest";
import { Back, Lock } from "../../../../components/icons.tsx";
import { MapEmpty } from "../../../../components/map-empty.tsx";
import { db } from "../../../../lib/db.ts";
import { formChoices } from "../../../../lib/form-data.ts";
import { isLevel } from "../../../../lib/model.ts";
import { context } from "../../../../lib/page-data.ts";
import { everyone } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { cycleGroup } from "../../views/cycle-group.ts";
import { ObjectiveForm } from "../../views/objective-form.tsx";

// A new objective, in the cycle asked (?cycle=), at the level asked
// (?level=), for the team asked (?team=), supporting what is asked
// (?parent=) — each only when this person may.
export default async function NewObjective({ searchParams }: { searchParams: Promise<{ cycle?: string; level?: string; team?: string; parent?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const q = await searchParams;
  const open = ctx.cycles.filter(c => !c.closed);
  const cycle = open.find(c => c.id === q.cycle) ?? open.find(c => c.current) ?? open[0];
  if (!cycle) {
    return (
      <div className="narrow">
        <div className="head"><div className="titles"><h1>{t.form.newTitle}</h1></div></div>
        <MapEmpty icon={<Lock />} title={t.form.closed} action={<Link className="button quiet" href="/chest/cycles">{t.shell.cycles}</Link>} />
      </div>
    );
  }
  const choices = await formChoices(sql, member, cycle.id, ctx.teamList, ctx.clock);
  if (choices.levels.length === 0) {
    return (
      <div className="narrow">
        <div className="head"><div className="titles"><h1>{t.form.newTitle}</h1></div></div>
        <MapEmpty icon={<Lock />} title={t.form.cannot} />
      </div>
    );
  }
  const level = isLevel(q.level) && choices.levels.includes(q.level) ? q.level : choices.levels.includes("team") ? "team" : choices.levels[0]!;
  const team = choices.teams.find(x => x.id === q.team && x.writable) ?? (choices.teams.filter(x => x.writable).length === 1 ? choices.teams.find(x => x.writable) : undefined);
  const parent = choices.parents.find(p => p.id === q.parent);
  // Tasks' boards Goals has heard of, for "Cards done on …" (lib/sources.ts).
  const boards = await knownBoards(sql);
  const owners = await everyone();
  return (
    <div className="narrow">
      <Link className="link-button" href="/chest/company"><Back />{t.company.title}</Link>
      <div className="head">
        <div className="titles"><h1>{t.form.newTitle}</h1></div>
      </div>
      {open.length > 1 && <Filters link={Link} path="/chest/objectives/new" params={{ cycle: cycle.id, level: q.level, team: q.team, parent: q.parent }} groups={[cycleGroup(open, cycle.id, t)]} labels={t.filters} />}
      <ObjectiveForm
        mode="new"
        cycleId={cycle.id}
        levels={choices.levels}
        teams={choices.teams}
        parents={choices.parents}
        owners={owners}
        me={member.id}
        initial={{ level, teamId: team?.id ?? "", parentId: parent ? parent.id : "", owner: member.id, title: "", why: "", visibility: "everyone", viewers: [] }}
        locale={v.locale}
        currency={chest.currency}
        boards={boards}
        personalNote
        t={{ form: t.form, tools: t.tools, kinds: t.kinds, kindHints: t.kindHints, levels: t.levels, errors: t.errors, visibility: t.visibility, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
