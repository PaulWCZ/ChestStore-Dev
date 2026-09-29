-- Subtasks, several checklists, start dates and times, board fields,
-- comments removed with Undo, and the email switch.
--
-- The previous version keeps working on this schema: every column added
-- is optional, a checklist item without a checklist belongs to the card's
-- main checklist, a comment without removed_at is shown.

-- Extra checklists of a card, each with a title. The card's main
-- checklist is the items whose checklist_id is null.
create table checklists (
  id bigint generated always as identity primary key,
  card_id bigint not null references cards (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  position text collate "C" not null
);
create index checklists_card on checklists (card_id, position);

-- A step of a checklist may be given to someone, with a date: a subtask.
alter table checklist_items add column checklist_id bigint references checklists (id) on delete cascade;
alter table checklist_items add column assignee text check (assignee is null or assignee ~ '^mbr_[a-z2-7]{26}$');
alter table checklist_items add column due_on date;
create index checklist_items_assignee on checklist_items (assignee) where assignee is not null and not done;

-- When the work starts, and the hour it is due at (a due time needs a due
-- date; 24-hour "HH:MM").
alter table cards add column start_on date;
alter table cards add column due_time text check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- A board's own fields (Monday's columns): text, a number, or one choice
-- among options. Each card holds at most one value per field.
create table fields (
  id bigint generated always as identity primary key,
  board_id bigint not null references boards (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('text', 'number', 'choice')),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  position text collate "C" not null
);
create index fields_board on fields (board_id, position);
create table card_values (
  card_id bigint not null references cards (id) on delete cascade,
  field_id bigint not null references fields (id) on delete cascade,
  value text not null check (char_length(value) between 1 and 500),
  primary key (card_id, field_id)
);

-- A removed comment is hidden at once and can be brought back (Undo) for
-- a few minutes; then it is deleted for good (lib/cards.ts purges it).
alter table comments add column removed_at timestamptz;
create index comments_removed on comments (removed_at) where removed_at is not null;

-- Email beside the bell, per person: on unless they turn it off.
alter table reminders add column email_off boolean not null default false;
