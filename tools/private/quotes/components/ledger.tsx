import type { RowView } from "../lib/rows.ts";

// A list of documents, as a ledger: number, client and subject, date,
// amount, state. Each row is one link (the whole row is its target).
export function Ledger({ rows, head, total }: { rows: RowView[]; head: { number: string; client: string; what: string; date: string; amount: string; state: string }; total?: { label: string; amount: string } }) {
  return (
    <div className="ledger">
      <div className="ledger-head" aria-hidden="true">
        <span>{head.number}</span>
        <span>{head.client}</span>
        <span>{head.what}</span>
        <span>{head.date}</span>
        <span className="amount">{head.amount}</span>
        <span className="state">{head.state}</span>
      </div>
      <ul className="plain">
        {rows.map(r => (
          <li key={r.id} className="ledger-row">
            <a className="main" href={r.href}><span className="visually-hidden">{[r.kind, r.number ?? r.stateText, r.who, r.what, r.amount, r.stateText].join(", ")}</span></a>
            <span className={r.number ? "number" : "number none"} aria-hidden="true">{r.number ?? r.kind}</span>
            <span className="who" aria-hidden="true">{r.who}</span>
            <span className="what" aria-hidden="true">{r.what}</span>
            <span className="date" aria-hidden="true">{r.date}</span>
            <span className="amount" aria-hidden="true">{r.amount}{r.sub && <small>{r.sub}</small>}</span>
            <span className="state" aria-hidden="true"><span className={`stamp ${r.state}`}>{r.stateText}</span></span>
          </li>
        ))}
      </ul>
      {total && <div className="foot"><span>{total.label}</span><span className="num">{total.amount}</span></div>}
    </div>
  );
}
