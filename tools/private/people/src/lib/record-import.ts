import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { parseCsv, unquote } from "./csv.ts";
import type { Sql } from "./db.ts";
import { dateOrder, headerKey, nameIndex, nameKey, readDate } from "./importer.ts";
import { note } from "./journal.ts";
import { fold, limits, type Contract, type Sex } from "../shared/model.ts";
import { everyone, type Colleague } from "./people.ts";
import { numberTaken, read, writeRecord, type Field, type Fields } from "./records.ts";
import { tellRecords } from "./share.ts";

// Import of HR records from a spreadsheet — the register's fields of 50
// people, from Lucca Core HR's or BambooHR's export or HR's own file, so
// switching never means typing them again. The same steps as the profile
// import: each column is recognised from its header (English and French),
// or HR says what it holds (the mapping step); a column nothing is read
// from is named, never dropped silently; dates are asked when they could
// be read both ways; a preview says what each row does; an empty cell
// changes nothing.
//
// Each row finds its record: by employee number (a record that has it),
// then by work email or name (a member of the Chest, and their record),
// then by legal name (a record of someone without the Chest). A row that
// finds none makes a new record — linked to the member when one matched,
// otherwise "Not in the Chest" (a warehouse worker, an intern, someone
// arriving). A row that could be two people is left out, and said.
export type RecordTarget = Exclude<Field, "tutorId" | "workDays" | "agency" | "workplace">;
export type Target = RecordTarget | "first" | "last" | "email" | "street" | "street2" | "postcode" | "city" | "country" | "skip";
export const recordTargets: RecordTarget[] = [
  "employeeNumber", "legalName", "sex", "birthDate", "nationality", "job", "qualification", "contract", "workingTime", "hours",
  "startDate", "trialEnd", "contractEnd", "endDate", "workPermit", "permitEnd", "address", "emergencyName", "emergencyRelation", "emergencyPhone",
];
const addressParts = ["street", "street2", "postcode", "city", "country"] as const;
const dateTargets: RecordTarget[] = ["birthDate", "startDate", "trialEnd", "contractEnd", "endDate", "permitEnd"];

// Header words, folded as the profile import folds them ("#" read as
// "number"): the columns of BambooHR's reports and Lucca's exports as the
// studio knows them, and the words of French HR files — not checked against
// a live export of either (the mapping step covers any other header).
const aliases: Record<Exclude<Target, "skip">, string[]> = {
  employeeNumber: ["employee number", "employee no", "employee id", "matricule", "numero de matricule", "n matricule", "no matricule", "matricule salarie", "payroll id"],
  legalName: ["legal name", "full legal name", "nom et prenoms", "nom prenoms", "nom complet", "nom et prenom", "name", "full name", "employee name", "salarie", "collaborateur"],
  first: ["first name", "firstname", "given name", "legal first name", "prenom", "prenoms"],
  last: ["last name", "lastname", "surname", "family name", "legal last name", "nom", "nom de famille", "nom de naissance", "nom d usage"],
  email: ["work email", "email", "e mail", "email address", "adresse e mail", "e mail professionnel", "email professionnel", "mail professionnel", "courriel"],
  sex: ["gender", "sex", "sexe", "genre", "civilite"],
  birthDate: ["birth date", "date of birth", "birthdate", "dob", "date de naissance"],
  nationality: ["nationality", "citizenship", "nationalite"],
  job: ["job title", "title", "job", "position", "poste", "emploi", "fonction", "intitule du poste", "libelle emploi"],
  qualification: ["qualification", "classification", "coefficient", "niveau", "echelon", "position conventionnelle", "pay grade", "grade", "statut"],
  contract: ["contract", "contract type", "employment type", "type de contrat", "nature du contrat", "contrat", "type contrat"],
  workingTime: ["working time", "full time part time", "temps de travail", "temps plein temps partiel", "regime horaire", "employment status"],
  hours: ["hours per week", "weekly hours", "hours a week", "standard hours", "heures hebdomadaires", "horaire hebdomadaire", "duree hebdomadaire", "heures par semaine", "duree du travail"],
  startDate: ["hire date", "start date", "original hire date", "date of hire", "date d entree", "date d embauche", "date entree", "date d arrivee", "premier jour"],
  trialEnd: ["end of trial period", "trial period end", "probation end date", "probation end", "fin de periode d essai", "date de fin de periode d essai", "fin periode d essai", "fin de la periode d essai"],
  contractEnd: ["contract end date", "contract end", "planned end", "fin de contrat", "date de fin de contrat", "date de fin prevue", "fin prevue"],
  endDate: ["termination date", "last day", "exit date", "end date", "date de sortie", "date de depart", "dernier jour", "date de fin"],
  workPermit: ["work permit", "work permit number", "visa", "visa type", "titre de sejour", "autorisation de travail", "titre de travail", "numero du titre de sejour"],
  permitEnd: ["work permit expiry", "work permit expiration", "work permit expiration date", "visa expiration date", "visa expiry", "date d expiration du titre", "fin de validite du titre de sejour", "titre de sejour valable jusqu au", "date de fin de validite", "expiration du titre de sejour"],
  address: ["address", "home address", "adresse", "adresse personnelle", "adresse complete"],
  street: ["address line 1", "address 1", "street", "street address", "adresse ligne 1", "numero et rue", "rue"],
  street2: ["address line 2", "address 2", "adresse ligne 2", "complement d adresse", "complement"],
  postcode: ["zip", "zip code", "postal code", "postcode", "code postal", "cp"],
  city: ["city", "town", "ville", "commune", "localite"],
  country: ["country", "pays"],
  emergencyName: ["emergency contact", "emergency contact name", "contact d urgence", "personne a prevenir", "nom du contact d urgence", "contact en cas d urgence"],
  emergencyRelation: ["emergency contact relationship", "relationship", "emergency relationship", "lien de parente", "lien avec le salarie", "lien du contact d urgence"],
  emergencyPhone: ["emergency contact phone", "emergency phone", "emergency contact mobile phone", "emergency contact home phone", "telephone d urgence", "telephone du contact d urgence", "telephone de la personne a prevenir"],
};

export function readHeader(header: string[]): Target[] {
  const taken = new Set<Target>();
  const found: Target[] = header.map(cell => {
    const key = headerKey(cell);
    for (const [target, words] of Object.entries(aliases) as [Exclude<Target, "skip">, string[]][]) {
      if (!taken.has(target) && words.includes(key)) {
        taken.add(target);
        return target;
      }
    }
    return "skip";
  });
  // A full name and first/last names: the parts win (the legal order is
  // written from them); "Nom" alone is the whole name.
  if (taken.has("last") && !taken.has("first")) {
    const i = found.indexOf("last");
    if (!taken.has("legalName")) found[i] = "legalName";
  }
  return found;
}

// Values as the exports write them.
const contractWords: [Contract, string[]][] = [
  ["permanent", ["cdi", "permanent", "contrat a duree indeterminee", "duree indeterminee", "indefinite", "open ended", "regular"]],
  ["fixed_term", ["cdd", "fixed term", "fixed term contract", "contrat a duree determinee", "duree determinee", "temporary contract", "cdd d usage", "saisonnier", "seasonal"]],
  ["apprenticeship", ["apprentissage", "apprenti", "apprenticeship", "apprentice", "contrat d apprentissage"]],
  ["professionalisation", ["professionnalisation", "contrat de professionnalisation", "contrat pro", "professionalisation"]],
  ["internship", ["stage", "stagiaire", "intern", "internship", "convention de stage"]],
  ["temporary", ["interim", "interimaire", "temporary worker", "temp", "agency worker", "travail temporaire"]],
  ["seconded", ["detache", "detachement", "mis a disposition", "mise a disposition", "seconded", "secondment"]],
];
const key = (v: string) => fold(v).replace(/[^a-z0-9]+/gu, " ").trim();

export function readContract(value: string): Contract | null {
  const k = key(value);
  return contractWords.find(([, words]) => words.includes(k))?.[0] ?? null;
}

export function readSex(value: string): Sex | null {
  const k = key(value);
  if (["f", "female", "woman", "femme", "feminin", "mme", "madame", "mrs", "ms", "miss"].includes(k)) return "female";
  if (["m", "h", "male", "man", "homme", "masculin", "monsieur", "mr"].includes(k)) return "male";
  return null;
}

export function readWorkingTime(value: string): "full" | "part" | null {
  const k = key(value);
  if (["full", "full time", "temps plein", "temps complet", "plein", "complet", "100"].includes(k)) return "full";
  if (["part", "part time", "temps partiel", "partiel"].includes(k)) return "part";
  return null;
}

export type Problem = "date" | "contract" | "sex" | "working_time" | "hours" | "phone" | "too_long" | "number" | "number_taken" | "dates";
export type Row = {
  line: number;
  name: string;
  // What the row does: updates a record, makes one for a member, makes
  // one for someone without the Chest; or is left out.
  action: "update" | "create_member" | "create_other" | null;
  skip: "ambiguous" | "duplicate" | "no_name" | null;
  recordId: string | null;
  memberId: string | null;
  changes: Partial<Record<RecordTarget, string>>;
  problems: Problem[];
};
export type Plan = {
  headers: string[]; targets: Target[]; samples: string[][];
  missing: "name" | "field" | null;
  rows: Row[];
  dateOrder: "dmy" | "mdy"; askDateOrder: boolean;
  leftOut: string[];
};
export type Choices = { targets?: unknown; dateOrder?: unknown };
type Existing = { id: string; memberId: string | null; legalName: string; employeeNumber: string };

function chosenTargets(value: unknown, width: number): Target[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length !== width) throw new AppError("import_invalid");
  const allowed = new Set<string>(["skip", "first", "last", "email", ...recordTargets, ...addressParts]);
  const seen = new Set<string>();
  return value.map(v => {
    if (typeof v !== "string" || !allowed.has(v)) throw new AppError("import_invalid");
    if (v !== "skip" && seen.has(v)) throw new AppError("import_invalid");
    seen.add(v);
    return v as Target;
  });
}

// plan: pure — what each row of the file would do, given the members of
// the Chest and the records that exist.
export function plan(text: unknown, people: readonly Colleague[], records: readonly Existing[], choices: Choices = {}): Plan {
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const table = parseCsv(text, limits.importRows + 1).map(row => row.map(c => unquote(c.trim())));
  if (table.length < 2 || table.length > limits.importRows + 1) throw new AppError("import_invalid");
  const headers = table[0]!.map(h => h.trim());
  const body = table.slice(1);
  const targets = chosenTargets(choices.targets, headers.length) ?? readHeader(headers);
  const at = (t: Target) => targets.indexOf(t);
  const cell = (row: string[], t: Target) => (at(t) < 0 ? "" : (row[at(t)] ?? "").trim());
  const samples = headers.map((_, i) => body.map(r => (r[i] ?? "").trim()).filter(Boolean).slice(0, 3));
  const detected = dateOrder(body.flatMap(r => dateTargets.map(t => cell(r, t))));
  const asked = choices.dateOrder === "dmy" || choices.dateOrder === "mdy" ? choices.dateOrder : null;
  const usLike = headers.some(h => headerKey(h) === "employee number");
  const order = detected === "dmy" || detected === "mdy" ? detected : asked ?? (usLike ? "mdy" : "dmy");
  const leftOut = headers.flatMap((h, i) => (targets[i] === "skip" && h && samples[i]!.length > 0 ? [h] : []));
  const base = { headers, targets, samples, dateOrder: order, askDateOrder: detected === "ambiguous", leftOut };
  const hasWho = at("legalName") >= 0 || (at("first") >= 0 && at("last") >= 0) || at("email") >= 0 || at("employeeNumber") >= 0;
  if (!hasWho) return { ...base, missing: "name", rows: [] };
  const fields = targets.filter(t => (recordTargets as string[]).includes(t) || (addressParts as readonly string[]).includes(t));
  if (fields.length === 0) return { ...base, missing: "field", rows: [] };

  const members = nameIndex(people);
  const byEmail = new Map(people.filter(p => p.email).map(p => [p.email.toLowerCase(), p.id]));
  const byNumber = new Map(records.filter(r => r.employeeNumber).map(r => [r.employeeNumber, r]));
  const byMember = new Map(records.filter(r => r.memberId).map(r => [r.memberId!, r]));
  const byLegal = new Map<string, Existing[]>();
  for (const r of records.filter(x => !x.memberId)) byLegal.set(nameKey(r.legalName), [...(byLegal.get(nameKey(r.legalName)) ?? []), r]);
  const seen = new Set<string>();
  const rows: Row[] = [];
  body.forEach((row, i) => {
    if (row.every(c => !c.trim())) return;
    const first = cell(row, "first"), last = cell(row, "last");
    // The legal name as the register writes it: LAST First.
    const legal = (cell(row, "legalName") || (last || first ? `${last.toUpperCase()} ${first}` : "")).replace(/\s+/gu, " ").trim();
    const address = cell(row, "email").toLowerCase();
    const number = cell(row, "employeeNumber");
    const shownName = legal || address || number;
    const changes: Row["changes"] = {};
    const problems: Problem[] = [];
    const out = (skip: Row["skip"]): void => void rows.push({ line: i + 2, name: shownName, action: null, skip, recordId: null, memberId: null, changes, problems });
    if (!legal && !address && !number) return out("no_name");
    // Who: the record with this number; else a member (address, then
    // name) and their record; else a record of that legal name.
    let record: Existing | undefined = number ? byNumber.get(number) : undefined;
    let memberId: string | null = record?.memberId ?? null;
    if (!record) {
      const written = legal || `${first} ${last}`.trim();
      const matches = address && byEmail.get(address) ? [byEmail.get(address)!] : written ? members.get(nameKey(written)) ?? members.get(nameKey(`${first} ${last}`)) ?? [] : [];
      if (matches.length > 1) return out("ambiguous");
      memberId = matches[0] ?? null;
      record = memberId ? byMember.get(memberId) : undefined;
      if (!memberId) {
        const same = byLegal.get(nameKey(legal)) ?? [];
        if (same.length > 1) return out("ambiguous");
        record = same[0];
      }
    }
    const who = record ? `r:${record.id}` : memberId ? `m:${memberId}` : `n:${nameKey(legal)}`;
    if (seen.has(who)) return out("duplicate");
    seen.add(who);
    if (!record && !legal && !memberId) return out("no_name");

    // What: each cell read as the record reads it.
    const given: Record<string, unknown> = {};
    for (const t of recordTargets) {
      const value = cell(row, t);
      if (!value || t === "legalName") continue;
      try {
        if ((dateTargets as string[]).includes(t)) given[t] = readDate(value, order);
        else if (t === "contract") { const c = readContract(value); if (!c) { problems.push("contract"); continue; } given[t] = c; }
        else if (t === "sex") { const s = readSex(value); if (!s) { problems.push("sex"); continue; } given[t] = s; }
        else if (t === "workingTime") { const w = readWorkingTime(value); if (!w) { problems.push("working_time"); continue; } given[t] = w; }
        else given[t] = value;
        read({ [t]: given[t] });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        delete given[t];
        problems.push((dateTargets as string[]).includes(t) ? "date" : t === "hours" ? "hours" : t === "emergencyPhone" ? "phone" : t === "employeeNumber" ? "number" : "too_long");
      }
    }
    // An address in parts (BambooHR, Lucca): written as one, a line each.
    if (!given["address"]) {
      const street = [cell(row, "street"), cell(row, "street2")].filter(Boolean);
      const town = [cell(row, "postcode"), cell(row, "city")].filter(Boolean).join(" ");
      const parts = [...street, town, cell(row, "country")].filter(Boolean);
      if (parts.length > 0) {
        try {
          read({ address: parts.join("\n") });
          given["address"] = parts.join("\n");
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          problems.push("too_long");
        }
      }
    }
    if (legal && (!record || fold(record.legalName) !== fold(legal))) {
      try {
        read({ legalName: legal });
        given["legalName"] = legal;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        problems.push("too_long");
      }
    }
    if (number) {
      const other = byNumber.get(String(given["employeeNumber"] ?? ""));
      if (other && other.id !== record?.id) { delete given["employeeNumber"]; problems.push("number_taken"); }
    }
    const ends = ["trialEnd", "contractEnd", "endDate"].map(k => given[k]).filter(Boolean) as string[];
    if (given["startDate"] && ends.some(e => e < String(given["startDate"]))) {
      for (const k of ["trialEnd", "contractEnd", "endDate"]) if (given[k] && String(given[k]) < String(given["startDate"])) delete given[k];
      problems.push("dates");
    }
    for (const [k, v] of Object.entries(given)) changes[k as RecordTarget] = String(v);
    rows.push({ line: i + 2, name: shownName, action: record ? "update" : memberId ? "create_member" : "create_other", skip: null, recordId: record?.id ?? null, memberId, changes, problems });
  });
  if (rows.length === 0) throw new AppError("import_invalid");
  return { ...base, missing: null, rows };
}

async function prepare(sql: Sql, actor: Member | null, text: unknown, choices: Choices): Promise<Plan> {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  const listed = await everyone();
  if (!listed.ok) throw new AppError("unavailable");
  const records = await sql<{ id: string; member_id: string | null; legal_name: string; employee_number: string }[]>`
    select id, member_id, legal_name, employee_number from records where erased_at is null`;
  return plan(text, listed.people, records.map(r => ({ id: String(r.id), memberId: r.member_id, legalName: r.legal_name, employeeNumber: r.employee_number })), choices);
}

export async function previewRecords(sql: Sql, actor: Member | null, text: unknown, choices: Choices = {}): Promise<Plan> {
  return prepare(sql, actor, text, choices);
}

// The import, in one transaction: records made where a row found none,
// then each row's cells written as HR's own change ("imported" in the
// journal, field names only). The other tools are told what changed
// (Leave: numbers, first and last days) after.
export async function applyRecords(sql: Sql, actor: Member | null, text: unknown, choices: Choices = {}): Promise<{ created: number; updated: number; skipped: number }> {
  const p = await prepare(sql, actor, text, choices);
  if (p.missing) throw new AppError("import_invalid");
  const who = actor!;
  const usable = p.rows.filter(r => r.action);
  const names = new Map((await everyone()).people.map(x => [x.id, x.name]));
  const touched: string[] = [];
  const done = await sql.begin(async tx => {
    let created = 0, updated = 0;
    for (const row of usable) {
      let key = row.recordId;
      if (!key) {
        const legal = row.changes.legalName || (row.memberId ? names.get(row.memberId) ?? "" : row.name);
        const [made] = await tx<{ id: string }[]>`
          insert into records (member_id, legal_name, created_by) values (${row.memberId}, ${[...legal].slice(0, limits.name).join("") || "?"}, ${who.id})
          on conflict (member_id) do nothing returning id`;
        if (!made) continue;
        key = String(made.id);
        await note(tx, who, "created", { recordId: key });
        created++;
      }
      const given = read(row.changes as Record<string, unknown>) as Partial<Fields>;
      const { changed } = await writeRecord(tx, who, key, given, "imported");
      if (changed.length > 0 && row.recordId) updated++;
      touched.push(key);
    }
    return { created, updated };
  }).catch(error => { throw numberTaken(error); });
  await tellRecords(sql, touched);
  return { ...done, skipped: p.rows.length - usable.length };
}
