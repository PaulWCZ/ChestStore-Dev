import Link from "next/link";
import { notFound } from "next/navigation";
import { MapEmpty } from "../../../../components/map-empty.tsx";
import { CycleChip } from "../../../../components/cycle-chip.tsx";
import { Back, Download } from "../../../../components/icons.tsx";
import { PersonLine } from "../../../../components/person.tsx";
import { Confidence, Progress } from "../../../../components/progress.tsx";
import { can } from "../../../../lib/access.ts";
import { readerFor } from "../../../../lib/groups.ts";
import { db } from "../../../../lib/db.ts";
import { format } from "../../../../lib/i18n/index.ts";
import { percent } from "../../../../lib/model.ts";
import { context, cycleWords } from "../../../../lib/page-data.ts";
import { cycleObjectives } from "../../../../lib/read.ts";
import { viewer } from "../../../../lib/session.ts";
import { idsOf, objectiveView, pctText } from "../../../../lib/views.ts";
import { CloseCycle } from "../../views/close-cycle.tsx";

// A cycle's review: every objective's final progress, its score and what
// the team learned — the page a closed cycle is remembered by.
export default async function CycleReview({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const { id } = await params;
  const cycle = ctx.cycles.find(c => c.id === id);
  if (!cycle) notFound();
  const objectives = await cycleObjectives(sql, cycle.id, ctx.clock, await readerFor(member));
  const who = await ctx.people(idsOf(objectives));
  const views = objectives.map(o => objectiveView(o, { actor: member, people: who, locale, t, zone: ctx.zone, now: ctx.clock.now, closed: cycle.closed, teams: ctx.teams }));
  const cw = cycleWords(cycle, ctx.clock.today, t, locale);
  return (
    <div className="page narrow">
      <Link className="link-button" href="/chest/cycles"><Back />{t.cycles.title}</Link>
      <div className="head">
        <div className="titles">
          <h1>{format(t.cycles.reviewTitle, { name: cycle.name })}</h1>
          <CycleChip name={cycle.name} dates={cw.dates} when={cw.when} elapsed={cw.elapsed} timeLabel={format(t.cycle.timeGone, { percent: pctText(t, cw.elapsed) })} />
          <p className="hint">{t.cycles.reviewBody}</p>
        </div>
        <div className="actions">
          <a className="button quiet" href={`/chest/cycles/${cycle.id}/export`} download><Download />{t.cycles.download}</a>
          <a className="button quiet" href={`/chest/cycles/${cycle.id}/export?what=check-ins`} download><Download />{t.export.checkIns}</a>
          {can(member, "cycles.manage") && !cycle.closed && <CloseCycle cycleId={cycle.id} name={cycle.name} t={{ cycles: t.cycles, errors: t.errors }} />}
        </div>
      </div>
      {views.length === 0 ? (
        <MapEmpty title={t.cycles.reviewEmpty} />
      ) : (
        <ul className="card rows">
          {views.map(o => (
            <li key={o.id} className="review-row">
              <div className="grow">
                <span className="eyebrow">{o.teamName ?? o.levelText}</span>
                <Link href={`/chest/objectives/${o.id}`}>{o.title}</Link>
                <span className="meta"><PersonLine person={o.owner} /><Confidence value={o.confidence} words={t.confidence} />{o.score !== null && <strong>{format(t.retro.scoreValue, { percent: pctText(t, percent(o.score)) })}</strong>}</span>
                {o.learned ? <blockquote className="learned">{o.learned}</blockquote> : null}
              </div>
              <div className="row-progress"><Progress percent={o.percent} text={o.percentText} label={`${o.title}: ${o.percentText}`} confidence={o.confidence} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
