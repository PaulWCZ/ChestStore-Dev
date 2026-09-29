import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { pdfOfFull } from "./archive.ts";
import type { Query, Sql } from "./db.ts";
import { getDocument } from "./documents.ts";
import { clientsCsv, corrected, csvText, fileBase, itemsCsv, rows, type Period } from "./export.ts";
import { catalogue, type Locale } from "./i18n/index.ts";
import { exportJournal } from "./journal.ts";
import { pdfFileName } from "./pdf/document.ts";
import { ZipWriter } from "./zip.ts";

// The monthly archive. Invoices must be kept ten years (Code de commerce
// L123-22), and the accountant wants each month closed: on the first days
// of a month (the "archive" schedule, Proposal (studio); or, without it, the
// first visit of a day), the month before is put into one ZIP — the PDFs of
// record of its invoices and credit notes, the summary, the accounting
// entries, the clients and the catalogue — kept in the Chest's files with
// its SHA-256. A month whose PDFs do not fit in one file the Chest takes at
// once is cut into parts. Nothing issued is ever dated in a past month
// (documents are dated the day they are numbered), so a month's archive is
// final once made.
//
// The files are the tool's own: removing the tool from the Chest deletes
// them with it. So the desk asks someone who exports to keep a copy outside
// the Chest, until one of them downloaded it.

// The tool reading its documents to archive them (reading and export rights).
const system = { id: "tool:archive", role: "viewer", name: "", firstName: "", lastName: "", photo: null, groups: [], isAdmin: false, isBuilder: false, locale: "en" } as Member;

// A part stays under what the Chest takes in one call (16 MiB), with room.
export const archiveLimits = { partBytes: 14 * 1024 * 1024, monthsPerRun: 3 } as const;

export type ArchivePart = { period: string; part: number; parts: number; object: string | null; sha256: string | null; size: number; documents: number; madeAt: string; downloadedAt: string | null };
type Row = { period: string; part: number; parts: number; object: string | null; sha256: string | null; size: number; documents: number; made_at: Date; downloaded_at: Date | null };
const toPart = (r: Row): ArchivePart => ({ period: r.period, part: r.part, parts: r.parts, object: r.object, sha256: r.sha256, size: r.size, documents: r.documents, madeAt: r.made_at.toISOString(), downloadedAt: r.downloaded_at ? r.downloaded_at.toISOString() : null });

const monthOf = (day: string) => day.slice(0, 7);
function previousMonth(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function periodOf(month: string): Period {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

// The months ended and not archived yet, the oldest first: from the month
// of the first document this tool issued to the month before today's.
export async function monthsDue(sql: Query, today: string): Promise<string[]> {
  const [first] = await sql<{ day: string | null }[]>`select min(issue_date) as day from documents where type in ('invoice', 'credit') and status = 'final'`;
  if (!first?.day) return [];
  const done = new Set((await sql<{ period: string }[]>`select distinct period from archives`).map(r => r.period));
  const out: string[] = [];
  for (let month = previousMonth(monthOf(today)); month >= monthOf(first.day); month = previousMonth(month)) {
    if (!done.has(month)) out.unshift(month);
    if (out.length > 120) break;
  }
  return out;
}

// makeArchive builds and keeps one month's archive. When the Chest cannot
// keep the file now, nothing is recorded: the next run tries again.
export async function makeArchive(sql: Sql, month: string, today: string, locale: Locale): Promise<ArchivePart[]> {
  const p = periodOf(month);
  const list = await rows(sql, system, p, today);
  if (list.length === 0) {
    await sql`insert into archives (period, part, parts, documents) values (${month}, 1, 1, 0) on conflict do nothing`;
    return (await sql<Row[]>`select * from archives where period = ${month} order by part`).map(toPart);
  }
  const encode = (text: string) => new TextEncoder().encode(text);
  const stamp = new Date(p.to + "T12:00:00Z");
  // The spreadsheets first, in part 1; then the PDFs, a new part when the
  // next one would not fit.
  const t = catalogue(locale).csv;
  const journal = await exportJournal(sql, system, locale, p);
  const sheets: [string, Uint8Array][] = [
    [fileBase(p, locale) + ".csv", encode(csvText(list, locale, await corrected(sql, list)))],
    [journal.fileName, encode(journal.text)],
    [t.clientsFile + ".csv", encode(await clientsCsv(sql, system, locale))],
    [t.itemsFile + ".csv", encode(await itemsCsv(sql, system, locale, list[0]!.currency))],
  ];
  const parts: { chunks: Uint8Array[]; size: number; documents: number }[] = [];
  let zip = new ZipWriter();
  let current = { chunks: [] as Uint8Array[], size: 0, documents: 0 };
  const add = (name: string, bytes: Uint8Array) => {
    for (const chunk of zip.file(name, bytes, stamp)) { current.chunks.push(chunk); current.size += chunk.length; }
  };
  for (const [name, bytes] of sheets) add(name, bytes);
  for (const r of list) {
    const full = await getDocument(sql, system, r.id, today);
    const bytes = await pdfOfFull(sql, full, today);
    if (current.documents > 0 && current.size + bytes.length + 2048 > archiveLimits.partBytes) {
      const end = zip.finish();
      current.chunks.push(end);
      current.size += end.length;
      parts.push(current);
      zip = new ZipWriter();
      current = { chunks: [], size: 0, documents: 0 };
    }
    add(pdfFileName(full), bytes);
    current.documents++;
  }
  const end = zip.finish();
  current.chunks.push(end);
  current.size += end.length;
  parts.push(current);
  const kept: { part: number; object: string; sha256: string; size: number; documents: number }[] = [];
  for (const [i, part] of parts.entries()) {
    const bytes = Buffer.concat(part.chunks);
    const object = `archives/${month.slice(0, 4)}/${month}${parts.length > 1 ? `-${i + 1}` : ""}.zip`;
    try {
      await files.put(object, bytes, "application/zip");
    } catch (error) {
      if (error instanceof ChestError) return [];
      throw error;
    }
    kept.push({ part: i + 1, object, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, documents: part.documents });
  }
  await sql.begin(async tx => {
    for (const k of kept) {
      await tx`insert into archives (period, part, parts, object, sha256, size, documents) values (${month}, ${k.part}, ${kept.length}, ${k.object}, ${k.sha256}, ${k.size}, ${k.documents}) on conflict do nothing`;
    }
  });
  return (await sql<Row[]>`select * from archives where period = ${month} order by part`).map(toPart);
}

// archiveDue makes the archives of the months ended (a few per run: the
// next run goes on). Never fails the page or the schedule that runs it.
export async function archiveDue(sql: Sql, today: string, locale: Locale): Promise<number> {
  let made = 0;
  for (const month of (await monthsDue(sql, today)).slice(0, archiveLimits.monthsPerRun)) {
    try {
      if ((await makeArchive(sql, month, today, locale)).length > 0) made++;
    } catch (error) {
      console.error("monthly archive failed", error instanceof Error ? error.name : "error");
      break;
    }
  }
  return made;
}

// The archives kept, the newest first (for whoever may export).
export async function listArchives(sql: Query, actor: Member | null, limit = 36): Promise<ArchivePart[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  return (await sql<Row[]>`select * from archives where object is not null order by period desc, part limit ${limit}`).map(toPart);
}

// The archives nobody downloaded yet: the desk asks to keep a copy.
export async function waitingArchives(sql: Query, actor: Member | null): Promise<ArchivePart[]> {
  if (!can(actor, "export")) return [];
  return (await sql<Row[]>`select * from archives where object is not null and downloaded_at is null order by period, part`).map(toPart);
}

// openArchive gives one part's bytes, and remembers that a copy left the
// Chest (who, when).
export async function openArchive(sql: Query, actor: Member | null, period: unknown, part: unknown): Promise<{ bytes: Uint8Array; fileName: string }> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  if (typeof period !== "string" || !/^\d{4}-\d{2}$/u.test(period)) throw new AppError("not_found");
  const n = Number(part ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new AppError("not_found");
  const [row] = await sql<Row[]>`select * from archives where period = ${period} and part = ${n} and object is not null`;
  if (!row) throw new AppError("not_found");
  const file = await files.get(row.object!).catch(error => { if (error instanceof ChestError) return null; throw error; });
  if (!file) throw new AppError("file_missing");
  await sql`update archives set downloaded_at = coalesce(downloaded_at, now()), downloaded_by = coalesce(downloaded_by, ${actor!.id}) where period = ${period} and part = ${n}`;
  return { bytes: file.data, fileName: row.object!.split("/").pop()! };
}
