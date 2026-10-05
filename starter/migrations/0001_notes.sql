-- The notes. author is a member id (mbr_…), never a name; null for a
-- message from the public page; 'erased' once its author asked to be
-- forgotten. A deleted note keeps deleted_at for its Undo, then the
-- schedule "purge" removes it.
create table notes (
  id bigint primary key generated always as identity,
  body text not null check (length(body) between 1 and 2000),
  author text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index notes_shown on notes (pinned desc, created_at desc) where deleted_at is null;
create index notes_author on notes (author);

-- What the Chest delivered already (events, schedule runs come at least
-- once): src/lib/db.ts's seen.
create table chest_seen (
  id text primary key,
  at timestamptz not null default now()
);
