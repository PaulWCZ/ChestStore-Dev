import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { parseCsv, unquote } from "./csv.ts";
import type { Sql } from "./db.ts";
import { listFields, type Extra } from "./fields.ts";
import { note } from "./journal.ts";
import { clean, day, fold, limits, phone } from "./model.ts";
import { everyone, type Colleague } from "./people.ts";
import { profiles, save, wouldLoop, type Profile } from "./profiles.ts";

// Import of profile data from a spreadsheet — the way out of a shared
// "who's who" file, BambooHR's reports (an "Employee #" first column,
// "First Name", "Last Name", "Reporting to", "Hire Date" in month/day/year),
// a Google Workspace users export or Lucca's CSV (sources in THIRD_PARTY.md).
//
// Each column is recognised from its header (English and French words), or
// HR says what it holds (the mapping step: any column may be left out, or
// go to one of HR's extra fields). People are matched by their work address
// when the file has one and the Chest gives addresses, otherwise by their
// full name (accents, case, commas and "Last First" order aside). When the
// dates could be day/month or month/day, HR is asked. A cell left empty
// changes nothing. The page shows the plan first; the import itself reads
// the file again on the server.

export type Field = "title" | "team" | "manager" | "phone" | "office" | "startDate";
export const fieldOrder: Field[] = ["title", "team", "manager", "phone", "office", "startDate"];
// What a column may hold: a person's name or address, a profile field, one
// of HR's extra fields ("x:<id>"), or nothing People keeps ("skip").
export type Target = Field | "name" | "first" | "last" | "email" | "skip" | `x:${string}`;
type Known = Exclude<Target, "skip" | `x:${string}`>;

// Header words, folded (lower case, no accents, "#" read as "number",
// anything else a space).
const aliases: Record<Known | "id", string[]> = {
  id: ["employee number", "employee no", "employee id", "id", "number", "matricule", "numero", "numero de matricule", "badge"],
  name: ["name", "full name", "employee name", "display name", "person", "nom complet", "prenom nom", "collaborateur", "salarie", "nom et prenom", "nom prenom"],
  first: ["first name", "first name required", "firstname", "given name", "prenom"],
  last: ["last name", "last name required", "lastname", "surname", "family name", "nom de famille"],
  email: ["work email", "email", "e mail", "email address", "primary email", "email address required", "adresse e mail", "e mail professionnel", "email professionnel", "mail", "courriel"],
  title: ["title", "job title", "job", "position", "role", "poste", "fonction", "intitule du poste", "titre"],
  team: ["team", "department", "division", "departement", "service", "equipe", "pole"],
  manager: ["manager", "manager name", "reports to", "reporting to", "supervisor", "supervisor name", "line manager", "responsable", "manager nom", "n 1", "superieur hierarchique"],
  phone: ["phone", "work phone", "phone number", "mobile", "mobile phone", "work mobile", "telephone", "tel", "telephone professionnel", "portable"],
  office: ["office", "location", "work location", "site", "building", "bureau", "lieu", "lieu de travail", "etablissement"],
  startDate: ["start date", "hire date", "original hire date", "date of hire", "start", "joined", "arrival date", "date d arrivee", "date d entree", "date d embauche", "date arrivee", "date entree"],
};

const headerKey = (text: string) => fold(text.replace(/#/gu, " number ")).replace(/[^a-z0-9]+/gu, " ").trim();

// readHeader says what each column holds, as far as its header tells; a
// French "Nom" beside a "Prénom" is the last name. An identifier column
// (BambooHR's "Employee #") is recognised and left out.
export function readHeader(header: string[], extras: readonly Extra[] = []): Target[] {
  const taken = new Set<Target>();
  const found: Target[] = header.map(cell => {
    const key = headerKey(cell);
    if (aliases.id.includes(key)) return "skip";
    for (const [column, words] of Object.entries(aliases) as [Known | "id", string[]][]) {
      if (column !== "id" && !taken.has(column) && words.includes(key)) {
        taken.add(column);
        return column;
      }
    }
    const extra = extras.find(x => fold(x.label) === fold(cell));
    if (extra && !taken.has(`x:${extra.id}`)) {
      taken.add(`x:${extra.id}`);
      return `x:${extra.id}` as const;
    }
    return "skip";
  });
  const nom = header.findIndex(h => headerKey(h) === "nom");
  if (nom >= 0 && found[nom] === "skip") {
    if (taken.has("first") && !taken.has("last")) found[nom] = "last";
    else if (!taken.has("name")) found[nom] = "name";
  }
  return found;
}

// Dates as spreadsheets write them: 2024-03-18, 18/03/2024, 03/18/2024,
// 18.03.2024. What the column shows: a 13 or more in the first place is
// day-first, in the second month-first; nothing of the sort is ambiguous.
const datePattern = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u;
export function dateOrder(values: string[]): "dmy" | "mdy" | "ambiguous" | "none" {
  let dmy = false, mdy = false, any = false;
  for (const v of values) {
    const m = datePattern.exec(v.trim().replace(/[T ].*$/u, ""));
    if (!m) continue;
    if (m[1] !== m[2]) any = true;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return any ? "ambiguous" : "none";
}

export function readDate(value: string, order: "dmy" | "mdy"): string | null {
  const text = value.trim().replace(/[T ].*$/u, "");
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return day(text, { from: 1900 });
  const m = datePattern.exec(text);
  if (!m) throw new AppError("invalid");
  const [d, mo] = order === "dmy" ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
  return day(`${m[3]}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, { from: 1900 });
}

const nameKey = (text: string) => fold(text.replace(/,/gu, " "));

// Names of the Chest's members, folded, both ways round; and their
// addresses.
function nameIndex(people: Colleague[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    if (!key) return;
    const list = index.get(key) ?? [];
    if (!list.includes(id)) index.set(key, [...list, id]);
  };
  for (const p of people) {
    add(nameKey(p.name), p.id);
    add(nameKey(`${p.firstName} ${p.lastName}`), p.id);
    add(nameKey(`${p.lastName} ${p.firstName}`), p.id);
  }
  return index;
}

export type Problem = "phone" | "date" | "choice" | "too_long" | "manager_not_found" | "manager_self" | "manager_loop";
export type PlanRow = {
  line: number;
  name: string;
  memberId: string | null;
  // Why the row is left out: nobody by that name, several, or the person
  // already met higher in the file.
  skip: "not_found" | "ambiguous" | "duplicate" | null;
  changes: Partial<Record<Field, string>>;
  extras: Record<string, string>;
  managerId: string | null;
  problems: Problem[];
};
export type Plan = {
  // The file's headers, what People reads in each, and a few values of each
  // (for the mapping step).
  headers: string[];
  targets: Target[];
  samples: string[][];
  // Why nothing can be imported yet: no column says who, or none says
  // anything People keeps.
  missing: "name" | "field" | null;
  columns: Field[];
  extras: string[];
  rows: PlanRow[];
  dateOrder: "dmy" | "mdy";
  // The dates could be read both ways: HR says which.
  askDateOrder: boolean;
  // The headers of columns that hold something and are not read.
  leftOut: string[];
};
export type Choices = { targets?: unknown; dateOrder?: unknown };

function chosenTargets(value: unknown, width: number, extras: readonly Extra[]): Target[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length !== width) throw new AppError("import_invalid");
  const allowed = new Set<string>(["name", "first", "last", "email", "skip", ...fieldOrder, ...extras.map(x => `x:${x.id}`)]);
  const seen = new Set<string>();
  return value.map(v => {
    if (typeof v !== "string" || !allowed.has(v)) throw new AppError("import_invalid");
    if (v !== "skip" && seen.has(v)) throw new AppError("import_invalid");
    seen.add(v);
    return v as Target;
  });
}

export function plan(text: unknown, people: Colleague[], extras: readonly Extra[] = [], choices: Choices = {}): Plan {
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const table = parseCsv(text, limits.importRows + 1).map(row => row.map(c => unquote(c.trim())));
  if (table.length < 2 || table.length > limits.importRows + 1) throw new AppError("import_invalid");
  const headers = table[0]!.map(h => h.trim());
  const body = table.slice(1);
  const targets = chosenTargets(choices.targets, headers.length, extras) ?? readHeader(headers, extras);
  const at = (t: Target) => targets.indexOf(t);
  const cell = (row: string[], t: Target) => (at(t) < 0 ? "" : (row[at(t)] ?? "").trim());
  const samples = headers.map((_, i) => body.map(r => (r[i] ?? "").trim()).filter(Boolean).slice(0, 3));
  const columns = fieldOrder.filter(f => at(f) >= 0);
  const extraColumns = targets.filter((t): t is `x:${string}` => t.startsWith("x:")).map(t => t.slice(2));
  const hasName = at("name") >= 0 || (at("first") >= 0 && at("last") >= 0) || at("email") >= 0;
  const dateExtras = extraColumns.filter(x => extras.find(e => e.id === x)?.kind === "date").map(x => `x:${x}` as const);
  // The dates of the file: the start date and HR's date fields, read in one order.
  const detected = dateOrder(body.flatMap(r => [cell(r, "startDate"), ...dateExtras.map(t => cell(r, t))]));
  const asked = choices.dateOrder === "dmy" || choices.dateOrder === "mdy" ? choices.dateOrder : null;
  // A guess before HR says: BambooHR (its "Employee #" column) writes US
  // dates; other files day-first, as in Europe.
  const usLike = headers.some(h => headerKey(h) === "employee number");
  const order = detected === "dmy" || detected === "mdy" ? detected : asked ?? (usLike ? "mdy" : "dmy");
  // The columns nothing is read from: shown, never dropped without a word.
  const leftOut = headers.flatMap((h, i) => (targets[i] === "skip" && h && samples[i]!.length > 0 ? [h] : []));
  const base = { headers, targets, samples, columns, extras: extraColumns, dateOrder: order, askDateOrder: detected === "ambiguous", leftOut };
  if (!hasName) return { ...base, missing: "name", rows: [] };
  if (columns.length === 0 && extraColumns.length === 0) return { ...base, missing: "field", rows: [] };
  const index = nameIndex(people);
  const byEmail = new Map(people.filter(p => p.email).map(p => [p.email.toLowerCase(), p.id]));
  const seen = new Set<string>();
  const rows: PlanRow[] = [];
  body.forEach((row, i) => {
    const address = cell(row, "email").toLowerCase();
    const written = (at("name") >= 0 ? cell(row, "name") : `${cell(row, "first")} ${cell(row, "last")}`).replace(/\s+/gu, " ").trim();
    const name = written || address;
    if (!name) return;
    const byAddress = address ? byEmail.get(address) : undefined;
    const matches = byAddress ? [byAddress] : written ? index.get(nameKey(written)) ?? [] : [];
    const memberId = matches.length === 1 ? matches[0]! : null;
    const skip = matches.length === 0 ? "not_found" : matches.length > 1 ? "ambiguous" : seen.has(memberId!) ? "duplicate" : null;
    if (memberId) seen.add(memberId);
    const changes: PlanRow["changes"] = {};
    const extrasOf: Record<string, string> = {};
    const problems: Problem[] = [];
    let managerId: string | null = null;
    for (const field of columns) {
      const value = cell(row, field);
      if (!value) continue;
      try {
        if (field === "phone") changes.phone = phone(value);
        else if (field === "startDate") changes.startDate = readDate(value, order)!;
        else if (field === "manager") {
          const found = byEmail.get(value.toLowerCase()) ? [byEmail.get(value.toLowerCase())!] : index.get(nameKey(value)) ?? [];
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
    for (const x of extraColumns) {
      const value = cell(row, `x:${x}`);
      if (!value) continue;
      const field = extras.find(e => e.id === x);
      try {
        if (field?.kind === "date") {
          const read = readDate(value, order);
          if (!read) throw new AppError("invalid");
          extrasOf[x] = read;
        } else if (field?.kind === "choice") {
          const found = field.options.find(o => o.toLowerCase() === value.toLowerCase());
          if (!found) throw new AppError("invalid");
          extrasOf[x] = found;
        } else extrasOf[x] = clean(value, limits.fieldValue);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        problems.push(field?.kind === "date" ? "date" : field?.kind === "choice" ? "choice" : "too_long");
      }
    }
    rows.push({ line: i + 2, name, memberId, skip, changes, extras: extrasOf, managerId, problems });
  });
  if (rows.length === 0) throw new AppError("import_invalid");
  return { ...base, missing: null, rows };
}

async function prepare(sql: Sql, actor: Member | null, text: unknown, choices: Choices): Promise<Plan> {
  if (!actor || !can(actor, "directory.import")) throw new AppError("forbidden");
  const listed = await everyone();
  if (!listed.ok) throw new AppError("unavailable");
  return plan(text, listed.people, await listFields(sql, actor), choices);
}

export async function previewImport(sql: Sql, actor: Member | null, text: unknown, choices: Choices = {}): Promise<Plan> {
  return prepare(sql, actor, text, choices);
}

// The import: each matched row's cells are written; a manager that would
// close a loop in the org chart is left out (and said). Each person whose
// job details change is written in the journal.
export async function applyImport(sql: Sql, actor: Member | null, text: unknown, choices: Choices = {}): Promise<{ updated: number; skipped: number; loops: string[] }> {
  const p = await prepare(sql, actor, text, choices);
  if (p.missing) throw new AppError("import_invalid");
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
      const changed = (["title", "team", "office", "phone", "startDate", "managerId"] as const).filter(f => next[f] !== before[f]);
      let extraChanged = false;
      for (const [fieldId, value] of Object.entries(row.extras)) {
        const done = await tx`
          insert into field_values (member_id, field_id, value) values (${row.memberId!}, ${fieldId}, ${value})
          on conflict (member_id, field_id) do update set value = excluded.value where field_values.value <> excluded.value returning 1`;
        if (done.length > 0) extraChanged = true;
      }
      if (changed.length > 0) {
        await save(tx, { ...next, managerLeft: next.managerId === before.managerId ? before.managerLeft : false });
        await note(tx, actor!, "profile_changed", { memberId: row.memberId!, fields: [...changed] });
      }
      if (changed.length > 0 || extraChanged) updated++;
    }
    return { updated, skipped: p.rows.length - usable.length, loops };
  });
}
