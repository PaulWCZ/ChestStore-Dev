// Safe in the browser: no SDK here.
// A job's facts in words: its salary as the careers page writes it.
import { format, money } from "./format.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { Currency, Period } from "./model.ts";

export type Salary = { min: number | null; max: number | null; currency: Currency; period: Period };

export function salaryText(s: Salary, t: Catalogue["facts"], locale: string): string {
  const min = s.min !== null ? money(s.min, s.currency, locale) : null;
  const max = s.max !== null ? money(s.max, s.currency, locale) : null;
  const amount = min && max ? (s.min === s.max ? min : format(t.salaryRange, { min, max })) : min ? format(t.salaryFrom, { min }) : max ? format(t.salaryUpTo, { max }) : "";
  return amount ? `${amount} ${t.period[s.period]}` : "";
}
