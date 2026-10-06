import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { company } from "./company.ts";
import type { Query, Sql } from "./db.ts";
import { prefixOf } from "./documents.ts";
import { documentNumber, nextSeq, numberFormats, oneOf, periodOf, documentTypes, type DocumentType, type NumberFormat } from "../shared/model.ts";

// Switching from another invoicing tool without breaking the law's one
// unbroken sequence: the company goes on from the last number its previous
// tool gave (F-2026-0347 there, F-2026-0348 here), in the same format.
//
// - The next number of a sequence is set by an administrator, only
//   forward, and only while this tool has numbered nothing in it (in this
//   year, or ever for numbers without the year): once it has, the only next
//   number is the one after its own last — a jump would leave a gap.
// - The format — with the year (F-2026-0001, from 0001 each year) or
//   without (F-0001, never restarting) — may change; each format keeps its
//   own counters, so no number can come twice.
// - Every change is kept (numbering_changes), shown in Settings, and on the
//   first document numbered after it.

export type Sequence = {
  type: DocumentType;
  period: number;
  last: number;
  // The number the next document of this kind takes.
  next: string;
  nextSeq: number;
  // Whether this tool numbered something in this sequence already (then
  // it can no longer be moved).
  started: boolean;
};

export async function sequences(sql: Query, today: string): Promise<Sequence[]> {
  const c = await company(sql);
  const period = periodOf(c.numberFormat, today);
  const counters = new Map((await sql<{ type: DocumentType; last: number }[]>`select type, last from counters where year = ${period}`).map(r => [r.type, r.last]));
  const used = new Set((await sql<{ type: DocumentType }[]>`select distinct type from documents where year = ${period} and number is not null`).map(r => r.type));
  return documentTypes.map(type => {
    const last = counters.get(type) ?? 0;
    return { type, period, last, next: documentNumber(prefixOf(c, type), period, last + 1), nextSeq: last + 1, started: used.has(type) };
  });
}

// continueSequence makes the next document of a kind take the number
// `next` (its sequence part: 348 for F-2026-0348).
export async function continueSequence(sql: Sql, actor: Member | null, type: unknown, next: unknown, today: string): Promise<Sequence> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const kind = oneOf(documentTypes, type);
  const seq = nextSeq(next);
  return sql.begin(async tx => {
    const c = await company(tx);
    const period = periodOf(c.numberFormat, today);
    await tx`insert into counters (type, year, last) values (${kind}, ${period}, 0) on conflict (type, year) do nothing`;
    const [counter] = await tx<{ last: number }[]>`select last from counters where type = ${kind} and year = ${period} for update`;
    const [numbered] = await tx`select 1 from documents where type = ${kind} and year = ${period} and number is not null limit 1`;
    if (numbered) throw new AppError("numbering_started");
    const last = counter?.last ?? 0;
    if (seq <= last) throw new AppError("next_number_backwards", { next: documentNumber(prefixOf(c, kind), period, last + 1) });
    await tx`update counters set last = ${seq - 1} where type = ${kind} and year = ${period}`;
    await tx`insert into numbering_changes (type, period, next, changed_by) values (${kind}, ${period}, ${seq}, ${actor!.id})`;
    return { type: kind, period, last: seq - 1, next: documentNumber(prefixOf(c, kind), period, seq), nextSeq: seq, started: false };
  });
}

// setNumberFormat numbers the next documents with or without the year.
export async function setNumberFormat(sql: Sql, actor: Member | null, value: unknown): Promise<NumberFormat> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const format = oneOf(numberFormats, value);
  return sql.begin(async tx => {
    const [row] = await tx<{ number_format: NumberFormat }[]>`select number_format from company where id = 1 for update`;
    if (row?.number_format === format) return format;
    await tx`update company set number_format = ${format}, updated_by = ${actor!.id}, updated_at = now() where id = 1`;
    await tx`insert into numbering_changes (number_format, changed_by) values (${format}, ${actor!.id})`;
    return format;
  });
}

export type NumberingChange = { id: string; type: DocumentType | null; period: number | null; next: number | null; numberFormat: NumberFormat | null; number: string | null; prefix: string | null; changedBy: string; changedAt: string };

// The changes of the numbering, the latest first; `number` is the number a
// continued sequence was set to start from.
export async function numberingChanges(sql: Query, limit = 50): Promise<NumberingChange[]> {
  const c = await company(sql);
  const rows = await sql<{ id: number; type: DocumentType | null; period: number | null; next: number | null; number_format: NumberFormat | null; prefix: string | null; changed_by: string; changed_at: Date }[]>`
    select * from numbering_changes order by changed_at desc, id desc limit ${limit}`;
  return rows.map(r => ({
    id: String(r.id), type: r.type, period: r.period, next: r.next, numberFormat: r.number_format,
    number: r.type !== null && r.period !== null && r.next !== null ? documentNumber(prefixOf(c, r.type), r.period, r.next) : null,
    prefix: r.prefix, changedBy: r.changed_by, changedAt: r.changed_at.toISOString(),
  }));
}

// The change that made a document's number the first of a continued
// sequence, if it is one (its history says so).
export async function continuedAt(sql: Query, doc: { type: DocumentType; year: number | null; seq: number | null }): Promise<NumberingChange | null> {
  if (doc.year === null || doc.seq === null) return null;
  const [row] = await sql<{ id: number; changed_by: string; changed_at: Date }[]>`
    select id, changed_by, changed_at from numbering_changes where type = ${doc.type} and period = ${doc.year} and next = ${doc.seq} and prefix is null order by id desc limit 1`;
  return row ? { id: String(row.id), type: doc.type, period: doc.year, next: doc.seq, numberFormat: null, number: null, prefix: null, changedBy: row.changed_by, changedAt: row.changed_at.toISOString() } : null;
}
