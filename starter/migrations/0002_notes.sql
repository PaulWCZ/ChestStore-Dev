-- EXAMPLE (Notes): replace with the tool's own tables.
-- author is a member id (mbr_…), never a name; 'erased' once its author
-- asked to be forgotten. A
-- deleted note keeps deleted_at for its Undo, and is purged 30 days later.
create table notes (
  id bigint primary key generated always as identity,
  body text not null check (length(body) between 1 and 2000),
  author text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index notes_shown on notes (pinned desc, created_at desc) where deleted_at is null;
create index notes_author on notes (author);

-- The pages that list notes change when notes do (a page's version:
-- changeStamp() of @argentic/chest-app/db, migrations/0001_chest.sql).
select chest_watch('notes');
