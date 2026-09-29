import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { atLeast, boardAccess, roleOf, type BoardAccess } from "./access.ts";
import { board, fields as boardFields, membership as membershipOf, type Board } from "./boards.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { chestToday } from "./clock.ts";
import { clean, day, fieldValue, id, limits, memberIds, memberPattern, time } from "./model.ts";
import { between } from "./position.ts";
import { firstDue, parseRepeat, type Repeat } from "./repeat.ts";
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
  // The hour it is due at ("HH:MM"), and the day work starts.
  dueTime: string | null;
  start: string | null;
  done: boolean;
  assignees: string[];
  labels: string[];
  checklist: { done: number; total: number };
  comments: number;
  attachments: number;
  hasDescription: boolean;
  // The card repeats (its next one is made when it is done).
  repeats: boolean;
  // The board's fields: field id → value.
  values: Record<string, string>;
  // The cards it waits for (its blockers), and how many of them are still
  // open: while one is, the card is "blocked".
  blockedBy: string[];
  waiting: number;
};

export type Activity = { id: string; actor: string; kind: string; data: Record<string, unknown>; at: string };
export type Comment = { id: string; author: string; body: string; at: string; edited: boolean; importedAuthor: string | null };
// A step of a checklist; given to someone with a date, it is a subtask.
// checklistId null: the card's main checklist.
export type CheckItem = { id: string; text: string; done: boolean; position: string; checklistId: string | null; assignee: string | null; due: string | null };
export type Checklist = { id: string; title: string };
export type Attachment = { id: string; object: string; fileName: string; type: string; size: number; addedBy: string; at: string };
// A card linked to another by "blocked by", as its panel lists it.
export type Link = { id: string; title: string; done: boolean; archived: boolean };
export type CardDetail = CardSummary & {
  boardId: string;
  description: string;
  archived: boolean;
  createdBy: string;
  createdAt: string;
  items: CheckItem[];
  checklists: Checklist[];
  thread: Comment[];
  history: Activity[];
  files: Attachment[];
  repeat: Repeat | null;
  // The next card of the series, once this one was done.
  next: { id: string; due: string | null; done: boolean; archived: boolean } | null;
  // The cards it waits for, and those that wait for it.
  blockers: Link[];
  blocking: Link[];
};

type SummaryRow = { id: string; column_id: string; title: string; position: string; due_on: string | null; due_time: string | null; start_on: string | null; done: boolean; description: string; assignees: string[] | null; labels: string[] | null; items_done: number; items: number; comments: number; attachments: number; repeats: boolean; vals: Record<string, string> | null; blocked_by: string[] | null; waiting: number };

const summary = (r: SummaryRow): CardSummary => ({
  id: String(r.id),
  columnId: String(r.column_id),
  title: r.title,
  position: r.position,
  due: r.due_on,
  dueTime: r.due_on ? r.due_time : null,
  start: r.start_on,
  done: r.done,
  assignees: r.assignees ?? [],
  labels: (r.labels ?? []).map(String),
  checklist: { done: r.items_done, total: r.items },
  comments: r.comments,
  attachments: r.attachments,
  hasDescription: r.description !== "",
  repeats: r.repeats,
  values: r.vals ?? {},
  blockedBy: (r.blocked_by ?? []).map(String),
  waiting: r.waiting,
});

const summaryColumns = (sql: Sql) => sql`
  c.id, c.column_id, c.title, c.position, to_char(c.due_on, 'YYYY-MM-DD') as due_on, c.due_time, to_char(c.start_on, 'YYYY-MM-DD') as start_on, k.done, c.description,
  (select array_agg(member_id order by member_id) from card_assignees where card_id = c.id) as assignees,
  (select array_agg(label_id order by label_id) from card_labels where card_id = c.id) as labels,
  (select count(*)::int from checklist_items where card_id = c.id and done) as items_done,
  (select count(*)::int from checklist_items where card_id = c.id) as items,
  (select count(*)::int from comments where card_id = c.id and removed_at is null) as comments,
  (select count(*)::int from attachments where card_id = c.id) as attachments,
  c.repeat is not null as repeats,
  (select jsonb_object_agg(field_id::text, value) from card_values where card_id = c.id) as vals,
  (select array_agg(blocker_id order by blocker_id) from card_blockers where card_id = c.id) as blocked_by,
  (select count(*)::int from card_blockers bl join cards x on x.id = bl.blocker_id join columns xk on xk.id = x.column_id
    where bl.card_id = c.id and not xk.done and x.archived_at is null and xk.archived_at is null) as waiting`;

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

// whereIs says on which board a card is now, for its address by id (a
// bell item, an email, a calendar event made before it moved); not_found
// when it is gone or its board is not the actor's to see.
export async function whereIs(sql: Sql, actor: Member | null, cardId: unknown): Promise<string> {
  return (await card(sql, actor, cardId, "read")).board.id;
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
  const items = await sql<{ id: string; text: string; done: boolean; position: string; checklist_id: string | null; assignee: string | null; due_on: string | null }[]>`
    select id, text, done, position, checklist_id, assignee, to_char(due_on, 'YYYY-MM-DD') as due_on from checklist_items where card_id = ${row.id} order by position, id`;
  const lists = await sql<{ id: string; title: string }[]>`select id, title from checklists where card_id = ${row.id} order by position, id`;
  const thread = await sql<{ id: string; author: string; body: string; created_at: Date; edited_at: Date | null; imported_author: string | null }[]>`select id, author, body, created_at, edited_at, imported_author from comments where card_id = ${row.id} and removed_at is null order by created_at, id`;
  const history = await sql<{ id: string; actor: string; kind: string; data: Record<string, unknown>; at: Date }[]>`select id, actor, kind, data, at from activity where card_id = ${row.id} order by at desc, id desc limit 50`;
  const files = await sql<{ id: string; object: string; file_name: string; type: string; size: string; added_by: string; added_at: Date }[]>`select id, object, file_name, type, size, added_by, added_at from attachments where card_id = ${row.id} order by added_at, id`;
  const links = await sql<{ id: string; title: string; done: boolean; archived: boolean; side: "blocker" | "blocking" }[]>`
    select x.id, x.title, xk.done, (x.archived_at is not null or xk.archived_at is not null) as archived, 'blocker' as side
    from card_blockers bl join cards x on x.id = bl.blocker_id join columns xk on xk.id = x.column_id where bl.card_id = ${row.id}
    union all
    select x.id, x.title, xk.done, (x.archived_at is not null or xk.archived_at is not null) as archived, 'blocking' as side
    from card_blockers bl join cards x on x.id = bl.card_id join columns xk on xk.id = x.column_id where bl.blocker_id = ${row.id}
    order by title, id`;
  const link = (l: (typeof links)[number]): Link => ({ id: String(l.id), title: l.title, done: l.done, archived: l.archived });
  return {
    ...summary(s!),
    boardId: b.id,
    access: b.access,
    description: s!.description,
    archived: row.archived_at !== null,
    createdBy: s!.created_by,
    createdAt: s!.created_at.toISOString(),
    items: items.map(i => ({ id: String(i.id), text: i.text, done: i.done, position: i.position, checklistId: i.checklist_id === null ? null : String(i.checklist_id), assignee: i.assignee, due: i.due_on })),
    checklists: lists.map(l => ({ id: String(l.id), title: l.title })),
    thread: thread.map(c => ({ id: String(c.id), author: c.author, body: c.body, at: c.created_at.toISOString(), edited: c.edited_at !== null, importedAuthor: c.imported_author })),
    history: history.map(h => ({ id: String(h.id), actor: h.actor, kind: h.kind, data: h.data, at: h.at.toISOString() })),
    files: files.map(f => ({ id: String(f.id), object: f.object, fileName: f.file_name, type: f.type, size: Number(f.size), addedBy: f.added_by, at: f.added_at.toISOString() })),
    repeat,
    next: next ? { id: String(next.id), due: next.due_on, done: next.done, archived: next.archived } : null,
    blockers: links.filter(l => l.side === "blocker").map(link),
    blocking: links.filter(l => l.side === "blocking").map(link),
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
  return { id: created, columnId: c.id, title: text, position, due: null, dueTime: null, start: null, done: c.done, assignees: [], labels: [], checklist: { done: 0, total: 0 }, comments: 0, attachments: 0, hasDescription: false, repeats: false, values: {}, blockedBy: [], waiting: 0 };
}

// updateCard changes what is given: title, description, due date (and
// its time: removing the date removes the time), start date.
export async function updateCard(sql: Sql, actor: Member | null, cardId: unknown, input: { title?: unknown; description?: unknown; due?: unknown; dueTime?: unknown; start?: unknown }): Promise<{ title: string; due: string | null; dueChanged: boolean }> {
  const { row } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const [current] = await sql<{ title: string; description: string; due_on: string | null; due_time: string | null; start_on: string | null }[]>`
    select title, description, to_char(due_on, 'YYYY-MM-DD') as due_on, due_time, to_char(start_on, 'YYYY-MM-DD') as start_on from cards where id = ${row.id}`;
  const title = input.title === undefined ? current!.title : clean(input.title, limits.title);
  const description = input.description === undefined ? current!.description : clean(input.description, limits.description, { multiline: true, optional: true });
  const due = input.due === undefined ? current!.due_on : day(input.due);
  const dueTime = due === null ? null : input.dueTime === undefined ? current!.due_time : time(input.dueTime);
  const start = input.start === undefined ? current!.start_on : day(input.start);
  await sql.begin(async tx => {
    await tx`update cards set title = ${title}, description = ${description}, due_on = ${due}, due_time = ${dueTime}, start_on = ${start}, updated_at = now() where id = ${row.id}`;
    if (title !== current!.title) await record(tx, row.id, actor!.id, "renamed", { from: current!.title, to: title });
    if (description !== current!.description) await record(tx, row.id, actor!.id, "described");
    if (due !== current!.due_on || (due && dueTime !== current!.due_time)) await record(tx, row.id, actor!.id, due ? "due_set" : "due_removed", due ? { due, ...(dueTime ? { time: dueTime } : {}) } : {});
    if (start !== current!.start_on) await record(tx, row.id, actor!.id, start ? "start_set" : "start_removed", start ? { start } : {});
  });
  return { title, due, dueChanged: due !== current!.due_on };
}

// setValue gives a card its value for one of the board's fields (null or
// "" clears it).
export async function setValue(sql: Sql, actor: Member | null, cardId: unknown, fieldId: unknown, value: unknown): Promise<void> {
  const { row, board: b } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const f = (await boardFields(sql, b.id)).find(x => x.id === id(fieldId));
  if (!f) throw new AppError("not_found");
  const text = fieldValue(f.kind, f.options, value);
  if (text === null) await sql`delete from card_values where card_id = ${row.id} and field_id = ${f.id}`;
  else await sql`insert into card_values (card_id, field_id, value) values (${row.id}, ${f.id}, ${text}) on conflict (card_id, field_id) do update set value = excluded.value`;
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
    // The history says when it starts or stops repeating (not each day ticked).
    const before = readRule(current!.repeat);
    if (Boolean(rule) !== Boolean(before)) await record(tx, row.id, actor!.id, rule ? "repeat_set" : "repeat_stopped");
    if (due !== current!.due_on) await record(tx, row.id, actor!.id, "due_set", { due });
    return rule ? makeNext(tx, row.id, today, actor!.id) : null;
  });
  return { due, next };
}

// moveCard puts a card in a column, after one card and before another (ids
// of that column, or null at an end).
// A card that waits for open cards (its blockers) is not marked done —
// moved to a "done" column — unless force says the person means it (the
// history then says so): "blocked", with how many and the first one's
// title.
export async function moveCard(sql: Sql, actor: Member | null, cardId: unknown, columnId: unknown, afterId: unknown, beforeId: unknown, options: { force?: boolean } = {}): Promise<{ from: string; to: string; completed: boolean | null; next: string | null; takenBack: string | null }> {
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
  const open = completed === true ? await openBlockers(sql, row.id) : [];
  if (open.length > 0 && !options.force) throw new AppError("blocked", { count: open.length, title: open[0]! });
  const series = await sql.begin(async tx => {
    await tx`update cards set column_id = ${c.id}, position = ${position}, updated_at = now(), completed_at = ${c.done ? (completed === null ? tx`completed_at` : tx`now()`) : null} where id = ${row.id}`;
    if (row.column_id !== c.id) await record(tx, row.id, actor!.id, completed === true ? (open.length > 0 ? "completed_anyway" : "completed") : completed === false ? "reopened" : "moved", { from: row.column_id, to: c.id });
    // A repeating card done makes its next one; reopened, it takes it back.
    if (completed === true) return { next: await makeNext(tx, row.id, chestToday(), actor!.id), takenBack: null };
    if (completed === false) return { next: null, takenBack: await takeBack(tx, row.id) };
    return { next: null, takenBack: null };
  });
  return { from: row.column_id, to: c.id, completed, ...series };
}

// Another board: a card moves or is copied there, into one of its
// columns. What belongs to the board goes by name: labels (made on the
// target board when missing, as room allows), fields of the same name and
// kind; people who cannot see the target board are left behind.
type Target = { board: Board; column: { id: string; done: boolean } };

async function target(sql: Sql, actor: Member | null, boardId: unknown, columnId: unknown): Promise<Target> {
  const b = await board(sql, actor, boardId, "write");
  if (b.archived) throw new AppError("forbidden");
  return { board: b, column: await liveColumn(sql, b.id, columnId) };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().trim();

// carry maps what hangs on a card to the target board, inside the
// transaction: the labels' ids there, the fields' values there, the people
// who see it. Says who was left behind.
async function carry(tx: Query, cardId: string, from: Board, to: Board): Promise<{ labels: string[]; values: { field: string; value: string }[]; people: string[]; dropped: string[] }> {
  const cardLabels = await tx<{ name: string; color: string }[]>`select l.name, l.color from card_labels cl join labels l on l.id = cl.label_id where cl.card_id = ${cardId} order by l.id`;
  const theirs = await tx<{ id: string; name: string; color: string }[]>`select id, name, color from labels where board_id = ${to.id} order by id`;
  const labels: string[] = [];
  for (const l of cardLabels) {
    const same = theirs.find(x => (l.name ? fold(x.name) === fold(l.name) : !x.name && x.color === l.color));
    if (same) labels.push(String(same.id));
    else if (theirs.length < limits.labelsPerBoard) {
      const [made] = await tx<{ id: string }[]>`insert into labels (board_id, name, color) values (${to.id}, ${l.name}, ${l.color}) returning id`;
      theirs.push({ id: String(made!.id), name: l.name, color: l.color });
      labels.push(String(made!.id));
    }
  }
  const values: { field: string; value: string }[] = [];
  if (from.id !== to.id) {
    const held = await tx<{ name: string; kind: string; value: string }[]>`select f.name, f.kind, v.value from card_values v join fields f on f.id = v.field_id where v.card_id = ${cardId}`;
    const fieldsThere = await tx<{ id: string; name: string; kind: string; options: unknown }[]>`select id, name, kind, options from fields where board_id = ${to.id}`;
    for (const v of held) {
      const f = fieldsThere.find(x => fold(x.name) === fold(v.name) && x.kind === v.kind);
      if (f && (f.kind !== "choice" || (Array.isArray(f.options) && f.options.includes(v.value)))) values.push({ field: String(f.id), value: v.value });
    }
  } else {
    for (const v of await tx<{ field_id: string; value: string }[]>`select field_id, value from card_values where card_id = ${cardId}`) values.push({ field: String(v.field_id), value: v.value });
  }
  const assigned = (await tx<{ member_id: string }[]>`select member_id from card_assignees where card_id = ${cardId}`).map(r => r.member_id);
  const steps = (await tx<{ assignee: string }[]>`select distinct assignee from checklist_items where card_id = ${cardId} and assignee is not null`).map(r => r.assignee);
  const everyone = [...new Set([...assigned, ...steps])];
  const allowed = from.id === to.id ? new Set(everyone) : await audience(to, everyone);
  return { labels, values, people: everyone.filter(p => allowed.has(p)), dropped: everyone.filter(p => !allowed.has(p)) };
}

// moveToBoard moves a card to a column of another board, with its
// comments, checklists, files and history; the history says where it came
// from. Says who was left behind (they no longer see it).
export async function moveToBoard(sql: Sql, actor: Member | null, cardId: unknown, boardId: unknown, columnId: unknown, options: { force?: boolean } = {}): Promise<{ from: string; to: string; dropped: string[]; stayed: string[]; completed: boolean | null }> {
  const { row, board: from } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const to = await target(sql, actor, boardId, columnId);
  if (to.board.id === from.id) {
    const moved = await moveCard(sql, actor, row.id, to.column.id, null, null, options);
    const stayed = (await sql<{ member_id: string }[]>`select member_id from card_assignees where card_id = ${row.id}`).map(r => r.member_id);
    return { from: from.id, to: from.id, dropped: [], stayed, completed: moved.completed };
  }
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from cards where board_id = ${to.board.id} and archived_at is null`;
  if ((counted?.count ?? 0) >= limits.cardsPerBoard) throw new AppError("too_many", { max: limits.cardsPerBoard });
  const [was] = await sql<{ done: boolean }[]>`select done from columns where id = ${row.column_id}`;
  const completed = was?.done === to.column.done ? null : to.column.done;
  const result = await sql.begin(async tx => {
    const kept = await carry(tx, row.id, from, to.board);
    const [edge] = await tx<{ position: string }[]>`select position from cards where column_id = ${to.column.id} order by position desc limit 1`;
    await tx`update cards set board_id = ${to.board.id}, column_id = ${to.column.id}, position = ${between(edge?.position ?? null, null)}, updated_at = now(),
      completed_at = ${to.column.done ? (completed === null ? tx`completed_at` : tx`now()`) : null} where id = ${row.id}`;
    await tx`delete from card_labels where card_id = ${row.id}`;
    for (const l of kept.labels) await tx`insert into card_labels (card_id, label_id) values (${row.id}, ${l}) on conflict do nothing`;
    await tx`delete from card_values where card_id = ${row.id}`;
    for (const v of kept.values) await tx`insert into card_values (card_id, field_id, value) values (${row.id}, ${v.field}, ${v.value})`;
    for (const p of kept.dropped) {
      await tx`delete from card_assignees where card_id = ${row.id} and member_id = ${p}`;
      await tx`update checklist_items set assignee = null where card_id = ${row.id} and assignee = ${p}`;
    }
    await record(tx, row.id, actor!.id, "moved_board", { from: from.name, to: to.board.name });
    // "Blocked by" links cards of one board: they stay behind.
    const unlinked = await tx`delete from card_blockers where card_id = ${row.id} or blocker_id = ${row.id} returning card_id`;
    if (unlinked.length > 0) await record(tx, row.id, actor!.id, "links_left", { count: unlinked.length });
    for (const p of kept.dropped) await record(tx, row.id, actor!.id, "unassigned", { member: p });
    if (completed === true) await makeNext(tx, row.id, chestToday(), actor!.id);
    if (completed === false) await takeBack(tx, row.id);
    const stayed = (await tx<{ member_id: string }[]>`select member_id from card_assignees where card_id = ${row.id}`).map(r => r.member_id);
    return { dropped: kept.dropped, stayed };
  });
  return { from: from.id, to: to.board.id, completed, ...result };
}

// duplicateCard copies a card into a column (of its board or another): its
// title, description, dates, people, labels, fields and checklists, the
// steps unticked — not its comments, files, history or repeat. The copy
// comes right under the card in its own column, at the bottom elsewhere.
export async function duplicateCard(sql: Sql, actor: Member | null, cardId: unknown, boardId: unknown, columnId: unknown): Promise<{ id: string; boardId: string; people: string[] }> {
  const { row, board: from } = await card(sql, actor, cardId, "read");
  const to = await target(sql, actor, boardId, columnId);
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from cards where board_id = ${to.board.id} and archived_at is null`;
  if ((counted?.count ?? 0) >= limits.cardsPerBoard) throw new AppError("too_many", { max: limits.cardsPerBoard });
  return sql.begin(async tx => {
    const [source] = await tx<{ title: string; description: string; position: string; due_on: string | null; due_time: string | null; start_on: string | null }[]>`
      select title, description, position, to_char(due_on, 'YYYY-MM-DD') as due_on, due_time, to_char(start_on, 'YYYY-MM-DD') as start_on from cards where id = ${row.id}`;
    let position: string;
    if (to.column.id === row.column_id) {
      const [next] = await tx<{ position: string }[]>`select position from cards where column_id = ${row.column_id} and position > ${source!.position} order by position limit 1`;
      position = between(source!.position, next?.position ?? null);
    } else {
      const [edge] = await tx<{ position: string }[]>`select position from cards where column_id = ${to.column.id} order by position desc limit 1`;
      position = between(edge?.position ?? null, null);
    }
    const kept = await carry(tx, row.id, from, to.board);
    const [made] = await tx<{ id: string }[]>`
      insert into cards (board_id, column_id, title, description, position, due_on, due_time, start_on, created_by, completed_at)
      values (${to.board.id}, ${to.column.id}, ${source!.title}, ${source!.description}, ${position}, ${source!.due_on}, ${source!.due_time}, ${source!.start_on}, ${actor!.id}, ${to.column.done ? tx`now()` : null})
      returning id`;
    const copy = String(made!.id);
    const assigned = (await tx<{ member_id: string }[]>`select member_id from card_assignees where card_id = ${row.id}`).map(r => r.member_id).filter(p => kept.people.includes(p));
    for (const p of assigned) await tx`insert into card_assignees (card_id, member_id) values (${copy}, ${p})`;
    for (const l of kept.labels) await tx`insert into card_labels (card_id, label_id) values (${copy}, ${l}) on conflict do nothing`;
    for (const v of kept.values) await tx`insert into card_values (card_id, field_id, value) values (${copy}, ${v.field}, ${v.value})`;
    const lists = await tx<{ id: string; title: string; position: string }[]>`select id, title, position from checklists where card_id = ${row.id} order by position`;
    const listIds = new Map<string, string>();
    for (const l of lists) {
      const [n] = await tx<{ id: string }[]>`insert into checklists (card_id, title, position) values (${copy}, ${l.title}, ${l.position}) returning id`;
      listIds.set(String(l.id), String(n!.id));
    }
    const items = await tx<{ text: string; position: string; checklist_id: string | null; assignee: string | null; due_on: string | null }[]>`
      select text, position, checklist_id, assignee, to_char(due_on, 'YYYY-MM-DD') as due_on from checklist_items where card_id = ${row.id} order by position`;
    for (const i of items) {
      await tx`insert into checklist_items (card_id, text, done, position, checklist_id, assignee, due_on)
        values (${copy}, ${i.text}, false, ${i.position}, ${i.checklist_id === null ? null : listIds.get(String(i.checklist_id)) ?? null}, ${i.assignee && kept.people.includes(i.assignee) ? i.assignee : null}, ${i.due_on})`;
    }
    await record(tx, copy, actor!.id, "copied", { from: row.title });
    return { id: copy, boardId: to.board.id, people: assigned };
  });
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

// Checklists: the card's main one (items without a checklist) and extra
// ones with a title. A step may be given to someone who sees the board,
// with a date: a subtask, shown in their "My tasks".
async function listOf(sql: Sql, cardId: string, checklistId: unknown): Promise<string | null> {
  if (checklistId === undefined || checklistId === null || checklistId === "") return null;
  const [l] = await sql<{ id: string }[]>`select id from checklists where id = ${id(checklistId)} and card_id = ${cardId}`;
  if (!l) throw new AppError("not_found");
  return String(l.id);
}

export async function addItem(sql: Sql, actor: Member | null, cardId: unknown, text: unknown, options: { checklist?: unknown } = {}): Promise<CheckItem> {
  const { row } = await card(sql, actor, cardId, "write");
  const value = clean(text, limits.checkItem);
  const checklistId = await listOf(sql, row.id, options.checklist);
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from checklist_items where card_id = ${row.id}`;
  if ((counted?.count ?? 0) >= limits.checkItemsPerCard) throw new AppError("too_many", { max: limits.checkItemsPerCard });
  const [last] = await sql<{ position: string }[]>`select position from checklist_items where card_id = ${row.id} order by position desc limit 1`;
  const position = between(last?.position ?? null, null);
  const [created] = await sql<{ id: string }[]>`insert into checklist_items (card_id, text, position, checklist_id) values (${row.id}, ${value}, ${position}, ${checklistId}) returning id`;
  return { id: String(created!.id), text: value, done: false, position, checklistId, assignee: null, due: null };
}

async function item(sql: Sql, actor: Member | null, itemId: unknown): Promise<{ id: string; cardId: string; text: string; done: boolean; assignee: string | null; due: string | null; row: CardRow; board: Board }> {
  const key = id(itemId);
  const [found] = await sql<{ card_id: string; text: string; done: boolean; assignee: string | null; due_on: string | null }[]>`select card_id, text, done, assignee, to_char(due_on, 'YYYY-MM-DD') as due_on from checklist_items where id = ${key}`;
  if (!found) throw new AppError("not_found");
  const { row, board: b } = await card(sql, actor, String(found.card_id), "write");
  return { id: key, cardId: row.id, text: found.text, done: found.done, assignee: found.assignee, due: found.due_on, row, board: b };
}

// updateItem changes a step: its text, ticked or not, whom it is given to
// (someone who sees the board, or null), its date. Says who was newly
// given it, to tell them.
export async function updateItem(sql: Sql, actor: Member | null, itemId: unknown, input: { text?: unknown; done?: unknown; assignee?: unknown; due?: unknown }): Promise<{ assigned: string | null; previous: string | null; assignee: string | null; text: string; card: { id: string; title: string; boardId: string } }> {
  const i = await item(sql, actor, itemId);
  const text = input.text === undefined ? i.text : clean(input.text, limits.checkItem);
  const done = typeof input.done === "boolean" ? input.done : i.done;
  let assignee = i.assignee;
  if (input.assignee !== undefined) {
    if (input.assignee !== null && (typeof input.assignee !== "string" || !memberPattern.test(input.assignee))) throw new AppError("invalid");
    assignee = input.assignee as string | null;
    if (assignee && assignee !== i.assignee && !(await audience(i.board, [assignee])).has(assignee)) throw new AppError("invalid");
  }
  const due = input.due === undefined ? i.due : day(input.due);
  await sql.begin(async tx => {
    await tx`update checklist_items set text = ${text}, done = ${done}, assignee = ${assignee}, due_on = ${due} where id = ${i.id}`;
    if (assignee !== i.assignee && assignee) await record(tx, i.cardId, actor!.id, "step_assigned", { member: assignee, step: text });
  });
  return { assigned: assignee !== i.assignee ? assignee : null, previous: assignee !== i.assignee ? i.assignee : null, assignee, text, card: { id: i.cardId, title: i.row.title, boardId: i.board.id } };
}

export async function removeItem(sql: Sql, actor: Member | null, itemId: unknown): Promise<{ assignee: string | null; cardId: string }> {
  const i = await item(sql, actor, itemId);
  await sql`delete from checklist_items where id = ${i.id}`;
  return { assignee: i.done ? null : i.assignee, cardId: i.cardId };
}

// Extra checklists ("Before the event", "On the day"…).
export async function addChecklist(sql: Sql, actor: Member | null, cardId: unknown, title: unknown): Promise<Checklist> {
  const { row } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const name = clean(title, limits.checklistTitle);
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from checklists where card_id = ${row.id}`;
  if ((counted?.count ?? 0) >= limits.checklistsPerCard) throw new AppError("too_many", { max: limits.checklistsPerCard });
  const [last] = await sql<{ position: string }[]>`select position from checklists where card_id = ${row.id} order by position desc limit 1`;
  const [created] = await sql<{ id: string }[]>`insert into checklists (card_id, title, position) values (${row.id}, ${name}, ${between(last?.position ?? null, null)}) returning id`;
  return { id: String(created!.id), title: name };
}

async function checklist(sql: Sql, actor: Member | null, checklistId: unknown): Promise<{ id: string; cardId: string }> {
  const key = id(checklistId);
  const [row] = await sql<{ card_id: string }[]>`select card_id from checklists where id = ${key}`;
  if (!row) throw new AppError("not_found");
  await card(sql, actor, String(row.card_id), "write");
  return { id: key, cardId: String(row.card_id) };
}

export async function renameChecklist(sql: Sql, actor: Member | null, checklistId: unknown, title: unknown): Promise<void> {
  const l = await checklist(sql, actor, checklistId);
  await sql`update checklists set title = ${clean(title, limits.checklistTitle)} where id = ${l.id}`;
}

// removeChecklist removes an extra checklist and its steps; says who held
// open steps of it (their "My tasks" change).
export async function removeChecklist(sql: Sql, actor: Member | null, checklistId: unknown): Promise<{ assignees: string[] }> {
  const l = await checklist(sql, actor, checklistId);
  const held = await sql<{ assignee: string }[]>`select distinct assignee from checklist_items where checklist_id = ${l.id} and assignee is not null and not done`;
  await sql`delete from checklists where id = ${l.id}`;
  return { assignees: held.map(h => h.assignee) };
}

// "Blocked by": a card waits for other cards of its board. A link that
// would close a loop (A waits for B, which waits for A) is refused.
export const maxBlockers = 20;

// openBlockers: the titles of the cards this one still waits for (not
// done, not archived), in order.
export async function openBlockers(sql: Sql | Query, cardId: string): Promise<string[]> {
  const rows = await sql<{ title: string }[]>`
    select x.title from card_blockers bl join cards x on x.id = bl.blocker_id join columns xk on xk.id = x.column_id
    where bl.card_id = ${cardId} and not xk.done and x.archived_at is null and xk.archived_at is null order by x.title, x.id`;
  return rows.map(r => r.title);
}

export async function addBlocker(sql: Sql, actor: Member | null, cardId: unknown, blockerId: unknown): Promise<{ title: string }> {
  const { row, board: b } = await card(sql, actor, cardId, "write");
  if (row.archived_at) throw new AppError("forbidden");
  const other = id(blockerId);
  if (other === row.id) throw new AppError("invalid");
  const [blocker] = await sql<{ id: string; title: string }[]>`select id, title from cards where id = ${other} and board_id = ${b.id} and archived_at is null`;
  if (!blocker) throw new AppError("not_found");
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from card_blockers where card_id = ${row.id}`;
  if ((counted?.count ?? 0) >= maxBlockers) throw new AppError("too_many", { max: maxBlockers });
  // Does the blocker already wait (maybe through others) for this card?
  const [loop] = await sql<{ id: string }[]>`
    with recursive up(id) as (
      select blocker_id from card_blockers where card_id = ${other}
      union select bl.blocker_id from card_blockers bl join up on bl.card_id = up.id
    ) select id from up where id = ${row.id} limit 1`;
  if (loop) throw new AppError("cycle");
  await sql.begin(async tx => {
    const [made] = await tx`insert into card_blockers (card_id, blocker_id, created_by) values (${row.id}, ${other}, ${actor!.id}) on conflict do nothing returning card_id`;
    if (made) await record(tx, row.id, actor!.id, "blocker_added", { title: blocker.title });
  });
  return { title: blocker.title };
}

export async function removeBlocker(sql: Sql, actor: Member | null, cardId: unknown, blockerId: unknown): Promise<void> {
  const { row } = await card(sql, actor, cardId, "write");
  const other = id(blockerId);
  await sql.begin(async tx => {
    const [gone] = await tx<{ title: string }[]>`
      delete from card_blockers bl using cards x where bl.card_id = ${row.id} and bl.blocker_id = ${other} and x.id = bl.blocker_id returning x.title`;
    if (gone) await record(tx, row.id, actor!.id, "blocker_removed", { title: gone.title });
  });
}

// freed: the open cards that waited for this one and wait for nothing
// else now (it was just done) — to tell their people they can start.
export async function freed(sql: Sql, cardId: string): Promise<{ id: string; title: string; boardId: string; assignees: string[] }[]> {
  const rows = await sql<{ id: string; title: string; board_id: string; assignees: string[] | null }[]>`
    select c.id, c.title, c.board_id, (select array_agg(member_id order by member_id) from card_assignees where card_id = c.id) as assignees
    from card_blockers bl join cards c on c.id = bl.card_id join columns k on k.id = c.column_id
    where bl.blocker_id = ${cardId} and not k.done and c.archived_at is null and k.archived_at is null
      and not exists (
        select 1 from card_blockers o join cards x on x.id = o.blocker_id join columns xk on xk.id = x.column_id
        where o.card_id = c.id and not xk.done and x.archived_at is null and xk.archived_at is null)
    order by c.id`;
  return rows.map(r => ({ id: String(r.id), title: r.title, boardId: String(r.board_id), assignees: r.assignees ?? [] }));
}

// waitingOn: the open cards that wait for this one (it was reopened: they
// are blocked again).
export async function waitingOn(sql: Sql, cardId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select card_id as id from card_blockers where blocker_id = ${cardId}`;
  return rows.map(r => String(r.id));
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

// What the bell needs of a comment: its card, its author, its words.
export type CommentRef = { id: string; author: string; body: string; card: { id: string; title: string; boardId: string } };

async function comment(sql: Sql, actor: Member | null, commentId: unknown): Promise<{ id: string; author: string; access: BoardAccess; removed: Date | null; ref: CommentRef }> {
  const key = id(commentId);
  const [row] = await sql<{ card_id: string; author: string; body: string; removed_at: Date | null }[]>`select card_id, author, body, removed_at from comments where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const { row: c, board: b } = await card(sql, actor, String(row.card_id), "comment");
  return { id: key, author: row.author, access: b.access, removed: row.removed_at, ref: { id: key, author: row.author, body: row.body, card: { id: c.id, title: c.title, boardId: b.id } } };
}

export async function editComment(sql: Sql, actor: Member | null, commentId: unknown, body: unknown): Promise<CommentRef> {
  const c = await comment(sql, actor, commentId);
  if (c.removed) throw new AppError("not_found");
  if (c.author !== actor!.id) throw new AppError("forbidden");
  const text = clean(body, limits.comment, { multiline: true });
  await sql`update comments set body = ${text}, edited_at = now() where id = ${c.id}`;
  return { ...c.ref, body: text };
}

// How long a removed comment can be brought back ("Undo"); after that it
// is deleted for good — a password pasted by mistake must really go.
export const undoMinutes = 10;

// purgeComments deletes for good the comments removed more than
// undoMinutes ago (at each removal, and each morning).
export async function purgeComments(sql: Query): Promise<void> {
  await sql`delete from comments where removed_at < now() - make_interval(mins => ${undoMinutes})`;
}

// A comment is removed by its author, or by a board owner: hidden at
// once, kept a few minutes for "Undo", then deleted for good.
export async function removeComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<CommentRef> {
  const c = await comment(sql, actor, commentId);
  if (c.author !== actor!.id && !atLeast(c.access, "own")) throw new AppError("forbidden");
  if (c.removed) return c.ref;
  await sql`update comments set removed_at = now() where id = ${c.id}`;
  await purgeComments(sql);
  return c.ref;
}

// restoreComment brings back a comment removed a moment ago, by whoever
// may remove it.
export async function restoreComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<CommentRef> {
  const c = await comment(sql, actor, commentId);
  if (c.author !== actor!.id && !atLeast(c.access, "own")) throw new AppError("forbidden");
  const [back] = await sql<{ id: string }[]>`update comments set removed_at = null where id = ${c.id} and removed_at > now() - make_interval(mins => ${undoMinutes}) returning id`;
  if (!back && c.removed) throw new AppError("not_found");
  return c.ref;
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
export type MyTask = CardSummary & { boardId: string; boardName: string; boardColor: string; columnName: string; columnKey: string | null };
export async function myTasks(sql: Sql, actor: Member | null): Promise<MyTask[]> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const rows = await sql<(SummaryRow & { board_id: string; board_name: string; board_color: string; column_name: string; column_key: string | null })[]>`
    select ${summaryColumns(sql)}, c.board_id, b.name as board_name, b.color as board_color, k.name as column_name, k.key as column_key
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
  return rows.filter(r => visible.has(String(r.board_id))).map(r => ({ ...summary(r), boardId: String(r.board_id), boardName: r.board_name, boardColor: r.board_color, columnName: r.column_name, columnKey: r.column_key }));
}

// My steps: open steps of checklists given to the actor (subtasks), on
// open cards of boards they still see.
export type MyStep = { id: string; text: string; due: string | null; cardId: string; cardTitle: string; boardId: string; boardName: string; boardColor: string };
export async function mySteps(sql: Sql, actor: Member | null): Promise<MyStep[]> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const rows = await sql<{ id: string; text: string; due_on: string | null; card_id: string; card_title: string; board_id: string; board_name: string; board_color: string }[]>`
    select i.id, i.text, to_char(i.due_on, 'YYYY-MM-DD') as due_on, c.id as card_id, c.title as card_title, c.board_id, b.name as board_name, b.color as board_color
    from checklist_items i join cards c on c.id = i.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
    where i.assignee = ${actor.id} and not i.done and c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done
    order by i.due_on asc nulls last, i.id
    limit 500`;
  const visible = new Map<string, boolean>();
  const result: MyStep[] = [];
  for (const r of rows) {
    const key = String(r.board_id);
    if (!visible.has(key)) visible.set(key, await board(sql, actor, key, "read").then(() => true, () => false));
    if (visible.get(key)) result.push({ id: String(r.id), text: r.text, due: r.due_on, cardId: String(r.card_id), cardTitle: r.card_title, boardId: key, boardName: r.board_name, boardColor: r.board_color });
  }
  return result;
}

// The number on the tile: open tasks and steps given to each member, late
// or due today.
export async function urgentCounts(sql: Sql, memberIdsList: string[], now = chestToday()): Promise<Map<string, number>> {
  const counts = new Map<string, number>(memberIdsList.map(m => [m, 0]));
  if (memberIdsList.length === 0) return counts;
  const rows = await sql<{ member_id: string; board_id: string; visibility: "team" | "private"; count: number }[]>`
    select member_id, board_id, visibility, count(*)::int as count from (
      select a.member_id, c.board_id, b.visibility
      from card_assignees a join cards c on c.id = a.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
      where a.member_id in ${sql(memberIdsList)} and c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done and c.due_on <= ${now}
      union all
      select i.assignee as member_id, c.board_id, b.visibility
      from checklist_items i join cards c on c.id = i.card_id join columns k on k.id = c.column_id join boards b on b.id = c.board_id
      where i.assignee in ${sql(memberIdsList)} and not i.done and c.archived_at is null and k.archived_at is null and b.archived_at is null and not k.done and i.due_on <= ${now}
    ) due
    group by member_id, board_id, visibility`;
  // Only cards of boards the person sees count (a private import may name
  // people it is not shared with): each private board is checked against
  // who they are (role, groups). Without the Chest's answer, a private
  // board counts only for its own people.
  const privateOnes = rows.filter(r => r.visibility === "private");
  const shapes = await membershipOf(sql, [...new Set(privateOnes.map(r => String(r.board_id)))]);
  let who = new Map<string, Member>();
  if (privateOnes.length > 0) {
    try {
      who = new Map((await members.lookup([...new Set(privateOnes.map(r => r.member_id))])).members.map(m => [m.id, m]));
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  for (const r of rows) {
    if (r.visibility === "private") {
      const shape = shapes.get(String(r.board_id)) ?? { people: [], groups: [] };
      const m = who.get(r.member_id);
      const sees = m ? boardAccess(m, { visibility: "private", ...shape }) !== "none" : shape.people.some(p => p.memberId === r.member_id);
      if (!sees) continue;
    }
    counts.set(r.member_id, (counts.get(r.member_id) ?? 0) + r.count);
  }
  return counts;
}

// search finds cards by words of their title or description, or a phrase
// of their comments, checklists or labels, on the boards the actor sees;
// with archived, also cards archived, in archived columns or on archived
// boards (each says so).
export type Found = MyTask & { archived: boolean };
export async function searchCards(sql: Sql, actor: Member | null, query: unknown, options: { archived?: boolean } = {}): Promise<Found[]> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const q = clean(query, 100);
  const words = q.split(/\s+/u).map(w => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 8);
  if (words.length === 0) return [];
  const pattern = "%" + q.replace(/[\\%_]/gu, "\\$&") + "%";
  const rows = await sql<(SummaryRow & { board_id: string; board_name: string; board_color: string; column_name: string; column_key: string | null; archived: boolean })[]>`
    select ${summaryColumns(sql)}, c.board_id, b.name as board_name, b.color as board_color, k.name as column_name, k.key as column_key,
      (c.archived_at is not null or k.archived_at is not null or b.archived_at is not null) as archived
    from cards c join columns k on k.id = c.column_id join boards b on b.id = c.board_id
    where ${options.archived ? sql`true` : sql`c.archived_at is null and k.archived_at is null and b.archived_at is null`}
      and (c.search @@ to_tsquery('simple', ${words.map(w => w + ":*").join(" & ")}) or c.title ilike ${pattern}
        or exists (select 1 from comments m where m.card_id = c.id and m.removed_at is null and m.body ilike ${pattern})
        or exists (select 1 from checklist_items i where i.card_id = c.id and i.text ilike ${pattern})
        or exists (select 1 from checklists l where l.card_id = c.id and l.title ilike ${pattern})
        or exists (select 1 from card_labels cl join labels l on l.id = cl.label_id where cl.card_id = c.id and l.name ilike ${pattern}))
    order by k.done, c.updated_at desc
    limit 200`;
  const seen = new Map<string, boolean>();
  const result: Found[] = [];
  for (const r of rows) {
    const key = String(r.board_id);
    if (!seen.has(key)) seen.set(key, await board(sql, actor, key, "read").then(() => true, () => false));
    if (seen.get(key)) result.push({ ...summary(r), boardId: key, boardName: r.board_name, boardColor: r.board_color, columnName: r.column_name, columnKey: r.column_key, archived: r.archived });
  }
  // Archived ones after the others.
  return result.sort((a, b) => Number(a.archived) - Number(b.archived)).slice(0, 50);
}
