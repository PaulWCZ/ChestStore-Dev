-- News: the company's front page. Every person is a member id (mbr_…),
-- never a name; 'erased' stands for someone whose data was erased (the
-- posts and comments they wrote stay for the company, unsigned).

-- A post: an announcement, an event, a welcome to a new colleague, or a
-- piece of information. It appears at publish_at (in the future: it is
-- scheduled, seen only by publishers until then). A deleted post stays 30
-- days (deleted_at) for "Undo", then is purged on a later pass.
create table posts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('announcement', 'event', 'welcome', 'info')),
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 20000),
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$' or author = 'erased'),
  important boolean not null default false,
  pinned_at timestamptz,
  publish_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  -- An event: its day in the Chest's time zone; its start and end (null
  -- start: all day); its place.
  event_day date,
  event_start timestamptz,
  event_end timestamptz,
  place text check (place is null or char_length(place) <= 200),
  -- A welcome: the new colleague.
  welcome text check (welcome is null or welcome ~ '^mbr_[a-z2-7]{26}$' or welcome = 'erased'),
  -- Once published, an Important post is told to everyone who has the tool
  -- in the Chest's bell, a page of members at a time (a welcome, to the new
  -- colleague); announced_at says it is done. announce_after is where the
  -- telling stopped (a members.list cursor) when the Chest's hourly quota
  -- was reached; announce_lease keeps two passes from telling at once.
  -- reminded_at: the last "remind those who have not confirmed".
  announced_at timestamptz,
  announce_after text,
  announce_lease timestamptz,
  reminded_at timestamptz,
  constraint event_fields check (kind = 'event' or (event_day is null and event_start is null and event_end is null and place is null)),
  constraint event_day_set check (kind <> 'event' or event_day is not null),
  constraint event_order check (event_end is null or (event_start is not null and event_end > event_start)),
  constraint welcome_fields check ((kind = 'welcome') = (welcome is not null))
);
create index posts_front on posts (publish_at desc, id desc) where deleted_at is null;
create index posts_pinned on posts (pinned_at desc) where deleted_at is null and pinned_at is not null;
create index posts_events on posts (event_day) where deleted_at is null and kind = 'event';
create index posts_to_announce on posts (publish_at) where announced_at is null and deleted_at is null and (important or kind = 'welcome');
create index posts_author on posts (author);
create index posts_welcome on posts (welcome) where welcome is not null;

-- Files of posts, kept by the Chest (files capability): the cover picture
-- (one per post) and attachments. A file uploaded in the composer has no
-- post yet (post_id null) until the post is saved; one never used is purged
-- after a day.
create table files (
  id bigint generated always as identity primary key,
  object text not null unique,
  post_id bigint references posts (id) on delete cascade,
  role text not null check (role in ('cover', 'attachment')),
  file_name text not null check (char_length(file_name) between 1 and 200),
  type text not null,
  size bigint not null check (size >= 0),
  added_by text not null check (added_by ~ '^mbr_[a-z2-7]{26}$' or added_by = 'erased'),
  added_at timestamptz not null default now()
);
create unique index files_one_cover on files (post_id) where role = 'cover';
create index files_post on files (post_id);
create index files_loose on files (added_at) where post_id is null;
create index files_added_by on files (added_by);

-- Reactions: a small fixed set; one of each per person and post. An erased
-- person's reactions still count, unsigned.
create table reactions (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts (id) on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$' or member = 'erased'),
  emoji text not null check (emoji in ('thumbs', 'heart', 'party', 'clap', 'smile')),
  at timestamptz not null default now()
);
create unique index reactions_once on reactions (post_id, member, emoji) where member <> 'erased';
create index reactions_member on reactions (member);

-- Comments: flat, oldest first. A deleted comment stays 30 days for "Undo".
create table comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts (id) on delete cascade,
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$' or author = 'erased'),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index comments_post on comments (post_id, created_at) where deleted_at is null;
create index comments_author on comments (author);

-- "I have read it" on an Important post: an explicit click, never a view.
create table confirmations (
  post_id bigint not null references posts (id) on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$'),
  at timestamptz not null default now(),
  primary key (post_id, member)
);
create index confirmations_member on confirmations (member);

-- Answers to an event: coming or not.
create table rsvps (
  post_id bigint not null references posts (id) on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$'),
  answer text not null check (answer in ('yes', 'no')),
  at timestamptz not null default now(),
  primary key (post_id, member)
);
create index rsvps_member on rsvps (member);

-- One line per member: when they last opened the front page (seen_at) and
-- the visit before that session (marker_at), to mark what is new since.
-- Never per post: the tool does not record who opened what.
create table visits (
  member text primary key check (member ~ '^mbr_[a-z2-7]{26}$'),
  seen_at timestamptz not null,
  marker_at timestamptz
);

-- The events of the members' lifecycle already handled (events.handle):
-- the Chest delivers at least once.
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
