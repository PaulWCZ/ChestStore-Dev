-- Reach: what a post needs to reach people outside the Chest and beyond
-- one group — email, hand-picked audiences, two languages, pictures —, and
-- what a publisher needs to trust it — versions, reach counts.

-- Audience by hand: a post may be for some groups, some people, or both
-- (either one lets a person in). No row here and none in post_groups: the
-- post is for everyone who has News.
create table post_people (
  post_id bigint not null references posts (id) on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$'),
  primary key (post_id, member)
);
create index post_people_member on post_people (member);

-- Languages: posts.title and posts.body are written in posts.locale; a post
-- may also have its headline and text in other languages (post_versions).
-- Each reader sees their own language's version, or the post's own.
alter table posts add column locale text not null default 'en' check (locale ~ '^[a-z]{2}$');
create table post_versions (
  post_id bigint not null references posts (id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}$'),
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 20000),
  primary key (post_id, locale)
);

-- Search with stemming ("move" finds "moving", "déménager" finds
-- "déménagement"), beside the exact words of 0002: an English and a French
-- configuration, accents aside.
create text search configuration news_en (copy = english);
alter text search configuration news_en alter mapping for hword, hword_part, word with unaccent, english_stem;
create text search configuration news_fr (copy = french);
alter text search configuration news_fr alter mapping for hword, hword_part, word with unaccent, french_stem;
alter table posts add column stems tsvector
  generated always as (to_tsvector('news_en', title || ' ' || body) || to_tsvector('news_fr', title || ' ' || body)) stored;
create index posts_stems on posts using gin (stems);
alter table post_versions add column search tsvector
  generated always as (setweight(to_tsvector('news', title), 'A') || setweight(to_tsvector('news', body), 'B')) stored;
alter table post_versions add column stems tsvector
  generated always as (to_tsvector('news_en', title || ' ' || body) || to_tsvector('news_fr', title || ' ' || body)) stored;
create index post_versions_search on post_versions using gin (search);
create index post_versions_stems on post_versions using gin (stems);
alter table comments add column stems tsvector
  generated always as (to_tsvector('news_en', body) || to_tsvector('news_fr', body)) stored;
create index comments_stems on comments using gin (stems);

-- Telling, and taking it back. A new post that tells people (Important) is
-- published 10 seconds after "Publish" (publish_at), and undo_until says
-- so: until then "Undo" takes it back and nothing has left.
-- email_short: the Chest's daily email quota stopped its emails.
alter table posts add column undo_until timestamptz;
alter table posts add column email_short boolean not null default false;

-- Who was sent an Important post by email (which version of its request to
-- confirm): so an email is never sent twice, and the publisher knows how
-- many it reached. A delivery, never a reading.
create table emails (
  post_id bigint not null references posts (id) on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$'),
  version integer not null,
  at timestamptz not null default now(),
  primary key (post_id, member, version)
);
create index emails_member on emails (member);

-- Versions of the text: each edit of a published post keeps what it
-- replaced. text_version counts them; an Important post asks for
-- confirmation from confirm_from on (a publisher who changes the text may
-- ask everyone to confirm again); each confirmation says which version was
-- confirmed.
create table revisions (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts (id) on delete cascade,
  version integer not null,
  locale text not null,
  title text not null,
  body text not null,
  versions jsonb not null default '[]',
  edited_by text not null check (edited_by ~ '^mbr_[a-z2-7]{26}$' or edited_by = 'erased'),
  replaced_at timestamptz not null default now()
);
create index revisions_post on revisions (post_id, version);
create index revisions_edited_by on revisions (edited_by);
alter table posts add column text_version integer not null default 1;
alter table posts add column confirm_from integer not null default 1;
alter table confirmations add column version integer not null default 1;

-- Pinned until a day (then it is no longer first, computed when read).
alter table posts add column pinned_until timestamptz;

-- Events over several days, and a number of seats: past it, "I'm coming"
-- puts the person on the waiting list ('wait'), first come first served; a
-- seat freed goes to the first on the list.
alter table posts add column event_last_day date;
alter table posts add column seats integer check (seats is null or seats between 1 and 10000);
alter table posts add constraint event_more check (kind = 'event' or (event_last_day is null and seats is null));
alter table posts add constraint event_days check (event_last_day is null or event_last_day > event_day);
alter table rsvps drop constraint rsvps_answer_check;
alter table rsvps add constraint rsvps_answer_check check (answer in ('yes', 'no', 'wait'));

-- Pictures: a gallery ('image') and the pictures inside the text
-- ('inline', named in the text as image:<id>); position orders the gallery.
alter table files drop constraint files_role_check;
alter table files add constraint files_role_check check (role in ('cover', 'attachment', 'image', 'inline'));
alter table files add column position integer;

-- Replies: one level under a comment.
alter table comments add column parent_id bigint references comments (id) on delete cascade;
create index comments_parent on comments (parent_id) where parent_id is not null;

-- Imported posts (a Slack channel): where each came from, once; the import
-- it belongs to, so one import can be taken back.
alter table posts add column origin text unique check (origin is null or char_length(origin) <= 200);
alter table posts add column import_batch text check (import_batch is null or import_batch ~ '^[a-z0-9]{1,32}$');
create index posts_import on posts (import_batch) where import_batch is not null;

-- Reach, as counts only: when each person last opened any page of News
-- (never which post). A post's reach is how many of its audience came to
-- News after it was published (README, "Works council").
create table activity (
  member text primary key check (member ~ '^mbr_[a-z2-7]{26}$'),
  at timestamptz not null
);

-- Each person's choice: the weekly digest by email too (on unless they
-- turn it off).
create table preferences (
  member text primary key check (member ~ '^mbr_[a-z2-7]{26}$'),
  digest_email boolean not null default true
);

-- What News learned of the Chest: whether it can send email ('mail':
-- 'on' or 'off', from the last attempt), so a publisher is told before
-- publishing.
create table chest_state (
  key text primary key,
  value text not null,
  at timestamptz not null default now()
);
