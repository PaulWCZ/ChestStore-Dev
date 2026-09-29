import { AppError } from "./app-error.ts";
import { isDay, isHalf, type Day, type Half } from "./calendar.ts";
import { parseCsv } from "./csv.ts";
import { limits } from "./model.ts";
import { normalize } from "./normalize.ts";

// Switching from Lucca, Factorial, PayFit or a spreadsheet: two imports,
// both a table (CSV, ";" or ",") read the same way. Pure: the caller gives
// the people and the kinds of leave; nothing is written here.
//
// - People and balances: one line per person — who (a full name, or last
//   and first names in two columns, or an employee number), then any of:
//   their start date, their employee number, and their balances, one column
//   per kind of leave. Paid leave may come in two columns, as pay slips and
//   Lucca's counters show it: "CP N-1" (acquired, to take now) and "CP N"
//   (being earned).
// - Approved leave: one line per absence — who, the kind, the first and
//   last day, and whether it starts or ends at noon (Lucca's absence export:
//   employeeNumber, startDate, flagStartDate AM/PM, endDate, flagEndDate —
//   see THIRD_PARTY.md for where these columns are documented).
//
// Headers are recognised in English and French, whatever their accents or
// case; a header that is not recognised is shown, and HR says what it is
// (a mapping), or it is ignored. Names are matched to the people who have
// the tool — accents, case and order aside; nothing is guessed: an unknown
// or ambiguous person, an unreadable number or date is shown, not imported.

export { normalize };

export type Part = "total" | "acquired" | "earning";
// What a column holds. "b:<typeId>:<part>" is a balance of a kind.
export type Field = "ignore" | "name" | "lastName" | "firstName" | "number" | "start" | "kind" | "from" | "fromHalf" | "to" | "toHalf" | "status" | `b:${string}:${Part}`;
export type Mapping = Record<number, Field>;
export type ImportColumn = { index: number; header: string; field: Field; known: boolean };

export type KindNames = { typeId: string; key: string | null; names: readonly string[]; split: boolean };
export type Person = { id: string; name: string; firstName: string; lastName: string; employeeNumber?: string | null };

export type Problem = "unknown" | "ambiguous" | "bad_number" | "bad_date" | "number_taken" | "unknown_kind" | "not_approved";
export type BalanceValue = { typeId: string; days: number | null; earning: number | null };
export type ImportRow = { line: number; name: string; memberId: string | null; problem: Problem | null; values: BalanceValue[]; start: Day | null; number: string | null };
export type ImportPlan = { columns: ImportColumn[]; rows: ImportRow[] };

export type LeaveRow = { line: number; name: string; memberId: string | null; problem: Problem | null; typeId: string | null; start: Day | null; startHalf: Half; end: Day | null; endHalf: Half };
// unknownKinds: the kinds named in the file the tool did not recognise
// (Lucca writes an account's id or its own name): HR says which kind each
// one is (a KindMap: the normalised text → a kind's id).
export type LeavePlan = { columns: ImportColumn[]; rows: LeaveRow[]; unknownKinds: string[] };
export type KindMap = Record<string, string>;

const words = (list: string[]) => new Set(list.map(normalize));
const personHeaders = {
  name: words(["Nom complet", "Nom et prénom", "Nom prénom", "Prénom nom", "Name", "Full name", "Employee", "Employee name", "Person", "Personne", "Collaborateur", "Salarié", "Salarie", "Utilisateur", "User"]),
  lastName: words(["Nom", "Nom de famille", "Last name", "Lastname", "Surname", "Family name"]),
  firstName: words(["Prénom", "First name", "Firstname", "Given name"]),
  number: words(["Matricule", "N° matricule", "Numéro de matricule", "Employee number", "EmployeeNumber", "Employee ID", "Payroll ID", "ID salarié", "Code salarié"]),
  start: words(["Date d'entrée", "Date d'embauche", "Entrée", "Date entrée", "Start date", "Hire date", "Hired on", "Arrival date", "Date d'arrivée"]),
  kind: words(["Type", "Type d'absence", "Type de congé", "Compte", "Compte d'absence", "Account", "AccountId", "Account ID", "AccountName", "Absence", "Kind", "Leave type", "Motif", "Nature"]),
  from: words(["Date de début", "Début", "Du", "Premier jour", "Start", "StartDate", "From", "First day", "Start day"]),
  fromHalf: words(["FlagStartDate", "Demi-journée de début", "Début matin/après-midi", "Début (matin/après-midi)", "Depuis", "Start half", "From half"]),
  to: words(["Date de fin", "Fin", "Au", "Dernier jour", "End", "EndDate", "To", "Last day", "End day"]),
  toHalf: words(["FlagEndDate", "Demi-journée de fin", "Fin matin/après-midi", "Fin (matin/après-midi)", "Jusqu'à", "End half", "To half"]),
  status: words(["Statut", "État", "Status", "IsApproved", "Approved", "Validé"]),
} as const;
// Headers known to hold nothing the tool needs (shown as ignored, no
// question asked).
const ignored = words(["LegalEntity", "Établissement", "Entité", "Société", "Company", "Department", "Service", "Département", "Email", "E-mail", "Commentaire", "Comment", "Note", "Durée", "Duration", "Days", "Jours", "Nombre de jours", "Ancienneté", "Seniority", "Manager", "Valideur"]);
// Other names the kinds of leave go by in exports and pay slips.
const aliases: Record<string, string[]> = {
  paid: ["CP", "Congés", "Congés payés", "Congé payé", "Conges payes", "Paid leave", "Annual leave", "Holiday", "Holidays", "Vacation", "PTO"],
  rtt: ["RTT", "JRTT", "Jours RTT", "Repos RTT"],
  sick: ["Maladie", "Arrêt maladie", "Arret maladie", "Sick", "Sickness", "Sick leave"],
  unpaid: ["Sans solde", "Congé sans solde", "Unpaid", "Unpaid leave"],
  remote: ["Télétravail", "Teletravail", "Remote", "Remote work", "Home office", "Work from home"],
  family: ["Événement familial", "Evenement familial", "Congé événement familial", "Family event", "Family leave"],
  other: ["Autre", "Autre absence", "Other", "Other absence"],
};
const partWords: [Part, Set<string>][] = [
  ["acquired", words(["N-1", "N 1", "Acquis", "Acquired", "Last year", "À poser", "A poser", "Reliquat", "N-1 acquis", "Acquis N-1", "Solde N-1"])],
  ["earning", words(["N", "En cours", "En cours d'acquisition", "Being earned", "In progress", "This year", "Acquis N", "N en cours", "Current year"])],
];
const prefixes = ["solde", "soldes", "balance", "compteur", "reste", "restant", "left", "remaining"];

// The kind of leave a header or a cell names ("CP N-1", "Congés payés
// 2025-2026", "RTT"), and which part of a paid-leave balance.
function kindOf(text: string, kinds: readonly KindNames[]): { typeId: string; part: Part } | null {
  let h = normalize(text);
  for (const p of prefixes) if (h.startsWith(p + " ")) h = h.slice(p.length + 1);
  h = h.replace(/\b(19|20)\d\d\b/gu, "").replace(/\s+/gu, " ").trim();
  const best: { typeId: string; part: Part; size: number }[] = [];
  for (const k of kinds) {
    const names = new Set([...k.names, ...(k.key ? aliases[k.key] ?? [] : [])].map(normalize).filter(Boolean));
    for (const n of names) {
      if (h === n) best.push({ typeId: k.typeId, part: "total", size: n.length });
      else if (h.startsWith(n + " ")) {
        const rest = h.slice(n.length + 1);
        const part = partWords.find(([, set]) => set.has(rest))?.[0];
        if (part) best.push({ typeId: k.typeId, part: k.split ? part : "total", size: n.length });
      }
    }
  }
  best.sort((a, b) => b.size - a.size);
  return best[0] ?? null;
}

function recognise(header: string, kinds: readonly KindNames[], allowed: readonly (keyof typeof personHeaders)[], balances: boolean): { field: Field; known: boolean } {
  const h = normalize(header);
  for (const key of allowed) if (personHeaders[key].has(h)) return { field: key, known: true };
  if (balances) {
    const k = kindOf(header, kinds);
    if (k) return { field: `b:${k.typeId}:${k.part}`, known: true };
  }
  if (ignored.has(h) || h === "") return { field: "ignore", known: true };
  return { field: "ignore", known: false };
}

// A number of days as spreadsheets write them: "12,5", "12.50", " 3 ".
export function readDays(cell: string): number | null | "bad" {
  const text = cell.trim().replace(/\s/gu, "").replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) > limits.adjustment) return "bad";
  return Math.round(n * 100) / 100;
}

// A date as exports write them: 2026-10-05, 05/10/2026, 5/10/2026,
// 05-10-2026, 05.10.2026 (day first: French and British files), with or
// without a time after it.
export function readDate(cell: string): Day | null | "bad" {
  const text = cell.trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?.*$/u, "");
  if (text === "") return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(text);
  let day: string | null = null;
  if (m) day = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u.exec(text);
  if (m) day = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return day && isDay(day) ? day : "bad";
}

// Morning or afternoon, as exports write it (AM/PM, matin/après-midi…).
function readHalf(cell: string, end: boolean): Half | null {
  const h = normalize(cell);
  if (h === "") return null;
  if (["am", "matin", "morning"].includes(h) || (end && ["midi", "noon", "12h", "12 00"].includes(h))) return "am";
  if (["pm", "apres midi", "afternoon", "soir", "evening"].includes(h) || (!end && ["midi", "noon", "12h", "12 00"].includes(h))) return "pm";
  return isHalf(h) ? h : null;
}

const approvedWords = words(["", "true", "1", "oui", "yes", "validé", "valide", "validée", "approuvé", "approuve", "approved", "accepté", "accepted", "confirmed", "confirmé"]);

function table(text: string): string[][] {
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const rows = parseCsv(text, limits.importRows + 1);
  if (rows.length > limits.importRows + 1) throw new AppError("import_invalid");
  return rows;
}

function columnsOf(header: string[], kinds: readonly KindNames[], allowed: readonly (keyof typeof personHeaders)[], balances: boolean, mapping: Mapping): ImportColumn[] {
  const columns = header.map((h, index) => {
    const guess = recognise(h, kinds, allowed, balances);
    const chosen = mapping[index];
    return { index, header: h.trim(), field: chosen && validField(chosen, kinds, allowed, balances) ? chosen : guess.field, known: guess.known || chosen !== undefined };
  });
  // A lone "Nom" column holds the whole name (the tool's own example, and
  // spreadsheets that write "Nom: Camille Martin").
  if (!columns.some(c => c.field === "firstName")) for (const c of columns) if (c.field === "lastName") c.field = "name";
  return columns;
}

function validField(field: string, kinds: readonly KindNames[], allowed: readonly string[], balances: boolean): boolean {
  if (field === "ignore" || allowed.includes(field)) return true;
  const m = /^b:(\d+):(total|acquired|earning)$/u.exec(field);
  return balances && m !== null && kinds.some(k => k.typeId === m[1] && (m[2] === "total" || k.split));
}

// Who a line is: by employee number first, then by name.
function matcher(people: readonly Person[]) {
  const byName = new Map<string, Set<string>>();
  const add = (key: string, id: string) => {
    if (!key) return;
    byName.set(key, (byName.get(key) ?? new Set()).add(id));
  };
  for (const p of people) {
    add(normalize(p.name), p.id);
    add(normalize(`${p.firstName} ${p.lastName}`), p.id);
    add(normalize(`${p.lastName} ${p.firstName}`), p.id);
  }
  const byNumber = new Map(people.filter(p => p.employeeNumber).map(p => [normalize(p.employeeNumber!), p.id]));
  return (cells: string[], columns: ImportColumn[]): { name: string; id: string | null; problem: Problem | null; number: string | null } => {
    const get = (f: Field) => columns.filter(c => c.field === f).map(c => (cells[c.index] ?? "").trim()).find(Boolean) ?? "";
    const number = get("number") || null;
    const name = get("name") || [get("firstName"), get("lastName")].filter(Boolean).join(" ");
    const known = number ? byNumber.get(normalize(number)) : undefined;
    if (known) return { name: name || number!, id: known, problem: null, number };
    const ids = byName.get(normalize(name));
    if (!ids) return { name: name || number || "", id: null, problem: "unknown", number };
    if (ids.size > 1) return { name, id: null, problem: "ambiguous", number };
    const id = [...ids][0]!;
    // A number that already belongs to someone else is not moved.
    if (number && people.some(p => p.id !== id && p.employeeNumber && normalize(p.employeeNumber) === normalize(number))) return { name, id, problem: "number_taken", number };
    return { name, id, problem: null, number };
  };
}

const hasPerson = (columns: ImportColumn[]) => columns.some(c => c.field === "name" || c.field === "number" || c.field === "lastName");

// planImport: people and balances.
export function planImport(text: string, kinds: readonly KindNames[], people: readonly Person[], mapping: Mapping = {}): ImportPlan {
  const [header, ...lines] = table(text);
  if (!header || header.length < 2) throw new AppError("import_invalid");
  const columns = columnsOf(header, kinds, ["name", "lastName", "firstName", "number", "start"], true, mapping);
  const data = columns.some(c => c.field.startsWith("b:") || c.field === "start" || c.field === "number");
  if (!hasPerson(columns) || !data) throw new AppError("import_invalid");
  const who = matcher(people);
  const rows: ImportRow[] = [];
  lines.forEach((cells, i) => {
    if (cells.every(c => !c.trim())) return;
    const m = who(cells, columns);
    let problem: Problem | null = m.problem;
    const values = new Map<string, BalanceValue>();
    let start: Day | null = null;
    for (const c of columns) {
      const cell = cells[c.index] ?? "";
      if (c.field === "start") {
        const d = readDate(cell);
        if (d === "bad") problem ??= "bad_date";
        else start = d;
        continue;
      }
      const b = /^b:(\d+):(total|acquired|earning)$/u.exec(c.field);
      if (!b) continue;
      const days = readDays(cell);
      if (days === "bad") {
        problem ??= "bad_number";
        continue;
      }
      if (days === null) continue;
      const v = values.get(b[1]!) ?? { typeId: b[1]!, days: null, earning: null };
      if (b[2] === "earning") v.earning = days;
      else v.days = Math.round(((v.days ?? 0) + days) * 100) / 100;
      values.set(b[1]!, v);
    }
    rows.push({ line: i + 2, name: m.name, memberId: m.id, problem, values: [...values.values()], start, number: m.number });
  });
  return { columns, rows };
}

// planLeave: approved leave, one line per absence.
export function planLeave(text: string, kinds: readonly KindNames[], people: readonly Person[], mapping: Mapping = {}, kindMap: KindMap = {}): LeavePlan {
  const [header, ...lines] = table(text);
  if (!header || header.length < 3) throw new AppError("import_invalid");
  const columns = columnsOf(header, kinds, ["name", "lastName", "firstName", "number", "kind", "from", "fromHalf", "to", "toHalf", "status"], false, mapping);
  if (!hasPerson(columns) || !columns.some(c => c.field === "from") || !columns.some(c => c.field === "kind")) throw new AppError("import_invalid");
  const who = matcher(people);
  const rows: LeaveRow[] = [];
  const unknownKinds = new Set<string>();
  lines.forEach((cells, i) => {
    if (cells.every(c => !c.trim())) return;
    const get = (f: Field) => columns.filter(c => c.field === f).map(c => cells[c.index] ?? "").find(v => v.trim()) ?? "";
    const m = who(cells, columns);
    let problem: Problem | null = m.problem === "number_taken" ? null : m.problem;
    const named = get("kind").trim();
    const chosen = kindMap[normalize(named)];
    const kind = chosen && kinds.some(k => k.typeId === chosen) ? { typeId: chosen } : kindOf(named, kinds);
    if (!kind) {
      problem ??= "unknown_kind";
      if (named) unknownKinds.add(named);
    }
    const from = readDate(get("from"));
    const to = columns.some(c => c.field === "to") ? readDate(get("to")) : from;
    if (from === "bad" || to === "bad" || from === null) problem ??= "bad_date";
    if (!approvedWords.has(normalize(get("status")))) problem ??= "not_approved";
    const start = from === "bad" ? null : from;
    const end = to === "bad" || to === null ? start : to;
    rows.push({
      line: i + 2, name: m.name, memberId: m.id, problem, typeId: kind?.typeId ?? null, start, end,
      startHalf: readHalf(get("fromHalf"), false) ?? "am", endHalf: readHalf(get("toHalf"), true) ?? "pm",
    });
  });
  return { columns, rows, unknownKinds: [...unknownKinds].slice(0, 50) };
}

// The fields HR may give a column the tool did not recognise.
export const personFields: readonly Field[] = ["ignore", "name", "lastName", "firstName", "number", "start"];
export const leaveFields: readonly Field[] = ["ignore", "name", "lastName", "firstName", "number", "kind", "from", "fromHalf", "to", "toHalf", "status"];
