"use client";

import { DataTable } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";

// The Team page's tables, in the kit's table (sticky header and totals, a
// row header per person, a column sorted on a click): the figures come
// written by the server; the numbers kept beside them only sort.
export type PipelineRow = { key: string; href: string; name: string; open: number; value: number; valueText: string; share: number; weightedText: string; noStep: number; late: number };

export function PipelineTable({ rows, totals, words, labels }: { rows: PipelineRow[]; totals: { open: string; value: string; weighted: string; noStep: string; late: string }; words: { caption: string; person: string; open: string; value: string; weighted: string; noStep: string; late: string; total: string }; labels: TableWords }) {
  return (
    <DataTable caption={words.caption} labels={{ ...labels, total: words.total }} rows={rows} rowKey={r => r.key}
      columns={[
        { key: "person", label: words.person, rowHeader: true, value: r => r.name, render: r => <Link prefetch={false} href={r.href}>{r.name}</Link> },
        { key: "open", label: words.open, align: "end", value: r => r.open, render: r => <span className="num">{r.open}</span> },
        { key: "value", label: words.value, value: r => r.value, render: r => <span className="bar-cell"><span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${r.share}%` }} /></span><span className="num">{r.valueText}</span></span> },
        { key: "weighted", label: words.weighted, align: "end", hideOnPhone: true, render: r => <span className="num">{r.weightedText}</span> },
        { key: "noStep", label: words.noStep, align: "end", value: r => r.noStep, render: r => <span className={`num${r.noStep > 0 ? " warn-text" : ""}`}>{r.noStep}</span> },
        { key: "late", label: words.late, align: "end", value: r => r.late, render: r => <span className={`num${r.late > 0 ? " late-text" : ""}`}>{r.late}</span> },
      ]}
      totals={{ open: <span className="num">{totals.open}</span>, value: <span className="num">{totals.value}</span>, weighted: <span className="num">{totals.weighted}</span>, noStep: <span className="num">{totals.noStep}</span>, late: <span className="num">{totals.late}</span> }} />
  );
}

export type ResultRow = { key: string; name: string; months: ({ won: string | null; count: string } | null)[]; rate: string };

export function ResultsTable({ rows, months, words, labels }: { rows: ResultRow[]; months: string[]; words: { caption: string; person: string; winRate: string }; labels: TableWords }) {
  return (
    <div className="compact-table">
      <DataTable caption={words.caption} labels={labels} rows={rows} rowKey={r => r.key}
        columns={[
          { key: "person", label: words.person, rowHeader: true, render: r => r.name },
          ...months.map((m, i) => ({ key: "m" + i, label: m, align: "end" as const, render: (r: ResultRow) => {
            const x = r.months[i];
            return x ? <span className="num">{x.won && <span className="won-text">{x.won} </span>}<span className="muted small-text">{x.count}</span></span> : <span className="muted">—</span>;
          } })),
          { key: "rate", label: words.winRate, align: "end", render: r => <span className="num">{r.rate}</span> },
        ]} />
    </div>
  );
}
