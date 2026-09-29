import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { Contours } from "../../../../components/contours.tsx";
import { Back, Lock } from "../../../../components/icons.tsx";
import { db } from "../../../../lib/db.ts";
import { formChoices } from "../../../../lib/form-data.ts";
import { isLevel } from "../../../../lib/model.ts";
import { context } from "../../../../lib/page-data.ts";
import { everyone } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { CyclePicker } from "../../views/cycle-picker.tsx";
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
        <div className="empty"><Contours variant="small" /><Lock /><p>{t.form.closed}</p><Link className="button quiet" href="/chest/cycles">{t.shell.cycles}</Link></div>
      </div>
    );
  }
  const choices = await formChoices(sql, member, cycle.id, ctx.teamList, ctx.clock);
  if (choices.levels.length === 0) {
    return (
      <div className="narrow">
        <div className="head"><div className="titles"><h1>{t.form.newTitle}</h1></div></div>
        <div className="empty"><Contours variant="small" /><p>{t.form.cannot}</p></div>
      </div>
    );
  }
  const level = isLevel(q.level) && choices.levels.includes(q.level) ? q.level : choices.levels.includes("team") ? "team" : choices.levels[0]!;
  const team = choices.teams.find(x => x.id === q.team && x.writable) ?? (choices.teams.filter(x => x.writable).length === 1 ? choices.teams.find(x => x.writable) : undefined);
  const parent = choices.parents.find(p => p.id === q.parent);
  const owners = await everyone();
  return (
    <div className="narrow">
      <Link className="link-button" href="/chest/company"><Back />{t.company.title}</Link>
      <div className="head">
        <div className="titles"><h1>{t.form.newTitle}</h1></div>
        {open.length > 1 && <div className="actions"><CyclePicker cycles={open.map(c => ({ id: c.id, name: c.name, closed: c.closed, current: c.current }))} value={cycle.id} t={{ label: t.cycle.label, show: t.cycle.show, closed: t.cycle.closed, current: t.cycle.current }} /></div>}
      </div>
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
        currency={chest.currency()}
        personalNote
        t={{ form: t.form, kinds: t.kinds, kindHints: t.kindHints, levels: t.levels, errors: t.errors, visibility: t.visibility }}
      />
    </div>
  );
}
