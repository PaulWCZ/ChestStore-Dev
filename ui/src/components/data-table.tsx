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
import type { LinkComponent } from "./shell.js";
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
  // What the header shows instead of `label` (an icon with its word, a
  // line break); `label` stays its name (the phone's stacked rows, the
  // sort's announcement) (0.2.2).
  readonly header?: ReactNode;
  // A class of the tool's own on the column's cells (0.2.2).
  readonly className?: string;
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
  // The whole row opens this address: its header cell becomes the link
  // and a click anywhere in the row follows it; a row's own buttons and
  // links keep working (0.2.2).
  readonly rowHref?: (row: R) => string;
  // Next.js's Link for rowHref (a component: a server component may pass it).
  readonly link?: LinkComponent;
  // The first column stays in view while the table scrolls sideways (0.2.2).
  readonly stickyFirst?: boolean;
  // On a phone (under 640 px): "scroll" (default) keeps the table, which
  // scrolls sideways; "stack" shows each row as a card of labelled lines (0.2.2).
  readonly phone?: "scroll" | "stack";
  readonly className?: string;
  // The table's id (an anchor, a skip link) (0.2.2).
  readonly id?: string;
};

export type RowProps = { readonly className?: string | undefined } & { readonly [data: `data-${string}`]: string | number | boolean | undefined };

export function DataTable<R>({ caption, showCaption = false, columns, rows, rowKey, rowName, actions, totals, empty, sort, onSort, sortHref, labels = en.table, current, rowProps, rowHref, link, stickyFirst = false, phone = "scroll", className, id }: DataTableProps<R>): ReactElement {
  const [localSort, setLocalSort] = useState<Sort | null>(null);
  const controlled = sort !== undefined || onSort !== undefined || sortHref !== undefined;
  const active = controlled ? sort ?? null : localSort;
  const shownRows = !controlled && localSort ? sortRows(rows, columns.find(c => c.key === localSort.key)?.value ?? (() => null), localSort.dir) : rows;

  if (rows.length === 0 && empty) return <>{empty}</>;
  const align = (c: Column<R>) => (c.align && c.align !== "start" ? ` ck-align-${c.align}` : "");
  const hide = (c: Column<R>) => (c.hideOnPhone ? " ck-hide-phone" : "") + (c.width ? " ck-col-" + c.width : "") + (c.className ? " " + c.className : "");
  // The row's link sits in its header cell (the first column without one).
  const linkAt = rowHref ? Math.max(0, columns.findIndex(c => c.rowHeader)) : -1;
  const A: LinkComponent = link ?? (p => <a {...p} />);
  const tableClass = `ck-table${stickyFirst ? " ck-table-sticky" : ""}${phone === "stack" ? " ck-table-stack" : ""}${rowHref ? " ck-table-linked" : ""}`;

  return (
    <div className={`ck-table-wrap${className ? " " + className : ""}`} role="region" aria-label={fill(labels.scroll, { caption })} tabIndex={0}>
      <table className={tableClass} {...(id ? { id } : {})}>
        <caption className={showCaption ? "ck-caption" : "ck-vh"}>{caption}</caption>
        <thead>
          <tr>
            {columns.map(c => {
              const sortable = c.value !== undefined;
              const state = ariaSort(active, c.key);
              const next = nextSort(active, c.key);
              const shown = c.header ?? c.label;
              const inner = <>{shown}<SortIcon dir={state === "ascending" ? "asc" : state === "descending" ? "desc" : "none"} /></>;
              return (
                <th key={c.key} scope="col" aria-sort={sortable && state !== "none" ? state : undefined} className={`${align(c)}${hide(c)}`.trim() || undefined}>
                  {!sortable ? shown : sortHref ? (
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
                {columns.map((c, i) => {
                  const raw = c.render ? c.render(row) : String(c.value?.(row) ?? "");
                  const content = i === linkAt ? <A href={rowHref!(row)} className="ck-row-link">{raw}</A> : raw;
                  const cls = `${align(c)}${hide(c)}`.trim() || undefined;
                  // The stacked phone layout names each line by its column.
                  const named = phone === "stack" ? { "data-label": c.label } : {};
                  return c.rowHeader ? <th key={c.key} scope="row" className={cls} {...named}>{content}</th> : <td key={c.key} className={cls} {...named}>{content}</td>;
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
                const named = phone === "stack" && i > 0 ? { "data-label": c.label } : {};
                return i === 0 ? <th key={c.key} scope="row" className={cls}>{content}</th> : <td key={c.key} className={`${cls ?? ""}${content === null || content === undefined ? " ck-empty-cell" : ""}`.trim() || undefined} {...named}>{content}</td>;
              })}
              {actions && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
