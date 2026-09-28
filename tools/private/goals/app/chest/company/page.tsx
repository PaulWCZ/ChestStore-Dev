import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Contours } from "../../../components/contours.tsx";
import { CycleChip } from "../../../components/cycle-chip.tsx";
import { Download, Mountain, Plus, Shape } from "../../../components/icons.tsx";
import { Progress } from "../../../components/progress.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, plural } from "../../../lib/i18n/index.ts";
import { objectiveProgress, percent } from "../../../lib/model.ts";
import { context, cycleWords } from "../../../lib/page-data.ts";
import { cycleObjectives, defaultCycle } from "../../../lib/read.ts";
import { viewer } from "../../../lib/session.ts";
import { idsOf, objectiveView, pctText, type ObjectiveView } from "../../../lib/views.ts";
import { AddExample } from "../views/add-example.tsx";
import { CyclePicker } from "../views/cycle-picker.tsx";
import { Tree, type TreeNode } from "../views/tree.tsx";

// The company's goals as a trail map: each company objective, and beneath
// it what supports it (team objectives, then personal ones), with their
// progress and confidence. What supports nothing is listed after.
export default async function Company({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const asked = (await searchParams).cycle;
  const cycle = asked && /^[1-9][0-9]{0,17}$/u.test(asked) ? ctx.cycles.find(c => c.id === asked) : await defaultCycle(sql);
  if (asked && !cycle) notFound();
  if (!cycle) {
    return (
      <div className="page">
        <div className="head"><div className="titles"><h1>{t.company.title}</h1></div></div>
        <div className="empty"><Contours variant="small" /><h2>{t.home.noCycle}</h2><p>{can(member, "cycles.manage") ? t.home.noCycleBody : t.home.noCycleMember}</p>{can(member, "cycles.manage") && <Link className="button" href="/chest/cycles">{t.cycles.new}</Link>}</div>
      </div>
    );
  }
  const objectives = await cycleObjectives(sql, cycle.id, ctx.clock);
  const who = await ctx.people(idsOf(objectives));
  const views = objectives.map(o => objectiveView(o, { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed: cycle.closed, teams: ctx.teams }));
  const byId = new Map(views.map(o => [o.id, o]));
  const childrenOf = new Map<string, ObjectiveView[]>();
  for (const o of views) if (o.parentId && byId.has(o.parentId)) childrenOf.set(o.parentId, [...(childrenOf.get(o.parentId) ?? []), o]);
  const grow = (o: ObjectiveView): TreeNode => ({ o, children: (childrenOf.get(o.id) ?? []).map(grow) });
  const roots = views.filter(o => o.level === "company").map(grow);
  const loose = views.filter(o => o.level === "team" && !(o.parentId && byId.has(o.parentId))).map(grow);
  const alone = views.filter(o => o.level === "personal" && !(o.parentId && byId.has(o.parentId))).map(grow);
  const company = objectives.filter(o => o.level === "company");
  const overall = percent(objectiveProgress(company.filter(o => o.progress !== null).map(o => ({ progress: o.progress!, weight: 1 }))));
  const tally = (c: "on_track" | "at_risk" | "off_track") => views.filter(o => o.confidence === c).length;
  const stale = views.filter(o => o.stale).length;
  const cw = cycleWords(cycle, ctx.clock.today, t, locale);
  const open = !cycle.closed;
  const words = { progress: t.progress, confidence: t.confidence, objective: t.objective, company: t.company, levels: t.levels };

  return (
    <div className="page">
      <AutoRefresh seconds={60} />
      <div className="head">
        <div className="titles">
          <h1>{t.company.title}</h1>
          <CycleChip name={cycle.name} dates={cw.dates} when={cw.when} elapsed={cw.elapsed} timeLabel={format(t.cycle.timeGone, { percent: pctText(t, cw.elapsed) })} />
        </div>
        {open && (
          <div className="actions">
            <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}${can(member, "company.write") ? "&level=company" : "&level=team"}`}><Plus />{can(member, "company.write") ? t.company.newCompany : t.company.newTeam}</Link>
          </div>
        )}
      </div>

      <div className="tree-tools">
        <CyclePicker cycles={ctx.cycles.map(c => ({ id: c.id, name: c.name, closed: c.closed, current: c.current }))} value={cycle.id} t={{ label: t.cycle.label, show: t.cycle.show, closed: t.cycle.closed, current: t.cycle.current }} />
        <div className="end">
          <a className="button quiet small" href={`/chest/cycles/${cycle.id}/export`} download><Download />{t.company.export}</a>
        </div>
      </div>

      {views.length === 0 ? (
        <div className="empty">
          <Contours variant="small" />
          <span className="summit"><Mountain /></span>
          <h2>{format(t.company.empty, { cycle: cycle.name })}</h2>
          <p>{can(member, "company.write") ? t.company.emptyBody : t.company.emptyMember}</p>
          {open && (
            <div className="row">
              {can(member, "company.write") ? (
                <>
                  <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=company`}><Plus />{t.company.firstObjective}</Link>
                  <AddExample cycleId={cycle.id} label={t.company.example} errors={t.errors} />
                </>
              ) : <Link className="button" href={`/chest/objectives/new?cycle=${cycle.id}&level=team`}><Plus />{t.company.newTeam}</Link>}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="overview">
            <div className="card">
              <span className="eyebrow">{t.company.overall}</span>
              <Progress percent={overall} text={pctText(t, overall)} label={`${t.company.overall}: ${pctText(t, overall)}`} big />
              <p className="hint">{plural(t.company.summary, views.length, locale)}</p>
            </div>
            <div className="card">
              <span className="eyebrow">{t.company.counts}</span>
              <ul className="tally">
                {(["on_track", "at_risk", "off_track"] as const).map(c => <li key={c} className={`shape-${c}`}><Shape confidence={c} /><strong>{tally(c)}</strong><span>{t.confidence[c]}</span></li>)}
                {stale > 0 && <li><strong>{stale}</strong><span>{t.progress.staleShort}</span></li>}
              </ul>
            </div>
          </div>
          <Tree roots={roots} t={words} label={t.company.title} />
          {loose.length > 0 && (
            <section aria-labelledby="loose">
              <h2 id="loose" className="group-title">{t.company.notAligned}</h2>
              <Tree roots={loose} t={words} label={t.company.notAligned} />
            </section>
          )}
          {alone.length > 0 && (
            <section aria-labelledby="alone">
              <h2 id="alone" className="group-title">{t.company.personalAlone}</h2>
              <Tree roots={alone} t={words} label={t.company.personalAlone} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
