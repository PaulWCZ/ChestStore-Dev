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
  // Ticked done in the other tool without being moved (Trello's "mark the
  // due date complete", dueComplete): it goes to a done column (arrange).
  complete: boolean;
  // Files attached in the other tool: not brought (they stay there); the
  // page says how many.
  files: number;
};
// What a board brings, for the check before importing: columns and cards
// (archived columns apart: they come, archived), files left behind, the
// people named, the cards ticked done that go to a done column.
export type ImportCounts = { columns: number; cards: number; files: number; people: string[]; archivedColumns: number; archivedCards: number; ticked: number };
export function importedCounts(board: ImportedBoard): ImportCounts {
  const open = board.columns.filter(c => !c.archived);
  const shut = board.columns.filter(c => c.archived);
  const cards = board.columns.flatMap(c => c.cards);
  return {
    columns: open.length,
    cards: open.reduce((n, c) => n + c.cards.length, 0),
    files: cards.reduce((n, c) => n + c.files, 0),
    people: [...new Set(cards.flatMap(c => c.people))],
    archivedColumns: shut.length,
    archivedCards: shut.reduce((n, c) => n + c.cards.length, 0),
    ticked: open.filter(c => !c.done).reduce((n, c) => n + c.cards.filter(k => k.complete).length, 0),
  };
}

export type ImportedColumn = { name: string; done: boolean; archived: boolean; cards: ImportedCard[] };
export type ImportedBoard = {
  name: string;
  columns: ImportedColumn[];
  labels: { name: string; color: Color }[];
};

// The name of a column of finished work, in English or French: "Done",
// "Fait", "Terminé", "Closed", "Livré ✅"… A word of the name counts, so
// "Done this week" is one; "Not done" or "Pas fini" are not.
const doneWords = new Set(["done", "fait", "faits", "faite", "faites", "fini", "finis", "finie", "finies", "termine", "terminee", "termines", "terminees", "complete", "completed", "finished", "closed", "clos", "cloture", "cloturee", "clotures", "shipped", "livre", "livree", "livres", "realise", "realisee", "realises", "resolved", "resolu", "resolus", "archive"]);
const notWords = new Set(["not", "pas", "non", "undone"]);
const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
export function looksDone(name: string): boolean {
  const words = fold(name).split(/[^a-z0-9]+/u).filter(Boolean);
  return (words.some(w => doneWords.has(w)) && !words.some(w => notWords.has(w))) || /^\s*(✓|✔|✅)/u.test(name);
}

// Where a column sits in a usual workflow, for a CSV whose rows come in any
// order: to do, (the rest), doing, to check, done.
const stages: [RegExp, number][] = [
  [/^(a faire|to ?do|todo|backlog|idees?|ideas?|new|nouveaux?|nouvelles?|inbox|a planifier|planned|prevu|not started|pas commence|open|ouvert)$/u, 0],
  [/^(en cours|doing|in progress|wip|ongoing|started|commence)$/u, 2],
  [/^(a valider|a verifier|en revue|review|in review|to review|to check|validation|test|testing|qa|en attente de validation)$/u, 3],
];
function stageOf(column: ImportedColumn): number {
  if (column.done) return 4;
  const name = fold(column.name).replace(/[^a-z0-9 ]+/gu, " ").replace(/\s+/gu, " ").trim();
  return stages.find(([pattern]) => pattern.test(name))?.[1] ?? 1;
}

// arrange settles what is finished before a board is written, the same on
// the page (to show it) and on the server: the columns chosen as holding
// finished work (by default those named so), and the cards ticked done
// elsewhere, which move to the first of them — or to a done column of
// their own (named by the importer's language) when there is none.
// `done` lists the indexes of the columns the person marked; indexes of
// archived columns or out of range are ignored.
export function arrange(board: ImportedBoard, done?: readonly number[] | null): ImportedBoard {
  const columns: ImportedColumn[] = board.columns.map((c, i) => ({ ...c, done: c.archived || !done ? c.done : done.includes(i), cards: [...c.cards] }));
  const ticked = columns.filter(c => !c.archived && !c.done).flatMap(c => c.cards.filter(k => k.complete));
  if (ticked.length === 0) return { ...board, columns };
  for (const c of columns) if (!c.archived && !c.done) c.cards = c.cards.filter(k => !k.complete);
  let finished = columns.find(c => c.done && !c.archived);
  if (!finished) {
    finished = { name: "✓", done: true, archived: false, cards: [] };
    const last = columns.findLastIndex(c => !c.archived);
    columns.splice(last + 1, 0, finished);
  }
  finished.cards.push(...ticked);
  return { ...board, columns };
}

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
  cards?: { id?: unknown; name?: unknown; desc?: unknown; idList?: unknown; closed?: unknown; pos?: unknown; due?: unknown; dueComplete?: unknown; start?: unknown; idLabels?: unknown; idMembers?: unknown; idChecklists?: unknown; attachments?: { name?: unknown; url?: unknown; isUpload?: unknown }[]; badges?: { attachments?: unknown } }[];
  labels?: { id?: unknown; name?: unknown; color?: unknown }[];
  checklists?: { id?: unknown; idCard?: unknown; name?: unknown; checkItems?: { name?: unknown; state?: unknown; pos?: unknown }[] }[];
  members?: { id?: unknown; fullName?: unknown }[];
  actions?: { type?: unknown; date?: unknown; data?: { card?: { id?: unknown }; text?: unknown }; memberCreator?: { fullName?: unknown } }[];
};

const array = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// A Trello "attachment" that is a link (its name is its address, or it was
// not uploaded) is a link, not a file: it comes into the description, as
// WeKan's importer does. Uploaded files stay in Trello (counted).
const isLink = (a: { name?: unknown; url?: unknown; isUpload?: unknown }): boolean => typeof a.url === "string" && /^https?:\/\//u.test(a.url) && (a.isUpload === false || a.name === a.url);
function withLinks(desc: unknown, attachments: { name?: unknown; url?: unknown; isUpload?: unknown }[]): string {
  const links = attachments.filter(isLink).map(a => (typeof a.name === "string" && a.name !== a.url ? `- [${oneLine(a.name, 100).replace(/[[\]]/gu, "")}](${String(a.url)})` : `- ${String(a.url)}`));
  const text = typeof desc === "string" ? desc.trim() : "";
  return links.length === 0 ? text : [text, links.join("\n")].filter(Boolean).join("\n\n");
}

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
  // Archived lists come too, archived (their cards with them): nothing is
  // left behind without a word. Open lists first, each group in Trello's
  // order.
  const lists = array<NonNullable<TrelloJson["lists"]>[number]>(data.lists).sort((a, b) => Number(a.closed === true) - Number(b.closed === true) || num(a.pos) - num(b.pos)).slice(0, limits.columnsPerBoard);
  const cards = array<NonNullable<TrelloJson["cards"]>[number]>(data.cards).sort((a, b) => num(a.pos) - num(b.pos));
  return {
    name: oneLine(data.name, limits.boardName) || "Trello",
    labels: labels.map((l, i) => ({ name: labelName.get(String(l.id))!, color: colorOf(l.color, i) })),
    columns: lists.map(list => ({
      name: oneLine(list.name, limits.columnName) || "—",
      // A list named Done, Fait, Terminé… holds finished work; the page
      // lets the person change it before importing (arrange).
      done: looksDone(oneLine(list.name, limits.columnName)),
      archived: list.closed === true,
      cards: cards.filter(c => c.idList === list.id).slice(0, limits.cardsPerBoard).map(c => ({
        title: oneLine(c.name, limits.title) || "—",
        description: cut(withLinks(c.desc, array<{ name?: unknown; url?: unknown; isUpload?: unknown }>(c.attachments)), limits.description),
        due: dayOf(c.due),
        start: dayOf(c.start),
        labels: array<unknown>(c.idLabels).map(l => labelName.get(String(l))).filter((l): l is string => !!l),
        people: array<unknown>(c.idMembers).map(m => people.get(String(m))).filter((m): m is string => !!m),
        checklist: checklists.filter(k => k.idCard === c.id).flatMap(k => array<{ name?: unknown; state?: unknown; pos?: unknown }>(k.checkItems).sort((a, b) => num(a.pos) - num(b.pos))).slice(0, limits.checkItemsPerCard).map(i => ({ text: oneLine(i.name, limits.checkItem) || "—", done: i.state === "complete" })),
        comments: comments.filter(a => a.data?.card?.id === c.id).reverse().map(a => ({ author: oneLine(a.memberCreator?.fullName, 120), text: cut(a.data?.text, limits.comment), at: typeof a.date === "string" ? a.date : null })).filter(x => x.text),
        archived: c.closed === true,
        // "Mark complete" on the due date: finished, wherever it sits.
        complete: c.dueComplete === true && typeof c.due === "string",
        files: Math.max(array<{ name?: unknown; url?: unknown; isUpload?: unknown }>(c.attachments).filter(a => !isLink(a)).length, num(c.badges?.attachments) - array<{ name?: unknown; url?: unknown; isUpload?: unknown }>(c.attachments).filter(isLink).length),
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
        // A status "Fait", "Terminé", "Done"… is a column of finished work.
        column = { name: columnName, done: looksDone(columnName), archived: false, cards: [] };
        columns.push(column);
      }
    }
    const labels = split(get(row, "labels"));
    labels.forEach(l => labelNames.add(l));
    const card: ImportedCard = { title, description: cut(get(row, "description"), limits.description), due: dayOf(get(row, "due")), start: dayOf(get(row, "start")), labels, people: split(get(row, "people")).slice(0, limits.assigneesPerCard), checklist: [], comments: [], archived: truthy(get(row, "archived")), complete: done, files: 0 };
    // A completed task goes to a done column (arrange: the first one, or
    // one of its own).
    column.cards.push(card);
    byTitle.set(title, card);
  }
  for (const s of subtasks) byTitle.get(s.parent)?.checklist.push({ text: oneLine(s.text, limits.checkItem), done: s.done });
  if (columns.length === 0) throw new AppError("import_invalid");
  // A sheet's rows come in any order (by task number, by date): the known
  // stages are put in a workflow's order — to do, doing, to check, done —
  // the others keep the order they came in, after "to do".
  const ordered = columns.map((c, i) => ({ c, i, stage: stageOf(c) })).sort((a, b) => a.stage - b.stage || a.i - b.i).map(x => x.c);
  return { name: oneLine(fallbackName, limits.boardName) || "Import", columns: ordered, labels: [...labelNames].slice(0, limits.labelsPerBoard).map((name, i) => ({ name, color: colors[i % colors.length]! })) };
}

