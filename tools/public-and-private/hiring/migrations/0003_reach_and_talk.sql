-- Reach, talking to candidates, interviews, the talent pool, screening
-- questions, imports (after the critique of 2026-09-29).

-- ---- Stages in the reader's language ---------------------------------------
-- A default stage is a key ('new', 'screening'…) with no name of its own:
-- each reader sees it in their language until someone renames it (then
-- name holds the team's word). Stages created before this migration with
-- a default name, in English or French, become keys.
alter table stages add column preset text check (preset in ('new', 'screening', 'interview', 'offer', 'hired'));
alter table stages alter column name drop not null;
alter table stages add constraint stages_named check (name is not null or preset is not null);
update stages set preset = d.preset, name = null
from (values
  ('new', 'New'), ('new', 'Nouveaux'),
  ('screening', 'Screening'), ('screening', 'Présélection'),
  ('interview', 'Interview'), ('interview', 'Entretien'),
  ('offer', 'Offer'), ('offer', 'Proposition'),
  ('hired', 'Hired'), ('hired', 'Embauché')
) as d(preset, label)
where stages.name = d.label and (d.preset <> 'hired' or stages.hired);

-- ---- Jobs: what job boards and Google need ---------------------------------
-- country (ISO 3166-1 alpha-2), postal code and street: the address Google
-- for Jobs and Indeed place a job with; hours: full or part time; closes_on:
-- the last day to apply (validThrough); questions: 0 to 5 screening
-- questions [{id, kind: text|yesno|choice, label, options, required}].
alter table jobs add column country text not null default 'FR' check (country ~ '^[A-Z]{2}$');
alter table jobs add column postal_code text not null default '' check (char_length(postal_code) <= 20);
alter table jobs add column street text not null default '' check (char_length(street) <= 200);
alter table jobs add column hours text not null default 'full_time' check (hours in ('full_time', 'part_time'));
alter table jobs add column closes_on date;
alter table jobs add column questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 5);

-- ---- Candidates ------------------------------------------------------------
-- pool_at: the candidate agreed (an optional box, never a condition of
-- applying) to be kept in mind for other jobs; answers: their answers to
-- the job's questions [{id, label, answer}]; source 'pool' (considered
-- from the talent pool for another job) and 'import' (from another tool).
alter table candidates add column pool_at timestamptz;
alter table candidates add column answers jsonb not null default '[]' check (jsonb_typeof(answers) = 'array');
alter table candidates drop constraint candidates_source_check;
alter table candidates add constraint candidates_source_check check (source in ('careers', 'team', 'pool', 'import'));
-- Where an imported candidate came from ("Teamtailor"), as the file said.
alter table candidates add column origin text not null default '' check (char_length(origin) <= 80);
create index candidates_pool on candidates (pool_at) where pool_at is not null;

-- Search: names, addresses, phone, cover letter, folded (lower case, no
-- accents) so "helene" finds "Hélène". A function of the tool's own: the
-- unaccent extension is not promised on every Chest.
create function hiring_fold(text) returns text language sql immutable parallel safe as $$
  select translate(lower($1),
    'àáâãäåāăąçćčďèéêëēĕėęěìíîïīĭįıñńňòóôõöøōŏőùúûüūŭůűųýÿžźżšśşłßœæ',
    'aaaaaaaaacccdeeeeeeeeeiiiiiiiinnnooooooooouuuuuuuuuyyzzzssslsoa')
$$;

alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check check (kind in (
  'applied', 'added', 'moved', 'rejected', 'restored', 'note', 'feedback', 'asked', 'emailed', 'cv',
  'wrote', 'replied', 'interview', 'interview_moved', 'interview_cancelled', 'considered', 'imported', 'written_outside'));

-- ---- Messages: what the team wrote to a candidate and what came back ------
-- out: written by a member (author), sent through the Chest's mail from the
-- jobs mailbox with the candidate's thread address (replies come back);
-- 'waiting' until send_after (a rejection waits until its Undo is over),
-- then 'sent', 'none' (the Chest has no mail yet), 'failed' or
-- 'cancelled' (Undo). in: received on the jobs mailbox, matched to the
-- candidate (thread, references, or their address), or kept unmatched
-- (candidate_id null) for a recruiter to file.
create table messages (
  id bigint generated always as identity primary key,
  candidate_id bigint references candidates (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  kind text not null default 'message' check (kind in ('message', 'rejection', 'interview', 'interview_cancelled', 'confirmation')),
  author text check (author is null or author ~ '^mbr_[a-z2-7]{26}$' or author = 'erased'),
  subject text not null check (char_length(subject) <= 998),
  body text not null check (char_length(body) <= 100000),
  html text check (html is null or char_length(html) <= 200000),
  from_address text check (from_address is null or char_length(from_address) <= 254),
  from_name text check (from_name is null or char_length(from_name) <= 200),
  status text not null check (status in ('waiting', 'sent', 'none', 'failed', 'cancelled', 'received', 'bounced')),
  send_after timestamptz,
  -- The .ics sent with an invitation (text), kept to send it once.
  calendar text,
  mail_id text,
  message_id text,
  received_id text unique,
  in_reply_to text,
  attachments jsonb not null default '[]',
  original text,
  authenticated boolean,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index messages_candidate on messages (candidate_id, created_at);
create index messages_waiting on messages (send_after) where status = 'waiting';
create index messages_message_id on messages (message_id) where message_id is not null;
create index messages_unmatched on messages (created_at) where candidate_id is null;
create index messages_author on messages (author);

-- Email templates the recruiters wrote (the tool's own come from its
-- catalogues): one language each.
create table templates (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  language text not null check (language in ('en', 'fr')),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  created_by text not null check (created_by ~ '^mbr_[a-z2-7]{26}$' or created_by = 'erased'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Interviews ------------------------------------------------------------
-- A time with a candidate and some of the team. calendar: 'pending' until
-- the interviewers' Chest calendars have it (calendar.put), 'done', or
-- 'off' (a Chest without calendars: the page offers the .ics instead).
create table interviews (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references candidates (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  place text not null default '' check (char_length(place) <= 200),
  note text not null default '' check (char_length(note) <= 2000),
  created_by text not null check (created_by ~ '^mbr_[a-z2-7]{26}$' or created_by = 'erased'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sequence integer not null default 0,
  cancelled_at timestamptz,
  calendar text not null default 'pending' check (calendar in ('pending', 'done', 'off')),
  constraint interview_order check (ends_at > starts_at and ends_at <= starts_at + interval '1 day')
);
create index interviews_candidate on interviews (candidate_id, starts_at);
create index interviews_time on interviews (starts_at) where cancelled_at is null;
create index interviews_calendar on interviews (id) where calendar = 'pending';

create table interview_people (
  interview_id bigint not null references interviews (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  primary key (interview_id, member_id)
);
create index interview_people_member on interview_people (member_id);

-- The calendar events of interviews of candidates since erased: removed
-- from the Chest at the next flush.
create table calendar_gone (
  key text primary key,
  queued_at timestamptz not null default now()
);
