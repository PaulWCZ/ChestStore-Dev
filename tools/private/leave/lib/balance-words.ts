// Safe in the browser: no SDK here.
// A balance in words, the same on every screen: "12.5 left", then what it
// is made of — for paid leave, the days acquired (to take now, before the
// end of the year when unused days are lost) and those being earned; days
// carried over; what is earned each month; days waiting for an answer.
import type { Catalogue } from "./i18n/index.ts";
import { format, formatDay, formatDays, plural } from "./i18n/format.ts";

type Figures = { left: number; acquired: number; earning: number; carried: number; deadline: string | null; perMonth: number; pending: number; until: string | null };
type Words = { balance: Catalogue["balance"] };

export function balanceNotes(b: Figures, period: "running" | "acquired" | "yearly", locale: string, t: Words): string[] {
  const notes: string[] = [];
  const date = (d: string) => formatDay(d, locale, { day: "numeric", month: "long" });
  if (period === "acquired") {
    notes.push(format(b.deadline ? t.balance.acquiredBy : t.balance.acquired, { days: formatDays(b.acquired, locale), date: b.deadline ? date(b.deadline) : "" }));
    notes.push(format(t.balance.earning, { days: formatDays(b.earning, locale) }));
  } else if (b.deadline && b.left > 0) notes.push(format(t.balance.takeBy, { date: date(b.deadline) }));
  if (b.carried > 0) notes.push(format(t.balance.carried, { days: formatDays(b.carried, locale) }));
  if (b.perMonth > 0 && !b.until) notes.push(format(t.balance.perMonth, { days: formatDays(b.perMonth, locale) }));
  if (b.until) notes.push(format(t.balance.until, { date: formatDay(b.until, locale, { day: "numeric", month: "long", year: "numeric" }) }));
  if (b.pending > 0) notes.push(plural(t.balance.waiting, b.pending, locale));
  return notes;
}

// "7.25 left · 2 waiting": the one figure of a kind, where there is room
// for one line only (the request form's cards, the approver's list).
export function leftLine(b: { left: number; pending: number }, locale: string, t: Words): string {
  const left = format(t.balance.left, { days: formatDays(b.left, locale) });
  return b.pending > 0 ? `${left} · ${plural(t.balance.waitingShort, b.pending, locale)}` : left;
}
