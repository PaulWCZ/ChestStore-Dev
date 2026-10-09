import { DataTable, StatusBadge } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";

// One part of the staff register (employees, or interns) in the kit's
// table: the row's name is its header (the whole row opens the record), a
// line lacking details says so in words (on screen only: the printed
// register is the register). Written on the server (dates, mentions); an
// island because the whole row is a link.
export type RegisterRow = { recordId: string; number: number; name: string; cells: string[]; gap: boolean };

export function RegisterTable({ caption, heads, rows, gap, labels }: { caption: string; heads: { number: string; name: string; rest: string[] }; rows: RegisterRow[]; gap: string; labels: TableWords }) {
  return (
    <DataTable
      caption={caption}
      rows={rows}
      rowKey={r => r.recordId}
      rowHref={r => `/chest/records/${r.recordId}`}
      labels={labels}
      columns={[
        { key: "number", label: heads.number, render: r => r.number, width: "narrow" },
        {
          key: "name", label: heads.name, rowHeader: true,
          render: r => <>{r.name}{r.gap && <span className="gap-mark no-print"><StatusBadge size="s" tone="wait" label={gap} /></span>}</>,
        },
        ...heads.rest.map((label, i) => ({ key: "c" + i, label, render: (r: RegisterRow) => r.cells[i] })),
      ]}
    />
  );
}
