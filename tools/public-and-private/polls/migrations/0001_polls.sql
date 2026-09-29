-- Polls: questions to the team, dates to find, short surveys.
--
-- A poll has one question (a choice, or dates) or a few (a survey). Who
-- answered is in participants (one row per member and poll: no double
-- vote). What they answered is kept in one of two ways:
--
-- - a named poll: answers, one row per chosen option, value or text, tied
--   to the participant (the organiser and, when results are shown, the
--   team see who answered what; a member may change their answer);
-- - an anonymous poll: only counts (tallies) and free texts (texts), tied
--   to no one. Nothing in these tables names a member, holds a time or an
--   order: every answer rewrites the poll's anonymous rows (and its
--   participants) in one transaction, in a random order (lib/answers.ts).

create table polls (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('choice', 'date', 'survey')),
  title text not null check (char_length(title) between 1 and 140),
  details text not null default '' check (char_length(details) <= 1000),
  organiser text not null check (organiser ~ '^mbr_[a-z2-7]{26}$' or organiser = 'erased'),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  anonymous boolean not null default false,
  -- When those asked see the results: at once ('live'), or once closed.
  results text not null default 'live' check (results in ('live', 'closed')),
  -- Who is asked: everyone who has the tool, or the members of these groups.
  everyone boolean not null default true,
  groups text[] not null default '{}' check (cardinality(groups) <= 20),
  closes_at timestamptz,
  opened_at timestamptz,
  closed_at timestamptz,
  -- Closed by its date (not by hand): the organiser is told.
  closed_by_date boolean not null default false,
  -- The work that follows a closing (bell items withdrawn, badges, the
  -- organiser told) is done.
  settled_at timestamptz,
  -- The day-before reminder was queued.
  reminded_at timestamptz,
  -- A date poll's chosen option, and when everyone was told.
  final_option bigint,
  final_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audience check (everyone or cardinality(groups) > 0)
);
create index polls_open on polls (status, closes_at) where deleted_at is null;
create index polls_organiser on polls (organiser);

create table questions (
  id bigint generated always as identity primary key,
  poll_id bigint not null references polls on delete cascade,
  position smallint not null check (position between 0 and 19),
  kind text not null check (kind in ('choice', 'date', 'scale', 'text')),
  -- A survey's question; empty for a poll of one question (its title asks it).
  text text not null default '' check (char_length(text) <= 200),
  multiple boolean not null default false,
  other boolean not null default false,
  -- The words at both ends of a 1–5 scale (optional).
  low text not null default '' check (char_length(low) <= 40),
  high text not null default '' check (char_length(high) <= 40),
  unique (poll_id, position)
);

create table options (
  id bigint generated always as identity primary key,
  question_id bigint not null references questions on delete cascade,
  position smallint not null check (position between 0 and 59),
  label text not null default '' check (char_length(label) <= 120),
  -- A date option: a day, and a time range on the Chest's clock (optional).
  day date,
  start_time text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  unique (question_id, position),
  constraint end_needs_start check (end_time is null or start_time is not null)
);

alter table polls add constraint final_is_option foreign key (final_option) references options on delete set null;

-- Who answered. No time, no order kept for anonymous polls (rewritten at
-- each answer). After an erasure, member reads 'erased' (counted, unnamed).
create table participants (
  id bigint generated always as identity primary key,
  poll_id bigint not null references polls on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$' or member = 'erased')
);
create unique index participants_once on participants (poll_id, member) where member <> 'erased';
create index participants_member on participants (member);

-- Named polls only: what each participant answered.
create table answers (
  participant_id bigint not null references participants on delete cascade,
  question_id bigint not null references questions on delete cascade,
  option_id bigint references options on delete cascade,
  -- 1–5 for a scale; 2 yes, 1 if need be, 0 no for a date option.
  value smallint check (value between 0 and 5),
  text text check (char_length(text) <= 1000)
);
create index answers_participant on answers (participant_id);
create index answers_question on answers (question_id);

-- Anonymous polls only: counts per question ("n" answered it, "o12" chose
-- option 12, "other", "v4" gave 4, "o12:2" said yes to date 12)…
create table tallies (
  poll_id bigint not null references polls on delete cascade,
  question_id bigint not null references questions on delete cascade,
  key text not null check (key ~ '^(n|other|v[1-5]|o[0-9]{1,18}(:[0-2])?)$'),
  count integer not null check (count >= 0),
  primary key (question_id, key)
);
create index tallies_poll on tallies (poll_id);

-- …and free texts (answers to a text question, "Other" answers), shown in
-- the random order `shuffle` gives them.
create table texts (
  poll_id bigint not null references polls on delete cascade,
  question_id bigint not null references questions on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  shuffle double precision not null
);
create index texts_poll on texts (poll_id);

-- Bell items to send, a page of members at a time, within the Chest's
-- quota: 'ask' when a poll opens, 'remind' the day before it closes,
-- 'final' when a date is chosen. `after` is where a telling stopped.
create table tellings (
  poll_id bigint not null references polls on delete cascade,
  kind text not null check (kind in ('ask', 'remind', 'final')),
  after text,
  lease timestamptz,
  created_at timestamptz not null default now(),
  primary key (poll_id, kind)
);

-- The Chest's lifecycle events already handled (delivered at least once).
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
