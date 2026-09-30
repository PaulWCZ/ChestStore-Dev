import { noCycleWords } from "../../../lib/people.ts";
import Link from "next/link";
import { MapEmpty } from "../../../components/map-empty.tsx";
import { Progress } from "../../../components/progress.tsx";
import { can } from "../../../lib/access.ts";
import { readerFor } from "../../../lib/groups.ts";
import { db } from "../../../lib/db.ts";
import { format, plural } from "../../../lib/i18n/index.ts";
import { firstCycleChoices, nextQuarter, objectiveProgress, percent } from "../../../lib/model.ts";
import { context, cycleWords, quarterName } from "../../../lib/page-data.ts";
import { visibleTo } from "../../../lib/read.ts";
import { viewer } from "../../../lib/session.ts";
import { pctText } from "../../../lib/views.ts";
import { CycleAdmin, NewCycle } from "../views/cycle-admin.tsx";

// The cycles: the current one, those to come, those past (readable, with
// their review). Admins create, pick the current one, close and reopen.
export default async function Cycles() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const admin = can(member, "cycles.manage");
  const stats = new Map((await sql<{ cycle_id: string; n: string; retro: string }[]>`
    select o.cycle_id, count(*) as n, count(*) filter (where o.score is not null or o.learned <> '') as retro from objectives o where o.archived_at is null ${visibleTo(sql, await readerFor(member))} group by o.cycle_id`).map(r => [String(r.cycle_id), { n: Number(r.n), retro: Number(r.retro) }]));
  const progressRows = await sql<{ cycle_id: string; start_value: string; target_value: string; current_value: string; weight: number; objective_id: string }[]>`
    select o.cycle_id, o.id as objective_id, k.start_value, k.target_value, k.current_value, k.weight from key_results k join objectives o on o.id = k.objective_id
    where k.archived_at is null and o.archived_at is null and o.level = 'company' ${visibleTo(sql, await readerFor(member))}`;
  const progressOf = (cycleId: string) => {
    const byObjective = new Map<string, { progress: number; weight: number }[]>();
    for (const r of progressRows.filter(r => String(r.cycle_id) === cycleId)) {
      const s = Number(r.start_value), g = Number(r.target_value), c = Number(r.current_value);
      const p = Math.min(1, Math.max(0, (c - s) / (g - s)));
      byObjective.set(String(r.objective_id), [...(byObjective.get(String(r.objective_id)) ?? []), { progress: p, weight: Number(r.weight) }]);
    }
    const each = [...byObjective.values()].map(list => objectiveProgress(list)).filter((p): p is number => p !== null);
    return percent(each.length ? each.reduce((a, b) => a + b, 0) / each.length : null);
  };
  const latest = ctx.cycles[0];
  const q = latest ? nextQuarter(latest.endsOn) : firstCycleChoices(ctx.clock.today).main.quarter;
  const suggestion = { name: quarterName(t, q), startsOn: q.startsOn, endsOn: q.endsOn };
  return (
    <div className="page narrow">
      <div className="head">
        <div className="titles"><h1>{t.cycles.title}</h1><p className="hint">{t.cycles.intro}</p></div>
        {admin && <div className="actions"><NewCycle suggestion={suggestion} first={ctx.cycles.length === 0} today={ctx.clock.today} t={{ cycles: t.cycles, errors: t.errors, date: t.date, dialog: t.dialog }} /></div>}
      </div>
      {ctx.cycles.length === 0 ? (
        <MapEmpty title={t.cycles.noCycles} body={admin ? t.home.noCycleBody : await noCycleWords(locale)} />
      ) : (
        <ul className="card rows">
          {ctx.cycles.map(c => {
            const s = stats.get(c.id) ?? { n: 0, retro: 0 };
            const cw = cycleWords(c, ctx.clock.today, t, locale);
            const p = progressOf(c.id);
            return (
              <li key={c.id}>
                <div className="grow">
                  <span className="eyebrow">{c.current ? t.cycles.current : c.closed ? t.cycles.closed : c.startsOn > ctx.clock.today ? t.cycles.upcoming : t.cycles.open}</span>
                  <Link href={`/chest/cycles/${c.id}`}>{c.name}</Link>
                  <span className="meta"><span>{cw.dates}</span><span>· {plural(t.cycles.objectives, s.n, locale)}</span>{c.closed && s.n > 0 && <span>· {format(t.cycles.retroDone, { done: s.retro, total: s.n })}</span>}</span>
                </div>
                <div className="row-progress"><Progress percent={p} text={pctText(t, p)} label={`${c.name}: ${pctText(t, p)}`} /></div>
                {admin && <CycleAdmin cycle={{ id: c.id, name: c.name, startsOn: c.startsOn, endsOn: c.endsOn, current: c.current, closed: c.closed, empty: s.n === 0 }} today={ctx.clock.today} t={{ cycles: t.cycles, errors: t.errors, date: t.date, dialog: t.dialog }} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
