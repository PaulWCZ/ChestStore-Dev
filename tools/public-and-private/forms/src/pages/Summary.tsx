import { Island } from "@argentic/chest-app";
import type { ReactNode } from "react";
import { EmptyState } from "@argentic/chest-ui/components";
import { KindIcon, StarIcon } from "../components/icons.tsx";
import { dayWords, format, number, plural } from "../i18n/index.ts";
import { summaryOf } from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import { open } from "../lib/forms.ts";
import { reachOf } from "../lib/reach.ts";
import { limits, readIn } from "../shared/model.ts";
import { summarise, type Bar, type Summary } from "../shared/summary.ts";
import type { Ctx } from "./context.ts";
import { AnswersSwitch } from "./Answers.tsx";
import { FormFrame } from "./form-frame.tsx";

// A share drawn as a bar: an SVG, its width a percentage (the page's
// policy refuses a style attribute; an attribute of the drawing is fine).
function Track({ share }: { share: number }) {
  return (
    <svg className="bar-track" aria-hidden="true" focusable="false">
      {share > 0 && <rect className="bar-fill" x="0" y="0" height="100%" width={`${Math.max(1, Math.min(100, share))}%`} rx="7" />}
    </svg>
  );
}

// Summary: each question at a glance — bars for choices, the average and
// the NPS for scales, numbers' range, a ranking's average places, a
// matrix row by row, the latest texts. Counted by the database (src/lib/
// stats.ts): the same page for ten answers or ten thousand.
export async function summaryPage({ sql, member, t, lang, param }: Ctx) {
  const { form, level } = await open(sql, member, param("id"));
  const base = `/chest/forms/${form.id}`;
  const head = <AnswersSwitch base={base} current="summary" t={t} />;
  const frame = (body: ReactNode) => ({ title: form.draft.title || t.builder.untitled, body: <FormFrame form={form} level={level} tab="answers" t={t} lang={lang}>{body}</FormFrame> });
  let data;
  try {
    data = await summaryOf(sql, member, form.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "too_few") return frame(<div className="panel-page">{head}<EmptyState title={t.answers.floorTitle} body={format(t.answers.floor, { floor: limits.anonymousFloor, count: error.values["count"] ?? 0 })} /></div>);
    throw error;
  }
  const s = t.summary;
  const n = (x: number) => number(x, lang);
  const bars = (list: Bar[], highlight = true, numeric = false) => {
    const top = Math.max(...list.map(b => b.count), 0);
    return (
      <ul className={numeric ? "bars numeric" : "bars"}>
        {list.map(b => (
          <li key={b.key} className={highlight && b.count === top && top > 0 ? "top" : ""}>
            <span className="bar-label">{b.label}</span>
            <Track share={b.share} />
            <span className="bar-value">{n(b.count)} <span className="dim">{format(s.percent, { share: n(b.share) })}</span></span>
          </li>
        ))}
      </ul>
    );
  };
  const body = (x: Summary) => {
    const st = x.stat;
    switch (st.type) {
      case "bars":
        return (
          <>
            {bars(st.bars)}
            {st.others.length > 0 && (<><p className="mini-label">{s.others}</p><ul className="texts">{st.others.slice(0, 10).map((o, i) => <li key={i}>{o}</li>)}</ul></>)}
          </>
        );
      case "average": {
        const nps = st.nps;
        const all = nps ? nps.detractors + nps.passives + nps.promoters : 0;
        const part = (k: number) => (all === 0 ? 0 : (k / all) * 100);
        return (
          <>
            <div className="big-number">
              <span className="value">{n(st.average)}</span>
              <span className="dim">{format(s.outOf, { max: st.max })}</span>
              {x.column.question.kind === "rating" && <span className="stars-row" aria-hidden="true">{Array.from({ length: st.max }, (_, i) => <StarIcon key={i} filled={i < Math.round(st.average)} />)}</span>}
            </div>
            {nps && (
              <div className="nps">
                <div className="nps-score"><span className="mini-label">{s.nps}</span><strong>{nps.score > 0 ? "+" : ""}{nps.score}</strong><span className="hint">{s.npsHint}</span></div>
                <svg className="nps-split" aria-hidden="true" focusable="false">
                  <rect className="detractors" x="0" y="0" height="100%" width={`${part(nps.detractors)}%`} />
                  <rect className="passives" x={`${part(nps.detractors)}%`} y="0" height="100%" width={`${part(nps.passives)}%`} />
                  <rect className="promoters" x={`${part(nps.detractors) + part(nps.passives)}%`} y="0" height="100%" width={`${part(nps.promoters)}%`} />
                </svg>
                <ul className="nps-legend">
                  <li><span className="key detractors" aria-hidden="true" />{s.detractors} {n(nps.detractors)}</li>
                  <li><span className="key passives" aria-hidden="true" />{s.passives} {n(nps.passives)}</li>
                  <li><span className="key promoters" aria-hidden="true" />{s.promoters} {n(nps.promoters)}</li>
                </ul>
              </div>
            )}
            {bars(st.bars, false, true)}
          </>
        );
      }
      case "number":
        return st.answered === 0 ? null : (
          <dl className="facts">
            <div><dt>{s.average}</dt><dd>{n(st.average)}</dd></div>
            <div><dt>{s.min}</dt><dd>{n(st.min)}</dd></div>
            <div><dt>{s.max}</dt><dd>{n(st.max)}</dd></div>
          </dl>
        );
      case "dates":
        return st.answered === 0 || !st.first ? null : (
          <dl className="facts">
            <div><dt>{s.first}</dt><dd>{dayWords(st.first, lang)}</dd></div>
            <div><dt>{s.last}</dt><dd>{dayWords(st.last, lang)}</dd></div>
          </dl>
        );
      case "files":
        return <p className="dim">{plural(s.files, st.files, lang)}</p>;
      case "ranks":
        return (
          <ol className="ranks">
            {st.items.map(i => (
              <li key={i.key}>
                <span className="bar-label">{i.label}</span>
                <span className="bar-value">{i.average ? format(s.rankAverage, { place: n(i.average) }) : "—"} <span className="dim">{plural(s.firsts, i.firsts, lang)}</span></span>
              </li>
            ))}
          </ol>
        );
      case "grid":
        return (
          <div className="ck-table-wrap" tabIndex={0} role="region" aria-label={x.column.question.title}>
            <table className="grid-table">
              <thead><tr><th scope="col"><span className="visually-hidden">{s.row}</span></th>{st.columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
              <tbody>
                {st.rows.map(r => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    {/* The cell's ground grows with its share (eleven steps). */}
                    {r.cells.map((c, k) => <td key={k} className={`share-${Math.round(c.share / 10)}`}>{n(c.count)} <span className="dim">{format(s.percent, { share: n(c.share) })}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "texts":
        return st.latest.length === 0 ? null : (
          <>
            <p className="mini-label">{form.anonymous ? s.some : s.latest}</p>
            <ul className="texts">{st.latest.map((text, i) => <li key={i}>{text}</li>)}</ul>
            <a className="button link" href={`${base}/answers`}>{s.seeAll}</a>
          </>
        );
    }
  };
  // The questions in the member's language when the form has it.
  // Who it reached: openings, answers, the share; the answers day by day
  // (a column a day, drawn as SVG: the policy refuses a style attribute).
  const reach = await reachOf(sql, form);
  const most = Math.max(1, ...(reach.days ?? []).map(d => d.count));
  const inDays = (reach.days ?? []).reduce((sum, d) => sum + d.count, 0);
  const reachCard = (reach.views > 0 || inDays > 0) && (
    <section className="summary-card reach" aria-labelledby="h-reach">
      <h2 id="h-reach">{s.reach}</h2>
      {reach.views > 0 && (
        <dl className="facts">
          <div><dt>{s.opened}</dt><dd>{n(reach.views)}</dd></div>
          <div><dt>{s.answeredSince}</dt><dd>{n(reach.answers)}</dd></div>
          {reach.rate !== null && <div><dt>{s.completion}</dt><dd>{format(s.percent, { share: n(reach.rate) })}</dd></div>}
        </dl>
      )}
      {reach.since && <p className="hint">{format(s.completionHint, { day: dayWords(reach.since, lang) })}</p>}
      {reach.days && inDays > 0 && (
        <figure className="per-day">
          <figcaption className="mini-label">{s.perDay}</figcaption>
          <svg viewBox={`0 0 ${reach.days.length * 10} 60`} preserveAspectRatio="none" role="img" aria-label={format(s.perDayLabel, { count: n(inDays), most: n(most) })}>
            {reach.days.map((d, i) => d.count > 0 && <rect key={d.day} className="day-bar" x={i * 10 + 1} width="8" y={60 - Math.max(2, (d.count / most) * 60)} height={Math.max(2, (d.count / most) * 60)} rx="1.5" />)}
          </svg>
          <p className="per-day-ends dim" aria-hidden="true"><span>{dayWords(reach.days[0]!.day, lang)}</span><span>{dayWords(reach.days.at(-1)!.day, lang)}</span></p>
        </figure>
      )}
    </section>
  );
  const summaries = summarise(new Map([...data.versions].map(([v, d]) => [v, readIn(d, lang)])), data.stats, { yes: t.respond.yes, no: t.respond.no, other: t.respond.other });
  return frame(
    <div className="summary-page">
      <Island name="AutoRefresh" props={{ seconds: 60 }} />
      {head}
      <p className="answers-count">{plural(t.answers.count, data.stats.total, lang)}</p>
      {data.versions.size > 1 && <p className="hint">{s.versions}</p>}
      {reachCard}
      {data.stats.total === 0 ? <EmptyState title={s.empty} /> : (
        <ol className="summary-list">
          {summaries.map(x => (
            <li key={x.column.question.id} id={`summary-${x.column.question.id}`} className="summary-card">
              <h2><span className={`type-icon kind-${x.column.question.kind}`}><KindIcon kind={x.column.question.kind} /></span>{x.column.question.title}{x.column.removed && <span className="tag">{s.removed}</span>}</h2>
              <p className="hint">{plural(s.answered, x.stat.answered, lang)}</p>
              {body(x)}
            </li>
          ))}
        </ol>
      )}
    </div>,
  );
}
