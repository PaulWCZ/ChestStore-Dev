-- Polls, second step: everyone may ask, hand-picked people, sign-up sheets,
-- comments, reminders on demand, recurring pulse surveys with eNPS.

-- The tool's settings (one row). Who may start a poll: every member of the
-- tool (the default, as in Slack or Teams), or organisers only (an admin
-- restricts it).
create table settings (
  id boolean primary key default true check (id),
  members_create boolean not null default true
);
insert into settings (id) values (true);

-- An anonymous poll shows its results only once closed, to everyone —
-- organiser and admins included: live results would let someone watch the
-- count move after a colleague answers.
update polls set results = 'closed' where anonymous;
alter table polls add constraint anonymous_after_close check (not anonymous or results = 'closed');

-- Who is asked: everyone, groups, or hand-picked people (member ids).
alter table polls add column people text[] not null default '{}' check (cardinality(people) <= 200);
alter table polls drop constraint audience;
alter table polls add constraint audience check (everyone or cardinality(groups) > 0 or cardinality(people) > 0);

-- A sign-up sheet: at most this many people per answer (a choice poll) or
-- per date (a date poll: "yes" counts). Named polls only.
alter table polls add column slots smallint check (slots between 1 and 999);
alter table polls add constraint slots_named check (slots is null or not anonymous);

-- The words changed after people had answered: how many had (shown on the
-- poll, so nobody reads old answers under new words unawares).
alter table polls add column edited_after integer check (edited_after > 0);

-- The organiser's "Remind those who haven't answered": at most every 12
-- hours, told like the day-before reminder (a telling of its own kind).
alter table polls add column nudged_at timestamptz;
alter table tellings drop constraint tellings_kind_check;
alter table tellings add constraint tellings_kind_check check (kind in ('ask', 'remind', 'nudge', 'final'));

-- A pulse survey that repeats: every round is a poll of the series, opened
-- by the pass at its time, the same questions for the same people. A round
-- closes when the next one opens.
create table series (
  id bigint generated always as identity primary key,
  organiser text not null check (organiser ~ '^mbr_[a-z2-7]{26}$' or organiser = 'erased'),
  every text not null check (every in ('week', 'month')),
  -- The first round's day and time on the Chest's clock: round n opens n
  -- weeks or months later, at the same time.
  first_day date not null,
  at_time text not null check (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  next_at timestamptz not null,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);
create index series_due on series (next_at) where stopped_at is null;
alter table polls add column repeat text check (repeat in ('week', 'month'));
alter table polls add column series_id bigint references series on delete set null;
alter table polls add column round integer check (round > 0);
alter table polls add constraint repeat_survey check (repeat is null or kind = 'survey');
create index polls_series on polls (series_id, round) where series_id is not null;

-- eNPS: "How likely are you to recommend working here?", 0 to 10.
alter table questions drop constraint questions_kind_check;
alter table questions add constraint questions_kind_check check (kind in ('choice', 'date', 'scale', 'text', 'enps'));
alter table answers drop constraint answers_value_check;
alter table answers add constraint answers_value_check check (value between 0 and 10);
alter table tallies drop constraint tallies_key_check;
alter table tallies add constraint tallies_key_check check (key ~ '^(n|other|v([0-9]|10)|o[0-9]{1,18}(:[0-2])?)$');

-- Comments on a named poll ("I can do the 17th, but only after 8 pm").
create table comments (
  id bigint generated always as identity primary key,
  poll_id bigint not null references polls on delete cascade,
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$' or author = 'erased'),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_poll on comments (poll_id, id);
create index comments_author on comments (author);
