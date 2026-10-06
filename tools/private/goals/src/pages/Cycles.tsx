import { Island, type PageContext, type View } from "@argentic/chest-app";
import { MapEmpty } from "../components/map-empty.tsx";
import { Progress } from "../components/progress.tsx";
import { format, localeOf, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { cycleStats } from "../lib/cycles.ts";
import { db } from "../lib/db.ts";
import { readerFor } from "../lib/groups.ts";
import { firstCycleChoices, nextQuarter } from "../lib/model.ts";
import { context, cycleWords, quarterName } from "../lib/page-data.ts";
import { noCycleWords } from "../lib/people.ts";
import { pctText } from "../lib/views.ts";

// The cycles: the current one, those to come, those past (readable, with
// their review). Admins create, pick the current one, close and reopen.
export async function cyclesPage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  const admin = can(member, "cycles.manage");
  const stats = await cycleStats(sql, await readerFor(member));
  const latest = ctx.cycles[0];
  const q = latest ? nextQuarter(latest.endsOn) : firstCycleChoices(ctx.clock.today).main.quarter;
  const suggestion = { name: quarterName(t, q), startsOn: q.startsOn, endsOn: q.endsOn };
  const words = { cycles: t.cycles, errors: t.errors, date: t.date, dialog: t.dialog };
  return {
    title: t.cycles.title,
    body: (
      <div className="page narrow">
        <div className="head">
          <div className="titles"><h1>{t.cycles.title}</h1><p className="hint">{t.cycles.intro}</p></div>
          {admin && <div className="actions"><Island id="island-new-cycle" name="NewCycle" props={{ suggestion, first: ctx.cycles.length === 0, today: ctx.clock.today, t: words }} /></div>}
        </div>
        {ctx.cycles.length === 0 ? (
          <MapEmpty title={t.cycles.noCycles} body={admin ? t.home.noCycleBody : await noCycleWords(locale)} />
        ) : (
          <ul className="card rows">
            {ctx.cycles.map(c => {
              const s = stats.get(c.id) ?? { objectives: 0, retros: 0, progress: null };
              const cw = cycleWords(c, ctx.clock.today, t, locale);
              const p = s.progress;
              return (
                <li key={c.id} id={`cycle-${c.id}`}>
                  <div className="grow">
                    <span className="eyebrow">{c.current ? t.cycles.current : c.closed ? t.cycles.closed : c.startsOn > ctx.clock.today ? t.cycles.upcoming : t.cycles.open}</span>
                    <a href={`/chest/cycles/${c.id}`}>{c.name}</a>
                    <span className="meta"><span>{cw.dates}</span><span>· {plural(t.cycles.objectives, s.objectives, locale)}</span>{c.closed && s.objectives > 0 && <span>· {format(t.cycles.retroDone, { done: s.retros, total: s.objectives })}</span>}</span>
                  </div>
                  <div className="row-progress"><Progress percent={p} text={pctText(t, p)} label={`${c.name}: ${pctText(t, p)}`} /></div>
                  {admin && <Island id={`island-cycle-${c.id}`} name="CycleAdmin" props={{ cycle: { id: c.id, name: c.name, startsOn: c.startsOn, endsOn: c.endsOn, current: c.current, closed: c.closed, empty: s.objectives === 0 }, today: ctx.clock.today, t: words }} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    ),
  };
}
