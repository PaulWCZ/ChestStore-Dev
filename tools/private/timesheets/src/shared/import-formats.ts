// Safe in the browser: no SDK here.
// Reading the "detailed time entries" CSV exports of Toggl Track, Clockify
// and Harvest into one neutral shape. Pure and tested. The column names are
// facts about those exports (read in solidtime's importers, AGPL-3.0, whose
// code is not copied — see THIRD_PARTY.md); the parser is our own.
import { AppError } from "@argentic/chest-app/client";
import { parseCsv } from "./csv.ts";

export const sources = ["toggl", "clockify", "harvest"] as const;
export type Source = (typeof sources)[number];
export type DateOrder = "dmy" | "mdy";

// One row of time, as the other tool wrote it, read.
export type Imported = {
  line: number;
  person: string;
  client: string;
  project: string;
  task: string;
  note: string;
  billable: boolean | null;
  day: string;
  // Minutes after midnight when the export gives a start time.
  start: number | null;
  minutes: number;
  // The old tool's hourly rates (cents) and whether it was invoiced, when
  // the export says: Harvest's Billable Rate, Cost Rate and Invoiced?;
  // Clockify's Billable Rate (EUR) and Cost Rate (EUR); Toggl's Amount
  // (EUR), turned into a rate.
  rateCents: number | null;
  costCents: number | null;
  invoiced: boolean | null;
};
// The currency of the rates, when the export names it ("Amount (EUR)",
// Harvest's Currency column); null when it does not.
export type Parsed = { source: Source; rows: Imported[]; invalid: number[]; dates: { ambiguous: boolean; order: DateOrder }; currency: string | null; rates: boolean };

export const maxRows = 20000;
export const maxBytes = 5 << 20;

const key = (header: string) => header.replace(/^﻿/u, "").trim().toLowerCase().replace(/\s+/gu, " ");

export function detect(headers: string[]): Source | null {
  const h = new Set(headers.map(key));
  if (h.has("date") && h.has("hours") && h.has("first name") && h.has("last name")) return "harvest";
  if (h.has("start date") && h.has("user") && (h.has("duration (h)") || h.has("duration (decimal)"))) return "clockify";
  if (h.has("start date") && h.has("user") && h.has("duration")) return "toggl";
  return null;
}

// Dates: 2026-09-21, 21/09/2026, 09/21/2026, 21.09.2026, 21/09/26.
const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/u;
const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/u;

function valid(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || d < 1 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function readDate(text: string, order: DateOrder): string | null {
  const value = text.trim();
  let m = iso.exec(value);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = local.exec(value);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return order === "dmy" ? valid(year, b, a) : valid(year, a, b);
}

// dateOrder reads which of day/month comes first in a file's dates: a
// first number above 12 is a day, a second above 12 too. When nothing
// tells, day first (Europe) — and the person is asked.
export function dateOrder(values: string[]): { ambiguous: boolean; order: DateOrder } {
  let dayFirst = false, monthFirst = false, any = false;
  for (const v of values) {
    const m = local.exec(v.trim());
    if (!m) continue;
    any = true;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return { ambiguous: false, order: "dmy" };
  if (monthFirst && !dayFirst) return { ambiguous: false, order: "mdy" };
  return { ambiguous: any && !(dayFirst && monthFirst), order: "dmy" };
}

// Times of day: 13:30, 13:30:15, 1:30 PM, 01:30:00 pm.
export function readTime(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/iu.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    const pm = m[4].toLowerCase().startsWith("p");
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h > 23) return null;
  return h * 60 + min;
}

// Durations of the exports: "01:30:00", "1:30", "1.5", "1,50".
export function readDuration(text: string): number | null {
  const value = text.trim();
  let m = /^(\d{1,4}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + Math.round(Number(m[3] ?? 0) / 60);
  m = /^(\d{1,4})(?:[.,](\d+))?$/u.exec(value);
  if (m) return Math.round(Number(`${m[1]}.${m[2] ?? "0"}`) * 60);
  return null;
}

export function readBillable(text: string): boolean | null {
  const value = text.trim().toLowerCase();
  if (["yes", "true", "1", "oui", "y"].includes(value)) return true;
  if (["no", "false", "0", "non", "n"].includes(value)) return false;
  return null;
}

const oneLine = (value: string | undefined, max: number) => [...(value ?? "").replace(/\s+/gu, " ").trim()].slice(0, max).join("");

// parseExport reads a whole file. Rows that cannot be read are listed by
// their line number; a file of none of the three shapes is refused.
export function parseExport(text: string, options: { order?: DateOrder } = {}): Parsed {
  if (text.length > maxBytes) throw new AppError("import_too_big", { max: 5 });
  const table = parseCsv(text, maxRows + 1);
  const [head, ...body] = table;
  if (!head) throw new AppError("import_invalid");
  if (body.length > maxRows) throw new AppError("import_too_big", { max: 5 });
  const source = detect(head);
  if (!source) throw new AppError("import_invalid");
  const index = new Map(head.map((h, i) => [key(h), i]));
  const col = (row: string[], ...names: string[]) => {
    for (const n of names) {
      const i = index.get(n);
      if (i !== undefined && row[i] !== undefined) return row[i]!;
    }
    return "";
  };
  const dateColumn = source === "harvest" ? ["date"] : ["start date"];
  // Money columns carry their currency in their name, "(EUR)".
  const money = (base: string) => [...index.keys()].find(k => k === base || k.startsWith(base + " ("));
  const rateColumn = source === "toggl" ? money("amount") : money("billable rate");
  const costColumn = source === "toggl" ? undefined : money("cost rate");
  const codeOf = (text: string | undefined) => (text ? /\b([A-Z]{3})\b/u.exec(text.toUpperCase())?.[1] ?? null : null);
  let currency = codeOf(/\(([^)]*)\)/u.exec(rateColumn ?? costColumn ?? "")?.[1]);
  const detected = dateOrder(body.map(r => col(r, ...dateColumn)));
  const order = options.order ?? detected.order;
  const rows: Imported[] = [];
  const invalid: number[] = [];
  body.forEach((row, i) => {
    const line = i + 2;
    if (source === "clockify" && col(row, "type").trim().toLowerCase() === "break") return;
    const day = readDate(col(row, ...dateColumn), order);
    const person = source === "harvest" ? oneLine(`${col(row, "first name")} ${col(row, "last name")}`, 120) : oneLine(col(row, "user"), 120);
    let minutes: number | null;
    let start: number | null = null;
    if (source === "harvest") minutes = readDuration(col(row, "hours"));
    else {
      start = readTime(col(row, "start time"));
      minutes = source === "toggl" ? readDuration(col(row, "duration")) : readDuration(col(row, "duration (h)")) ?? readDuration(col(row, "duration (decimal)"));
      if (minutes === null && start !== null) {
        const endDay = readDate(col(row, "end date"), order);
        const end = readTime(col(row, "end time"));
        if (day && endDay && end !== null) minutes = Math.round((Date.parse(endDay) - Date.parse(day)) / 60000) + end - start;
      }
    }
    if (!day || !person || minutes === null || minutes < 1 || minutes > 1440) {
      invalid.push(line);
      return;
    }
    if (source === "harvest" && currency === null) currency = codeOf(col(row, "currency"));
    const rateText = rateColumn ? col(row, rateColumn).trim() : "";
    const costText = costColumn ? col(row, costColumn).trim() : "";
    let rateCents = rateText ? readExportAmount(rateText) : null;
    if (source === "toggl" && rateCents !== null) rateCents = Math.round((rateCents * 60) / minutes);
    const costCents = costText ? readExportAmount(costText) : null;
    rows.push({
      line,
      person,
      client: oneLine(col(row, "client"), 80),
      project: oneLine(col(row, "project"), 80),
      task: oneLine(col(row, "task", "activity"), 60),
      note: [...col(row, source === "harvest" ? "notes" : "description").replace(/\r\n?/gu, "\n").trim()].slice(0, 500).join(""),
      billable: readBillable(col(row, "billable", "billable?")),
      day,
      start,
      minutes,
      // A rate of 0 is how the exports write "no rate".
      rateCents: rateCents !== null && rateCents > 0 && rateCents <= 100_000_000 ? rateCents : null,
      costCents: costCents !== null && costCents > 0 && costCents <= 100_000_000 ? costCents : null,
      invoiced: source === "harvest" ? readBillable(col(row, "invoiced?")) : null,
    });
  });
  const rates = rows.some(r => r.rateCents !== null || r.costCents !== null);
  return { source, rows, invalid, dates: { ambiguous: options.order ? false : detected.ambiguous, order }, currency, rates };
}

// fold is how names are compared: accents, case, spaces and the order of
// the words aside ("MARTIN Camille" is "Camille Martin").
export function fold(name: string): string {
  return name.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean).sort().join(" ");
}

// foldText compares the names of clients, projects and tasks: accents,
// case and spaces aside, the words in their order.
export function foldText(name: string): string {
  return name.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

// An amount as the old tool's export writes it ("95.00", "1,200.50",
// "€ 95", "1.200,50 €"): a currency sign or code aside; the last
// separator is the decimal one when two decimals or fewer follow it. More
// lenient than a person's form (src/shared/amounts.ts): an export is
// written by a program, in one convention per file.
export function readExportAmount(input: string): number | null {
  let text = input.trim().replace(/[\s\u00a0\u202f]/gu, "").replace(/[€$£]|chf|eur|usd|gbp|cad/giu, "");
  if (text === "") return null;
  const last = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
  if (last >= 0) {
    const decimals = text.slice(last + 1);
    const whole = text.slice(0, last).replace(/[.,]/gu, "");
    text = decimals.length <= 2 ? `${whole}.${decimals}` : whole + decimals;
  }
  if (!/^\d+(\.\d{0,2})?$/u.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
