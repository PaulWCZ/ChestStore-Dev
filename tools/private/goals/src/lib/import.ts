import type { Member } from "@argentic/chest-sdk/member";
import { chest } from "@argentic/chest-sdk/chest";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import { openCycle, readCycle } from "./cycles.ts";
import type { Query, Sql } from "./db.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { limits, type Confidence, type Kind, type Level } from "./model.ts";
import { unitLocaleOf } from "./objectives.ts";
import { everyone } from "./people.ts";
import { settings, teams as readTeams, type Team } from "./teams.ts";

// Importing a spreadsheet of objectives and key results: the file a
// company kept its OKRs in, Goals' own export (in English or French), or
// Lattice's goals file. The admin sees which column means what (guessed
// from the headers, changed in one select each), who each owner is (matched
// by name, or by the name in an email address; those not found are listed
// and given to someone), what will be added and which rows are left out,
// then imports. Pure reading and planning here; `runImport` writes, in one
// transaction.
//
// Two shapes of file:
// - one row per key result, its objective in a column (spreadsheets, Goals'
//   export, Perdoo's "Key Results" view): rows with the same objective are
//   one objective; an empty objective cell continues the one above;
// - a row per objective and a row per key result, a column saying which
//   (Lattice's "OKR Type"): a key result belongs to the objective row above
//   it — Lattice's file carries no link between them (its help centre says
//   parents are attached after the upload), so the order of the rows is
//   the link, and the preview shows it.

export const fields = ["objective", "keyResult", "rowKind", "owner", "krOwner", "level", "team", "parent", "why", "kind", "start", "target", "current", "unit", "confidence"] as const;
export type Field = (typeof fields)[number];
export type Mapping = Partial<Record<Field, number>>;
export type Preset = "goals" | "lattice" | "sheet";

export const importLimits = { chars: 1_000_000, rows: 2000, columns: 80 } as const;

export type Sheet = { headers: string[]; rows: string[][]; separator: "," | ";" };

// norm makes a header or a word comparable: no accents, no case, words
// separated by one space ("Résultat clé" → "resultat cle").
export function norm(text: string): string {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[’']/gu, " ").replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}

export function readSheet(text: unknown): Sheet {
  if (typeof text !== "string" || text.trim() === "") throw new AppError("import_invalid");
  if (text.length > importLimits.chars) throw new AppError("import_too_big");
  const clean = text.replace(/^﻿/u, "");
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/u));
  const separator = (firstLine.match(/;/gu)?.length ?? 0) > (firstLine.match(/,/gu)?.length ?? 0) ? ";" : ",";
  const all = parseCsv(clean, importLimits.rows + 1);
  if (all.length < 2) throw new AppError("import_invalid");
  if (all.length > importLimits.rows + 1) throw new AppError("import_too_big");
  const headers = all[0]!.map(h => h.trim()).slice(0, importLimits.columns);
  if (headers.every(h => h === "")) throw new AppError("import_invalid");
  const rows = all.slice(1).map(r => r.slice(0, headers.length)).filter(r => r.some(c => c.trim() !== ""));
  if (rows.length === 0) throw new AppError("import_invalid");
  return { headers, rows, separator };
}

// The words a header may be, per field: Goals' own export headers in every
// language, Lattice's template, and what spreadsheets usually say.
const synonyms: Record<Field, string[]> = {
  objective: ["objective", "objectives", "objective name", "objective title", "objectif", "objectifs", "o"],
  keyResult: ["key result", "key results", "key result name", "key result title", "kr", "result", "resultat cle", "resultats cles", "kr name"],
  rowKind: ["okr type", "goal type", "type of goal", "row type", "type de ligne"],
  owner: ["owner", "owner email", "owner name", "objective owner", "responsable", "responsable de l objectif", "assignee", "email", "proprietaire"],
  krOwner: ["key result owner", "kr owner", "responsable du resultat cle", "responsable du kr"],
  level: ["level", "niveau", "goal level", "scope"],
  team: ["team", "teams", "equipe", "department", "departement", "service"],
  parent: ["supports", "contribue a", "parent", "parent goal", "parent objective", "aligned to", "aligned with", "objectif parent"],
  why: ["description", "why", "why it matters", "pourquoi", "pourquoi c est important", "details", "notes"],
  kind: ["type", "measured as", "mesure par", "metric", "metric type", "measure", "measurement", "unit type", "kind"],
  start: ["start", "start value", "starting amount", "starting value", "initial value", "baseline", "depart", "valeur de depart", "valeur initiale", "from", "de"],
  target: ["target", "target value", "goal amount", "target amount", "cible", "valeur cible", "objectif chiffre", "to"],
  current: ["current", "current value", "progress amount", "actual", "value", "valeur actuelle", "actuel", "valeur", "now"],
  unit: ["unit", "units", "unite", "unites"],
  confidence: ["confidence", "confiance", "status", "statut", "health"],
};

// Goals' own export headers, in every language, are the first guess.
function ownHeaders(): Partial<Record<Field, string[]>> {
  const h = [en.export.headers, fr.export.headers];
  return {
    level: h.map(x => norm(x.level)), team: h.map(x => norm(x.team)), objective: h.map(x => norm(x.objective)), parent: h.map(x => norm(x.alignedTo)),
    owner: h.map(x => norm(x.objectiveOwner)), keyResult: h.map(x => norm(x.keyResult)), krOwner: h.map(x => norm(x.keyResultOwner)), kind: h.map(x => norm(x.type)),
    start: h.map(x => norm(x.start)), target: h.map(x => norm(x.target)), current: h.map(x => norm(x.current)), unit: h.map(x => norm(x.unit)), confidence: h.map(x => norm(x.confidence)),
  };
}

// guess reads the headers: which column is which field, and which kind of
// file it is. Each column goes to one field at most.
export function guess(headers: string[]): { preset: Preset; mapping: Mapping } {
  const normal = headers.map(norm);
  const mapping: Mapping = {};
  const taken = new Set<number>();
  const own = ownHeaders();
  const lattice = normal.includes("okr type") && normal.some(h => h === "owner email");
  const ours = (own.keyResult ?? []).some(k => normal.includes(k)) && (own.objective ?? []).some(k => normal.includes(k)) && (own.level ?? []).some(k => normal.includes(k));
  const order: Field[] = ["krOwner", "rowKind", "keyResult", "objective", "owner", "level", "team", "parent", "why", "kind", "start", "target", "current", "unit", "confidence"];
  for (const field of order) {
    const words = [...(own[field] ?? []), ...synonyms[field]];
    const i = normal.findIndex((h, j) => !taken.has(j) && words.includes(h));
    if (i >= 0) {
      mapping[field] = i;
      taken.add(i);
    }
  }
  if (lattice) {
    // Lattice's file: one "Name" (or "Title") column holds both objectives
    // and key results; "OKR Type" says which.
    const name = normal.findIndex(h => h === "name" || h === "title" || h === "goal name" || h === "goal");
    if (name >= 0) {
      mapping.objective = name;
      mapping.keyResult = name;
    }
  }
  return { preset: lattice ? "lattice" : ours ? "goals" : "sheet", mapping };
}

// checkMapping keeps a mapping a person sent: known fields, columns that
// exist, the objective's column given.
export function checkMapping(value: unknown, columns: number): Mapping {
  if (!value || typeof value !== "object") throw new AppError("invalid");
  const out: Mapping = {};
  for (const [key, index] of Object.entries(value as Record<string, unknown>)) {
    if (!(fields as readonly string[]).includes(key)) continue;
    if (index === null || index === undefined || index === "" || index === -1) continue;
    const n = Number(index);
    if (!Number.isInteger(n) || n < 0 || n >= columns) throw new AppError("invalid");
    out[key as Field] = n;
  }
  if (out.objective === undefined) throw new AppError("import_no_objective");
  return out;
}

// A number as a spreadsheet wrote it: "1,200.50", "1 200,5", "18 000 €",
// "35%". A file separated by ";" writes decimals with a comma.
export function readNumber(text: string, decimalComma: boolean): number | null {
  let t = text.trim().replace(/[\s  ]/gu, "").replace(/[€$£%]|[A-Z]{3}$/gu, "");
  if (t === "") return null;
  if (!/^[+-]?[\d.,]+$/u.test(t)) return Number.NaN;
  const comma = t.lastIndexOf(","), dot = t.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) t = comma > dot ? t.replace(/\./gu, "").replace(",", ".") : t.replace(/,/gu, "");
  else if (comma >= 0) t = !decimalComma && /^[+-]?\d{1,3}(,\d{3})+$/u.test(t) ? t.replace(/,/gu, "") : t.replace(/,/gu, ".");
  else if (dot >= 0 && decimalComma && /^[+-]?\d{1,3}(\.\d{3})+$/u.test(t)) t = t.replace(/\./gu, "");
  const n = Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > limits.value) return Number.NaN;
  return Math.round(n * 10000) / 10000;
}

const kindWords: Record<Kind, string[]> = {
  number: ["number", "numeric", "digit", "count", "nombre", "chiffre", "numerique", ...[en, fr].map(c => norm(c.kinds.number))],
  percent: ["percent", "percentage", "pourcentage", "%", ...[en, fr].map(c => norm(c.kinds.percent))],
  money: ["money", "dollar", "currency", "amount", "revenue", "montant", "euro", "argent", ...[en, fr].map(c => norm(c.kinds.money))],
  milestone: ["milestone", "binary", "boolean", "yes no", "done or not", "done", "jalon", "oui non", "fait ou pas", ...[en, fr].map(c => norm(c.kinds.milestone))],
};
const confidenceWords: Record<Confidence, string[]> = {
  on_track: ["on track", "green", "ok", "good", "en bonne voie", "vert", ...[en, fr].map(c => norm(c.confidence.on_track))],
  at_risk: ["at risk", "amber", "yellow", "orange", "needs attention", "a risque", "a surveiller", ...[en, fr].map(c => norm(c.confidence.at_risk))],
  off_track: ["off track", "red", "behind", "rouge", "en retard", "hors trajectoire", ...[en, fr].map(c => norm(c.confidence.off_track))],
};
const levelWords: Record<Level, string[]> = {
  company: ["company", "entreprise", "societe", "organisation", "organization", "org"],
  team: ["team", "equipe", "department", "departement"],
  personal: ["personal", "personnel", "individual", "individuel", "person", "moi"],
};
const doneWords = ["done", "yes", "true", "1", "100", "100%", "fait", "oui", "vrai", "achieved", "complete", "completed", "atteint", norm(en.export.done), norm(fr.export.done)];
const krWords = ["key result", "kr", "result", "resultat cle", "resultat"];
const objectiveWords = ["objective", "objectif", "goal", "o"];

const pick = <T extends string>(table: Record<T, string[]>, value: string): T | null => {
  const n = norm(value);
  if (n === "") return null;
  for (const [key, words] of Object.entries(table) as [T, string[]][]) if (words.includes(n)) return key;
  return null;
};

// People: a name or an address, found among the members who have Goals.
export type Person = { id: string; name: string };
export function personKey(value: string): string {
  const text = value.trim();
  const at = text.indexOf("@");
  // "camille.martin@atelier.fr" is looked for as "camille martin".
  return norm(at > 0 ? text.slice(0, at).replace(/[._+-]+/gu, " ") : text);
}
export function matchPerson(key: string, people: Person[]): string | null {
  if (key === "") return null;
  const found = people.filter(p => {
    const n = norm(p.name);
    const parts = n.split(" ");
    const reversed = [...parts.slice(1), parts[0]].join(" ");
    return n === key || reversed === key || (parts.length > 1 && `${parts[0]![0]} ${parts.slice(1).join(" ")}` === key);
  });
  return found.length === 1 ? found[0]!.id : null;
}

export type RowProblem = { row: number; code: "no_title" | "target_missing" | "same_values" | "bad_number" | "too_long" | "too_many_krs" | "kr_without_objective" | "personal_off" | "parent_not_found" | "team_archived" };
export type PlannedKr = { row: number; title: string; kind: Kind; unit: string; start: number; target: number; current: number; confidence: Confidence | null; owner: string };
export type PlannedObjective = { row: number; title: string; level: Level; team: string | null; parent: string | null; why: string; owner: string; keyResults: PlannedKr[]; exists: boolean };
export type Plan = {
  objectives: PlannedObjective[];
  problems: RowProblem[];
  // Each owner as written, how many rows name them, whom it matched.
  owners: { key: string; written: string; rows: number; match: string | null }[];
  newTeams: string[];
};

type Context = { people: Person[]; teams: Team[]; existing: { title: string; level: Level }[]; personal: boolean; currency: string; chosen: Record<string, string> };

// plan reads the rows with a mapping: what would be added, who owns it,
// what is left out and why. Nothing is written.
export function plan(sheet: Sheet, mapping: Mapping, ctx: Context): Plan {
  const decimalComma = sheet.separator === ";";
  const cell = (row: string[], field: Field): string => (mapping[field] === undefined ? "" : (row[mapping[field]!] ?? "").trim());
  const problems: RowProblem[] = [];
  const owners = new Map<string, { written: string; rows: number }>();
  const ownerOf = (written: string): string => {
    const key = personKey(written);
    if (key === "") return "";
    const seen = owners.get(key);
    owners.set(key, { written: seen?.written ?? written, rows: (seen?.rows ?? 0) + 1 });
    return key;
  };
  const objectives: PlannedObjective[] = [];
  const byTitle = new Map<string, PlannedObjective>();
  const existing = new Set(ctx.existing.map(e => norm(e.title)));
  const teamNames = new Map(ctx.teams.map(t => [norm(t.name), t]));
  const newTeams = new Map<string, string>();
  let last: PlannedObjective | null = null;
  const twoShapes = mapping.rowKind !== undefined;

  sheet.rows.forEach((row, i) => {
    const n = i + 2; // the row's number in the spreadsheet (its header is row 1)
    let objectiveTitle = cell(row, "objective");
    let krTitle = cell(row, "keyResult");
    if (twoShapes) {
      const kindText = norm(cell(row, "rowKind"));
      const isKr = krWords.includes(kindText) || kindText.includes("key");
      if (isKr) {
        if (!last) return void problems.push({ row: n, code: "kr_without_objective" });
        objectiveTitle = "";
        krTitle = cell(row, "keyResult") || cell(row, "objective");
      } else if (objectiveWords.includes(kindText) || kindText === "") {
        krTitle = "";
      }
    }
    let o: PlannedObjective | null;
    if (objectiveTitle === "") {
      o = last;
      if (!o) return void problems.push({ row: n, code: "no_title" });
    } else {
      if ([...objectiveTitle].length > limits.title) return void problems.push({ row: n, code: "too_long" });
      const key = norm(objectiveTitle);
      o = byTitle.get(key) ?? null;
      if (!o) {
        const levelText = cell(row, "level");
        const teamText = cell(row, "team");
        let level: Level = pick(levelWords, levelText) ?? (teamText ? "team" : "company");
        if (level === "team" && !teamText) level = "company";
        if (level === "personal" && !ctx.personal) return void problems.push({ row: n, code: "personal_off" });
        let team: string | null = null;
        if (level === "team") {
          const found = teamNames.get(norm(teamText));
          if (found?.archived) return void problems.push({ row: n, code: "team_archived" });
          team = found?.name ?? teamText.slice(0, limits.teamName);
          if (!found) newTeams.set(norm(teamText), team);
        }
        const why = cell(row, "why").slice(0, limits.why);
        o = { row: n, title: objectiveTitle, level, team, parent: cell(row, "parent") || null, why, owner: ownerOf(cell(row, "owner")), keyResults: [], exists: existing.has(key) };
        byTitle.set(key, o);
        objectives.push(o);
      }
    }
    last = o;
    if (krTitle === "") return;
    if ([...krTitle].length > limits.title) return void problems.push({ row: n, code: "too_long" });
    if (o.keyResults.length >= limits.keyResultsPerObjective) return void problems.push({ row: n, code: "too_many_krs" });
    const unitText = cell(row, "unit");
    const startText = cell(row, "start"), targetText = cell(row, "target"), currentText = cell(row, "current");
    let kind: Kind | null = pick(kindWords, cell(row, "kind"));
    if (!kind) {
      if (unitText === "%" || /%\s*$/u.test(targetText)) kind = "percent";
      else if (/^[A-Z]{3}$/u.test(unitText) || /[€$£]/u.test(targetText)) kind = "money";
      else if (targetText === "" && startText === "") kind = "milestone";
      else kind = "number";
    }
    // Without a column of its own, a key result's owner is the row's owner
    // (a spreadsheet with one "Owner" column names who does each line).
    const who = ownerOf(cell(row, "krOwner")) || (twoShapes || mapping.krOwner === undefined ? ownerOf(cell(row, "owner")) : "") || o.owner;
    const confidence = pick(confidenceWords, cell(row, "confidence"));
    if (kind === "milestone") {
      const done = doneWords.includes(norm(currentText)) || (readNumber(currentText, decimalComma) ?? 0) >= 1;
      o.keyResults.push({ row: n, title: krTitle, kind, unit: "", start: 0, target: 1, current: done ? 1 : 0, confidence, owner: who });
      return;
    }
    const start = readNumber(startText, decimalComma) ?? 0;
    const target = readNumber(targetText, decimalComma);
    const current = readNumber(currentText, decimalComma) ?? start;
    if (target === null) return void problems.push({ row: n, code: "target_missing" });
    if ([start, target, current].some(Number.isNaN)) return void problems.push({ row: n, code: "bad_number" });
    if (start === target) return void problems.push({ row: n, code: "same_values" });
    const unit = kind === "number" && !/^[A-Z]{3}$/u.test(unitText) && unitText !== "%" ? unitText.slice(0, limits.unit) : "";
    o.keyResults.push({ row: n, title: krTitle, kind, unit, start, target, current, confidence, owner: who });
  });

  // What an objective supports: another of the file, or of the cycle, of a
  // level it may support (a team's: a company objective; a person's: a
  // company or team one).
  const levelOf = new Map<string, Level>([...ctx.existing.map(e => [norm(e.title), e.level] as const), ...objectives.map(o => [norm(o.title), o.level] as const)]);
  for (const o of objectives) {
    if (!o.parent) continue;
    const parentLevel = levelOf.get(norm(o.parent));
    const allowed: Level[] = o.level === "team" ? ["company"] : o.level === "personal" ? ["company", "team"] : [];
    if (!parentLevel || !allowed.includes(parentLevel) || norm(o.parent) === norm(o.title)) {
      problems.push({ row: o.row, code: "parent_not_found" });
      o.parent = null;
    }
  }
  return {
    objectives,
    problems: problems.sort((a, b) => a.row - b.row),
    owners: [...owners].map(([key, v]) => ({ key, written: v.written, rows: v.rows, match: ctx.chosen[key] ?? matchPerson(key, ctx.people) })),
    newTeams: [...newTeams.values()],
  };
}

async function contextFor(sql: Query, cycleId: string, chosen: unknown): Promise<Context> {
  const [people, teamList, { personal }, existing] = await Promise.all([
    everyone(),
    readTeams(sql, { archived: true }),
    settings(sql),
    sql<{ title: string; level: Level }[]>`select title, level from objectives where cycle_id = ${cycleId} and archived_at is null`,
  ]);
  const picks: Record<string, string> = {};
  if (chosen && typeof chosen === "object") {
    const ids = new Set(people.map(p => p.id));
    for (const [key, value] of Object.entries(chosen as Record<string, unknown>).slice(0, 500)) if (typeof value === "string" && ids.has(value)) picks[key] = value;
  }
  return { people, teams: teamList, existing: [...existing], personal, currency: chest.currency, chosen: picks };
}

function admin(actor: Member | null): Member {
  if (!actor || !can(actor, "any.write")) throw new AppError("forbidden");
  return actor;
}

export type Preview = { headers: string[]; sample: string[][]; rows: number; preset: Preset; mapping: Mapping; plan: Plan };

// What the import page shows: the columns, a few rows, the mapping (the
// guess, or the admin's), and the plan.
export async function previewImport(sql: Sql, actor: Member | null, input: { text?: unknown; mapping?: unknown; cycleId?: unknown; owners?: unknown }): Promise<Preview> {
  admin(actor);
  const cycle = await openCycle(sql, (await readCycle(sql, actor, input.cycleId)).id);
  const sheet = readSheet(input.text);
  const guessed = guess(sheet.headers);
  const mapping = input.mapping === undefined || input.mapping === null ? guessed.mapping : checkMapping(input.mapping, sheet.headers.length);
  if (mapping.objective === undefined) return { headers: sheet.headers, sample: sheet.rows.slice(0, 3), rows: sheet.rows.length, preset: guessed.preset, mapping, plan: { objectives: [], problems: [], owners: [], newTeams: [] } };
  const p = plan(sheet, mapping, await contextFor(sql, cycle.id, input.owners));
  return { headers: sheet.headers, sample: sheet.rows.slice(0, 3), rows: sheet.rows.length, preset: guessed.preset, mapping, plan: p };
}

// The import itself: every planned objective not already in the cycle,
// with its key results (their values now, and a first check-in when the
// file says how sure the owner is), the new teams, the owners matched or
// chosen (the admin otherwise). One transaction: all or nothing.
export async function runImport(sql: Sql, actor: Member | null, input: { text?: unknown; mapping?: unknown; cycleId?: unknown; owners?: unknown }): Promise<{ objectives: string[]; keyResults: number; owners: string[] }> {
  const who = admin(actor);
  const cycle = await openCycle(sql, (await readCycle(sql, actor, input.cycleId)).id);
  const sheet = readSheet(input.text);
  const mapping = checkMapping(input.mapping, sheet.headers.length);
  const ctx = await contextFor(sql, cycle.id, input.owners);
  const p = plan(sheet, mapping, ctx);
  const ownerId = new Map(p.owners.map(o => [o.key, o.match ?? who.id]));
  const idOf = (key: string, fallback: string) => (key === "" ? fallback : ownerId.get(key) ?? fallback);
  const todo = p.objectives.filter(o => !o.exists);
  if (todo.length === 0) throw new AppError("import_nothing");
  const currency = ctx.currency;
  return sql.begin(async tx => {
    const [{ n }] = (await tx<{ n: string }[]>`select count(*) as n from objectives where cycle_id = ${cycle.id} and archived_at is null`) as unknown as [{ n: string }];
    if (Number(n) + todo.length > limits.objectivesPerCycle) throw new AppError("too_many", { max: limits.objectivesPerCycle });
    // Teams named in the file that do not exist yet.
    const teamIds = new Map((await tx<{ id: string; name: string; group_id: string | null }[]>`select id, name, group_id from teams where archived_at is null`).map(r => [norm(r.name), String(r.id)]));
    for (const t of ctx.teams) if (!t.archived) teamIds.set(norm(t.name), t.id);
    for (const name of p.newTeams) {
      if (teamIds.has(norm(name))) continue;
      const [row] = await tx<{ id: string }[]>`insert into teams (name) values (${name}) returning id`;
      teamIds.set(norm(name), String(row!.id));
    }
    const made = new Map<string, string>();
    const existingIds = new Map((await tx<{ id: string; title: string }[]>`select id, title from objectives where cycle_id = ${cycle.id} and archived_at is null`).map(r => [norm(r.title), String(r.id)]));
    // Company objectives first, then teams', then people's: a parent is
    // written before what supports it.
    const rank: Record<Level, number> = { company: 0, team: 1, personal: 2 };
    let krCount = 0;
    const told = new Set<string>();
    for (const o of [...todo].sort((a, b) => rank[a.level] - rank[b.level] || a.row - b.row)) {
      const owner = idOf(o.owner, who.id);
      const teamId = o.level === "team" ? teamIds.get(norm(o.team ?? "")) ?? null : null;
      const parentId = o.parent ? made.get(norm(o.parent)) ?? existingIds.get(norm(o.parent)) ?? null : null;
      const [row] = await tx<{ id: string }[]>`
        insert into objectives (cycle_id, level, team_id, parent_id, owner, title, why, position, created_by)
        values (${cycle.id}, ${o.level}, ${teamId}, ${parentId}, ${owner}, ${o.title}, ${o.why},
          (select coalesce(max(position), 0) + 1 from objectives where cycle_id = ${cycle.id} and level = ${o.level}), ${who.id})
        returning id`;
      const objectiveId = String(row!.id);
      made.set(norm(o.title), objectiveId);
      told.add(owner);
      for (const k of o.keyResults) {
        const krOwner = idOf(k.owner, owner);
        told.add(krOwner);
        const [kr] = await tx<{ id: string }[]>`
          insert into key_results (objective_id, title, kind, unit, unit_locale, currency, start_value, target_value, current_value, weight, owner, position, created_by)
          values (${objectiveId}, ${k.title}, ${k.kind}, ${k.unit}, ${k.unit ? unitLocaleOf(who) : null}, ${k.kind === "money" ? currency : null}, ${k.start}, ${k.target}, ${k.current}, 1, ${krOwner},
            (select coalesce(max(position), 0) + 1 from key_results where objective_id = ${objectiveId}), ${who.id})
          returning id`;
        if (k.confidence) await tx`insert into check_ins (key_result_id, value, confidence, note, author) values (${kr!.id}, ${k.current}, ${k.confidence}, '', ${who.id})`;
        krCount++;
      }
    }
    return { objectives: [...made.values()], keyResults: krCount, owners: [...told].filter(x => x !== who.id) };
  });
}

// Undo of an import: the objectives it added, archived (with their key
// results), while nobody changed the cycle's state.
export async function undoImport(sql: Sql, actor: Member | null, ids: unknown): Promise<number> {
  const who = admin(actor);
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > limits.objectivesPerCycle) throw new AppError("invalid");
  const clean = ids.map(i => (typeof i === "string" && /^[1-9][0-9]{0,17}$/u.test(i) ? i : null));
  if (clean.some(i => i === null)) throw new AppError("invalid");
  const rows = await sql`update objectives o set archived_at = now() from cycles y where y.id = o.cycle_id and y.closed_at is null and o.id in ${sql(clean as string[])} and o.created_by = ${who.id} and o.archived_at is null returning o.id`;
  return rows.length;
}
