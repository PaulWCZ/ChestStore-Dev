import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { ChestError } from "@argentic/chest-sdk/errors";
import { boardAccess, can } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "../core/tool.ts";
import { colors } from "../shared/model.ts";
import { arrange, type ImportedBoard } from "../shared/parse-import.ts";
import { sequence } from "../shared/position.ts";

export { arrange, dayOf, fromCsv, fromTrello, importedCounts, looksDone, type ImportedBoard, type ImportedCard } from "../shared/parse-import.ts";

// Moving in from another tool: a Trello board (its JSON export), or a CSV
// of tasks (Asana's project export, Trello's CSV export, or any sheet with
// a title column), read by lib/parse-import.ts, shown to the person for a
// check, then written as a new board in one transaction. People are matched
// to the Chest's members by their full name; the rest stay unassigned.

const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();

// matchPeople finds the Chest's members by the names the other tool gave.
export async function matchPeople(names: string[]): Promise<Map<string, string>> {
  return new Map([...(await findPeople(names))].map(([key, m]) => [key, m.id]));
}

async function findPeople(names: string[]): Promise<Map<string, Member>> {
  const wanted = new Set(names.map(fold).filter(Boolean));
  const found = new Map<string, Member>();
  if (wanted.size === 0) return found;
  try {
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const answer = await members.list({ limit: 500, ...(after ? { after } : {}) });
      for (const m of answer.members) {
        const key = fold(m.name);
        if (wanted.has(key) && !found.has(key)) found.set(key, m);
      }
      if (!answer.next) break;
      after = answer.next;
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return found;
}

export function importedPeople(board: ImportedBoard): string[] {
  return [...new Set(board.columns.flatMap(c => c.cards.flatMap(k => k.people)))];
}

// previewPeople says, before anything is written, which of the names the
// other tool gave are found in the Chest and which stay unassigned — and
// which of those found would not see the board kept private ("only me"):
// not the importer, not a manager (who sees every board).
export async function previewPeople(actor: Member | null, names: unknown): Promise<{ found: string[]; missing: string[]; hidden: string[] }> {
  if (!actor || !can(actor, "import")) throw new AppError("forbidden");
  if (!Array.isArray(names) || names.length > 2000 || !names.every(n => typeof n === "string" && n.length <= 120)) throw new AppError("invalid");
  const list = [...new Set(names as string[])];
  const matched = await findPeople(list);
  const onlyMe = { visibility: "private" as const, people: [{ memberId: actor.id, owner: true }], groups: [] };
  return {
    found: list.filter(n => matched.has(fold(n))),
    missing: list.filter(n => !matched.has(fold(n))),
    hidden: list.filter(n => { const m = matched.get(fold(n)); return !!m && boardAccess(m, onlyMe) === "none"; }),
  };
}

// importBoard writes the board; the importer owns it. It is private (the
// importer alone sees it) unless they chose "everyone": an imported board
// may hold what the whole company should not read. What is finished is
// settled first (arrange): the columns the person marked as finished work
// (`done`, indexes of the board's columns; by default those named so), and
// the cards ticked done elsewhere go there — so the first morning nobody
// finds last year's work "late". Archived columns come archived. Says how
// many cards came and how many people were matched.
export async function importBoard(sql: Sql, actor: Member | null, source: ImportedBoard, doneName: string, options: { visibility?: unknown; done?: unknown } = {}): Promise<{ id: string; cards: number; matched: number; people: number }> {
  if (!actor || !can(actor, "import")) throw new AppError("forbidden");
  const visibility = options.visibility === "team" ? "team" : "private";
  const done = options.done === undefined || options.done === null ? null : options.done;
  if (done !== null && (!Array.isArray(done) || done.length > 100 || !done.every(i => Number.isInteger(i) && i >= 0 && i < 100))) throw new AppError("invalid");
  const imported = arrange(source, done as number[] | null);
  const names = importedPeople(imported);
  const matched = await matchPeople(names);
  let count = 0;
  const id = await sql.begin(async tx => {
    // Cards imported into a "done" column are history, not work done
    // today: the linked tools are not told (migrations/0006_card_events.sql).
    await tx`select set_config('tasks.importing', 'on', true)`;
    const [b] = await tx<{ id: string }[]>`insert into boards (name, color, visibility, created_by) values (${imported.name}, ${colors[0]}, ${visibility}, ${actor.id}) returning id`;
    const boardId = String(b!.id);
    await tx`insert into board_people (board_id, member_id, owner) values (${boardId}, ${actor.id}, true)`;
    const labelIds = new Map<string, string>();
    for (const l of imported.labels) {
      const [row] = await tx<{ id: string }[]>`insert into labels (board_id, name, color) values (${boardId}, ${l.name}, ${l.color}) returning id`;
      labelIds.set(l.name, String(row!.id));
    }
    const columnKeys = sequence(imported.columns.length);
    for (const [i, column] of imported.columns.entries()) {
      const [k] = await tx<{ id: string }[]>`insert into columns (board_id, name, position, done, archived_at) values (${boardId}, ${column.done && column.name === "✓" ? doneName : column.name}, ${columnKeys[i]!}, ${column.done}, ${column.archived ? tx`now()` : null}) returning id`;
      const columnId = String(k!.id);
      const cardKeys = sequence(column.cards.length);
      for (const [j, c] of column.cards.entries()) {
        const [row] = await tx<{ id: string }[]>`
          insert into cards (board_id, column_id, title, description, position, due_on, start_on, created_by, completed_at, archived_at)
          values (${boardId}, ${columnId}, ${c.title}, ${c.description}, ${cardKeys[j]!}, ${c.due}, ${c.start ?? null}, ${actor.id}, ${column.done ? tx`now()` : null}, ${c.archived ? tx`now()` : null})
          returning id`;
        const cardId = String(row!.id);
        count++;
        for (const l of new Set(c.labels)) if (labelIds.has(l)) await tx`insert into card_labels (card_id, label_id) values (${cardId}, ${labelIds.get(l)!}) on conflict do nothing`;
        for (const p of new Set(c.people.map(n => matched.get(fold(n))).filter((m): m is string => !!m))) await tx`insert into card_assignees (card_id, member_id) values (${cardId}, ${p}) on conflict do nothing`;
        const itemKeys = sequence(c.checklist.length);
        for (const [n, item] of c.checklist.entries()) await tx`insert into checklist_items (card_id, text, done, position) values (${cardId}, ${item.text}, ${item.done}, ${itemKeys[n]!})`;
        for (const comment of c.comments) {
          const author = matched.get(fold(comment.author));
          const at = comment.at && !Number.isNaN(Date.parse(comment.at)) ? new Date(comment.at) : new Date();
          await tx`insert into comments (card_id, author, body, created_at, imported_author) values (${cardId}, ${author ?? actor.id}, ${comment.text}, ${at}, ${author ? null : comment.author || null})`;
        }
        await tx`insert into activity (card_id, actor, kind) values (${cardId}, ${actor.id}, 'imported')`;
      }
    }
    return boardId;
  });
  return { id, cards: count, matched: matched.size, people: names.length };
}
