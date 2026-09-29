"use client";

import { DataTable, type Column } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";
import type { ReactNode } from "react";
import type { RowView } from "../lib/rows.ts";
import { Stamp } from "./stamp.tsx";

// A list of documents, as a ledger: the kit's DataTable — its header stays
// while the list scrolls, a column sorts on a click, the total of what is
// shown sits at the bottom. The whole row opens the document (its number,
// or the kind of a draft, is the link). On a phone each document is a card
// of labelled lines (the kit's stacked rows); the date goes.
export type DocTableWords = { caption: string; number: string; client: string; what: string; date: string; amount: string; state: string; total: string };

export function DocTable({ rows, words, labels, total, empty }: { rows: RowView[]; words: DocTableWords; labels: TableWords; total?: string | null; empty?: ReactNode }) {
  const columns: Column<RowView>[] = [
    { key: "number", label: words.number, rowHeader: true, width: "narrow", value: r => r.number ?? "", render: r => <span className={r.number ? "doc-link" : "doc-link none"}>{r.number ?? r.kind}</span> },
    { key: "client", label: words.client, value: r => r.who, render: r => <span className="who">{r.who}</span> },
    { key: "what", label: words.what, render: r => <span className="what">{r.what}</span> },
    { key: "date", label: words.date, value: r => r.sortDate, render: r => <span className="date">{r.date}</span>, hideOnPhone: true, width: "narrow" },
    { key: "amount", label: words.amount, align: "end", width: "narrow", value: r => r.value, render: r => <span className="amount">{r.amount}{r.sub && <small>{r.sub}</small>}</span> },
    { key: "state", label: words.state, align: "end", width: "narrow", render: r => <Stamp state={r.state} label={r.stateText} /> },
  ];
  return (
    <DataTable
      className="doc-table"
      caption={words.caption}
      columns={columns}
      rows={rows}
      rowKey={r => r.id}
      rowHref={r => r.href}
      phone="stack"
      labels={{ ...labels, total: words.total }}
      rowProps={r => ({ "data-state": r.state })}
      {...(total ? { totals: { amount: <span className="amount">{total}</span> } } : {})}
      {...(empty ? { empty } : {})}
    />
  );
}
