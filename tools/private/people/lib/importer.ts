import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { clean, day, fold, limits, phone } from "./model.ts";
import { everyone, type Colleague } from "./people.ts";
import { profiles, save, wouldLoop, type Profile } from "./profiles.ts";

// Import of profile data from a spreadsheet — the way out of a shared
// "who's who" file, BambooHR's "Employee directory" report, a Google
// Workspace users export or Lucca's CSV. People are matched by their full
// name to the Chest's members (accents, case and "Last First" order
// aside); a cell left empty changes nothing. The page shows the plan
// first; the import itself reads the file again on the server.

export type Field = "title" | "team" | "manager" | "phone" | "office" | "startDate";
type Column = Field | "name" | "first" | "last";

// Header words, folded (lower case, no accents, anything else a space).
const aliases: Record<Column, string[]> = {
  name: ["name", "full name", "employee name", "employee", "display name", "person", "nom complet", "prenom nom", "collaborateur", "salarie", "nom et prenom", "nom prenom"],
  first: ["first name", "first name required", "firstname", "given name", "preferred name", "prenom"],
  last: ["last name", "last name required", "lastname", "surname", "family name", "nom de famille"],
  title: ["title", "job title", "job", "position", "role", "poste", "fonction", "intitule du poste", "titre"],
  team: ["team", "department", "division", "departement", "service", "equipe", "pole"],
  manager: ["manager", "manager name", "reports to", "supervisor", "line manager", "responsable", "manager nom", "n 1", "superieur hierarchique"],
  phone: ["phone", "work phone", "phone number", "mobile", "mobile phone", "work mobile", "telephone", "tel", "telephone professionnel", "portable"],
  office: ["office", "location", "work location", "site", "building", "bureau", "lieu", "lieu de travail", "etablissement"],
  startDate: ["start date", "hire date", "date of hire", "start", "joined", "arrival date", "date d arrivee", "date d entree", "date d embauche", "date arrivee", "date entree"],
};

const headerKey = (text: string) => fold(text).replace(/[^a-z0-9]+/gu, " ").trim();

export type Problem = "phone" | "date" | "too_long" | "manager_not_found" | "manager_self" | "manager_loop";
export type PlanRow = {
  line: number;
  name: string;
  memberId: string | null;
  // Why the row is left out: nobody by that name, several, or the person
  // already met higher in the file.
  skip: "not_found" | "ambiguous" | "duplicate" | null;
  changes: Partial<Record<Field, string>>;
  managerId: string | null;
  problems: Problem[];
};
export type Plan = { columns: Field[]; rows: PlanRow[]; dateOrder: "dmy" | "mdy" };

// readHeader finds which column holds what; a French "Nom" beside a
// "Prénom" is the last name.
function readHeader(header: string[]): Partial<Record<Column, number>> {
  const found: Partial<Record<Column, number>> = {};
  header.forEach((cell, index) => {
    const key = headerKey(cell);
    for (const [column, words] of Object.entries(aliases) as [Column, string[]][]) {
      if (found[column] === undefined && words.includes(key)) {
        found[column] = index;
        return;
      }
    }
  });
  const nom = header.findIndex(h => headerKey(h) === "nom");
  if (nom >= 0) {
    if (found.first !== undefined && found.last === undefined) found.last = nom;
    else if (found.name === undefined) found.name = nom;
  }
  return found;
}

// Dates as spreadsheets write them: 2024-03-18, 18/03/2024, 18.03.2024.
// Day-first unless the column shows otherwise (a 13 or more in the middle).
const datePattern = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u;
function dateOrder(values: string[]): "dmy" | "mdy" {
  let dmy = false, mdy = false;
  for (const v of values) {
    const m = datePattern.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return mdy && !dmy ? "mdy" : "dmy";
}
export function readDate(value: string, order: "dmy" | "mdy"): string | null {
  const text = value.trim().replace(/[T ].*$/u, "");
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return day(text);
  const m = datePattern.exec(text);
  if (!m) throw new AppError("invalid");
  const [d, mo] = order === "dmy" ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
  return day(`${m[3]}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
}

// Names of the Chest's members, folded, both ways round.
function nameIndex(people: Colleague[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    if (!key) return;
    const list = index.get(key) ?? [];
    if (!list.includes(id)) index.set(key, [...list, id]);
  };
  for (const p of people) {
    add(fold(p.name), p.id);
    add(fold(`${p.firstName} ${p.lastName}`), p.id);
    add(fold(`${p.lastName} ${p.firstName}`), p.id);
  }
  return index;
}

export function plan(text: unknown, people: Colleague[]): Plan {
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const table = parseCsv(text, limits.importRows + 1);
  if (table.length < 2 || table.length > limits.importRows + 1) throw new AppError("import_invalid");
  const header = readHeader(table[0]!);
  if (header.name === undefined && (header.first === undefined || header.last === undefined)) throw new AppError("import_invalid");
  const columns = (["title", "team", "manager", "phone", "office", "startDate"] as Field[]).filter(f => header[f] !== undefined);
  if (columns.length === 0) throw new AppError("import_invalid");
  const cell = (row: string[], column: Column) => (header[column] === undefined ? "" : (row[header[column]!] ?? "").trim());
  const order = dateOrder(table.slice(1).map(r => cell(r, "startDate")));
  const index = nameIndex(people);
  const seen = new Set<string>();
  const rows: PlanRow[] = [];
  table.slice(1).forEach((row, i) => {
    const name = (header.name !== undefined ? cell(row, "name") : `${cell(row, "first")} ${cell(row, "last")}`).replace(/\s+/gu, " ").trim();
    if (!name) return;
    const matches = index.get(fold(name)) ?? [];
    const memberId = matches.length === 1 ? matches[0]! : null;
    const skip = matches.length === 0 ? "not_found" : matches.length > 1 ? "ambiguous" : seen.has(memberId!) ? "duplicate" : null;
    if (memberId) seen.add(memberId);
    const changes: PlanRow["changes"] = {};
    const problems: Problem[] = [];
    let managerId: string | null = null;
    for (const field of columns) {
      const value = cell(row, field);
      if (!value) continue;
      try {
        if (field === "phone") changes.phone = phone(value);
        else if (field === "startDate") changes.startDate = readDate(value, order)!;
        else if (field === "manager") {
          const found = index.get(fold(value)) ?? [];
          if (found.length !== 1) problems.push("manager_not_found");
          else if (found[0] === memberId) problems.push("manager_self");
          else {
            managerId = found[0]!;
            changes.manager = value;
          }
        } else changes[field] = clean(value, limits[field]);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        problems.push(field === "phone" ? "phone" : field === "startDate" ? "date" : "too_long");
      }
    }
    rows.push({ line: i + 2, name, memberId, skip, changes, managerId, problems });
  });
  if (rows.length === 0) throw new AppError("import_invalid");
  return { columns, rows, dateOrder: order };
}

export async function previewImport(sql: Sql, actor: Member | null, text: unknown): Promise<Plan> {
  if (!actor || !can(actor, "directory.import")) throw new AppError("forbidden");
  void sql;
  const listed = await everyone();
  if (!listed.ok) throw new AppError("unavailable");
  return plan(text, listed.people);
}

// The import: each matched row's cells are written; a manager that would
// close a loop in the org chart is left out (and said).
export async function applyImport(sql: Sql, actor: Member | null, text: unknown): Promise<{ updated: number; skipped: number; loops: string[] }> {
  if (!actor || !can(actor, "directory.import")) throw new AppError("forbidden");
  const listed = await everyone();
  if (!listed.ok) throw new AppError("unavailable");
  const p = plan(text, listed.people);
  const usable = p.rows.filter(r => r.memberId && !r.skip);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.managers'))`;
    const current = await profiles(tx, actor, usable.map(r => r.memberId!));
    const loops: string[] = [];
    let updated = 0;
    for (const row of usable) {
      const before = current.get(row.memberId!)!;
      const next: Profile = { ...before };
      const c = row.changes;
      if (c.title !== undefined) next.title = c.title;
      if (c.team !== undefined) next.team = c.team;
      if (c.office !== undefined) next.office = c.office;
      if (c.phone !== undefined) next.phone = c.phone;
      if (c.startDate !== undefined) next.startDate = c.startDate;
      if (row.managerId) {
        if (await wouldLoop(tx, row.memberId!, row.managerId)) loops.push(row.name);
        else next.managerId = row.managerId;
      }
      if (JSON.stringify(next) !== JSON.stringify(before)) {
        await save(tx, next);
        updated++;
      }
    }
    return { updated, skipped: p.rows.length - usable.length, loops };
  });
}
