-- Audience, search and the weekly digest.

-- Audience: a post is for everyone who has News (no row here), or for the
-- members of one or more of the Chest's groups (grp_…, the groups that give
-- News). A post kept to groups is seen by those groups' members, its author
-- and the Chest's admins; only its audience is told, asked to confirm and
-- counted (lib/access.ts).
create table post_groups (
  post_id bigint not null references posts (id) on delete cascade,
  group_id text not null check (group_id ~ '^grp_[a-z2-7]{26}$'),
  primary key (post_id, group_id)
);
create index post_groups_group on post_groups (group_id);

-- Search in any language, accents and case aside ("equipe" finds
-- "Équipe"). Both extensions are trusted: the database's owner may create
-- them (PostgreSQL 13+). The configuration keeps every word as it is
-- written (no stemming: a company writes in English and French at once),
-- without its accents.
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create text search configuration news (copy = simple);
alter text search configuration news alter mapping for hword, hword_part, word with unaccent, simple;

alter table posts add column search tsvector
  generated always as (setweight(to_tsvector('news', title), 'A') || setweight(to_tsvector('news', body), 'B')) stored;
create index posts_search on posts using gin (search);
alter table comments add column search tsvector generated always as (to_tsvector('news', body)) stored;
create index comments_search on comments using gin (search);

-- The weekly digest (schedule "digest", Monday morning): one run per week,
-- told a page of members at a time; after is where it stopped when the
-- Chest's hourly quota was reached (the "publish" pass goes on from there),
-- lease keeps two passes from telling at once. It covers the posts
-- published in (from_at, to_at].
create table digest_runs (
  week date primary key,
  from_at timestamptz not null,
  to_at timestamptz not null,
  after text,
  lease timestamptz,
  done_at timestamptz
);

-- Who has this week's digest item in their bell: it is withdrawn when they
-- open the front page, or replaced by next week's.
create table digests (
  member text primary key check (member ~ '^mbr_[a-z2-7]{26}$'),
  sent_at timestamptz not null
);
