import { ChestError } from "@argentic/chest-sdk/errors";
import { AppError, type PageContext } from "@argentic/chest-app";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { directory } from "../lib/directory.ts";
import { directoryCsv as writeDirectory } from "../lib/export.ts";
import { listFields } from "../lib/fields.ts";
import { everyone, people, plainName } from "../lib/people.ts";
import { openDocument } from "../lib/records.ts";
import { register, registerCsv as writeRegister, registerGaps } from "../lib/register.ts";
import { today } from "../lib/zone.ts";

// What is not a page: two CSV files and a document's signed link. Each
// checks the member's role as the pages do (404 otherwise), and is never
// cached. The files are built from the directory and the records in
// memory: a few thousand rows at most (the Chest lists 5,000 members at
// most; the register holds a company's staff of the last five years).

const csv = (body: string, name: string) => new Response(body, {
  headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
});
const nothing = (status: 404 | 503) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

// The directory as a CSV file, for HR, headers in their language.
export async function directoryCsv({ member, t }: PageContext): Promise<Response> {
  if (!can(member, "directory.export")) return nothing(404);
  const { ok, entries } = await directory(db(), member);
  if (!ok) return new Response(t.errors.unavailable, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  return csv(writeDirectory(entries, t.exportColumns, await listFields(db(), member)), `${t.exportColumns.file}-${today()}.csv`);
}

// The staff register as a CSV file, for HR, headers in their language;
// people it cannot list are named at its end; each download is written in
// the journal.
export async function registerCsv({ member, locale, t }: PageContext): Promise<Response> {
  if (!can(member, "records.manage")) return nothing(404);
  const r = await register(db(), member, "register_exported");
  const [tutors, listed] = await Promise.all([people(r.interns.flatMap(l => (l.tutorId ? [l.tutorId] : []))), everyone()]);
  const gaps = await registerGaps(db(), member, r, listed.people, today());
  const words = { ...t.register.columns, sexes: t.record.sexes, mention: t.register.mention };
  return csv(writeRegister(r, words, id => (id ? plainName(tutors.get(id), locale) : ""), gaps, t.register.gaps), `${t.register.file}-${today()}.csv`);
}

// Opening a record's document: for HR or the record's person only, through
// a fresh 15-minute link the Chest signs (written in the journal when
// someone else than the person opens it). Never cached.
export async function documentLink({ member, param }: PageContext): Promise<Response> {
  try {
    const url = await openDocument(db(), member, param("id"), param("doc"));
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return nothing(404);
    if (error instanceof ChestError) return nothing(error.code === "not_found" ? 404 : 503);
    throw error;
  }
}
