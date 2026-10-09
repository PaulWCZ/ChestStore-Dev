import { Island, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { Filters } from "@argentic/chest-ui/components";
import { Back, Lock } from "../components/icons.tsx";
import { MapEmpty } from "../components/map-empty.tsx";
import { localeOf } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { formChoices } from "../lib/form-data.ts";
import { isLevel } from "../lib/model.ts";
import { context } from "../lib/page-data.ts";
import { everyone } from "../lib/people.ts";
import { knownBoards } from "../lib/sources.ts";
import { cycleGroup } from "./cycle-group.ts";

// A new objective, in the cycle asked (?cycle=), at the level asked
// (?level=), for the team asked (?team=), supporting what is asked
// (?parent=) — each only when this person may.
export async function newObjectivePage({ member, t, locale: language, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  const open = ctx.cycles.filter(c => !c.closed);
  const cycle = open.find(c => c.id === query("cycle")) ?? open.find(c => c.current) ?? open[0];
  const head = <div className="head"><div className="titles"><h1>{t.form.newTitle}</h1></div></div>;
  if (!cycle) {
    return { title: t.form.newTitle, body: <div className="narrow">{head}<MapEmpty icon={<Lock />} title={t.form.closed} action={<a className="button quiet" href="/chest/cycles">{t.shell.cycles}</a>} /></div> };
  }
  const choices = await formChoices(sql, member, cycle.id, ctx.teamList, ctx.clock);
  if (choices.levels.length === 0) {
    return { title: t.form.newTitle, body: <div className="narrow">{head}<MapEmpty icon={<Lock />} title={t.form.cannot} /></div> };
  }
  const asked = query("level");
  const level = isLevel(asked) && choices.levels.includes(asked) ? asked : choices.levels.includes("team") ? "team" : choices.levels[0]!;
  const writable = choices.teams.filter(x => x.writable);
  const team = writable.find(x => x.id === query("team")) ?? (writable.length === 1 ? writable[0] : undefined);
  const parent = choices.parents.find(p => p.id === query("parent"));
  const [boards, owners] = await Promise.all([knownBoards(sql), everyone()]);
  return {
    title: t.form.newTitle,
    body: (
      <div className="narrow">
        <a className="link-button" href="/chest/company"><Back />{t.company.title}</a>
        {head}
        {open.length > 1 && <Filters path="/chest/objectives/new" params={{ cycle: cycle.id, level: query("level"), team: query("team"), parent: query("parent") }} groups={[cycleGroup(open, cycle.id, t)]} labels={t.filters} />}
        <Island id={`new-${cycle.id}`} name="ObjectiveForm" props={{
          mode: "new",
          objectiveId: null,
          cycleId: cycle.id,
          levels: choices.levels,
          teams: choices.teams,
          parents: choices.parents,
          owners,
          me: member.id,
          initial: { level, teamId: team?.id ?? "", parentId: parent ? parent.id : "", owner: member.id, title: "", why: "", visibility: "everyone", viewers: [] },
          locale,
          currency: chest.currency,
          boards,
          personalNote: true,
          t: { form: t.form, tools: t.tools, kinds: t.kinds, kindHints: t.kindHints, levels: t.levels, errors: t.errors, visibility: t.visibility, peoplePicker: t.peoplePicker },
        }} />
      </div>
    ),
  };
}
