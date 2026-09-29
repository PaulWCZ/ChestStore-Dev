import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { board, columns, fields, labels, listBoards } from "./boards.ts";
import { boardCards } from "./cards.ts";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import type { Catalogue, Locale } from "./i18n/index.ts";
import { nameOf, people } from "./people.ts";

// A board leaves as it came: a CSV any spreadsheet opens (one row per card,
// the headers in the reader's language) or a JSON file with everything.
// Reversibility is part of the promise.

export async function boardCsv(sql: Sql, actor: Member | null, boardId: unknown, t: Catalogue, locale: Locale): Promise<{ name: string; csv: string }> {
  const b = await board(sql, actor, boardId, "read");
  const cols = await columns(sql, b.id);
  const labs = await labels(sql, b.id);
  const own = await fields(sql, b.id);
  const cards = await boardCards(sql, b.id);
  const who = await people(cards.flatMap(c => c.assignees));
  const h = t.export.headers;
  const rows: unknown[][] = [[h.title, h.column, h.assignees, h.due, h.labels, h.checklist, h.done, h.description, h.start, h.time, ...own.map(f => f.name)]];
  for (const c of cards) {
    const column = cols.find(k => k.id === c.columnId);
    rows.push([
      c.title,
      column?.name ?? "",
      c.assignees.map(a => nameOf(who.get(a), locale)).join(", "),
      c.due ?? "",
      c.labels.map(l => labs.find(x => x.id === l)?.name ?? "").filter(Boolean).join(", "),
      c.checklist.total ? `${c.checklist.done}/${c.checklist.total}` : "",
      c.done ? h.yes : "",
      "",
      c.start ?? "",
      c.dueTime ?? "",
      ...own.map(f => c.values[f.id] ?? ""),
    ]);
  }
  // Descriptions are read in one query, not per card.
  const descriptions = new Map((await sql<{ id: string; description: string }[]>`select id, description from cards where board_id = ${b.id} and archived_at is null`).map(r => [String(r.id), r.description]));
  cards.forEach((c, i) => { rows[i + 1]![7] = descriptions.get(c.id) ?? ""; });
  return { name: b.name, csv: toCsv(rows) };
}

export async function boardJson(sql: Sql, actor: Member | null, boardId: unknown): Promise<{ name: string; json: string }> {
  const data = await boardData(sql, actor, boardId);
  return { name: data.board.name, json: JSON.stringify(data, null, 2) };
}

// everything is every board a manager sees (all of them, private ones and
// archived ones included) in one file: a company leaving takes it all.
// Files are named with their card, not included: each opens from the
// board while it exists.
export async function everything(sql: Sql, actor: Member | null): Promise<string> {
  if (!actor || !can(actor, "boards.all")) throw new AppError("forbidden");
  const all = [...await listBoards(sql, actor), ...await listBoards(sql, actor, { archived: true })];
  const boards = [];
  for (const b of all) boards.push({ ...await boardData(sql, actor, b.id), archived: b.archived });
  return JSON.stringify({ format: "chest-tasks-all/1", exportedAt: new Date().toISOString(), boards }, null, 2);
}

async function boardData(sql: Sql, actor: Member | null, boardId: unknown) {
  const b = await board(sql, actor, boardId, "read");
  const cols = await columns(sql, b.id);
  const labs = await labels(sql, b.id);
  const own = await fields(sql, b.id);
  const cards = await sql<{ id: string; column_id: string; title: string; description: string; due_on: string | null; due_time: string | null; start_on: string | null; created_by: string; created_at: Date; completed_at: Date | null; repeat: unknown }[]>`
    select id, column_id, title, description, to_char(due_on, 'YYYY-MM-DD') as due_on, due_time, to_char(start_on, 'YYYY-MM-DD') as start_on, created_by, created_at, completed_at, repeat from cards where board_id = ${b.id} and archived_at is null order by position`;
  const ids = cards.map(c => String(c.id));
  const assignees = ids.length ? await sql<{ card_id: string; member_id: string }[]>`select card_id, member_id from card_assignees where card_id in ${sql(ids)}` : [];
  const cardLabels = ids.length ? await sql<{ card_id: string; label_id: string }[]>`select card_id, label_id from card_labels where card_id in ${sql(ids)}` : [];
  const items = ids.length ? await sql<{ card_id: string; text: string; done: boolean; checklist_id: string | null; assignee: string | null; due_on: string | null }[]>`select card_id, text, done, checklist_id, assignee, to_char(due_on, 'YYYY-MM-DD') as due_on from checklist_items where card_id in ${sql(ids)} order by position` : [];
  const lists = ids.length ? await sql<{ id: string; card_id: string; title: string }[]>`select id, card_id, title from checklists where card_id in ${sql(ids)} order by position` : [];
  const comments = ids.length ? await sql<{ card_id: string; author: string; body: string; created_at: Date }[]>`select card_id, author, body, created_at from comments where card_id in ${sql(ids)} and removed_at is null order by created_at` : [];
  const values = ids.length ? await sql<{ card_id: string; field_id: string; value: string }[]>`select card_id, field_id, value from card_values where card_id in ${sql(ids)}` : [];
  const files = ids.length ? await sql<{ card_id: string; file_name: string; type: string; size: string }[]>`select card_id, file_name, type, size from attachments where card_id in ${sql(ids)} order by added_at` : [];
  const everyone = await people([...assignees.map(a => a.member_id), ...comments.map(c => c.author), ...cards.map(c => c.created_by), ...items.flatMap(i => (i.assignee ? [i.assignee] : []))]);
  const person = (memberId: string) => ({ id: memberId, name: everyone.get(memberId)?.status === "member" || everyone.get(memberId)?.status === "former" ? everyone.get(memberId)!.name : null });
  const item = (i: (typeof items)[number]) => ({ text: i.text, done: i.done, ...(i.assignee ? { assignee: person(i.assignee) } : {}), ...(i.due_on ? { due: i.due_on } : {}) });
  return {
    format: "chest-tasks/1",
    exportedAt: new Date().toISOString(),
    board: { name: b.name, color: b.color, visibility: b.visibility },
    columns: cols.map(c => ({ id: c.id, name: c.name, done: c.done })),
    labels: labs.map(l => ({ id: l.id, name: l.name, color: l.color })),
    fields: own.map(f => ({ id: f.id, name: f.name, kind: f.kind, options: f.options })),
    cards: cards.map(c => {
      const key = String(c.id);
      return {
        id: key,
        column: String(c.column_id),
        title: c.title,
        description: c.description,
        due: c.due_on,
        dueTime: c.due_time,
        start: c.start_on,
        repeat: c.repeat ?? null,
        createdBy: person(c.created_by),
        createdAt: c.created_at.toISOString(),
        completedAt: c.completed_at?.toISOString() ?? null,
        assignees: assignees.filter(a => String(a.card_id) === key).map(a => person(a.member_id)),
        labels: cardLabels.filter(l => String(l.card_id) === key).map(l => String(l.label_id)),
        checklist: items.filter(i => String(i.card_id) === key && i.checklist_id === null).map(item),
        checklists: lists.filter(l => String(l.card_id) === key).map(l => ({ title: l.title, items: items.filter(i => String(i.checklist_id) === String(l.id)).map(item) })),
        values: Object.fromEntries(values.filter(v => String(v.card_id) === key).map(v => [String(v.field_id), v.value])),
        files: files.filter(f => String(f.card_id) === key).map(f => ({ name: f.file_name, type: f.type, size: Number(f.size) })),
        comments: comments.filter(x => String(x.card_id) === key).map(x => ({ author: person(x.author), body: x.body, at: x.created_at.toISOString() })),
      };
    }),
  };
}

// fileName makes a board's name safe in a download.
export function fileName(name: string, extension: string): string {
  const base = name.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^A-Za-z0-9 _-]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "board";
  return `${base}.${extension}`;
}
