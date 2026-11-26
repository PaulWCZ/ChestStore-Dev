import { DataTable, type Column } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";
import { StageBadge } from "./stage-badge.tsx";
import { format } from "../i18n/format.ts";
import { RowCheck } from "./bulk.tsx";

// A deal of the list, written by the server (money, days, names in the
// reader's language): the browser only lays it out.
export type DealRow = {
  id: string;
  title: string;
  company: { id: string; name: string } | null;
  value: string;
  stage: string;
  kind: "open" | "won" | "lost";
  probability: string;
  close: string | null;
  owner: string;
  step: { text: string; late: boolean } | null;
  noStep: string;
};
type Words = { caption: string; select: string; selectOne: string; title: string; company: string; value: string; stage: string; probability: string; close: string; owner: string; step: string };

// The deals as the kit's table (sticky header, a row header per deal, the
// less useful columns hidden on a phone), in the server's order (the list
// is paged: a sort here would only sort one page). A tick per row when the
// person may change many at once.
export function DealTable({ rows, writes, words, labels }: { rows: DealRow[]; writes: boolean; words: Words; labels: TableWords }) {
  const columns: Column<DealRow>[] = [
    ...(writes ? [{ key: "check", label: words.select, width: "narrow" as const, render: (d: DealRow) => <RowCheck id={d.id} label={format(words.selectOne, { name: d.title })} /> }] : []),
    { key: "title", label: words.title, rowHeader: true, render: d => <><a className="strong" href={`/chest/deals/${d.id}`}>{d.title}</a>{d.company && <span className="show-phone muted small-text">{d.company.name}</span>}</> },
    { key: "company", label: words.company, hideOnPhone: true, render: d => (d.company ? <a href={`/chest/companies/${d.company.id}`}>{d.company.name}</a> : <span className="muted">—</span>) },
    { key: "value", label: words.value, align: "end", render: d => <span className="num">{d.value}</span> },
    { key: "stage", label: words.stage, render: d => <StageBadge kind={d.kind} name={d.stage} /> },
    { key: "probability", label: words.probability, align: "end", hideOnPhone: true, render: d => <span className="num">{d.probability}</span> },
    { key: "close", label: words.close, hideOnPhone: true, render: d => (d.close ? <span className="num">{d.close}</span> : <span className="muted">—</span>) },
    { key: "owner", label: words.owner, hideOnPhone: true, render: d => d.owner },
    { key: "step", label: words.step, hideOnPhone: true, render: d => (d.step ? <span className={d.step.late ? "due late" : ""}>{d.step.text}</span> : <span className="muted">{d.noStep}</span>) },
  ];
  return <DataTable caption={words.caption} columns={columns} rows={rows} rowKey={d => d.id} labels={labels} />;
}
