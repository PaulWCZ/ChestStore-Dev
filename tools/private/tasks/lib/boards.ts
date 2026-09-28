import type { Member } from "@argentic/chest-sdk/member";
import { atLeast, boardAccess, can, type BoardAccess } from "./access.ts";
import { chestToday } from "./clock.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, colors, groupPattern, id, isColor, isTemplate, limits, memberIds, templates, type Color, type Template } from "./model.ts";
import { between, isPosition, sequence } from "./position.ts";
import { makeNext, takeBack } from "./repeats.ts";

// Boards, their columns, labels and people. Every function takes the
// database and the member acting, checks the board's access
// (lib/access.ts) and throws AppError with a code.

export type Board = {
  id: string;
  name: string;
  color: Color;
  visibility: "team" | "private";
  archived: boolean;
  createdBy: string;
  people: { memberId: string; owner: boolean }[];
  groups: string[];
  access: BoardAccess;
};
export type Column = { id: string; name: string; position: string; done: boolean };
export type Label = { id: string; name: string; color: Color };

type BoardRow = { id: string; name: string; color: string; visibility: "team" | "private"; archived_at: Date | null; created_by: string };

export async function membership(sql: Sql, ids: string[]): Promise<Map<string, { people: Board["people"]; groups: string[] }>> {
  const found = new Map<string, { people: Board["people"]; groups: string[] }>(ids.map(i => [i, { people: [], groups: [] }]));
  if (ids.length === 0) return found;
  for (const p of await sql<{ board_id: string; member_id: string; owner: boolean }[]>`select board_id, member_id, owner from board_people where board_id in ${sql(ids)}`) found.get(String(p.board_id))?.people.push({ memberId: p.member_id, owner: p.owner });
  for (const g of await sql<{ board_id: string; group_id: string }[]>`select board_id, group_id from board_groups where board_id in ${sql(ids)}`) found.get(String(g.board_id))?.groups.push(g.group_id);
  return found;
}

function toBoard(row: BoardRow, m: { people: Board["people"]; groups: string[] }, actor: Member | null): Board {
  const board = { id: String(row.id), name: row.name, color: (isColor(row.color) ? row.color : "sun") as Color, visibility: row.visibility, archived: row.archived_at !== null, createdBy: row.created_by, people: m.people, groups: m.groups };
  return { ...board, access: boardAccess(actor, board) };
}

// board reads one board as the actor may see it: a board they cannot see
// does not exist for them (not_found), one they may not change is refused.
export async function board(sql: Sql, actor: Member | null, boardId: unknown, needed: BoardAccess = "read"): Promise<Board> {
  const key = id(boardId);
  const [row] = await sql<BoardRow[]>`select id, name, color, visibility, archived_at, created_by from boards where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const found = toBoard(row, (await membership(sql, [key])).get(key)!, actor);
  if (found.access === "none") throw new AppError("not_found");
  if (!atLeast(found.access, needed)) throw new AppError("forbidden");
  // An archived board is read only, until it is restored.
  if (found.archived && needed !== "read" && needed !== "own") throw new AppError("forbidden");
  return found;
}

export type BoardSummary = Board & { open: number; mine: number; late: number };

// The boards the actor sees, with their counts: open cards, open cards
// given to the actor, late ones.
export async function listBoards(sql: Sql, actor: Member | null, options: { archived?: boolean } = {}): Promise<BoardSummary[]> {
  if (!actor) throw new AppError("forbidden");
  const rows = await sql<(BoardRow & { open: number; mine: number; late: number })[]>`
    select b.id, b.name, b.color, b.visibility, b.archived_at, b.created_by,
      (select count(*)::int from cards c join columns k on k.id = c.column_id where c.board_id = b.id and c.archived_at is null and k.archived_at is null and not k.done) as open,
      (select count(*)::int from cards c join columns k on k.id = c.column_id join card_assignees a on a.card_id = c.id where c.board_id = b.id and c.archived_at is null and k.archived_at is null and not k.done and a.member_id = ${actor.id}) as mine,
      (select count(*)::int from cards c join columns k on k.id = c.column_id where c.board_id = b.id and c.archived_at is null and k.archived_at is null and not k.done and c.due_on < ${chestToday()}) as late
    from boards b
    where ${options.archived ? sql`b.archived_at is not null` : sql`b.archived_at is null`}
    order by lower(b.name), b.id`;
  const m = await membership(sql, rows.map(r => String(r.id)));
  return rows.map(r => ({ ...toBoard(r, m.get(String(r.id))!, actor), open: r.open, mine: r.mine, late: r.late })).filter(b => b.access !== "none");
}

// createBoard makes a board from a template, its creator its owner; the
// column names come in the creator's words (a page gives them).
export async function createBoard(sql: Sql, actor: Member | null, input: { name: unknown; color?: unknown; template?: unknown; visibility?: unknown }, columnNames: Record<string, string>): Promise<Board> {
  if (!actor || !can(actor, "boards.create")) throw new AppError("forbidden");
  const name = clean(input.name, limits.boardName);
  const color: Color = input.color === undefined ? colors[Math.floor(Math.random() * colors.length)]! : isColor(input.color) ? input.color : "sun";
  const template: Template = input.template === undefined ? "simple" : isTemplate(input.template) ? input.template : "simple";
  const visibility = input.visibility === "private" ? "private" : "team";
  const boardId = await sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`insert into boards (name, color, visibility, created_by) values (${name}, ${color}, ${visibility}, ${actor.id}) returning id`;
    const key = String(row!.id);
    await tx`insert into board_people (board_id, member_id, owner) values (${key}, ${actor.id}, true)`;
    const steps = templates[template];
    const positions = sequence(steps.length);
    for (const [i, step] of steps.entries()) await tx`insert into columns (board_id, name, position, done) values (${key}, ${columnNames[step.key] ?? step.key}, ${positions[i]!}, ${step.done})`;
    return key;
  });
  return board(sql, actor, boardId);
}

export async function updateBoard(sql: Sql, actor: Member | null, boardId: unknown, input: { name?: unknown; color?: unknown; visibility?: unknown }): Promise<void> {
  const b = await board(sql, actor, boardId, "own");
  const name = input.name === undefined ? b.name : clean(input.name, limits.boardName);
  const color = input.color === undefined ? b.color : isColor(input.color) ? input.color : b.color;
  const visibility = input.visibility === undefined ? b.visibility : input.visibility === "private" ? "private" : "team";
  await sql`update boards set name = ${name}, color = ${color}, visibility = ${visibility} where id = ${b.id}`;
}

// setPeople names who belongs to the board (a private board's audience) and
// who owns it; groups give it to their members. At least one owner stays.
export async function setPeople(sql: Sql, actor: Member | null, boardId: unknown, input: { people: unknown; owners: unknown; groups: unknown }): Promise<void> {
  const b = await board(sql, actor, boardId, "own");
  const people = memberIds(input.people, limits.boardPeople);
  const owners = memberIds(input.owners, limits.boardPeople).filter(o => people.includes(o));
  if (!Array.isArray(input.groups) || !input.groups.every(g => typeof g === "string" && groupPattern.test(g)) || input.groups.length > 16) throw new AppError("invalid");
  const groups = [...new Set(input.groups as string[])];
  if (owners.length === 0) throw new AppError("invalid");
  await sql.begin(async tx => {
    await tx`delete from board_people where board_id = ${b.id}`;
    for (const p of people) await tx`insert into board_people (board_id, member_id, owner) values (${b.id}, ${p}, ${owners.includes(p)})`;
    await tx`delete from board_groups where board_id = ${b.id}`;
    for (const g of groups) await tx`insert into board_groups (board_id, group_id) values (${b.id}, ${g})`;
  });
}

export async function archiveBoard(sql: Sql, actor: Member | null, boardId: unknown, archived: boolean): Promise<void> {
  const b = await board(sql, actor, boardId, "own");
  await sql`update boards set archived_at = ${archived ? sql`now()` : null} where id = ${b.id}`;
}

// deleteBoard removes an archived board and everything on it, for good.
export async function deleteBoard(sql: Sql, actor: Member | null, boardId: unknown): Promise<void> {
  const b = await board(sql, actor, boardId, "own");
  if (!b.archived) throw new AppError("not_archived");
  await sql`delete from boards where id = ${b.id}`;
}

// Columns.
export async function columns(sql: Sql, boardId: string, options: { archived?: boolean } = {}): Promise<Column[]> {
  const rows = await sql<{ id: string; name: string; position: string; done: boolean }[]>`
    select id, name, position, done from columns where board_id = ${boardId} and ${options.archived ? sql`archived_at is not null` : sql`archived_at is null`} order by position, id`;
  return rows.map(r => ({ id: String(r.id), name: r.name, position: r.position, done: r.done }));
}

export async function addColumn(sql: Sql, actor: Member | null, boardId: unknown, name: unknown): Promise<Column> {
  const b = await board(sql, actor, boardId, "write");
  const text = clean(name, limits.columnName);
  const list = await columns(sql, b.id);
  if (list.length >= limits.columnsPerBoard) throw new AppError("too_many", { max: limits.columnsPerBoard });
  // A new column goes before a "done" column at the end: where work goes.
  const last = list.at(-1);
  const position = last?.done ? between(list.at(-2)?.position ?? null, last.position) : between(last?.position ?? null, null);
  const [row] = await sql<{ id: string }[]>`insert into columns (board_id, name, position) values (${b.id}, ${text}, ${position}) returning id`;
  return { id: String(row!.id), name: text, position, done: false };
}

async function column(sql: Sql, actor: Member | null, columnId: unknown, needed: BoardAccess): Promise<{ column: Column & { archived: boolean }; board: Board }> {
  const key = id(columnId);
  const [row] = await sql<{ id: string; board_id: string; name: string; position: string; done: boolean; archived_at: Date | null }[]>`select id, board_id, name, position, done, archived_at from columns where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const b = await board(sql, actor, String(row.board_id), needed);
  return { column: { id: String(row.id), name: row.name, position: row.position, done: row.done, archived: row.archived_at !== null }, board: b };
}

export async function updateColumn(sql: Sql, actor: Member | null, columnId: unknown, input: { name?: unknown; done?: unknown }): Promise<void> {
  const { column: c } = await column(sql, actor, columnId, "write");
  const name = input.name === undefined ? c.name : clean(input.name, limits.columnName);
  const done = typeof input.done === "boolean" ? input.done : c.done;
  await sql.begin(async tx => {
    await tx`update columns set name = ${name}, done = ${done} where id = ${c.id}`;
    // Cards follow the column: complete in a "done" column, open otherwise.
    if (done !== c.done) await tx`update cards set completed_at = ${done ? tx`now()` : null} where column_id = ${c.id}`;
    // Repeating cards completed with it make their next ones (reopened, take them back).
    if (done !== c.done) {
      const repeating = await tx<{ id: string }[]>`select id from cards where column_id = ${c.id} and repeat is not null and archived_at is null order by position`;
      for (const r of repeating) await (done ? makeNext(tx, String(r.id), chestToday(), actor!.id) : takeBack(tx, String(r.id)));
    }
  });
}

// moveColumn puts a column between two others (their positions, or null
// at an end).
export async function moveColumn(sql: Sql, actor: Member | null, columnId: unknown, after: unknown, before: unknown): Promise<void> {
  const { column: c, board: b } = await column(sql, actor, columnId, "write");
  const list = (await columns(sql, b.id)).filter(x => x.id !== c.id);
  const low = after === null ? null : list.find(x => x.id === String(after))?.position ?? null;
  const high = before === null ? null : list.find(x => x.id === String(before))?.position ?? null;
  if ((after !== null && low === null) || (before !== null && high === null) || (low !== null && high !== null && low >= high)) throw new AppError("invalid");
  await sql`update columns set position = ${between(low, high)} where id = ${c.id}`;
}

export async function archiveColumn(sql: Sql, actor: Member | null, columnId: unknown, archived: boolean): Promise<void> {
  const { column: c } = await column(sql, actor, columnId, "write");
  await sql`update columns set archived_at = ${archived ? sql`now()` : null} where id = ${c.id}`;
}

// Labels.
export async function labels(sql: Sql, boardId: string): Promise<Label[]> {
  const rows = await sql<{ id: string; name: string; color: string }[]>`select id, name, color from labels where board_id = ${boardId} order by id`;
  return rows.map(r => ({ id: String(r.id), name: r.name, color: (isColor(r.color) ? r.color : "slate") as Color }));
}

export async function addLabel(sql: Sql, actor: Member | null, boardId: unknown, input: { name: unknown; color: unknown }): Promise<Label> {
  const b = await board(sql, actor, boardId, "write");
  const name = clean(input.name, limits.labelName, { optional: true });
  const color = isColor(input.color) ? input.color : "slate";
  const [counted] = await sql<{ count: number }[]>`select count(*)::int as count from labels where board_id = ${b.id}`;
  if ((counted?.count ?? 0) >= limits.labelsPerBoard) throw new AppError("too_many", { max: limits.labelsPerBoard });
  const [row] = await sql<{ id: string }[]>`insert into labels (board_id, name, color) values (${b.id}, ${name}, ${color}) returning id`;
  return { id: String(row!.id), name, color };
}

async function label(sql: Sql, actor: Member | null, labelId: unknown): Promise<{ id: string; boardId: string }> {
  const key = id(labelId);
  const [row] = await sql<{ board_id: string }[]>`select board_id from labels where id = ${key}`;
  if (!row) throw new AppError("not_found");
  await board(sql, actor, String(row.board_id), "write");
  return { id: key, boardId: String(row.board_id) };
}

export async function updateLabel(sql: Sql, actor: Member | null, labelId: unknown, input: { name: unknown; color: unknown }): Promise<void> {
  const l = await label(sql, actor, labelId);
  const name = clean(input.name, limits.labelName, { optional: true });
  const color = isColor(input.color) ? input.color : "slate";
  await sql`update labels set name = ${name}, color = ${color} where id = ${l.id}`;
}

export async function removeLabel(sql: Sql, actor: Member | null, labelId: unknown): Promise<void> {
  const l = await label(sql, actor, labelId);
  await sql`delete from labels where id = ${l.id}`;
}

export { isPosition };
