-- "Blocked by" between cards, columns named in the reader's language, the
-- bell items of comments (to take them back when a comment is deleted),
-- and emails held a moment and grouped per person.
--
-- The previous version keeps working on this schema: every table is new,
-- the one column added is optional.

-- A card waits for others (its blockers), on the same board. It cannot be
-- marked done while one of them is open, unless the person says so.
create table card_blockers (
  card_id bigint not null references cards (id) on delete cascade,
  blocker_id bigint not null references cards (id) on delete cascade,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (card_id, blocker_id),
  check (card_id <> blocker_id)
);
create index card_blockers_blocker on card_blockers (blocker_id);

-- A column made by a template keeps the template's key ("todo", "done"…):
-- each reader sees it named in their own language until someone renames
-- it (then the key goes and the name written stays).
alter table columns add column key text check (key is null or key ~ '^[a-zA-Z]{1,16}$');

-- Which comments the bell items of a card show, per person: each mention
-- has its own item; the comments seen by the card's people share one item
-- per card (a new comment replaces it: one row per card and person). A
-- comment deleted takes its items back; one brought back with Undo, or
-- edited, shows again with its words as they are.
create table comment_notices (
  card_id bigint not null references cards (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  reason text not null check (reason in ('comment', 'mention')),
  comment_id bigint not null references comments (id) on delete cascade,
  primary key (comment_id, member_id, reason)
);
create unique index comment_notices_latest on comment_notices (card_id, member_id) where reason = 'comment';
create index comment_notices_card on comment_notices (card_id, reason);

-- Emails wait here a minute (lib/mail.ts): what one person did in one go —
-- a card given, a step, a mention — leaves as one email, and a comment
-- deleted in that time is never sent. What an email names is read again
-- when it leaves: a card no longer given, a step ticked, a comment
-- deleted (held while its Undo lasts, gone with it) are left out.
create table mail_queue (
  id bigint generated always as identity primary key,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  kind text not null check (kind in ('assigned', 'step', 'mention')),
  actor text not null,
  card_id bigint not null references cards (id) on delete cascade,
  step_id bigint references checklist_items (id) on delete cascade,
  comment_id bigint references comments (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index mail_queue_member on mail_queue (member_id, created_at);
create unique index mail_queue_once on mail_queue (member_id, kind, card_id, coalesce(step_id, 0), coalesce(comment_id, 0));
