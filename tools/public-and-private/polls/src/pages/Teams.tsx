import { People } from "../components/icons.tsx";
import { fill as format, type Catalogue, type Format } from "../i18n/index.ts";
import type { TeamResult } from "../lib/teams.ts";

// An anonymous survey read per team, once closed (lib/teams.ts): a table,
// one row per group that may show, one column per question — a 1–5
// question's average, eNPS, a choice's most given answer — and how many
// answered. How many groups stay hidden, and why, is said under it.
type Props = { teams: TeamResult[]; hidden: number; f: Format; t: Pick<Catalogue, "results"> };

export function TeamsCard({ teams, hidden, f, t }: Props) {
  const n = (v: number, digits = 1) => f.number(v, digits);
  const columns = teams[0]?.results ?? [];
  return (
    <section className="card teams-card" aria-labelledby="by-team">
      <h2 id="by-team"><People />{t.results.byTeam}</h2>
      {teams.length === 0 ? <p className="hint">{t.results.noTeams}</p> : (
        <div className="table-frame" tabIndex={0} role="region" aria-labelledby="by-team">
          <table className="teams-table">
            <thead>
              <tr>
                <th scope="col">{t.results.team}</th>
                {columns.map(q => <th key={q.id} scope="col">{q.text}{q.kind === "scale" ? <small>{t.results.average5}</small> : q.kind === "enps" ? <small>{t.results.enps}</small> : null}</th>)}
                <th scope="col" className="num">{t.results.answers5}</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team.id}>
                  <th scope="row">{team.name}</th>
                  {team.results.map(q => {
                    if (q.kind === "scale") return <td key={q.id} className="num">{q.average === null ? "—" : n(q.average)}</td>;
                    if (q.kind === "enps") return <td key={q.id} className="num">{q.score === null ? "—" : (q.score > 0 ? "+" : "") + n(q.score, 0)}</td>;
                    if (q.kind === "choice") {
                      const top = [...q.options].sort((a, b) => b.count - a.count)[0];
                      return <td key={q.id}>{top && top.count > 0 ? format(t.results.topAnswer, { answer: top.label, value: top.percent }) : "—"}</td>;
                    }
                    return <td key={q.id}>—</td>;
                  })}
                  <td className="num">{team.answered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{t.results.teamsHint}</p>
      {hidden > 0 && <p className="hint">{f.plural(t.results.hiddenTeams, hidden)}</p>}
    </section>
  );
}
