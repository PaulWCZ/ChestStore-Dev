import type { Expense, Warning } from "./expenses.ts";
import { dot, format, formatDate, shortDate, type Catalogue, type Locale } from "../i18n/index.ts";
import { thumbnailTypes } from "../shared/model.ts";
import { formatMoney } from "../shared/money.ts";
import type { Allowance, Category } from "./settings.ts";
import { allowanceDetail, allowanceName, categoryName, km } from "../shared/words.ts";

// What a page shows of an expense, as plain data in the reader's words:
// views (client components) get these, never the services' rows.
export type StampKind = "draft" | "refused" | "submitted" | "approved" | "paid" | "imported";
export type RowView = {
  id: string;
  href: string;
  day: string;
  month: string;
  // The day in one line, as every list writes it (shortDate).
  date: string;
  what: string;
  sub: string;
  amount: string;
  stamp: { kind: StampKind; text: string };
  card: boolean;
  // A company card payment of a statement, still without its receipt.
  receiptNeeded: boolean;
  thumb: string | null;
  // The receipt itself (opens in a new tab) and a large preview of a photo.
  open: string | null;
  preview: string | null;
  icon: "receipt" | "car" | "pdf" | "flat" | "none";
  warnings: string[];
  reason: string | null;
};

export function stampOf(e: Expense, t: Catalogue): { kind: StampKind; text: string } {
  const kind: StampKind = e.imported ? "imported" : e.status === "draft" && e.refusedReason ? "refused" : e.status;
  return { kind, text: t.status[kind] };
}

export function warningText(w: Warning, t: Catalogue, currency: string, locale: Locale): string {
  if (w.code === "over_cap") return format(t.warnings.over_cap, { cap: formatMoney(w.cap ?? 0, currency, locale) });
  if (w.code === "resent") return format(t.warnings.resent, { reason: w.reason ?? "" });
  return t.warnings[w.code];
}

export type RowContext = { t: Catalogue; locale: Locale; categories: Map<string, Category>; allowances?: Map<string, Allowance>; warnings?: Map<string, Warning[]>; currency: string; who?: string };

// What a flat rate reads as: its name, and "3 nights × €56.80".
export function allowanceWords(e: Expense, ctx: Pick<RowContext, "t" | "locale" | "allowances">): { name: string; detail: string } | null {
  if (!e.allowance) return null;
  const a = ctx.allowances?.get(e.allowance.id);
  const each = formatMoney(Math.round(e.amount / e.allowance.units), e.currency, ctx.locale);
  return { name: allowanceName(a, ctx.t), detail: allowanceDetail(e.allowance.units, a?.unit ?? "day", each, ctx.t, ctx.locale) };
}

export function rowView(e: Expense, ctx: RowContext): RowView {
  const { t, locale } = ctx;
  const category = categoryName(ctx.categories.get(e.categoryId), t);
  const date = new Date(e.spentOn + "T12:00:00Z");
  const flat = allowanceWords(e, ctx);
  const what = e.trip ? format(t.trip.detail, { from: e.trip.from, to: e.trip.to }) : flat ? flat.name || category : e.merchant || category;
  const subParts = e.trip ? [format(t.trip.km, { km: km(e.trip.distance, locale) })] : flat ? [flat.detail] : e.merchant ? [category] : [];
  if (ctx.who) subParts.unshift(ctx.who);
  if (e.base !== null && e.baseCurrency && e.baseCurrency !== e.currency) subParts.push(format(t.form.converted, { amount: formatMoney(e.base, e.baseCurrency, locale) }));
  return {
    id: e.id,
    href: `/chest/expenses/${e.id}`,
    day: formatDate(date, locale, { day: "numeric" }),
    month: formatDate(date, locale, { month: "short" }).replace(".", ""),
    date: shortDate(e.spentOn, locale),
    what,
    sub: subParts.join(dot),
    amount: formatMoney(e.amount, e.currency, locale),
    stamp: stampOf(e, t),
    card: e.paidBy === "company",
    receiptNeeded: e.fromCard && !e.receipt && e.status === "draft",
    thumb: e.receipt && thumbnailTypes.includes(e.receipt.type) ? `/chest/receipts/${e.id}?size=256` : null,
    open: e.receipt ? `/chest/receipts/${e.id}` : null,
    preview: e.receipt && thumbnailTypes.includes(e.receipt.type) ? `/chest/receipts/${e.id}?size=1024` : null,
    icon: e.trip ? "car" : e.allowance ? "flat" : e.receipt ? (e.receipt.type === "application/pdf" ? "pdf" : "receipt") : "none",
    warnings: (ctx.warnings?.get(e.id) ?? []).map(w => warningText(w, t, ctx.currency, locale)),
    reason: e.status === "draft" ? e.refusedReason : null,
  };
}
