import { EmptyState } from "@argentic/chest-ui/components";
import { KindIcon, StarIcon } from "../../../../../../components/icons.tsx";
import { allAnswers } from "../../../../../../lib/answers.ts";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { format, formatDate, plural } from "../../../../../../lib/i18n/index.ts";
import { limits, readIn } from "../../../../../../lib/model.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { summarise, type Bar, type Summary } from "../../../../../../lib/summary.ts";
import { AnswersSwitch } from "../answers-switch.tsx";

// Summary: each question at a glance — bars for choices, the average and
// the NPS for scales, numbers' range, a ranking's average places, a
// matrix row by row, the latest texts (shuffled for an anonymous form).
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const id = (await params).id;
  const head = <AnswersSwitch base={`/chest/forms/${id}`} current="summary" list={t.answers.viewList} summary={t.answers.viewSummary} label={t.answers.views} />;
  let data;
  try {
    data = await allAnswers(db(), member, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "too_few") {
      return <div className="panel-page">{head}<EmptyState title={t.answers.floorTitle} body={format(t.answers.floor, { floor: limits.anonymousFloor, count: error.values["count"] ?? 0 })} /></div>;
    }
    throw error;
  }
  const s = t.summary;
  const n = (x: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, { maximumFractionDigits: 2 }).format(x);
  const bars = (list: Bar[], highlight = true, numeric = false) => {
    const top = Math.max(...list.map(b => b.count), 0);
    return (
      <ul className={numeric ? "bars numeric" : "bars"}>
        {list.map(b => (
          <li key={b.key} className={highlight && b.count === top && top > 0 ? "top" : ""}>
            <span className="bar-label">{b.label}</span>
            <span className="bar-track" aria-hidden="true">{b.share > 0 && <span className="bar-fill" style={{ width: `${b.share}%` }} />}</span>
            <span className="bar-value">{b.count} <span className="dim">{format(s.percent, { share: n(b.share) })}</span></span>
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
      case "average":
        return (
          <>
            <div className="big-number">
              <span className="value">{n(st.average)}</span>
              <span className="dim">{format(s.outOf, { max: st.max })}</span>
              {x.column.question.kind === "rating" && <span className="stars-row" aria-hidden="true">{Array.from({ length: st.max }, (_, i) => <StarIcon key={i} filled={i < Math.round(st.average)} />)}</span>}
            </div>
            {st.nps && (
              <div className="nps">
                <div className="nps-score"><span className="mini-label">{s.nps}</span><strong>{st.nps.score > 0 ? "+" : ""}{st.nps.score}</strong><span className="hint">{s.npsHint}</span></div>
                <div className="nps-split" aria-hidden="true">
                  <span className="detractors" style={{ flexGrow: st.nps.detractors }} />
                  <span className="passives" style={{ flexGrow: st.nps.passives }} />
                  <span className="promoters" style={{ flexGrow: st.nps.promoters }} />
                </div>
                <ul className="nps-legend">
                  <li><span className="key detractors" aria-hidden="true" />{s.detractors} {st.nps.detractors}</li>
                  <li><span className="key passives" aria-hidden="true" />{s.passives} {st.nps.passives}</li>
                  <li><span className="key promoters" aria-hidden="true" />{s.promoters} {st.nps.promoters}</li>
                </ul>
              </div>
            )}
            {bars(st.bars, false, true)}
          </>
        );
      case "number":
        return st.answered === 0 ? null : (
          <dl className="facts">
            <div><dt>{s.average}</dt><dd>{n(st.average)}</dd></div>
            <div><dt>{s.min}</dt><dd>{n(st.min)}</dd></div>
            <div><dt>{s.max}</dt><dd>{n(st.max)}</dd></div>
          </dl>
        );
      case "dates":
        return st.answered === 0 ? null : (
          <dl className="facts">
            <div><dt>{s.first}</dt><dd>{formatDate(st.first + "T12:00:00Z", locale, "UTC")}</dd></div>
            <div><dt>{s.last}</dt><dd>{formatDate(st.last + "T12:00:00Z", locale, "UTC")}</dd></div>
          </dl>
        );
      case "files":
        return <p className="dim">{plural(s.files, st.files, locale)}</p>;
      case "ranks":
        return (
          <ol className="ranks">
            {st.items.map(i => (
              <li key={i.key}>
                <span className="bar-label">{i.label}</span>
                <span className="bar-value">{i.average ? format(s.rankAverage, { place: n(i.average) }) : "—"} <span className="dim">{plural(s.firsts, i.firsts, locale)}</span></span>
              </li>
            ))}
          </ol>
        );
      case "grid":
        return (
          <div className="table-wrap grid-wrap" tabIndex={0} role="region" aria-label={x.column.question.title}>
            <table className="grid-table">
              <thead><tr><th scope="col"><span className="visually-hidden">{s.row}</span></th>{st.columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
              <tbody>
                {st.rows.map(r => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    {r.cells.map((c, k) => <td key={k} style={{ ["--share" as string]: String(c.share / 100) }}>{c.count} <span className="dim">{format(s.percent, { share: n(c.share) })}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "texts":
        return st.latest.length === 0 ? null : (
          <>
            <p className="mini-label">{data.form.anonymous ? s.some : s.latest}</p>
            <ul className="texts">{st.latest.map((text, i) => <li key={i}>{text}</li>)}</ul>
            <a className="button link" href={`/chest/forms/${id}/answers`}>{s.seeAll}</a>
          </>
        );
    }
  };
  // The questions in the member's language when the form has it.
  const summaries = summarise(new Map([...data.versions].map(([n, d]) => [n, readIn(d, locale)])), data.answers, { yes: t.respond.yes, no: t.respond.no, other: t.respond.other });
  return (
    <div className="summary-page">
      {head}
      <p className="answers-count">{plural(t.answers.count, data.answers.length, locale)}</p>
      {data.versions.size > 1 && <p className="hint">{s.versions}</p>}
      {data.answers.length === 0 ? <EmptyState title={s.empty} /> : (
        <ol className="summary-list">
          {summaries.map(x => (
            <li key={x.column.question.id} className="summary-card">
              <h2><span className={`type-icon kind-${x.column.question.kind}`}><KindIcon kind={x.column.question.kind} /></span>{x.column.question.title}{x.column.removed && <span className="tag">{s.removed}</span>}</h2>
              <p className="hint">{plural(s.answered, x.stat.answered, locale)}</p>
              {body(x)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
