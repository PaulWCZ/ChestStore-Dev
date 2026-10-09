import { DataTable } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";
import { FollowBadge } from "../components/state-badge.tsx";

export type AnswerRow = {
  id: string;
  when: string;
  // The order of "When" (the list comes sorted by the server).
  at: string;
  who: string;
  email: string | null;
  cells: Record<string, string>;
  status: string;
  statusLabel: string;
  href: string;
  openLabel: string;
};

// The answers as the kit's table: the header stays while the list
// scrolls, "When" sorts newest or oldest first (kept in the address, done
// by the server), who answered is each row's header; the whole row opens
// its answer. On a phone each answer is a card: who, when, the first three
// answers, where it stands (the kit's stacked layout).
export function AnswersTable({ rows, columns, sort, sortBase, t }: {
  rows: AnswerRow[];
  columns: { id: string; title: string }[];
  sort: "newest" | "oldest";
  // The list's address without its order.
  sortBase: string;
  t: { caption: string; when: string; who: string; status: string; open: string; empty: string; table: TableWords };
}) {
  return (
    <DataTable<AnswerRow>
      caption={t.caption}
      rows={rows}
      rowKey={r => r.id}
      rowName={r => r.who}
      phone="stack"
      rowHref={r => r.href}
      sort={{ key: "when", dir: sort === "oldest" ? "asc" : "desc" }}
      sortHref={s => `${sortBase}${sortBase.includes("?") ? "&" : "?"}${s.dir === "asc" ? "sort=oldest" : ""}`.replace(/[?&]$/u, "")}
      columns={[
        { key: "when", label: t.when, value: r => r.at, render: r => <span className="nowrap">{r.when}</span>, width: "narrow" },
        // The row's header is the link to the answer: the address as text
        // (a link inside a link is not HTML; the answer's page has "Write").
        { key: "who", label: t.who, rowHeader: true, render: r => r.email ?? r.who },
        ...columns.map((c, i) => ({ key: `q-${c.id}`, label: c.title, hideOnPhone: i > 2, render: (r: AnswerRow) => r.cells[c.id] || <span className="dim">—</span> })),
        { key: "status", label: t.status, render: r => <FollowBadge state={r.status} label={r.statusLabel} /> },
        { key: "open", label: t.open, hideOnPhone: true, render: r => <a className="button small quiet" href={r.href} aria-label={r.openLabel}>{t.open}</a>, align: "end" },
      ]}
      labels={t.table}
    />
  );
}
