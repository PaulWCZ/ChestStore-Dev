-- Tasks: boards of columns of cards. People are member ids (mbr_…), never
-- names; 'erased' replaces the id of a person whose data was erased.
-- Positions are fractional keys (text, compared bytewise with collate "C"):
-- moving a card writes one row. Nothing is deleted by a click: boards,
-- columns and cards are archived, then deleted from their archive.

create table boards (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'sun' check (color ~ '^[a-z]{1,16}$'),
  -- 'team': everyone who has the tool; 'private': the board's people and groups.
  visibility text not null default 'team' check (visibility in ('team', 'private')),
  created_by text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Who belongs to a private board (and who owns any board: may change its
-- settings). A group gives the board to its members as the Chest says.
create table board_people (
  board_id bigint not null references boards (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  owner boolean not null default false,
  primary key (board_id, member_id)
);
create index board_people_member on board_people (member_id);
create table board_groups (
  board_id bigint not null references boards (id) on delete cascade,
  group_id text not null check (group_id ~ '^grp_[a-z2-7]{26}$'),
  primary key (board_id, group_id)
);

create table columns (
  id bigint generated always as identity primary key,
  board_id bigint not null references boards (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position text collate "C" not null,
  -- A card in a "done" column is complete: it leaves "My tasks".
  done boolean not null default false,
  archived_at timestamptz
);
create index columns_board on columns (board_id, position);

create table labels (
  id bigint generated always as identity primary key,
  board_id bigint not null references boards (id) on delete cascade,
  name text not null check (char_length(name) between 0 and 40),
  color text not null check (color ~ '^[a-z]{1,16}$')
);
create index labels_board on labels (board_id);

create table cards (
  id bigint generated always as identity primary key,
  board_id bigint not null references boards (id) on delete cascade,
  column_id bigint not null references columns (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '' check (char_length(description) <= 20000),
  position text collate "C" not null,
  due_on date,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  search tsvector generated always as (to_tsvector('simple', title || ' ' || description)) stored
);
create index cards_column on cards (column_id, position) where archived_at is null;
create index cards_board on cards (board_id) where archived_at is null;
create index cards_due on cards (due_on) where archived_at is null and completed_at is null;
create index cards_search on cards using gin (search);

create table card_assignees (
  card_id bigint not null references cards (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  primary key (card_id, member_id)
);
create index card_assignees_member on card_assignees (member_id);

create table card_labels (
  card_id bigint not null references cards (id) on delete cascade,
  label_id bigint not null references labels (id) on delete cascade,
  primary key (card_id, label_id)
);

create table checklist_items (
  id bigint generated always as identity primary key,
  card_id bigint not null references cards (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  done boolean not null default false,
  position text collate "C" not null
);
create index checklist_card on checklist_items (card_id, position);

create table comments (
  id bigint generated always as identity primary key,
  card_id bigint not null references cards (id) on delete cascade,
  author text not null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  -- Imported from another tool: the name its author had there.
  imported_author text check (char_length(imported_author) <= 120)
);
create index comments_card on comments (card_id, created_at);

-- Files attached to a card, kept by the Chest (files capability); the name
-- is the Chest's object name, confirmed by files.stat before it is recorded.
create table attachments (
  id bigint generated always as identity primary key,
  card_id bigint not null references cards (id) on delete cascade,
  object text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  type text not null,
  size bigint not null,
  added_by text not null,
  added_at timestamptz not null default now()
);
create index attachments_card on attachments (card_id);

-- What happened to a card, for its history: codes and ids, never sentences.
create table activity (
  id bigint generated always as identity primary key,
  card_id bigint not null references cards (id) on delete cascade,
  actor text not null,
  kind text not null check (kind ~ '^[a-z_]{1,32}$'),
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index activity_card on activity (card_id, at);

create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
