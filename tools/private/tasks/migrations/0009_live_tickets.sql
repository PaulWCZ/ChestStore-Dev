-- Who may join a board's realtime channel ("board:<id>", chest.json's
-- "realtime"): the Chest checks this table at every join, on Tasks'
-- database, without Tasks (SDK 0.7.0's membership tables). A row is written
-- when Tasks shows a board to a member it has just checked may see it (the
-- board, Boards, My tasks); it goes whenever that may no longer be true —
-- the board went private or its people or groups changed, it was deleted,
-- the member's groups or role changed, they lost access, left or were
-- erased —, and the Chest then takes them out of the channel at once. Their
-- page reads itself again: still allowed, it is let in again (a new row);
-- no longer, the board is not shown.
-- Without it, any member of Tasks could join "board:<id>" of a private
-- board they are not on and learn when its cards change.
create table board_live (
  board_id bigint not null references boards (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (board_id, member_id)
);
create index board_live_member on board_live (member_id);
