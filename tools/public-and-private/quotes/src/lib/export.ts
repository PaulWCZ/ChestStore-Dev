import { log } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { pdfOfFull } from "./archive.ts";
import { AppError } from "./app-error.ts";
import { separatorFor, toCsv } from "./csv.ts";
import type { Query } from "./db.ts";
import { getDocument, listDocuments, type ListRow } from "./documents.ts";
import { catalogue, format, numericDay, type Locale } from "../i18n/index.ts";
import { day, limits, slug } from "./model.ts";
import { formatRate, plainAmount, vatRates } from "./money.ts";
import { pdfFileName } from "./pdf/document.ts";
import { exportJournal } from "./journal.ts";
import { ZipWriter } from "./zip.ts";

// The accountant's export: the invoices and credit notes issued in a period
// (by their date), as a spreadsheet — one line each, amounts excluding VAT
// and VAT for each rate, totals; credit notes negative — and as a ZIP of
// their PDFs (the copies kept when they were issued) with the same
// spreadsheet inside. In the reader's language: French spreadsheets get ";"
// and decimal commas, dates as 28/09/2026.

export type Period = { from: string; to: string };

export function period(from: unknown, to: unknown): Period {
  const f = day(from), t = day(to);
  if (f > t) throw new AppError("period_invalid");
  return { from: f, to: t };
}

export async function rows(sql: Query, actor: Member | null, p: Period, today: string): Promise<ListRow[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const found = (await listDocuments(sql, actor, { types: ["invoice", "credit"], from: p.from, to: p.to, limit: limits.exportRows + 1 }, today)).filter(r => r.status === "final");
  if (found.length > limits.exportRows) throw new AppError("export_too_large");
  return found.sort((a, b) => (a.issueDate ?? "").localeCompare(b.issueDate ?? "") || a.type.localeCompare(b.type) || (a.number ?? "").localeCompare(b.number ?? ""));
}

export function csvText(list: ListRow[], locale: Locale, corrected: Map<string, string>): string {
  const t = catalogue(locale);
  const c = t.csv;
  const rates = [...vatRates];
  const header = [c.journal, c.date, c.number, c.kind, c.client, c.siren, c.vatNumber,
    ...rates.flatMap(r => (r === 0 ? [format(c.netAt, { rate: formatRate(r, locale) })] : [format(c.netAt, { rate: formatRate(r, locale) }), format(c.vatAt, { rate: formatRate(r, locale) })])),
    c.net, c.vat, c.gross, c.due, c.invoice, c.status, c.currency];
  const body = list.map(r => {
    const sign = r.type === "credit" ? -1 : 1;
    const amount = (minor: number) => plainAmount(sign * minor, r.currency, locale);
    const byRate = new Map(r.rates.map(x => [x.rate, x]));
    const kind = r.type === "credit" ? t.types.credit : r.depositPercent !== null ? t.types.deposit : t.types.invoice;
    return [
      c.journalCode,
      locale === "fr" ? numericDay(r.issueDate ?? "") : r.issueDate ?? "",
      r.number ?? "",
      kind,
      r.buyer?.name ?? r.clientName,
      r.buyer?.siren ?? "",
      r.buyer?.vatNumber ?? "",
      ...rates.flatMap(rate => {
        const x = byRate.get(rate);
        return rate === 0 ? [x ? amount(x.base) : ""] : [x ? amount(x.base) : "", x ? amount(x.vat) : ""];
      }),
      amount(r.net), amount(r.vat), amount(r.gross),
      r.dueDate ? (locale === "fr" ? numericDay(r.dueDate) : r.dueDate) : "",
      r.invoiceId ? corrected.get(r.invoiceId) ?? "" : "",
      r.type === "invoice" ? t.states[r.state] : "",
      r.currency,
    ];
  });
  return toCsv([header, ...body], separatorFor(locale));
}

export const fileBase = (p: Period, locale: Locale) => `${slug(catalogue(locale).meta.name)}_${p.from}_${p.to}`;

export async function exportCsv(sql: Query, actor: Member | null, locale: Locale, p: Period, today: string): Promise<{ text: string; fileName: string; count: number }> {
  const list = await rows(sql, actor, p, today);
  return { text: csvText(list, locale, await corrected(sql, list)), fileName: fileBase(p, locale) + ".csv", count: list.length };
}

// The numbers of the invoices the credit notes correct, even when those
// were issued in an earlier period.
export async function corrected(sql: Query, list: ListRow[]): Promise<Map<string, string>> {
  const wanted = [...new Set(list.filter(r => r.invoiceId).map(r => Number(r.invoiceId)))];
  if (wanted.length === 0) return new Map();
  const found = await sql<{ id: number; number: string | null }[]>`select id, number from documents where id = any(${wanted}::bigint[])`;
  return new Map(found.map(f => [String(f.id), f.number ?? ""]));
}

// The clients and the catalogue as spreadsheets, with the importer's
// column names (lib/parse-import.ts): what leaves this tool comes back
// into it, or goes to the next one, as it is. Archived rows too, said so.
export async function clientsCsv(sql: Query, actor: Member | null, locale: Locale): Promise<string> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const t = catalogue(locale);
  const f = t.importer.fields.clients;
  const rows = await sql<{ kind: string; name: string; contact: string; email: string; phone: string; address: string; postcode: string; city: string; country: string; siren: string; vat_number: string; delivery_address: string; language: string; account: string; reverse_charge: boolean; notes: string; archived_at: Date | null }[]>`
    select * from clients order by lower(name), id limit ${limits.clients}`;
  const header = [f.name, f.kind, f.contact, f.email, f.phone, f.address, f.postcode, f.city, f.country, f.siren, f.vatNumber, f.deliveryAddress, f.language, f.account, t.csv.reverseCharge, f.notes, t.csv.archived];
  const body = rows.map(r => [r.name, r.kind === "person" ? t.csv.person : t.csv.company, r.contact, r.email, r.phone, r.address, r.postcode, r.city, r.country, r.siren, r.vat_number,
    r.delivery_address, r.language, r.account, r.reverse_charge ? t.csv.yes : "", r.notes, r.archived_at ? t.csv.yes : ""]);
  return toCsv([header, ...body], separatorFor(locale));
}

export async function itemsCsv(sql: Query, actor: Member | null, locale: Locale, currency: string): Promise<string> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const t = catalogue(locale);
  const f = t.importer.fields.items;
  const rows = await sql<{ name: string; description: string; unit: string; unit_price: number; vat_rate: number; goods: boolean; archived_at: Date | null }[]>`
    select * from items order by lower(name), id limit ${limits.items * 5}`;
  const header = [f.name, f.description, f.unit, f.unitPrice, f.vatRate, f.kind, t.csv.archived];
  const body = rows.map(r => [r.name, r.description, r.unit, plainAmount(r.unit_price, currency, locale), formatRate(r.vat_rate, locale), r.goods ? t.csv.goods : t.csv.service, r.archived_at ? t.csv.yes : ""]);
  return toCsv([header, ...body], separatorFor(locale));
}

export async function exportZip(sql: Query, actor: Member | null, locale: Locale, p: Period, today: string, currency = "EUR"): Promise<{ stream: ReadableStream<Uint8Array>; fileName: string }> {
  const list = await rows(sql, actor, p, today);
  if (list.length > limits.exportFiles) throw new AppError("export_too_large");
  const numbers = await corrected(sql, list);
  const zip = new ZipWriter();
  let next = 0;
  let finished = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (next < list.length) {
          const r = list[next++]!;
          const full = await getDocument(sql, actor, r.id, today);
          const bytes = await pdfOfFull(sql, full, today);
          for (const chunk of zip.file(pdfFileName(full), bytes, new Date((r.issueDate ?? today) + "T12:00:00Z"))) controller.enqueue(chunk);
          return;
        }
        if (!finished) {
          finished = true;
          const encode = (text: string) => new TextEncoder().encode(text);
          for (const chunk of zip.file(fileBase(p, locale) + ".csv", encode(csvText(list, locale, numbers)))) controller.enqueue(chunk);
          const journal = await exportJournal(sql, actor, locale, p);
          for (const chunk of zip.file(journal.fileName, encode(journal.text))) controller.enqueue(chunk);
          const t = catalogue(locale).csv;
          for (const chunk of zip.file(t.clientsFile + ".csv", encode(await clientsCsv(sql, actor, locale)))) controller.enqueue(chunk);
          for (const chunk of zip.file(t.itemsFile + ".csv", encode(await itemsCsv(sql, actor, locale, list[0]?.currency ?? currency)))) controller.enqueue(chunk);
          controller.enqueue(zip.finish());
        }
        controller.close();
      } catch (error) {
        log.error("export zip failed", error);
        controller.error(error);
      }
    },
  }, { highWaterMark: 1 });
  return { stream, fileName: fileBase(p, locale) + ".zip" };
}
