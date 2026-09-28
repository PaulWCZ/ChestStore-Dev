-- Wiki: spaces holding a tree of pages; every save of a page is a version.
-- People are member ids (mbr_…), never names; 'erased' replaces the id of a
-- person whose data was erased. Page content is ProseMirror JSON checked by
-- the server (lib/doc.ts), rendered to HTML by the server, never stored as
-- HTML. Positions are fractional keys (text, compared bytewise with collate
-- "C"): moving a page writes one row.

-- Search in any language, accents aside: "ete" finds "Été". Both extensions
-- are trusted: the database's owner may create them.
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create text search configuration wiki (copy = simple);
alter text search configuration wiki alter mapping for hword, hword_part, word with unaccent, simple;

create table spaces (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  color text not null default 'green' check (color ~ '^[a-z]{1,16}$'),
  position text collate "C" not null,
  -- 'everyone': everyone who has the tool; 'groups': the members of its
  -- groups (and its creator, and the Chest's admins).
  visibility text not null default 'everyone' check (visibility in ('everyone', 'groups')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table space_groups (
  space_id bigint not null references spaces (id) on delete cascade,
  group_id text not null check (group_id ~ '^grp_[a-z2-7]{26}$'),
  primary key (space_id, group_id)
);

create table pages (
  id bigint generated always as identity primary key,
  space_id bigint not null references spaces (id) on delete cascade,
  parent_id bigint references pages (id) on delete cascade,
  position text collate "C" not null,
  title text not null check (char_length(title) between 1 and 200),
  doc jsonb not null,
  -- The page's words, for search and diffs (derived from doc on save).
  body text not null default '' check (char_length(body) <= 400000),
  version int not null default 1,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  -- In the trash (with its subpages) since then; deleted for good from there.
  deleted_at timestamptz,
  search tsvector generated always as (setweight(to_tsvector('wiki', title), 'A') || setweight(to_tsvector('wiki', body), 'B')) stored,
  check (parent_id is null or parent_id <> id)
);
create index pages_tree on pages (space_id, parent_id, position) where deleted_at is null;
create index pages_updated on pages (updated_at desc) where deleted_at is null;
create index pages_search on pages using gin (search);
create index pages_title_trgm on pages using gin (lower(title) gin_trgm_ops);

-- Every save, whole: the history shows, compares and restores them.
create table page_versions (
  id bigint generated always as identity primary key,
  page_id bigint not null references pages (id) on delete cascade,
  number int not null,
  title text not null,
  doc jsonb not null,
  body text not null default '',
  author text not null,
  created_at timestamptz not null default now(),
  -- 'created', 'edited', 'restored', 'imported'
  kind text not null default 'edited' check (kind ~ '^[a-z]{1,16}$'),
  restored_from int,
  unique (page_id, number)
);

-- A member's unsaved changes to a page, kept as they type: a closed tab
-- loses nothing. One per member and page.
create table drafts (
  page_id bigint not null references pages (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  title text not null,
  doc jsonb not null,
  base_version int not null,
  updated_at timestamptz not null default now(),
  primary key (page_id, member_id)
);
create index drafts_member on drafts (member_id);

-- Who is editing a page (no live co-editing: one at a time). The lock is
-- held while its holder is active; idle for 15 minutes, another may take it.
create table page_locks (
  page_id bigint primary key references pages (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default now(),
  active_at timestamptz not null default now()
);
create index page_locks_member on page_locks (member_id);

-- Links from a page to others (by id, so they survive renames and moves):
-- the "linked from" list.
create table page_links (
  from_page bigint not null references pages (id) on delete cascade,
  to_page bigint not null references pages (id) on delete cascade,
  primary key (from_page, to_page)
);
create index page_links_to on page_links (to_page);

-- Images and files of a page, kept by the Chest (files capability); the
-- object is the Chest's name, confirmed by files.stat before it is recorded.
create table page_files (
  id bigint generated always as identity primary key,
  page_id bigint not null references pages (id) on delete cascade,
  object text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  type text not null,
  size bigint not null,
  added_by text not null,
  added_at timestamptz not null default now()
);
create index page_files_page on page_files (page_id);

create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
