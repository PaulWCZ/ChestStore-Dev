"use client";

import { DataTable } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";
import type { CSSProperties } from "react";

// Arrivals and departures month by month, in the kit's table: each figure
// written beside its bar (never a bar alone). Written on the server (the
// month's name, the figures); here only because the table is a client
// component.
export type MonthRow = { month: string; label: string; arrivals: number; departures: number; arrivalsText: string; departuresText: string };

const bar = (value: number, peak: number): CSSProperties => ({ width: `${(value / peak) * 100}%` });

export function MonthsTable({ caption, rows, peak, departures, heads, labels }: { caption: string; rows: MonthRow[]; peak: number; departures: boolean; heads: { month: string; arrivals: string; departures: string }; labels: TableWords }) {
  return (
    <DataTable
      caption={caption}
      rows={rows}
      rowKey={r => r.month}
      labels={labels}
      columns={[
        { key: "month", label: heads.month, render: r => r.label, rowHeader: true },
        { key: "arrivals", label: heads.arrivals, render: r => <span className="cell-bar"><span className="mini-bar in" style={bar(r.arrivals, peak)} /><span className="bar-value">{r.arrivalsText}</span></span> },
        ...(departures ? [{ key: "departures", label: heads.departures, render: (r: MonthRow) => <span className="cell-bar"><span className="mini-bar out" style={bar(r.departures, peak)} /><span className="bar-value">{r.departuresText}</span></span> }] : []),
      ]}
    />
  );
}
