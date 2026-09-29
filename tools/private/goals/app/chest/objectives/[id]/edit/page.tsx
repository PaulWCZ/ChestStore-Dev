import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { mayEdit } from "../../../../../lib/access.ts";
import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { formChoices } from "../../../../../lib/form-data.ts";
import { readObjective } from "../../../../../lib/objectives.ts";
import { viewersOf } from "../../../../../lib/read.ts";
import { context } from "../../../../../lib/page-data.ts";
import { everyone } from "../../../../../lib/people.ts";
import { viewer } from "../../../../../lib/session.ts";
import { ObjectiveForm } from "../../../views/objective-form.tsx";

// An objective's own fields: title, why, owner, what it supports, its team.
export default async function EditObjective({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  let o;
  try {
    o = await readObjective(sql, member, (await params).id, ctx.clock);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const cycle = ctx.cycles.find(c => c.id === o.cycleId);
  if (!cycle || cycle.closed || !mayEdit(member, o)) notFound();
  const choices = await formChoices(sql, member, cycle.id, ctx.teamList, ctx.clock);
  const teams = choices.teams.map(x => ({ ...x, writable: x.writable || x.id === o.teamId }));
  const owners = await everyone();
  return (
    <div className="narrow">
      <Link className="link-button" href={`/chest/objectives/${o.id}`}><Back />{o.title}</Link>
      <div className="head"><div className="titles"><h1>{t.form.editTitle}</h1></div></div>
      <ObjectiveForm
        mode="edit"
        objectiveId={o.id}
        cycleId={cycle.id}
        levels={[o.level]}
        teams={teams}
        parents={choices.parents.filter(p => p.id !== o.id)}
        owners={owners}
        me={member.id}
        initial={{ level: o.level, teamId: o.teamId ?? "", parentId: o.parentId ?? "", owner: o.owner, title: o.title, why: o.why, visibility: o.visibility, viewers: await viewersOf(sql, o.id) }}
        locale={v.locale}
        currency={chest.currency()}
        personalNote={false}
        t={{ form: t.form, kinds: t.kinds, kindHints: t.kindHints, levels: t.levels, errors: t.errors, visibility: t.visibility, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
