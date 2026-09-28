-- Notes: short texts posted by members. Authors are member ids (mbr_…),
-- never names. A deleted note stays 30 days (deleted_at) for "Undo" and is
-- purged on a later request (lib/notes.ts): the Chest runs nothing in the
-- background.
create table notes (
  id bigint generated always as identity primary key,
  body text not null check (char_length(body) between 1 and 500),
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$' or author = 'erased'),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index notes_live on notes (pinned desc, created_at desc) where deleted_at is null;
create index notes_author on notes (author);

-- The events of the members' lifecycle already handled (events.handle):
-- the Chest delivers at least once.
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
