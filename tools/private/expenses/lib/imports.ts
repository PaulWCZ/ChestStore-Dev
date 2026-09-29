import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError, type ErrorCode } from "./app-error.ts";
import { personKey, readDate, type DateOrder } from "./csv-read.ts";
import type { Sql } from "./db.ts";
import { catalogue, locales } from "./i18n/index.ts";
import { clean, limits, today } from "./model.ts";
import { isCurrency, parseAmount } from "./money.ts";
import { categories, settings } from "./settings.ts";
import { categoryName } from "./words.ts";

// Importing past expenses from the tool used before: the accountant maps
// the columns of its export (lib/csv-read.ts), then each line becomes an
// expense of the person it names, already paid back there. They are the
// person's history (and the year's record in one place); they are never
// paid, exported or booked again here. A line imported twice is recognised
// and left out.

export type ImportLine = { person?: unknown; date?: unknown; amount?: unknown; currency?: unknown; category?: unknown; merchant?: unknown; note?: unknown };
export type Skipped = { line: number; reason: ErrorCode | "person" | "duplicate" | "negative" };
export type Imported = { imported: number; skipped: Skipped[] };

export async function importExpenses(sql: Sql, actor: Member | null, input: { lines?: unknown; dateOrder?: unknown }, team: { id: string; name: string }[]): Promise<Imported> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (!Array.isArray(input.lines)) throw new AppError("invalid");
  if (input.lines.length === 0) throw new AppError("nothing_selected");
  if (input.lines.length > limits.importLines) throw new AppError("too_many", { max: limits.importLines });
  const order: DateOrder = input.dateOrder === "mdy" || input.dateOrder === "ymd" ? input.dateOrder : "dmy";
  const company = await settings(sql);
  const cats = await categories(sql);
  // A category is found by its name in any language, or its account;
  // otherwise "Other".
  const byName = new Map<string, string>();
  for (const c of cats.filter(c => !c.mileage && c.key !== "allowance")) {
    for (const l of locales) byName.set(personKey(categoryName(c, catalogue(l))), c.id);
    if (c.account) byName.set(c.account, c.id);
  }
  const other = cats.find(c => c.key === "other")?.id ?? cats.find(c => !c.mileage && c.key !== "allowance")?.id;
  if (!other) throw new AppError("category_invalid");
  const people = new Map(team.map(m => [personKey(m.name), m.id]));
  const skipped: Skipped[] = [];
  let imported = 0;
  const last = today();
  for (const [index, raw] of (input.lines as ImportLine[]).entries()) {
    const line = index + 1;
    try {
      const member = typeof raw?.person === "string" ? people.get(personKey(raw.person)) : undefined;
      if (!member) {
        skipped.push({ line, reason: "person" });
        continue;
      }
      const day = typeof raw.date === "string" ? readDate(raw.date, order) : null;
      if (!day || day < "2000-01-01" || day > last) throw new AppError("date_invalid");
      const currency = typeof raw.currency === "string" && isCurrency(raw.currency.trim().toUpperCase()) ? raw.currency.trim().toUpperCase() : company.currency;
      const text = typeof raw.amount === "string" ? raw.amount.trim() : "";
      if (text.startsWith("-") || text.startsWith("(")) {
        skipped.push({ line, reason: "negative" });
        continue;
      }
      const amount = parseAmount(text, currency);
      if (amount === null || amount <= 0 || amount > limits.amount) throw new AppError("amount_invalid");
      const category = (typeof raw.category === "string" && byName.get(personKey(raw.category))) || other;
      const merchant = clean(typeof raw.merchant === "string" ? raw.merchant : "", limits.merchant, { optional: true }).slice(0, limits.merchant);
      const note = clean(typeof raw.note === "string" ? raw.note : "", limits.note, { optional: true, multiline: true });
      const key = createHash("sha256").update(JSON.stringify([day, amount, currency, merchant.toLowerCase(), note])).digest("hex");
      const base = currency === company.currency ? amount : null;
      const [row] = await sql<{ id: string }[]>`
        insert into expenses (member_id, kind, status, spent_on, amount_cents, currency, base_cents, base_currency, category_id, merchant, note, paid_by, imported_at, import_key)
        values (${member}, 'expense', 'paid', ${day}, ${amount}, ${currency}, ${base}, ${base === null ? null : currency}, ${category}, ${merchant}, ${note}, 'me', now(), ${key})
        on conflict (member_id, import_key) where import_key is not null do nothing
        returning id`;
      if (!row) {
        skipped.push({ line, reason: "duplicate" });
        continue;
      }
      await sql`insert into history (expense_id, actor, kind) values (${row.id}, ${actor!.id}, 'imported')`;
      imported++;
    } catch (error) {
      if (error instanceof AppError) skipped.push({ line, reason: error.code });
      else throw error;
    }
  }
  return { imported, skipped };
}
