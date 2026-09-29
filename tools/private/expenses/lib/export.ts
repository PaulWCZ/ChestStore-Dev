import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { toCsv, separatorFor } from "./csv.ts";
import type { Query } from "./db.ts";
import { exportReceipts, exportRows, type ExportRow } from "./expenses.ts";
import { catalogue, format, type Locale } from "./i18n/index.ts";
import { monthRange, slug } from "./model.ts";
import { plainAmount, rateText, recoverable } from "./money.ts";
import { nameOf, people, type Person } from "./people.ts";
import { settings } from "./settings.ts";
import { categoryName, km, powerName, vehicleName } from "./words.ts";
import { ZipWriter } from "./zip.ts";

// The accountant's monthly export: a CSV of everything approved or paid in
// the month (by the day of the expense), and a ZIP of the receipts named by
// date and person, with the same CSV inside. Words and numbers in the
// accountant's language (French: ";" and a decimal comma).
//
// Memory: the CSV is at most 20,000 lines (a few MB); the ZIP is streamed,
// one receipt in memory at a time (10 MiB at most each), 5,000 receipts and
// 1 GiB per archive at most — far under the 256 MiB a tool has.

type Selection = { month: string; person: string | null };

export function receiptFileName(row: { id: string; spentOn: string; amount: number; currency: string; object: string }, name: string): string {
  const ext = row.object.split(".").at(-1) ?? "bin";
  const amount = plainAmount(row.amount, row.currency, "en").replace(".", "-");
  return `${row.spentOn}_${slug(name)}_${amount}${row.currency}_E${row.id}.${ext}`;
}

function csvDate(day: string, locale: Locale): string {
  return locale === "fr" ? day.split("-").reverse().join("/") : day;
}

function details(r: ExportRow, locale: Locale): string {
  const t = catalogue(locale);
  if (r.trip) {
    return [format(t.trip.detail, { from: r.trip.from, to: r.trip.to }), format(t.trip.km, { km: km(r.trip.distance, locale) }),
      `${vehicleName(r.trip.vehicle, t)} ${powerName(r.trip.vehicle, r.trip.power, t)}${r.trip.electric ? " " + t.trip.electric : ""}`,
      format(t.trip.scaleNote, { year: r.trip.scaleYear })].join(", ");
  }
  return r.note.replace(/\s+/gu, " ");
}

async function lines(sql: Query, actor: Member, selection: Selection): Promise<{ rows: ExportRow[]; who: Map<string, Person>; currency: string }> {
  const rows = await exportRows(sql, actor, monthRange(selection.month), selection.person);
  const who = await people(rows.flatMap(r => [r.owner, r.decidedBy ?? "", ...r.guests.members]));
  return { rows, who, currency: (await settings(sql)).currency };
}

function csvText(rows: ExportRow[], who: Map<string, Person>, locale: Locale, receiptNames: Map<string, string>, currency: string): string {
  const t = catalogue(locale);
  const c = t.csv;
  const money = (minor: number | null, currency: string) => (minor === null ? "" : plainAmount(minor, currency, locale));
  const header = [c.date, c.person, c.category, c.account, c.merchant, c.details, c.net, c.vat, c.recoverable, c.gross, c.currency, c.rate, format(c.base, { currency }), c.paidBy, c.status, c.approvedBy, c.paidOn, c.receipt, c.reference, c.guests];
  const body = rows.map(r => {
    const vat = r.trip ? 0 : r.vat;
    return [
      csvDate(r.spentOn, locale),
      nameOf(who.get(r.owner), locale),
      categoryName({ key: r.categoryKey, name: r.categoryName }, t),
      r.account,
      r.merchant,
      details(r, locale),
      vat === null ? "" : money(r.amount - vat, r.currency),
      money(vat, r.currency),
      vat === null ? "" : money(recoverable(vat, r.vatRecovery), r.currency),
      money(r.amount, r.currency),
      r.currency,
      r.rate !== null && r.currency !== currency ? rateText(r.rate, locale) : "",
      r.base !== null && r.baseCurrency === currency ? money(r.base, currency) : "",
      r.paidBy === "me" ? c.me : c.company,
      r.paidBy === "company" && r.status === "approved" ? t.status.companyCard : t.status[r.status],
      r.decidedBy ? nameOf(who.get(r.decidedBy), locale) : "",
      r.paidOn ? csvDate(r.paidOn, locale) : "",
      receiptNames.get(r.id) ?? "",
      "E" + r.id,
      [...r.guests.members.map(g => nameOf(who.get(g), locale)), ...r.guests.names].join(", "),
    ];
  });
  return toCsv([header, ...body], separatorFor(locale));
}

export async function exportCsv(sql: Query, actor: Member, locale: Locale, selection: Selection): Promise<{ text: string; fileName: string }> {
  const { rows, who, currency } = await lines(sql, actor, selection);
  return { text: csvText(rows, who, locale, await objectNames(sql, rows, who, locale), currency), fileName: fileBase(selection, who, locale) + ".csv" };
}

// The receipt names the ZIP gives, by expense id.
async function objectNames(sql: Query, rows: ExportRow[], who: Map<string, Person>, locale: Locale): Promise<Map<string, string>> {
  const withReceipt = rows.filter(r => r.receipt).map(r => r.id);
  const names = new Map<string, string>();
  if (withReceipt.length === 0) return names;
  const objects = await sql<{ id: string; receipt_object: string }[]>`select id, receipt_object from expenses where id = any(${withReceipt}::bigint[])`;
  const byId = new Map(objects.map(o => [String(o.id), o.receipt_object]));
  for (const r of rows) {
    const object = byId.get(r.id);
    if (object) names.set(r.id, receiptFileName({ id: r.id, spentOn: r.spentOn, amount: r.amount, currency: r.currency, object }, nameOf(who.get(r.owner), locale)));
  }
  return names;
}

function fileBase(selection: Selection, who: Map<string, Person>, locale: Locale): string {
  const t = catalogue(locale);
  return `${slug(t.meta.name)}_${selection.month}${selection.person ? "_" + slug(nameOf(who.get(selection.person), locale)) : ""}`;
}

// The ZIP, as a stream: each receipt read from the Chest when the reader
// asks for more, then the CSV, then the directory. A receipt the Chest no
// longer has is left out (its line in the CSV says no file).
export async function exportZip(sql: Query, actor: Member, locale: Locale, selection: Selection): Promise<{ stream: ReadableStream<Uint8Array>; fileName: string }> {
  const receipts = await exportReceipts(sql, actor, monthRange(selection.month), selection.person);
  const { rows, who, currency } = await lines(sql, actor, selection);
  const zip = new ZipWriter();
  const names = new Map<string, string>();
  let next = 0;
  let finished = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (next < receipts.length) {
          const r = receipts[next++]!;
          const file = await files.get(r.object);
          if (!file) continue;
          const name = receiptFileName(r, nameOf(who.get(r.owner), locale));
          names.set(r.id, name);
          for (const chunk of zip.file(name, file.data, new Date(r.spentOn + "T12:00:00Z"))) controller.enqueue(chunk);
          return;
        }
        if (!finished) {
          finished = true;
          const csv = new TextEncoder().encode(csvText(rows, who, locale, names, currency));
          for (const chunk of zip.file(fileBase(selection, who, locale) + ".csv", csv)) controller.enqueue(chunk);
          controller.enqueue(zip.finish());
        }
        controller.close();
      } catch (error) {
        console.error("export zip failed", error instanceof Error ? error.name : "error");
        controller.error(error);
      }
    },
  }, { highWaterMark: 1 });
  return { stream, fileName: fileBase(selection, who, locale) + ".zip" };
}
