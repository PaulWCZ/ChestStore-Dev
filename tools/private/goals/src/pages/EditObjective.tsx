import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { Back } from "../components/icons.tsx";
import { localeOf } from "../i18n/index.ts";
import { mayEdit } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { formChoices } from "../lib/form-data.ts";
import { readObjective } from "../lib/objectives.ts";
import { context } from "../lib/page-data.ts";
import { everyone } from "../lib/people.ts";
import { viewersOf } from "../lib/read.ts";
import { knownBoards } from "../lib/sources.ts";

// An objective's own fields: title, why, owner, what it supports, its team,
// who sees it. Its owner and the admins, while its cycle is open.
export async function editObjectivePage({ member, t, locale: language, param }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  const o = await readObjective(sql, member, param("id"), ctx.clock);
  const cycle = ctx.cycles.find(c => c.id === o.cycleId);
  if (!cycle || cycle.closed || !mayEdit(member, o)) return notFound();
  const [choices, boards, owners, viewers] = await Promise.all([formChoices(sql, member, cycle.id, ctx.teamList, ctx.clock), knownBoards(sql), everyone(), viewersOf(sql, o.id)]);
  const teams = choices.teams.map(x => ({ ...x, writable: x.writable || x.id === o.teamId }));
  return {
    title: t.form.editTitle,
    body: (
      <div className="narrow">
        <a className="link-button" href={`/chest/objectives/${o.id}`}><Back />{o.title}</a>
        <div className="head"><div className="titles"><h1>{t.form.editTitle}</h1></div></div>
        <Island id={`edit-${o.id}`} name="ObjectiveForm" props={{
          mode: "edit",
          objectiveId: o.id,
          cycleId: cycle.id,
          levels: [o.level],
          teams,
          parents: choices.parents.filter(p => p.id !== o.id),
          owners,
          me: member.id,
          initial: { level: o.level, teamId: o.teamId ?? "", parentId: o.parentId ?? "", owner: o.owner, title: o.title, why: o.why, visibility: o.visibility, viewers },
          locale,
          currency: chest.currency,
          boards,
          personalNote: false,
          t: { form: t.form, tools: t.tools, kinds: t.kinds, kindHints: t.kindHints, levels: t.levels, errors: t.errors, visibility: t.visibility, peoplePicker: t.peoplePicker },
        }} />
      </div>
    ),
  };
}
