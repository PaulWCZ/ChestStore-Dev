"use client";

// DataTable: a list of records as a real table — the header stays while
// the list scrolls, a column sorts on a click (aria-sort says how), totals
// sit at the bottom, each row may have a menu of rare actions, and an
// empty list shows the tool's empty state instead of a bare header.
//
// Sorting: controlled by the tool (`sort` + `onSort`, or `sortHref` for a
// sort kept in the address and done by the server), or, without them, done
// here on the rows given — only after a click, so the first render (server
// and browser) shows the rows in the tool's order.
import { useState, type ReactElement, type ReactNode } from "react";
import { SortIcon } from "./icons.js";
import { ariaSort, nextSort, sortRows, type Sort, type SortValue } from "./lists.js";
import { Menu, type MenuItem } from "./menu.js";
import { fill } from "./text.js";
import { en, type TableWords } from "./words.js";

export type Column<R> = {
  readonly key: string;
  readonly label: string;
  // What the cell shows (default: the value as text).
  readonly render?: (row: R) => ReactNode;
  // What the column sorts by; a column without it does not sort.
  readonly value?: (row: R) => SortValue;
  readonly align?: "start" | "end" | "center";
  // The row's header cell (its name): read before each cell by screen readers.
  readonly rowHeader?: boolean;
  // Hidden under this width, as a CSS class: "ck-hide-phone".
  readonly hideOnPhone?: boolean;
  readonly width?: "narrow" | "wide";
};

export type DataTableProps<R> = {
  readonly caption: string;
  // Shown, not only read (a heading above the table is often enough).
  readonly showCaption?: boolean;
  readonly columns: readonly Column<R>[];
  readonly rows: readonly R[];
  readonly rowKey: (row: R) => string;
  // The row's name for its actions' label ("Actions for Invoice 2026-014").
  readonly rowName?: (row: R) => string;
  readonly actions?: (row: R) => readonly MenuItem[];
  readonly totals?: Readonly<Record<string, ReactNode>>;
  readonly empty?: ReactNode;
  readonly sort?: Sort | null;
  readonly onSort?: (sort: Sort) => void;
  readonly sortHref?: (sort: Sort) => string;
  readonly labels?: TableWords;
  // A row the person is looking at (just added, opened).
  readonly current?: string | null;
  // A row's own class and data- attributes (a past booking, a late
  // invoice), for the tool's CSS; its meaning is also said in a cell (0.2.1).
  readonly rowProps?: (row: R) => RowProps;
};

export type RowProps = { readonly className?: string } & { readonly [data: `data-${string}`]: string | number | boolean | undefined };

export function DataTable<R>({ caption, showCaption = false, columns, rows, rowKey, rowName, actions, totals, empty, sort, onSort, sortHref, labels = en.table, current, rowProps }: DataTableProps<R>): ReactElement {
  const [localSort, setLocalSort] = useState<Sort | null>(null);
  const controlled = sort !== undefined || onSort !== undefined || sortHref !== undefined;
  const active = controlled ? sort ?? null : localSort;
  const shownRows = !controlled && localSort ? sortRows(rows, columns.find(c => c.key === localSort.key)?.value ?? (() => null), localSort.dir) : rows;

  if (rows.length === 0 && empty) return <>{empty}</>;
  const align = (c: Column<R>) => (c.align && c.align !== "start" ? ` ck-align-${c.align}` : "");
  const hide = (c: Column<R>) => (c.hideOnPhone ? " ck-hide-phone" : "") + (c.width ? " ck-col-" + c.width : "");

  return (
    <div className="ck-table-wrap" role="region" aria-label={fill(labels.scroll, { caption })} tabIndex={0}>
      <table className="ck-table">
        <caption className={showCaption ? "ck-caption" : "ck-vh"}>{caption}</caption>
        <thead>
          <tr>
            {columns.map(c => {
              const sortable = c.value !== undefined;
              const state = ariaSort(active, c.key);
              const next = nextSort(active, c.key);
              const inner = <>{c.label}<SortIcon dir={state === "ascending" ? "asc" : state === "descending" ? "desc" : "none"} /></>;
              return (
                <th key={c.key} scope="col" aria-sort={sortable && state !== "none" ? state : undefined} className={`${align(c)}${hide(c)}`.trim() || undefined}>
                  {!sortable ? c.label : sortHref ? (
                    <a className="ck-sort" href={sortHref(next)}>{inner}</a>
                  ) : (
                    <button type="button" className="ck-sort" onClick={() => (onSort ? onSort(next) : setLocalSort(next))}>{inner}</button>
                  )}
                </th>
              );
            })}
            {actions && <th scope="col" className="ck-col-actions"><span className="ck-vh">{labels.rowActions}</span></th>}
          </tr>
        </thead>
        <tbody>
          {shownRows.map(row => {
            const key = rowKey(row);
            const extra = rowProps?.(row) ?? {};
            // Only a class and data- attributes: never an event, a style or an ARIA state the table owns.
            const own = Object.fromEntries(Object.entries(extra).filter(([k, v]) => k.startsWith("data-") && v !== undefined));
            return (
              <tr key={key} {...own} {...(extra.className ? { className: extra.className } : {})} aria-current={current === key ? "true" : undefined}>
                {columns.map(c => {
                  const content = c.render ? c.render(row) : String(c.value?.(row) ?? "");
                  const cls = `${align(c)}${hide(c)}`.trim() || undefined;
                  return c.rowHeader ? <th key={c.key} scope="row" className={cls}>{content}</th> : <td key={c.key} className={cls}>{content}</td>;
                })}
                {actions && (
                  <td className="ck-col-actions">
                    {(() => {
                      const items = actions(row);
                      return items.length > 0 ? <Menu label={rowName ? fill(labels.rowActionsFor, { name: rowName(row) }) : labels.rowActions} items={items} /> : null;
                    })()}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {columns.map((c, i) => {
                const cls = `${align(c)}${hide(c)}`.trim() || undefined;
                const content = totals[c.key] ?? (i === 0 ? labels.total : null);
                return i === 0 ? <th key={c.key} scope="row" className={cls}>{content}</th> : <td key={c.key} className={cls}>{content}</td>;
              })}
              {actions && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
