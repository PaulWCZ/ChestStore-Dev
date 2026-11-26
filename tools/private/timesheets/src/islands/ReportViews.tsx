import { DataTable, DateRangeField, SearchBox, Segmented, StatusBadge, type Column } from "@argentic/chest-ui/components";
import type { DateRange } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import type { SearchWords, TableWords } from "@argentic/chest-ui/components/logic";
import { Meter, Share } from "../components/gauges.tsx";
import type { Catalogue } from "../i18n/index.ts";

// The report's pieces that live in the browser: the grouping (the kit's
// Segmented — native radios the report's form sends as soon as one is
// chosen), a custom period (the kit's DateRangeField, in the reader's
// language), and the breakdown (the kit's DataTable).

export function GroupChoice<G extends string>({ label, value, options }: { label: string; value: G; options: { value: G; label: string }[] }) {
  const [chosen, setChosen] = useState(value);
  return <Segmented hideLabel={false} label={label} name="group" value={chosen} options={options} onChange={setChosen} />;
}

export function RangeFields({ from, to, today, label, labels, lang }: { from: string; to: string; today: string; label: string; labels: Catalogue["kit"]["date"]; lang: string }) {
  const [range, setRange] = useState<DateRange>({ from, to });
  return <DateRangeField label={label} value={range} onChange={setRange} today={today} names={{ from: "from", to: "to" }} labels={labels} lang={lang} />;
}

// Words of the notes, searched (the kit's SearchBox: a GET form, "/" to
// reach it): the report, the CSV and the list of entries found follow them.
export function NoteSearch({ value, keep, labels }: { value: string; keep: Record<string, string>; labels: SearchWords }) {
  return <SearchBox action="/chest/reports" value={value} keep={keep} labels={labels} maxLength={100} className="note-search" />;
}

// A line of the breakdown, written on the server (hours in the company's
// style, amounts in its currency, in the reader's language).
export type LineRow = {
  key: string; name: string; client: string | null; color: string | null;
  minutes: number; hours: string; share: number;
  billableMinutes: number; billable: string;
  cents: number; amount: string; costCents: number; cost: string; marginCents: number; margin: string; loss: boolean;
  budget: { share: number; text: string; state: "near" | "over" | "" } | null;
};
export type LineColumns = { money: boolean; cost: boolean; budget: boolean };
const cell = (text: string) => <span className="num">{text}</span>;

export function LinesTable({ rows, show, heading, totals, t, labels }: { rows: LineRow[]; show: LineColumns; heading: string; totals: { hours: string; billable: string; amount: string; cost: string; margin: string }; t: Catalogue["reports"] & { over: string; near: string }; labels: TableWords }) {
  const columns: Column<LineRow>[] = [
    {
      key: "name", label: heading, rowHeader: true, value: r => r.name, render: r => (
        <>
          <span className="line-name">
            {r.color && <span className={`swatch c-${r.color}`} aria-hidden="true" />}
            <span>
              <span className="p">{r.name}</span>
              {r.client !== null && <span className="c">{r.client}</span>}
            </span>
          </span>
          <Share value={r.share} />
        </>
      ),
    },
    { key: "hours", label: t.hours, align: "end", value: r => r.minutes, render: r => <span className="num">{r.hours}</span> },
    { key: "billable", label: t.billable, align: "end", hideOnPhone: true, value: r => r.billableMinutes, render: r => <span className="num">{r.billable}</span> },
    ...(show.money ? [{ key: "amount", label: t.amount, align: "end", value: (r: LineRow) => r.cents, render: (r: LineRow) => <span className="num">{r.amount}</span> } satisfies Column<LineRow>] : []),
    ...(show.cost ? [
      { key: "cost", label: t.cost, align: "end", hideOnPhone: true, value: (r: LineRow) => r.costCents, render: (r: LineRow) => <span className="num">{r.cost}</span> } satisfies Column<LineRow>,
      { key: "margin", label: t.margin, align: "end", hideOnPhone: true, value: (r: LineRow) => r.marginCents, render: (r: LineRow) => <span className={`num${r.loss ? " loss" : ""}`}>{r.margin}</span> } satisfies Column<LineRow>,
    ] : []),
    ...(show.budget ? [{
      key: "budget", label: t.budget, hideOnPhone: true, value: (r: LineRow) => r.budget?.share ?? -1, render: (r: LineRow) => r.budget ? (
        <span className={`budget ${r.budget.state}`}>
          <Meter value={r.budget.share} />
          <span className="small num">{r.budget.text}</span>
          {r.budget.state && <StatusBadge tone={r.budget.state === "over" ? "danger" : "wait"} size="s" label={r.budget.state === "over" ? t.over : t.near} />}
        </span>
      ) : <span className="muted small">–</span>,
    } satisfies Column<LineRow>] : []),
  ];
  return (
    <DataTable
      caption={heading}
      columns={columns}
      rows={rows}
      rowKey={r => r.key}
      totals={{ hours: cell(totals.hours), billable: cell(totals.billable), ...(show.money ? { amount: cell(totals.amount) } : {}), ...(show.cost ? { cost: cell(totals.cost), margin: cell(totals.margin) } : {}) }}
      labels={labels}
    />
  );
}
