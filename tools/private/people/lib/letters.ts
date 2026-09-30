import { chest } from "@argentic/chest-sdk/chest";
import { localeOf, type Member } from "@argentic/chest-sdk/member";
import { can, recordAccess } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, formatDay, locales, type Catalogue } from "./i18n/index.ts";
import { note } from "./journal.ts";
import { clean, id } from "./model.ts";
import { record } from "./records.ts";

// Letters from templates: HR writes a letter once — a certificat de
// travail, an attestation d'emploi — with merge fields ({name}, {job},
// {firstDay}…), and prints it for anyone from their record: a page laid
// out as paper, printed or saved as PDF by the browser. The two examples
// speak each reader's language until HR rewords them (like the example
// checklists). What a letter could not fill is shown on screen, never
// printed silently blank: "……" stands in its place.
//
// Not a signature: the letter is signed by hand (or scanned), and kept in
// the record's documents if HR wants it there. The attestation employeur
// France Travail needs is not a letter: payroll sends it through the DSN.
export const mergeFields = [
  "name", "employeeNumber", "birthDate", "nationality", "job", "qualification", "contract", "workingTime", "firstDay", "lastDay", "address", "company", "today", "signer",
] as const;
export type MergeField = (typeof mergeFields)[number];
export type Letter = { id: string; name: string; body: string; phrase: "certificate" | "attestation" | null };
const limits = { name: 80, body: 8000, letters: 30 } as const;
export const keepRemovedLetterDays = 30;

type Row = { id: string; name: string; body: string; phrase: Letter["phrase"] };
const toLetter = (r: Row): Letter => ({ id: String(r.id), name: r.name, body: r.body, phrase: r.phrase });

function hr(actor: Member | null): Member {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  return actor;
}

// How a reader sees a letter: an untouched example in their language.
export function shown(letter: Letter, t: Catalogue): { name: string; body: string } {
  if (!letter.phrase) return { name: letter.name, body: letter.body };
  const ex = t.letters.examples[letter.phrase];
  return { name: ex.name, body: ex.body };
}

// Whether a text is still an example's words in one of the languages.
function sameExample(phrase: Letter["phrase"], name: string, body: string): boolean {
  return phrase !== null && locales.some(l => {
    const ex = catalogue(l).letters.examples[phrase];
    return ex.name === name && ex.body === body;
  });
}

export async function listLetters(sql: Query, actor: Member | null): Promise<Letter[]> {
  hr(actor);
  return (await sql<Row[]>`select id, name, body, phrase from letters where removed_at is null order by position, id`).map(toLetter);
}

export async function letter(sql: Query, actor: Member | null, letterId: unknown): Promise<Letter> {
  hr(actor);
  const [row] = await sql<Row[]>`select id, name, body, phrase from letters where id = ${id(letterId)} and removed_at is null`;
  if (!row) throw new AppError("not_found");
  return toLetter(row);
}

// The two examples, in one click (an empty page).
export async function addExamples(sql: Sql, actor: Member | null, t: Catalogue): Promise<string[]> {
  const who = hr(actor);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.letters'))`;
    const made: string[] = [];
    for (const phrase of ["certificate", "attestation"] as const) {
      const [exists] = await tx`select 1 from letters where phrase = ${phrase} and removed_at is null`;
      if (exists) continue;
      const ex = t.letters.examples[phrase];
      const [row] = await tx<{ id: string }[]>`
        insert into letters (name, body, phrase, position, created_by)
        values (${ex.name}, ${ex.body}, ${phrase}, (select coalesce(max(position), 0) + 1 from letters), ${who.id}) returning id`;
      made.push(String(row!.id));
    }
    return made;
  });
}

export async function saveLetter(sql: Sql, actor: Member | null, letterId: unknown, input: { name?: unknown; body?: unknown }): Promise<Letter> {
  const who = hr(actor);
  const name = clean(input?.name, limits.name);
  const body = clean(input?.body, limits.body, { multiline: true });
  if (letterId === null || letterId === undefined || letterId === "") {
    return sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(hashtext('people.letters'))`;
      const [n] = await tx<{ n: number }[]>`select count(*)::int as n from letters where removed_at is null`;
      if (n!.n >= limits.letters) throw new AppError("too_many", { max: limits.letters });
      const [row] = await tx<Row[]>`
        insert into letters (name, body, position, created_by) values (${name}, ${body}, (select coalesce(max(position), 0) + 1 from letters), ${who.id})
        returning id, name, body, phrase`;
      return toLetter(row!);
    });
  }
  const key = id(letterId);
  const [current] = await sql<Row[]>`select id, name, body, phrase from letters where id = ${key} and removed_at is null`;
  if (!current) throw new AppError("not_found");
  // Saved as the example's words (in any language): still the example;
  // reworded: HR's own words from now on.
  const phrase = sameExample(current.phrase, name, body) ? current.phrase : null;
  const [row] = await sql<Row[]>`update letters set name = ${name}, body = ${body}, phrase = ${phrase}, updated_at = now() where id = ${key} returning id, name, body, phrase`;
  return toLetter(row!);
}

// Deleted with Undo (kept 30 days, then gone).
export async function removeLetter(sql: Query, actor: Member | null, letterId: unknown, removed: boolean): Promise<void> {
  hr(actor);
  const done = await sql`update letters set removed_at = ${removed ? new Date() : null} where id = ${id(letterId)} and (removed_at is null) = ${removed}`;
  if (done.count === 0) throw new AppError("not_found");
}

export async function purgeLetters(sql: Query): Promise<number> {
  return (await sql`delete from letters where removed_at < now() - make_interval(days => ${keepRemovedLetterDays}) returning id`).length;
}

// fill: a letter's text with the record's values; what is missing is
// "……" in the text and named in `missing` (shown on screen, not printed).
// Unknown braces stay as written. Pure.
export function fill(body: string, values: Partial<Record<MergeField, string>>): { text: string; missing: MergeField[] } {
  const missing = new Set<MergeField>();
  const text = body.replace(/\{([a-zA-Z]{1,30})\}/gu, (all, key: string) => {
    if (!(mergeFields as readonly string[]).includes(key)) return all;
    const value = values[key as MergeField];
    if (value) return value;
    missing.add(key as MergeField);
    return "……";
  });
  return { text, missing: [...missing] };
}

// A letter for one record, in the reader's language (dates, the contract's
// words), noted in the record's journal (the letter's name, never its
// text). The signer is the HR person printing it.
export async function printLetter(sql: Query, actor: Member | null, recordId: unknown, letterId: unknown, today: string): Promise<{ title: string; text: string; missing: MergeField[]; recordId: string }> {
  const who = hr(actor);
  const found = await record(sql, who, recordId);
  if (recordAccess(who, { memberId: found.record.memberId }) !== "edit") throw new AppError("not_found");
  const l = await letter(sql, who, letterId);
  const locale = localeOf(who.language);
  const t = catalogue(locale);
  const r = found.record;
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" }) : "");
  const words = shown(l, t);
  const values: Partial<Record<MergeField, string>> = {
    name: r.legalName, employeeNumber: r.employeeNumber, birthDate: day(r.birthDate), nationality: r.nationality, job: r.job, qualification: r.qualification,
    contract: t.record.contracts[r.contract], workingTime: t.record.workingTimes[r.workingTime].toLocaleLowerCase(locale), firstDay: day(r.startDate), lastDay: day(r.endDate),
    address: r.address, company: chest.organization.name, today: day(today), signer: who.name,
  };
  const done = fill(words.body, values);
  await note(sql, who, "letter_printed", { recordId: r.id, fields: [words.name] });
  return { title: words.name, text: done.text, missing: done.missing, recordId: r.id };
}
