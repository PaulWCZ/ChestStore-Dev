import { Avatar } from "@argentic/chest-ui/components";
import { Check, Cross, Maybe, Star } from "../../../../components/icons.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/index.ts";
import type { QuestionResult } from "../../../../lib/results.ts";

// The results of a poll, drawn on the server (the bars grow with CSS; no
// script). Names are given resolved: a map from member id to how the reader
// sees them ("You", "Camille Martin (former member)", "Former member").
export type DateLabel = { month: string; day: string; weekday: string; text: string; hours: string };
export type Named = Map<string, { name: string; photo: string | null }>;

type Props = {
  results: QuestionResult[];
  single: boolean;
  names: Named | null;
  dateLabels: Map<string, DateLabel>;
  finalOption: string | null;
  // A sign-up sheet has no "best" date: each slot fills up on its own.
  signup?: boolean;
  locale: string;
  t: Pick<Catalogue, "results" | "poll" | "people">;
};

function Voters({ ids, names, t, locale }: { ids: string[]; names: Named; t: Props["t"]; locale: string }) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, 6).map(id => names.get(id)?.name ?? t.people.unknown);
  const more = ids.length - shown.length;
  return <p className="voters">{shown.join(", ")}{more > 0 ? " " + plural(t.people.more, more, locale) : ""}</p>;
}

const cellIcon = (value: number | undefined) => (value === 2 ? <Check /> : value === 1 ? <Maybe /> : <Cross />);

export function DayBadge({ label }: { label: DateLabel }) {
  return (
    <span className="day-badge" aria-hidden="true">
      <span className="m">{label.month}</span>
      <span className="d">{label.day}</span>
      <span className="w">{label.weekday}</span>
    </span>
  );
}

export function Results({ results, single, names, dateLabels, finalOption, signup = false, locale, t }: Props) {
  return (
    <>
      {results.map(q => {
        const heading = single ? null : <h3>{q.text}</h3>;
        const answered = <p className="hint">{plural(t.results.answers, q.answered, locale)}</p>;
        if (q.kind === "choice") {
          return (
            <section key={q.id} className="q">
              {heading}
              {!single && answered}
              <div className="bars">
                {q.options.map(o => (
                  <div key={o.id} className={"bar-row" + (o.top ? " top" : "")}>
                    <div className="bar-label">
                      <span className="what">{o.label}{o.top && <span className="best-tag"><Star />{t.results.best}</span>}</span>
                      <span className="num"><strong>{format(t.results.percent, { value: o.percent })}</strong> · {plural(t.results.votes, o.count, locale)}</span>
                    </div>
                    <div className="bar" role="img" aria-label={format(t.results.percent, { value: o.percent })}><i style={{ ["--w" as string]: o.percent + "%" }} /></div>
                    {names && <Voters ids={o.voters} names={names} t={t} locale={locale} />}
                  </div>
                ))}
                {q.other && (
                  <div className="bar-row">
                    <div className="bar-label">
                      <span className="what">{t.poll.other}</span>
                      <span className="num"><strong>{format(t.results.percent, { value: q.other.percent })}</strong> · {plural(t.results.votes, q.other.count, locale)}</span>
                    </div>
                    <div className="bar" role="img" aria-label={format(t.results.percent, { value: q.other.percent })}><i style={{ ["--w" as string]: q.other.percent + "%" }} /></div>
                    {q.other.texts.length > 0 && (
                      <ul className="quotes">
                        {q.other.texts.map((x, i) => <li key={i}>{x.body}{x.member && names && <cite>{names.get(x.member)?.name ?? t.people.unknown}</cite>}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        }
        if (q.kind === "date") {
          const bestId = signup ? null : q.best;
          const lit = (id: string) => (id === finalOption ? " final" : id === bestId && !finalOption ? " best" : "");
          // The best date in words, above the grid: on a phone the grid
          // scrolls sideways, the answer stays in sight.
          const top = !finalOption && bestId ? q.options.find(o => o.id === bestId) : undefined;
          const topLabel = top ? dateLabels.get(top.id) : undefined;
          const bestLine = top && topLabel ? (
            <p className="best-line"><Star /><span><strong>{format(t.results.bestDate, { date: topLabel.text + (topLabel.hours ? " · " + topLabel.hours : "") })}</strong> · {plural(t.results.canMake, top.yes + top.maybe, locale)}</span></p>
          ) : null;
          if (names && q.grid.length > 0) {
            return (
              <section key={q.id} className="q">
                {bestLine}
                <div className="grid-wrap" tabIndex={0} role="region" aria-label={t.results.title}>
                  <table className="grid-table">
                    <thead>
                      <tr>
                        <th scope="col">{t.results.people}</th>
                        {q.options.map(o => {
                          const label = dateLabels.get(o.id)!;
                          return (
                            <th key={o.id} scope="col" className={lit(o.id).trim()}>
                              <span className="col-head">
                                {o.id === bestId && <span className="best-tag"><Star />{t.results.best}</span>}
                                <DayBadge label={label} />
                                <span className="time">{label.hours}</span>
                                <span className="visually-hidden">{label.text}</span>
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {q.grid.map((row, i) => {
                        const person = names.get(row.member);
                        return (
                          <tr key={i}>
                            <th scope="row"><span className="person"><Avatar name={person?.name ?? ""} photo={person?.photo ?? null} size="s" /><span className="name">{person?.name ?? t.people.unknown}</span></span></th>
                            {q.options.map(o => {
                              const value = row.values[o.id];
                              const word = value === 2 ? t.poll.yes : value === 1 ? t.poll.maybe : t.poll.no;
                              return <td key={o.id} className={lit(o.id).trim()}><span className={"cell v" + (value ?? 0)} title={word}>{cellIcon(value)}<span className="visually-hidden">{word}</span></span></td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">{t.results.total}</th>
                        {q.options.map(o => (
                          <td key={o.id} className={lit(o.id).trim()}>
                            <span className="tally"><strong>{o.yes + o.maybe}</strong><small>{format(t.results.yesMaybe, { yes: o.yes, maybe: o.maybe })}</small></span>
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            );
          }
          const most = Math.max(1, ...q.options.map(o => o.yes + o.maybe));
          return (
            <section key={q.id} className="q">
              {bestLine}
              <div className="bars">
                {q.options.map(o => {
                  const label = dateLabels.get(o.id)!;
                  const pct = Math.round(((o.yes + o.maybe) * 100) / Math.max(q.answered, 1));
                  return (
                    <div key={o.id} className={"bar-row" + (o.id === bestId ? " top" : "")}>
                      <div className="bar-label">
                        <span className="what">{label.text}{label.hours ? " · " + label.hours : ""}{o.id === bestId && <span className="best-tag"><Star />{t.results.best}</span>}</span>
                        <span className="num"><strong>{o.yes + o.maybe}</strong> · {format(t.results.yesMaybe, { yes: o.yes, maybe: o.maybe })}</span>
                      </div>
                      <div className="bar" role="img" aria-label={format(t.results.percent, { value: pct })}><i style={{ ["--w" as string]: Math.round(((o.yes + o.maybe) * 100) / most) + "%" }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        }
        if (q.kind === "scale") {
          const most = Math.max(1, ...q.counts.map(c => c.count));
          return (
            <section key={q.id} className="q">
              {heading}
              {answered}
              <div className="scale-result">
                <div className="average" aria-label={q.average === null ? t.results.noAnswers : format(t.results.average, { value: q.average.toLocaleString(locale) })}>
                  <strong>{q.average === null ? "–" : q.average.toLocaleString(locale)}</strong>
                  <span>/ 5</span>
                </div>
                <div>
                <div className="columns">
                  {q.counts.map(c => (
                    <div key={c.value} className={"col" + (c.count === most && c.count > 0 ? " top" : "")}>
                      <span className="stick" style={{ ["--h" as string]: Math.round((c.count * 100) / most) + "%" }} />
                      <b>{c.value}</b>
                      <small>{c.count}</small>
                    </div>
                  ))}
                </div>
                {(q.low || q.high) && <div className="scale-ends wide"><span>{q.low}</span><span>{q.high}</span></div>}
                </div>
              </div>
            </section>
          );
        }
        if (q.kind === "enps") {
          const bands = [
            { key: "detractors", label: t.results.detractors, count: q.bands.detractors, percent: q.percents.detractors },
            { key: "passives", label: t.results.passives, count: q.bands.passives, percent: q.percents.passives },
            { key: "promoters", label: t.results.promoters, count: q.bands.promoters, percent: q.percents.promoters },
          ];
          return (
            <section key={q.id} className="q">
              {heading}
              {answered}
              <div className="enps-result">
                <div className="average enps-score">
                  <strong>{q.score === null ? "–" : (q.score > 0 ? "+" : "") + q.score.toLocaleString(locale)}</strong>
                  <span>{t.results.enps}</span>
                </div>
                <div className="bars">
                  {bands.map(b => (
                    <div key={b.key} className={"bar-row band " + b.key}>
                      <div className="bar-label">
                        <span className="what">{b.label}</span>
                        <span className="num"><strong>{format(t.results.percent, { value: b.percent })}</strong> · {plural(t.results.votes, b.count, locale)}</span>
                      </div>
                      <div className="bar" role="img" aria-label={format(t.results.percent, { value: b.percent })}><i style={{ ["--w" as string]: b.percent + "%" }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="hint">{t.results.enpsExplain}</p>
            </section>
          );
        }
        return (
          <section key={q.id} className="q">
            {heading}
            {answered}
            {q.texts.length === 0 ? <p className="hint">{t.results.noAnswers}</p> : (
              <ul className="quotes">
                {q.texts.map((x, i) => <li key={i}>{x.body}{x.member && names && <cite>{names.get(x.member)?.name ?? t.people.unknown}</cite>}</li>)}
              </ul>
            )}
            {!names && q.texts.length > 1 && <p className="hint">{t.results.shuffled}</p>}
          </section>
        );
      })}
    </>
  );
}
