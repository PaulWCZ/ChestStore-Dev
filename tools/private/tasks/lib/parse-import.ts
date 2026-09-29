import { parseCsv } from "./csv.ts";
import { AppError } from "./app-error.ts";
import { colors, limits, type Color } from "./model.ts";

// Reading another tool's export into one neutral shape: pure, so the page
// can show what will come before anything is sent. The mapping of Trello's
// fields follows WeKan's importer (MIT, see THIRD_PARTY.md), rewritten for
// this schema; no code is copied.

export type ImportedCard = {
  title: string;
  description: string;
  due: string | null;
  start: string | null;
  labels: string[];
  people: string[];
  checklist: { text: string; done: boolean }[];
  comments: { author: string; text: string; at: string | null }[];
  archived: boolean;
  // Files attached in the other tool: not brought (they stay there); the
  // page says how many.
  files: number;
};
// What a board brings, for the check before importing.
export function importedCounts(board: ImportedBoard): { columns: number; cards: number; files: number; people: string[] } {
  const cards = board.columns.flatMap(c => c.cards);
  return { columns: board.columns.length, cards: cards.length, files: cards.reduce((n, c) => n + c.files, 0), people: [...new Set(cards.flatMap(c => c.people))] };
}

export type ImportedBoard = {
  name: string;
  columns: { name: string; done: boolean; cards: ImportedCard[] }[];
  labels: { name: string; color: Color }[];
};

const cut = (value: unknown, max: number): string => [...(typeof value === "string" ? value : "").replace(/\r\n?/gu, "\n").trim()].slice(0, max).join("");
const oneLine = (value: unknown, max: number): string => cut(typeof value === "string" ? value.replace(/\s+/gu, " ") : "", max);

// Dates of the other tool (ISO, 2026-10-01, 01/10/2026 in a French sheet).
export function dayOf(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(text);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(text);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

const trelloColors: Record<string, Color> = { green: "leaf", lime: "leaf", yellow: "sun", orange: "sand", red: "tomato", purple: "grape", blue: "sky", sky: "sea", pink: "berry", black: "slate" };
const colorOf = (trello: unknown, index: number): Color => (typeof trello === "string" ? trelloColors[trello.split("_")[0]!] : undefined) ?? colors[index % colors.length]!;

type TrelloJson = {
  name?: unknown;
  lists?: { id?: unknown; name?: unknown; closed?: unknown; pos?: unknown }[];
  cards?: { id?: unknown; name?: unknown; desc?: unknown; idList?: unknown; closed?: unknown; pos?: unknown; due?: unknown; start?: unknown; idLabels?: unknown; idMembers?: unknown; idChecklists?: unknown; attachments?: unknown; badges?: { attachments?: unknown } }[];
  labels?: { id?: unknown; name?: unknown; color?: unknown }[];
  checklists?: { id?: unknown; idCard?: unknown; name?: unknown; checkItems?: { name?: unknown; state?: unknown; pos?: unknown }[] }[];
  members?: { id?: unknown; fullName?: unknown }[];
  actions?: { type?: unknown; date?: unknown; data?: { card?: { id?: unknown }; text?: unknown }; memberCreator?: { fullName?: unknown } }[];
};

const array = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export function fromTrello(text: string): ImportedBoard {
  let data: TrelloJson;
  try {
    data = JSON.parse(text) as TrelloJson;
  } catch {
    throw new AppError("import_invalid");
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.lists) || !Array.isArray(data.cards)) throw new AppError("import_invalid");
  const people = new Map(array<{ id?: unknown; fullName?: unknown }>(data.members).map(m => [String(m.id), oneLine(m.fullName, 120)]));
  const labels = array<{ id?: unknown; name?: unknown; color?: unknown }>(data.labels).slice(0, limits.labelsPerBoard);
  const labelName = new Map(labels.map((l, i) => [String(l.id), oneLine(l.name, limits.labelName) || String(colorOf(l.color, i))]));
  const checklists = array<NonNullable<TrelloJson["checklists"]>[number]>(data.checklists);
  const comments = array<NonNullable<TrelloJson["actions"]>[number]>(data.actions).filter(a => a.type === "commentCard");
  const lists = array<NonNullable<TrelloJson["lists"]>[number]>(data.lists).filter(l => l.closed !== true).sort((a, b) => num(a.pos) - num(b.pos)).slice(0, limits.columnsPerBoard);
  const cards = array<NonNullable<TrelloJson["cards"]>[number]>(data.cards).sort((a, b) => num(a.pos) - num(b.pos));
  return {
    name: oneLine(data.name, limits.boardName) || "Trello",
    labels: labels.map((l, i) => ({ name: labelName.get(String(l.id))!, color: colorOf(l.color, i) })),
    columns: lists.map(list => ({
      name: oneLine(list.name, limits.columnName) || "—",
      done: false,
      cards: cards.filter(c => c.idList === list.id).slice(0, limits.cardsPerBoard).map(c => ({
        title: oneLine(c.name, limits.title) || "—",
        description: cut(c.desc, limits.description),
        due: dayOf(c.due),
        start: dayOf(c.start),
        labels: array<unknown>(c.idLabels).map(l => labelName.get(String(l))).filter((l): l is string => !!l),
        people: array<unknown>(c.idMembers).map(m => people.get(String(m))).filter((m): m is string => !!m),
        checklist: checklists.filter(k => k.idCard === c.id).flatMap(k => array<{ name?: unknown; state?: unknown; pos?: unknown }>(k.checkItems).sort((a, b) => num(a.pos) - num(b.pos))).slice(0, limits.checkItemsPerCard).map(i => ({ text: oneLine(i.name, limits.checkItem) || "—", done: i.state === "complete" })),
        comments: comments.filter(a => a.data?.card?.id === c.id).reverse().map(a => ({ author: oneLine(a.memberCreator?.fullName, 120), text: cut(a.data?.text, limits.comment), at: typeof a.date === "string" ? a.date : null })).filter(x => x.text),
        archived: c.closed === true,
        files: Math.max(array<unknown>(c.attachments).length, num(c.badges?.attachments)),
      })),
    })),
  };
}

// The columns a CSV of tasks may have, by the names the tools give them.
const headers = {
  title: ["name", "card name", "task name", "title", "task", "titre", "nom", "tâche"],
  column: ["section/column", "section", "list name", "list", "column", "status", "colonne", "liste", "statut"],
  description: ["notes", "card description", "description", "details"],
  due: ["due date", "due", "due on", "échéance", "date d'échéance"],
  start: ["start date", "start", "start on", "début", "date de début"],
  people: ["assignee", "members", "assigned to", "owner", "responsable", "assigné"],
  labels: ["tags", "labels", "label", "étiquettes"],
  done: ["completed at", "completed", "done", "terminé"],
  parent: ["parent task", "parent"],
  archived: ["archived"],
};

export function fromCsv(text: string, fallbackName: string): ImportedBoard {
  const rows = parseCsv(text);
  const [head, ...body] = rows;
  if (!head) throw new AppError("import_invalid");
  const index = (names: readonly string[]) => head.findIndex(h => names.includes(h.trim().toLowerCase()));
  const at = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, index(v)])) as Record<keyof typeof headers, number>;
  if (at.title < 0) throw new AppError("import_invalid");
  const get = (row: string[], key: keyof typeof headers) => (at[key] >= 0 ? row[at[key]] ?? "" : "");
  const truthy = (value: string) => value.trim() !== "" && !/^(false|no|non|0)$/iu.test(value.trim());
  const split = (value: string) => value.split(/[,;]/u).map(v => oneLine(v, limits.labelName)).filter(Boolean);
  const columns: ImportedBoard["columns"] = [];
  const byTitle = new Map<string, ImportedCard>();
  const labelNames = new Set<string>();
  const subtasks: { parent: string; text: string; done: boolean }[] = [];
  for (const row of body.slice(0, limits.cardsPerBoard)) {
    const title = oneLine(get(row, "title"), limits.title);
    if (!title) continue;
    const done = truthy(get(row, "done"));
    const parent = oneLine(get(row, "parent"), limits.title);
    if (parent) {
      subtasks.push({ parent, text: title, done });
      continue;
    }
    const columnName = oneLine(get(row, "column"), limits.columnName) || "—";
    let column = columns.find(c => c.name === columnName);
    if (!column) {
      if (columns.length >= limits.columnsPerBoard) column = columns.at(-1)!;
      else {
        column = { name: columnName, done: false, cards: [] };
        columns.push(column);
      }
    }
    const labels = split(get(row, "labels"));
    labels.forEach(l => labelNames.add(l));
    const card: ImportedCard = { title, description: cut(get(row, "description"), limits.description), due: dayOf(get(row, "due")), start: dayOf(get(row, "start")), labels, people: split(get(row, "people")).slice(0, limits.assigneesPerCard), checklist: [], comments: [], archived: truthy(get(row, "archived")), files: 0 };
    // A completed task goes to a "done" column of its own.
    if (done) {
      let finished = columns.find(c => c.done);
      if (!finished) {
        finished = { name: "✓", done: true, cards: [] };
        columns.push(finished);
      }
      finished.cards.push(card);
    } else column.cards.push(card);
    byTitle.set(title, card);
  }
  for (const s of subtasks) byTitle.get(s.parent)?.checklist.push({ text: oneLine(s.text, limits.checkItem), done: s.done });
  if (columns.length === 0) throw new AppError("import_invalid");
  // The done column stays last.
  columns.sort((a, b) => Number(a.done) - Number(b.done));
  return { name: oneLine(fallbackName, limits.boardName) || "Import", columns, labels: [...labelNames].slice(0, limits.labelsPerBoard).map((name, i) => ({ name, color: colors[i % colors.length]! })) };
}

