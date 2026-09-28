import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { atLeast, boardAccess, roleOf, type BoardAccess } from "./access.ts";
import { board, type Board } from "./boards.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { chestToday } from "./clock.ts";
import { clean, day, id, limits, memberIds } from "./model.ts";
import { between } from "./position.ts";
import { firstDue, parseRepeat, ruleKey, type Repeat } from "./repeat.ts";
import { makeNext, takeBack } from "./repeats.ts";

// Cards and what hangs on them: assignees, labels, checklist, comments,
// files, history. Every change checks the board's access and records what
// happened (activity: codes and ids, the page words them).

export type CardSummary = {
  id: string;
  columnId: string;
  title: string;
  position: string;
  due: string | null;
  done: boolean;
  assignees: string[];
  labels: string[];
  checklist: { done: number; total: number };
  comments: number;
  attachments: number;
  hasDescription: boolean;
  // The card repeats (its next one is made when it is done).
  repeats: boolean;
};

export type Activity = { id: string; actor: string; kind: string; data: Record<string, unknown>; at: string };
export type Comment = { id: string; author: string; body: string; at: string; edited: boolean; importedAuthor: string | null };
export type CheckItem = { id: string; text: string; done: boolean; position: string };
export type Attachment = { id: string; object: string; fileName: string; type: string; size: number; addedBy: string; at: string };
export type CardDetail = CardSummary & {
  boardId: string;
  description: string;
  archived: boolean;
  createdBy: string;
  createdAt: string;
  items: CheckItem[];
  thread: Comment[];
  history: Activity[];
  files: Attachment[];
  repeat: Repeat | null;
  // The next card of the series, once this one was done.
  next: { id: string; due: string | null; done: boolean; archived: boolean } | null;
};

type SummaryRow = { id: string; column_id: string; title: string; position: string; due_on: string | null; done: boolean; description: string; assignees: string[] | null; labels: string[] | null; items_done: number; items: number; comments: number; attachments: number; repeats: boolean };

const summary = (r: SummaryRow): CardSummary => ({
  id: String(r.id),
  columnId: String(r.column_id),
  title: r.title,
  position: r.position,
  due: r.due_on,
  done: r.done,
  assignees: r.assignees ?? [],
  labels: (r.labels ?? []).map(String),
  checklist: { done: r.items_done, total: r.items },
  comments: r.comments,
  attachments: r.attachments,
  hasDescription: r.description !== "",
  repeats: r.repeats,
});

const summaryColumns = (sql: Sql) => sql`
  c.id, c.column_id, c.title, c.position, to_char(c.due_on, 'YYYY-MM-DD') as due_on, k.done, c.description,
  (select array_agg(member_id order by member_id) from card_assignees where card_id = c.id) as assignees,
  (select array_agg(label_id order by label_id) from card_labels where card_id = c.id) as labels,
  (select count(*)::int from checklist_items where card_id = c.id and done) as items_done,
  (select count(*)::int from checklist_items where card_id = c.id) as items,
  (select count(*)::int from comments where card_id = c.id) as comments,
  (select count(*)::int from attachments where card_id = c.id) as attachments,
  c.repeat is not null as repeats`;

// The open cards of a board (in live columns), in order.
export async function boardCards(sql: Sql, boardId: string, options: { archived?: boolean } = {}): Promise<CardSummary[]> {
  const rows = await sql<SummaryRow[]>`
    select ${summaryColumns(sql)}
    from cards c join columns k on k.id = c.column_id
    where c.board_id = ${boardId} and ${options.archived ? sql`c.archived_at is not null` : sql`c.archived_at is null and k.archived_at is null`}
    order by k.position, c.position, c.id
    limit ${limits.cardsPerBoard}`;
  return rows.map(summary);
}

// A stored rule; one this version cannot read counts as none.
function readRule(value: unknown): Repeat | null {
  try {
    return parseRepeat(value);
  } catch {
    return null;
  }
}

type CardRow = { id: string; board_id: string; column_id: string; title: string; archived_at: Date | null };

// card reads the card and its board, with the access the actor needs.
async function card(sql: Sql, actor: Member | null, cardId: unknown, needed: BoardAccess): Promise<{ row: CardRow; board: Board }> {
  const key = id(cardId);
  const [row] = await sql<CardRow[]>`select id, board_id, column_id, title, archived_at from cards where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const b = await board(sql, actor, String(row.board_id), needed);
  return { row: { ...row, id: String(row.id), board_id: String(row.board_id), column_id: String(row.column_id) }, board: b };
}

async function record(sql: Query, cardId: string, actor: string, kind: string, data: Record<string, unknown> = {}): Promise<void> {
  await sql`insert into activity (card_id, actor, kind, data) values (${cardId}, ${actor}, ${kind}, ${sql.json(data as never)})`;
}

export async function cardDetail(sql: Sql, actor: Member | null, cardId: unknown): Promise<CardDetail & { access: BoardAccess }> {
  const { row, board: b } = await card(sql, actor, cardId, "read");
  const [s] = await sql<(SummaryRow & { created_by: string; created_at: Date; repeat: unknown; next_card_id: string | null })[]>`
    select ${summaryColumns(sql)}, c.created_by, c.created_at, c.repeat, c.next_card_id from cards c join columns k on k.id = c.column_id where c.id = ${row.id}`;
  const [next] = s!.next_card_id ? await sql<{ id: string; due_on: string | null; done: boolean; archived: boolean }[]>`
    select n.id, to_char(n.due_on, 'YYYY-MM-DD') as due_on, k.done, n.archived_at is not null as archived from cards n join columns k on k.id = n.column_id where n.id = ${s!.next_card_id}` : [];
  const repeat = readRule(s!.repeat);
  const items = await sql<{ id: string; text: string; done: boolean; position: string }[]>`select id, text, done, position from checklist_items where card_id = ${row.id} order by position, id`;
  const thread = await sql<{ id: string; author: string; body: string; created_at: Date; edited_at: Date | null; imported_author: string | null }[]>`select id, author, body, created_at, edited_at, imported_author from comments where card_id = ${row.id} order by created_at, id`;
  const history = await sql<{ id: string; actor: string; kind: string; data: Record<string, unknown>; at: Date }[]>`select id, actor, kind, data, at from activity where card_id = ${row.id} order by at desc, id desc limit 50`;
  const files = await sql<{ id: string; object: string; file_name: string; type: string; size: string; added_by: string; added_at: Date }[]>`select id, object, file_name, type, size, added_by, added_at from attachments where card_id = ${row.id} order by added_at, id`;
  return {
    ...summary(s!),
    boardId: b.id,
    access: b.access,
    description: s!.description,
    archived: row.archived_at !== null,
    createdBy: s!.created_by,
    createdAt: s!.created_at.toISOString(),
    items: items.map(i => ({ id: String(i.id), text: i.text, done: i.done, position: i.position })),
    thread: thread.map(c => ({ id: String(c.id), author: c.author, body: c.body, at: c.created_at.toISOString(), edited: c.edited_at !== null, importedAuthor: c.imported_author })),
    history: history.map(h => ({ id: String(h.id), actor: h.actor, kind: h.kind, data: h.data, at: h.at.toISOString() })),
    files: files.map(f => ({ id: String(f.id), object: f.object, fileName: f.file_name, type: f.type, size: Number(f.size), addedBy: f.added_by, at: f.added_at.toISOString() })),
    repeat,
    next: next ? { id: String(next.id), due: next.due_on, done: next.done, archived: next.archived } : null,
  };
}

async function liveColumn(sql: Sql, boardId: string, columnId: unknown): Promise<{ id: string; done: boolean }> {
  const key = id(columnId);
  const [c] = await sql<{ id: string; done: boolean }[]>`select id, done from columns where id = ${key} and board_id = ${boardId} and archived_at is null`;
  if (!c) throw new AppError("not_found");
  return { id: String(c.id), done: c.done };
}

// addCard puts a new card at the bottom of a column (or the top).
export async function addCard(sql: Sql, actor: Member | null, boardId: unknown, columnId: unknown, title: unknown, options: { top?: boolean } = {}): Promise<CardSummary> {
  const b = await board(sql, actor, boardId, "write");
  const c = await liveColumn(sql, b.id, columnId);
  const text = clean(title, limits.title);
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from cards where board_id = ${b.id} and archived_at is null`;
  if ((counted?.count ?? 0) >= limits.cardsPerBoard) throw new AppError("too_many", { max: limits.cardsPerBoard });
  const [edge] = options.top
    ? await sql<{ position: string }[]>`select position from cards where column_id = ${c.id} and archived_at is null order by position asc limit 1`
    : await sql<{ position: string }[]>`select position from cards where column_id = ${c.id} order by position desc limit 1`;
  const position = options.top ? between(null, edge?.position ?? null) : between(edge?.position ?? null, null);
  const created = await sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`insert into cards (board_id, column_id, title, position, created_by, completed_at) values (${b.id}, ${c.id}, ${text}, ${position}, ${actor!.id}, ${c.done ? tx`now()` : null}) returning id`;
    await record(tx, String(row!.id), actor!.id, "created");
    return String(row!.id);
  });
  return { id: created, columnId: c.id, title: text, position, due: null, done: c.done, assignees: [], labels: [], checklist: { done: 0, total: 0 }, comments: 0, attachments: 0, hasDescription: false, repeats: false };
}

export async function updateCard(sql: Sql, actor: Member | null, cardId: unknown, input: { title?: unknown; description?: unknown; due?: unknown }): Promise<{ title: string; due: string | null; dueChanged: boolean }> {
  const { row } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const [current] = await sql<{ title: string; description: string; due_on: string | null }[]>`select title, description, to_char(due_on, 'YYYY-MM-DD') as due_on from cards where id = ${row.id}`;
  const title = input.title === undefined ? current!.title : clean(input.title, limits.title);
  const description = input.description === undefined ? current!.description : clean(input.description, limits.description, { multiline: true, optional: true });
  const due = input.due === undefined ? current!.due_on : day(input.due);
  await sql.begin(async tx => {
    await tx`update cards set title = ${title}, description = ${description}, due_on = ${due}, updated_at = now() where id = ${row.id}`;
    if (title !== current!.title) await record(tx, row.id, actor!.id, "renamed", { from: current!.title, to: title });
    if (description !== current!.description) await record(tx, row.id, actor!.id, "described");
    if (due !== current!.due_on) await record(tx, row.id, actor!.id, due ? "due_set" : "due_removed", due ? { due } : {});
  });
  return { title, due, dueChanged: due !== current!.due_on };
}

// setRepeat makes a card repeat (a rule of lib/repeat.ts), or stop (null).
// A card without a date gets the first day of the rule; a card already
// done makes its next one at once. The card of a series whose next one is
// made no longer changes: the rule lives on in the next one.
export async function setRepeat(sql: Sql, actor: Member | null, cardId: unknown, value: unknown): Promise<{ due: string | null; next: string | null }> {
  const { row } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const rule = parseRepeat(value);
  const [current] = await sql<{ repeat: unknown; next_card_id: string | null; due_on: string | null }[]>`select repeat, next_card_id, to_char(due_on, 'YYYY-MM-DD') as due_on from cards where id = ${row.id}`;
  if (current!.next_card_id) throw new AppError("invalid");
  const today = chestToday();
  const due = rule && !current!.due_on ? firstDue(rule, today) : current!.due_on;
  const next = await sql.begin(async tx => {
    await tx`update cards set repeat = ${rule ? tx.json(rule as never) : null}, due_on = ${due}, updated_at = now() where id = ${row.id}`;
    if (ruleKey(rule) !== ruleKey(readRule(current!.repeat))) await record(tx, row.id, actor!.id, rule ? "repeat_set" : "repeat_stopped");
    if (due !== current!.due_on) await record(tx, row.id, actor!.id, "due_set", { due });
    return rule ? makeNext(tx, row.id, today, actor!.id) : null;
  });
  return { due, next };
}

// moveCard puts a card in a column, after one card and before another (ids
// of that column, or null at an end).
export async function moveCard(sql: Sql, actor: Member | null, cardId: unknown, columnId: unknown, afterId: unknown, beforeId: unknown): Promise<{ from: string; to: string; completed: boolean | null; next: string | null; takenBack: string | null }> {
  const { row, board: b } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const c = await liveColumn(sql, b.id, columnId);
  const neighbour = async (value: unknown): Promise<string | null> => {
    if (value === null || value === undefined) return null;
    const [n] = await sql<{ position: string }[]>`select position from cards where id = ${id(value)} and column_id = ${c.id} and archived_at is null and id <> ${row.id}`;
    if (!n) throw new AppError("invalid");
    return n.position;
  };
  let low = await neighbour(afterId);
  let high = await neighbour(beforeId);
  // A stale page may name neighbours that moved: fall back to the bottom.
  if (low !== null && high !== null && low >= high) {
    const [edge] = await sql<{ position: string }[]>`select position from cards where column_id = ${c.id} and id <> ${row.id} order by position desc limit 1`;
    [low, high] = [edge?.position ?? null, null];
  }
  const position = between(low, high);
  const [was] = await sql<{ done: boolean }[]>`select done from columns where id = ${row.column_id}`;
  const completed = was?.done === c.done ? null : c.done;
  const series = await sql.begin(async tx => {
    await tx`update cards set column_id = ${c.id}, position = ${position}, updated_at = now(), completed_at = ${c.done ? (completed === null ? tx`completed_at` : tx`now()`) : null} where id = ${row.id}`;
    if (row.column_id !== c.id) await record(tx, row.id, actor!.id, completed === true ? "completed" : completed === false ? "reopened" : "moved", { from: row.column_id, to: c.id });
    // A repeating card done makes its next one; reopened, it takes it back.
    if (completed === true) return { next: await makeNext(tx, row.id, chestToday(), actor!.id), takenBack: null };
    if (completed === false) return { next: null, takenBack: await takeBack(tx, row.id) };
    return { next: null, takenBack: null };
  });
  return { from: row.column_id, to: c.id, completed, ...series };
}

// audience says which of these people may see the board: only they may be
// given its cards or mentioned on it.
export async function audience(b: Board, ids: string[]): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (ids.length === 0) return allowed;
  try {
    const found = await members.lookup(ids);
    for (const m of found.members) if (boardAccess(m, b) !== "none") allowed.add(m.id);
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
  return allowed;
}

// setAssignees gives the card to these people (who see the board); says who
// was added and removed, to tell them.
export async function setAssignees(sql: Sql, actor: Member | null, cardId: unknown, value: unknown): Promise<{ added: string[]; removed: string[]; title: string; boardId: string }> {
  const { row, board: b } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const wanted = memberIds(value, limits.assigneesPerCard);
  const current = (await sql<{ member_id: string }[]>`select member_id from card_assignees where card_id = ${row.id}`).map(r => r.member_id);
  const added = wanted.filter(m => !current.includes(m));
  const removed = current.filter(m => !wanted.includes(m));
  const allowed = await audience(b, added);
  if (added.some(m => !allowed.has(m))) throw new AppError("invalid");
  await sql.begin(async tx => {
    for (const m of removed) await tx`delete from card_assignees where card_id = ${row.id} and member_id = ${m}`;
    for (const m of added) await tx`insert into card_assignees (card_id, member_id) values (${row.id}, ${m}) on conflict do nothing`;
    for (const m of added) await record(tx, row.id, actor!.id, "assigned", { member: m });
    for (const m of removed) await record(tx, row.id, actor!.id, "unassigned", { member: m });
  });
  return { added, removed, title: row.title, boardId: b.id };
}

export async function setLabel(sql: Sql, actor: Member | null, cardId: unknown, labelId: unknown, on: boolean): Promise<void> {
  const { row, board: b } = await card(sql, actor, cardId, "write");
  const [l] = await sql<{ id: string }[]>`select id from labels where id = ${id(labelId)} and board_id = ${b.id}`;
  if (!l) throw new AppError("not_found");
  if (on) await sql`insert into card_labels (card_id, label_id) values (${row.id}, ${l.id}) on conflict do nothing`;
  else await sql`delete from card_labels where card_id = ${row.id} and label_id = ${l.id}`;
}

// Checklist.
export async function addItem(sql: Sql, actor: Member | null, cardId: unknown, text: unknown): Promise<CheckItem> {
  const { row } = await card(sql, actor, cardId, "write");
  const value = clean(text, limits.checkItem);
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from checklist_items where card_id = ${row.id}`;
  if ((counted?.count ?? 0) >= limits.checkItemsPerCard) throw new AppError("too_many", { max: limits.checkItemsPerCard });
  const [last] = await sql<{ position: string }[]>`select position from checklist_items where card_id = ${row.id} order by position desc limit 1`;
  const position = between(last?.position ?? null, null);
  const [created] = await sql<{ id: string }[]>`insert into checklist_items (card_id, text, position) values (${row.id}, ${value}, ${position}) returning id`;
  return { id: String(created!.id), text: value, done: false, position };
}

async function item(sql: Sql, actor: Member | null, itemId: unknown): Promise<{ id: string; cardId: string }> {
  const key = id(itemId);
  const [row] = await sql<{ card_id: string }[]>`select card_id from checklist_items where id = ${key}`;
  if (!row) throw new AppError("not_found");
  await card(sql, actor, String(row.card_id), "write");
  return { id: key, cardId: String(row.card_id) };
}

export async function updateItem(sql: Sql, actor: Member | null, itemId: unknown, input: { text?: unknown; done?: unknown }): Promise<void> {
  const i = await item(sql, actor, itemId);
  if (input.text !== undefined) await sql`update checklist_items set text = ${clean(input.text, limits.checkItem)} where id = ${i.id}`;
  if (typeof input.done === "boolean") await sql`update checklist_items set done = ${input.done} where id = ${i.id}`;
}

export async function removeItem(sql: Sql, actor: Member | null, itemId: unknown): Promise<void> {
  const i = await item(sql, actor, itemId);
  await sql`delete from checklist_items where id = ${i.id}`;
}

// Comments: whoever may comment on the board; mentions name people who see
// the board (checked), to tell them.
export async function addComment(sql: Sql, actor: Member | null, cardId: unknown, body: unknown, mentioned: unknown = []): Promise<{ comment: Comment; mentions: string[]; assignees: string[]; title: string; boardId: string }> {
  const { row, board: b } = await card(sql, actor, cardId, "comment");
  const text = clean(body, limits.comment, { multiline: true });
  const asked = memberIds(mentioned, 20).filter(m => m !== actor!.id);
  const allowed = await audience(b, asked);
  const mentions = asked.filter(m => allowed.has(m));
  const [created] = await sql<{ id: string; created_at: Date }[]>`insert into comments (card_id, author, body) values (${row.id}, ${actor!.id}, ${text}) returning id, created_at`;
  const assignees = (await sql<{ member_id: string }[]>`select member_id from card_assignees where card_id = ${row.id}`).map(r => r.member_id).filter(m => m !== actor!.id);
  return { comment: { id: String(created!.id), author: actor!.id, body: text, at: created!.created_at.toISOString(), edited: false, importedAuthor: null }, mentions, assignees, title: row.title, boardId: b.id };
}

async function comment(sql: Sql, actor: Member | null, commentId: unknown): Promise<{ id: string; author: string; access: BoardAccess }> {
  const key = id(commentId);
  const [row] = await sql<{ card_id: string; author: string }[]>`select card_id, author from comments where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const { board: b } = await card(sql, actor, String(row.card_id), "comment");
  return { id: key, author: row.author, access: b.access };
}

export async function editComment(sql: Sql, actor: Member | null, commentId: unknown, body: unknown): Promise<void> {
  const c = await comment(sql, actor, commentId);
  if (c.author !== actor!.id) throw new AppError("forbidden");
  await sql`update comments set body = ${clean(body, limits.comment, { multiline: true })}, edited_at = now() where id = ${c.id}`;
}

// A comment is removed by its author, or by a board owner.
export async function removeComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<void> {
  const c = await comment(sql, actor, commentId);
  if (c.author !== actor!.id && !atLeast(c.access, "own")) throw new AppError("forbidden");
  await sql`delete from comments where id = ${c.id}`;
}

// Archive and delete: a card is archived (and restored) by whoever works on
// the board; deleted for good only from the archive.
export async function archiveCard(sql: Sql, actor: Member | null, cardId: unknown, archived: boolean): Promise<{ boardId: string; assignees: string[] }> {
  const { row, board: b } = await card(sql, actor, cardId, "write");
  if (!archived) {
    // Back into its column, or the board's first column if that one went.
    const [c] = await sql<{ id: string }[]>`select id from columns where id = ${row.column_id} and archived_at is null`;
    if (!c) {
      const [first] = await sql<{ id: string }[]>`select id from columns where board_id = ${b.id} and archived_at is null order by position limit 1`;
      if (!first) throw new AppError("not_found");
      await sql`update cards set column_id = ${first.id} where id = ${row.id}`;
    }
  }
  await sql.begin(async tx => {
    await tx`update cards set archived_at = ${archived ? tx`now()` : null} where id = ${row.id}`;
    await record(tx, row.id, actor!.id, archived ? "archived" : "restored");
  });
  const assignees = (await sql<{ member_id: string }[]>`select member_id from card_assignees where card_id = ${row.id}`).map(r => r.member_id);
  return { boardId: b.id, assignees };
}

export async function deleteCard(sql: Sql, actor: Member | null, cardId: unknown): Promise<{ objects: string[] }> {
  const { row } = await card(sql, actor, cardId, "write");
  if (!row.archived_at) throw new AppError("not_archived");
  const objects = (await sql<{ object: string }[]>`select object from attachments where card_id = ${row.id}`).map(r => r.object);
  await sql`delete from cards where id = ${row.id}`;
  return { objects };
}

// Files: recorded once the Chest confirmed it holds them (the route stats
// the object first).
export async function attach(sql: Sql, actor: Member | null, cardId: unknown, file: { object: string; fileName: unknown; type: string; size: number }): Promise<Attachment> {
  const { row } = await card(sql, actor, cardId, "write");
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from attachments where card_id = ${row.id}`;
  if ((counted?.count ?? 0) >= limits.attachmentsPerCard) throw new AppError("too_many", { max: limits.attachmentsPerCard });
  const fileName = clean(file.fileName, limits.fileName).replace(/[/\\]/gu, "_");
  const [created] = await sql<{ id: string; added_at: Date }[]>`insert into attachments (card_id, object, file_name, type, size, added_by) values (${row.id}, ${file.object}, ${fileName}, ${file.type}, ${file.size}, ${actor!.id}) on conflict (object) do nothing returning id, added_at`;
  if (!created) throw new AppError("invalid");
  await record(sql, row.id, actor!.id, "attached", { file: fileName });
  return { id: String(created.id), object: file.object, fileName, type: file.type, size: file.size, addedBy: actor!.id, at: created.added_at.toISOString() };
}

export async function attachment(sql: Sql, actor: Member | null, attachmentId: unknown, needed: BoardAccess = "read"): Promise<Attachment & { cardId: string }> {
  const key = id(attachmentId);
  const [f] = await sql<{ id: string; card_id: string; object: string; file_name: string; type: string; size: string; added_by: string; added_at: Date }[]>`select id, card_id, object, file_name, type, size, added_by, added_at from attachments where id = ${key}`;
  if (!f) throw new AppError("not_found");
  await card(sql, actor, String(f.card_id), needed);
  return { id: key, cardId: String(f.card_id), object: f.object, fileName: f.file_name, type: f.type, size: Number(f.size), addedBy: f.added_by, at: f.added_at.toISOString() };
}

export async function detach(sql: Sql, actor: Member | null, attachmentId: unknown): Promise<string> {
  const f = await attachment(sql, actor, attachmentId, "write");
  await sql`delete from attachments where id = ${f.id}`;
  await record(sql, f.cardId, actor!.id, "detached", { file: f.fileName });
  return f.object;
}

// My tasks: open cards given to the actor, on boards they still see.
export type MyTask = CardSummary & { boardId: string; boardName: string; boardColor: string; columnName: string };
export async function myTasks(sql: Sql, actor: Member | null): Promise<MyTask[]> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const rows = await sql<(SummaryRow & { board_id: string; board_name: string; board_color: string; column_name: string })[]>`
    select ${summaryColumns(sql)}, c.board_id, b.name as board_name, b.color as board_color, k.name as column_name
    from cards c join columns k on k.id = c.column_id join boards b on b.id = c.board_id
    join card_assignees a on a.card_id = c.id and a.member_id = ${actor.id}
    where c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done
    order by c.due_on asc nulls last, c.created_at desc
    limit 500`;
  const boardIds = [...new Set(rows.map(r => String(r.board_id)))];
  const visible = new Set<string>();
  for (const key of boardIds) {
    try {
      await board(sql, actor, key, "read");
      visible.add(key);
    } catch {
      // A board the actor no longer sees keeps its cards out of their list.
    }
  }
  return rows.filter(r => visible.has(String(r.board_id))).map(r => ({ ...summary(r), boardId: String(r.board_id), boardName: r.board_name, boardColor: r.board_color, columnName: r.column_name }));
}

// The number on the tile: open tasks given to each member, late or due
// today.
export async function urgentCounts(sql: Sql, memberIdsList: string[], now = chestToday()): Promise<Map<string, number>> {
  const counts = new Map<string, number>(memberIdsList.map(m => [m, 0]));
  if (memberIdsList.length === 0) return counts;
  const rows = await sql<{ member_id: string; count: number }[]>`
    select a.member_id, count(*)::int as count
    from card_assignees a join cards c on c.id = a.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
    where a.member_id in ${sql(memberIdsList)} and c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done and c.due_on <= ${now}
    group by a.member_id`;
  for (const r of rows) counts.set(r.member_id, r.count);
  return counts;
}

// search finds cards by words of their title or description, on the boards
// the actor sees.
export async function searchCards(sql: Sql, actor: Member | null, query: unknown): Promise<MyTask[]> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const q = clean(query, 100);
  const words = q.split(/\s+/u).map(w => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 8);
  if (words.length === 0) return [];
  const pattern = "%" + q.replace(/[\\%_]/gu, "\\$&") + "%";
  const rows = await sql<(SummaryRow & { board_id: string; board_name: string; board_color: string; column_name: string })[]>`
    select ${summaryColumns(sql)}, c.board_id, b.name as board_name, b.color as board_color, k.name as column_name
    from cards c join columns k on k.id = c.column_id join boards b on b.id = c.board_id
    where c.archived_at is null and k.archived_at is null and b.archived_at is null
      and (c.search @@ to_tsquery('simple', ${words.map(w => w + ":*").join(" & ")}) or c.title ilike ${pattern})
    order by k.done, c.updated_at desc
    limit 200`;
  const seen = new Map<string, boolean>();
  const result: MyTask[] = [];
  for (const r of rows) {
    const key = String(r.board_id);
    if (!seen.has(key)) {
      try {
        await board(sql, actor, key, "read");
        seen.set(key, true);
      } catch {
        seen.set(key, false);
      }
    }
    if (seen.get(key)) result.push({ ...summary(r), boardId: key, boardName: r.board_name, boardColor: r.board_color, columnName: r.column_name });
  }
  return result.slice(0, 50);
}
