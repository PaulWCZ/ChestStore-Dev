import { EmptyState, Filters, PageHeader, SearchBox } from "@argentic/chest-ui/components";
import { BlankSheet, Plus } from "./icons.tsx";
import { DocTable } from "./doc-table.tsx";
import { NewDocument } from "./new-document.tsx";
import type { ListRow } from "../lib/documents.ts";
import type { Catalogue, Locale } from "../lib/i18n/index.ts";
import { formatMoney } from "../lib/money.ts";
import { rowView } from "../lib/rows.ts";

// A list of quotes or of invoices: its filters (the states, as links that
// keep the search: the kit's Filters), a search box that works without
// script ("/" reaches it), the ledger (the kit's DataTable) with the total
// of what is shown.
export type Filter = { key: string; label: string; match: (r: ListRow) => boolean };

export function ListPage({ t, locale, path, title, intro, filters, current, q, rows, create, empty, more, readerEmpty }: {
  t: Catalogue;
  locale: Locale;
  path: string;
  title: string;
  intro: string;
  // The first one is "all" (no filter).
  filters: Filter[];
  current: string;
  q: string;
  rows: ListRow[];
  create: { type: "quote" | "invoice"; label: string } | null;
  empty: { title: string; body: string; action: string };
  // A quieter second way in (import the invoices still to collect).
  more?: { href: string; label: string } | null;
  // What an empty list says to someone who cannot write here (a viewer).
  readerEmpty: string;
}) {
  const [all, ...states] = filters;
  const active = states.find(f => f.key === current) ?? all!;
  const shown = rows.filter(active.match);
  const currencies = new Set(shown.map(r => r.currency));
  const totalValue = shown.reduce((s, r) => s + (r.type === "credit" ? -r.gross : r.gross), 0);
  const params = { ...(active !== all ? { state: active.key } : {}), ...(q ? { q } : {}) };
  const h = t.list.head;
  return (
    <div className="page">
      {/* Empty, the page's one action is the empty state's: no header button. */}
      <PageHeader size="m" title={title} intro={intro}
        secondary={more && (rows.length > 0 || q) ? <a className="button quiet" href={more.href}>{more.label}</a> : undefined}
        action={create && (rows.length > 0 || q) ? <NewDocument type={create.type} errors={t.errors}><Plus />{create.label}</NewDocument> : undefined} />
      {rows.length === 0 && !q ? (
        <EmptyState icon={<BlankSheet />} title={empty.title} body={create ? empty.body : readerEmpty}
          action={create ? (
            <>
              <NewDocument type={create.type} errors={t.errors}><Plus />{empty.action}</NewDocument>
              {more && <a className="button quiet" href={more.href}>{more.label}</a>}
            </>
          ) : more ? <a className="button quiet" href={more.href}>{more.label}</a> : undefined} />
      ) : (
        <>
          <div className="toolbar">
            <Filters path={path} params={params} labels={t.filters}
              groups={[{ key: "state", label: t.list.filters, all: true, options: states.map(f => ({ value: f.key, label: f.label, count: rows.filter(f.match).length })) }]} />
            <SearchBox action={path} value={q} keep={{ state: params.state }} labels={t.searchBox} maxLength={80} />
          </div>
          {shown.length === 0 ? (
            <p className="muted" role="status">{t.list.none}</p>
          ) : (
            <DocTable
              rows={shown.map(r => rowView(r, t, locale))}
              words={{ caption: title, number: h.number, client: h.client, what: h.what, date: h.date, amount: h.amount, state: h.state, total: t.list.total }}
              labels={t.table}
              total={currencies.size === 1 && shown.length > 1 ? formatMoney(totalValue, [...currencies][0]!, locale) : null}
            />
          )}
        </>
      )}
    </div>
  );
}
