-- Tasks tells the tools an admin linked to it (Goals: "Cards done") when a
-- card is done or reopened: tasks.card.done {card, board, boardName,
-- assignees} and tasks.card.reopened {card} (Proposal (studio): events
-- between tools). A trigger writes each one in the same transaction as
-- the change, whatever made it — the card's button, a move to or from a
-- "done" column (drag, keyboard, "Move to board"), the tick of My tasks,
-- a column made "done" or not (all its cards), archiving a column into
-- another, a card added or copied into a "done" column, and every Undo
-- (a move back) —; lib/card-events.ts publishes them after the action,
-- and the "mail" schedule again while the Chest cannot take them.
--
-- Done: completed_at goes from nothing to a time (a card is done exactly
-- when it is in a "done" column; lib/cards.ts keeps completed_at so).
-- Reopened: it goes back to nothing. Cards an import writes are history,
-- not work done today: the import sets `tasks.importing` for its
-- transaction and the trigger leaves them out. Archiving or deleting a
-- done card does not take it back: the work was done.
--
-- Only the card and its board are kept: the board's name and the card's
-- people are read when the event leaves (no member id waits here, so an
-- erasure has nothing to change).

create table card_events (
  id bigint generated always as identity primary key,
  type text not null check (type in ('tasks.card.done', 'tasks.card.reopened')),
  card bigint not null,
  board bigint not null,
  at timestamptz not null default clock_timestamp(),
  published_at timestamptz
);
create index card_events_pending on card_events (id) where published_at is null;

create function card_done_or_reopened() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.completed_at is not null and coalesce(current_setting('tasks.importing', true), '') <> 'on' then
      insert into card_events (type, card, board) values ('tasks.card.done', new.id, new.board_id);
    end if;
  elsif old.completed_at is null and new.completed_at is not null then
    insert into card_events (type, card, board) values ('tasks.card.done', new.id, new.board_id);
  elsif old.completed_at is not null and new.completed_at is null then
    insert into card_events (type, card, board) values ('tasks.card.reopened', new.id, new.board_id);
  end if;
  return new;
end
$$;

create trigger cards_done_or_reopened after insert or update of completed_at on cards
  for each row execute function card_done_or_reopened();
