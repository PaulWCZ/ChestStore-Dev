import { DataTable } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";

// Arrivals and departures month by month, in the kit's table: each figure
// written beside its bar (never a bar alone). Written on the server (the
// month's name, the figures, each bar's length as a class pct-0…pct-100:
// the policy refuses style attributes).
export type MonthRow = { month: string; label: string; arrivalsText: string; departuresText: string; arrivalsPct: number; departuresPct: number };

export function MonthsTable({ caption, rows, departures, heads, labels }: { caption: string; rows: MonthRow[]; departures: boolean; heads: { month: string; arrivals: string; departures: string }; labels: TableWords }) {
  return (
    <DataTable
      caption={caption}
      rows={rows}
      rowKey={r => r.month}
      labels={labels}
      columns={[
        { key: "month", label: heads.month, render: r => r.label, rowHeader: true },
        { key: "arrivals", label: heads.arrivals, render: r => <span className="cell-bar"><span className={`mini-bar in pct-${r.arrivalsPct}`} /><span className="bar-value">{r.arrivalsText}</span></span> },
        ...(departures ? [{ key: "departures", label: heads.departures, render: (r: MonthRow) => <span className="cell-bar"><span className={`mini-bar out pct-${r.departuresPct}`} /><span className="bar-value">{r.departuresText}</span></span> }] : []),
      ]}
    />
  );
}
