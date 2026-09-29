"use client";

import { Avatar, DataTable, type Column } from "@argentic/chest-ui/components";
import Link from "next/link";
import type { Catalogue } from "../../../lib/i18n/index.ts";

export type PersonRow = {
  id: string;
  name: string;
  // The Chest's name and photo, for the avatar (never the "(former
  // member)" note: the initials are the person's).
  avatarName: string;
  photo: string | null;
  number: string | null;
  // The approver's name, or the last day (the Former list).
  second: string;
  // Days left of each counted kind, as written, or null when not set up;
  // and the number, for sorting.
  balances: { text: string | null; value: number | null }[];
  waiting: string;
  waitingDays: number;
};

type Words = { team: Catalogue["team"]; table: Catalogue["table"] };

// Everyone HR sees (or the people a manager answers for) as the kit's
// table: a sticky header, sortable columns, the person's name as the row's
// header (a link to their page, where their approver, dates and balances
// are changed).
export function PeopleTable({ rows, kinds, former, t }: { rows: PersonRow[]; kinds: string[]; former: boolean; t: Words }) {
  const columns: Column<PersonRow>[] = [
    {
      key: "person",
      label: t.team.person,
      rowHeader: true,
      value: r => r.name,
      render: r => (
        <>
          <Link className="person-link" href={`/chest/people/${r.id}`}><Avatar name={r.avatarName} photo={r.photo} size="s" />{r.name}</Link>
          {r.number && <span className="muted small number">{r.number}</span>}
        </>
      ),
    },
    { key: "second", label: former ? t.team.lastDay : t.team.approver, value: r => r.second },
    ...kinds.map((kind, i): Column<PersonRow> => ({
      key: `k${i}`,
      label: kind,
      align: "end",
      value: r => r.balances[i]?.value ?? null,
      render: r => (r.balances[i]?.text !== null && r.balances[i]?.text !== undefined ? <span className="figure">{r.balances[i]!.text}</span> : <span className="muted">{t.team.notSet}</span>),
    })),
    ...(former ? [] : [{ key: "waiting", label: t.team.pending, align: "end" as const, value: (r: PersonRow) => r.waitingDays, render: (r: PersonRow) => r.waiting }]),
  ];
  return <DataTable caption={t.team.title} columns={columns} rows={rows} rowKey={r => r.id} labels={t.table} />;
}
