import type { ListRow, State } from "./documents.ts";
import { format, formatDay, type Catalogue, type Locale } from "./i18n/index.ts";
import { formatMoney } from "./money.ts";

// What a list shows of a document, as plain data in the reader's words:
// views (client components) get these, never the services' rows. Dates
// and amounts are written here, on the server.
export type RowView = {
  id: string;
  href: string;
  number: string | null;
  kind: string;
  who: string;
  what: string;
  date: string;
  // The day the list sorts by (ISO), and the amount in minor units (a
  // credit note negative).
  sortDate: string;
  value: number;
  amount: string;
  sub: string | null;
  state: State;
  stateText: string;
};

export function kindOf(r: Pick<ListRow, "type" | "depositPercent">, t: Catalogue): string {
  return r.type === "credit" ? t.types.credit : r.type === "quote" ? t.types.quote : r.depositPercent !== null ? t.types.deposit : t.types.invoice;
}

export function rowView(r: ListRow, t: Catalogue, locale: Locale): RowView {
  const day = (d: string | null) => (d ? formatDay(d, locale) : "");
  const date = r.status === "draft" ? format(t.list.edited, { date: formatDay(r.updatedAt.slice(0, 10), locale) })
    : r.type === "quote" ? day(r.issueDate)
    : r.type === "invoice" ? format(t.list.due, { date: day(r.dueDate) })
    : day(r.issueDate);
  const sub = r.type === "invoice" && r.status === "final" && r.due > 0 && r.due < r.gross ? format(t.list.left, { amount: formatMoney(r.due, r.currency, locale) }) : null;
  return {
    id: r.id,
    href: `/chest/documents/${r.id}`,
    number: r.number,
    kind: kindOf(r, t),
    who: r.clientName || t.list.noClient,
    what: r.title || kindOf(r, t),
    date,
    sortDate: r.status === "draft" ? r.updatedAt.slice(0, 10) : r.type === "invoice" ? r.dueDate ?? r.issueDate ?? "" : r.issueDate ?? "",
    value: r.type === "credit" ? -r.gross : r.gross,
    amount: formatMoney(r.type === "credit" ? -r.gross : r.gross, r.currency, locale),
    sub,
    state: r.state,
    stateText: t.states[r.state],
  };
}

// A country's name in a language ("BE" → "Belgique"), from Intl.
export function countryName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
