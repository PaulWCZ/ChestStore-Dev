import { BlankSheet, Plus, Search } from "./icons.tsx";
import { Ledger } from "./ledger.tsx";
import { NewDocument } from "./new-document.tsx";
import type { ListRow } from "../lib/documents.ts";
import type { Catalogue, Locale } from "../lib/i18n/index.ts";
import { formatMoney } from "../lib/money.ts";
import { rowView } from "../lib/rows.ts";

// A list of quotes or of invoices: its filters (the states, as links that
// keep the search), a search box that works without script, the ledger.
export type Filter = { key: string; label: string; match: (r: ListRow) => boolean };

export function ListPage({ t, locale, path, title, intro, filters, current, q, rows, create, empty }: {
  t: Catalogue;
  locale: Locale;
  path: string;
  title: string;
  intro: string;
  filters: Filter[];
  current: string;
  q: string;
  rows: ListRow[];
  create: { type: "quote" | "invoice"; label: string } | null;
  empty: { title: string; body: string; action: string };
}) {
  const active = filters.find(f => f.key === current) ?? filters[0]!;
  const shown = rows.filter(active.match);
  const href = (key: string) => `${path}?${new URLSearchParams({ ...(key !== filters[0]!.key ? { state: key } : {}), ...(q ? { q } : {}) }).toString()}`.replace(/\?$/u, "");
  const currencies = new Set(shown.map(r => r.currency));
  const totalValue = shown.reduce((s, r) => s + (r.type === "credit" ? -r.gross : r.gross), 0);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        {create && <div className="actions"><NewDocument type={create.type} errors={t.errors}><Plus />{create.label}</NewDocument></div>}
      </div>
      {rows.length === 0 && !q ? (
        <div className="empty">
          <BlankSheet />
          <h2>{empty.title}</h2>
          <p>{empty.body}</p>
          {create && <div className="actions"><NewDocument type={create.type} errors={t.errors}><Plus />{empty.action}</NewDocument></div>}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <nav className="filters" aria-label={t.list.filters}>
              {filters.map(f => (
                <a key={f.key} href={href(f.key)} aria-current={f.key === active.key ? "true" : undefined}>
                  {f.label} <span className="n">{rows.filter(f.match).length}</span>
                </a>
              ))}
            </nav>
            <form className="search" role="search" action={path}>
              {active.key !== filters[0]!.key && <input type="hidden" name="state" value={active.key} />}
              <Search />
              <label className="visually-hidden" htmlFor="q">{t.list.search}</label>
              <input id="q" className="field" type="search" name="q" defaultValue={q} placeholder={t.list.searchPlaceholder} />
            </form>
          </div>
          {shown.length === 0 ? (
            <p className="muted">{t.list.none}</p>
          ) : (
            <Ledger
              rows={shown.map(r => rowView(r, t, locale))}
              head={t.list.head}
              {...(currencies.size === 1 && shown.length > 1 ? { total: { label: t.list.total, amount: formatMoney(totalValue, [...currencies][0]!, locale) } } : {})}
            />
          )}
        </>
      )}
    </main>
  );
}
