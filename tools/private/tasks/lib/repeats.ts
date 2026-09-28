import type { Query, Sql } from "./db.ts";
import { limits } from "./model.ts";
import { between } from "./position.ts";
import { addDays, nextDue, parseRepeat, type Repeat } from "./repeat.ts";

// The series of a repeating card: when a card that repeats is done, its
// next one is made in the board's first column — same title, description,
// people and labels, the checklist unticked, the next due date — and the
// done card names it (next_card_id), so it is made once, whichever path
// completed it (a drag, a tick in My tasks, a column marked done) and
// however often the morning runs. Reopened by mistake ("Undo"), the done
// card takes back a next one nobody touched yet.

type Pending = { id: string; board_id: string; title: string; description: string; due_on: string | null; created_by: string; repeat: unknown; completed_on: string | null };

// makeNext makes the next card of a done repeating card, inside the
// caller's transaction; the id of the new card, or null when there is
// nothing to make (not repeating, not done, archived, already made, no
// column to put it in, the board full).
export async function makeNext(tx: Query, cardId: string, today: string, actor: string): Promise<string | null> {
  // The row is locked: two deliveries of a run, or a run and a click, make one card.
  const [c] = await tx<Pending[]>`
    select c.id, c.board_id, c.title, c.description, to_char(c.due_on, 'YYYY-MM-DD') as due_on, c.created_by, c.repeat, to_char(c.completed_at, 'YYYY-MM-DD') as completed_on
    from cards c join columns k on k.id = c.column_id join boards b on b.id = c.board_id
    where c.id = ${cardId} and c.repeat is not null and c.next_card_id is null and c.archived_at is null and k.done and k.archived_at is null and b.archived_at is null
    for update of c`;
  if (!c) return null;
  let rule: Repeat | null;
  try {
    rule = parseRepeat(c.repeat);
  } catch {
    return null;
  }
  if (!rule) return null;
  const [lane] = await tx<{ id: string }[]>`select id from columns where board_id = ${c.board_id} and archived_at is null and not done order by position, id limit 1`;
  if (!lane) return null;
  const [counted] = await tx<{ count: number }[]>`select count(*)::int as count from cards where board_id = ${c.board_id} and archived_at is null`;
  if ((counted?.count ?? 0) >= limits.cardsPerBoard) return null;
  const [edge] = await tx<{ position: string }[]>`select position from cards where column_id = ${lane.id} order by position desc limit 1`;
  const due = nextDue(rule, c.due_on ?? addDays(today, -1), today);
  const [made] = await tx<{ id: string }[]>`
    insert into cards (board_id, column_id, title, description, position, due_on, created_by, repeat)
    values (${c.board_id}, ${lane.id}, ${c.title}, ${c.description}, ${between(edge?.position ?? null, null)}, ${due}, ${c.created_by}, ${tx.json(rule as never)})
    returning id`;
  const next = String(made!.id);
  await tx`insert into card_assignees (card_id, member_id) select ${next}, member_id from card_assignees where card_id = ${c.id}`;
  await tx`insert into card_labels (card_id, label_id) select ${next}, label_id from card_labels where card_id = ${c.id}`;
  await tx`insert into checklist_items (card_id, text, done, position) select ${next}, text, false, position from checklist_items where card_id = ${c.id}`;
  await tx`update cards set next_card_id = ${next} where id = ${c.id}`;
  await tx`insert into activity (card_id, actor, kind, data) values (${next}, ${actor}, 'repeat_made', ${tx.json({ from: c.id })})`;
  await tx`insert into activity (card_id, actor, kind, data) values (${c.id}, ${actor}, 'repeat_next', ${tx.json({ due })})`;
  return next;
}

// takeBack removes the next card of a card reopened, if nobody touched it
// yet (no change in its history, no comment, no file, no ticked step), and
// lets the reopened card make it again once done. The id removed, or null.
export async function takeBack(tx: Query, cardId: string): Promise<string | null> {
  const [c] = await tx<{ next_card_id: string | null }[]>`select next_card_id from cards where id = ${cardId} for update`;
  if (!c?.next_card_id) return null;
  const next = String(c.next_card_id);
  const [untouched] = await tx<{ id: string }[]>`
    select n.id from cards n join columns k on k.id = n.column_id
    where n.id = ${next} and n.archived_at is null and not k.done and n.next_card_id is null
      and not exists (select 1 from activity where card_id = n.id and kind <> 'repeat_made')
      and not exists (select 1 from comments where card_id = n.id)
      and not exists (select 1 from attachments where card_id = n.id)
      and not exists (select 1 from checklist_items where card_id = n.id and done)`;
  if (!untouched) return null;
  await tx`delete from cards where id = ${next}`;
  await tx`insert into activity (card_id, actor, kind, data) values (${cardId}, 'chest', 'repeat_taken_back', '{}')`;
  return next;
}

// catchUp makes the next card of every done repeating card that has none
// (the morning's safety net: a card completed while the Chest could not be
// told, a repeat set on a card already done). Returns the cards made.
export async function catchUp(sql: Sql, today: string): Promise<string[]> {
  const pending = await sql<{ id: string }[]>`
    select c.id from cards c join columns k on k.id = c.column_id
    where c.repeat is not null and c.next_card_id is null and c.archived_at is null and k.done and k.archived_at is null
    order by c.id limit 1000`;
  const made: string[] = [];
  for (const { id } of pending) {
    const next = await sql.begin(tx => makeNext(tx, String(id), today, "chest"));
    if (next) made.push(next);
  }
  return made;
}
