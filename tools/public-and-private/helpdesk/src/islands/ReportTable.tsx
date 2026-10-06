import { DataTable } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";

// A table of the reports, in the kit's DataTable (a row header per row, a
// sticky header, sorting by a click on a column that has numbers). The
// page gives plain cells: what each shows, and what it sorts by. On a
// phone each row is a small card of labelled lines (the kit's stacked
// rows): no table wider than the screen.
export type Cell = { text: string; sort: number | string | null };
export type ReportRow = { key: string; cells: Record<string, Cell> };

export function ReportTable({ caption, columns, rows, labels }: { caption: string; columns: { key: string; label: string; number?: boolean }[]; rows: ReportRow[]; labels: TableWords }) {
  return (
    <DataTable
      caption={caption}
      rows={rows}
      rowKey={r => r.key}
      labels={labels}
      phone="stack"
      columns={columns.map((c, i) => ({
        key: c.key,
        label: c.label,
        render: (r: ReportRow) => r.cells[c.key]?.text ?? "",
        value: (r: ReportRow) => r.cells[c.key]?.sort ?? null,
        ...(i === 0 ? { rowHeader: true } : {}),
        ...(c.number ? { align: "end" as const } : {}),
      }))}
    />
  );
}
