-- Round 3: who sees an extra field, the employee number, the work permit's
-- end, the days a part-timer works, what People last told the other tools
-- about a record, changes asked by the person, and letters from templates.

-- Who sees an extra field: everyone who has the tool, or only HR and the
-- person it is about ("Medical visit"). Dates are HR's follow-ups, not
-- the team's business: every date field becomes private, the new default
-- for dates (the tool had shown them to every colleague).
alter table fields add column seen text not null default 'everyone' check (seen in ('everyone', 'private'));
update fields set seen = 'private' where kind = 'date';

-- The employee number (matricule) payroll and the other HR tools key on,
-- unique when written; the end of a work permit's validity (HR is told 60
-- days before); the days of the week a part-timer works (ISO: 1 Monday …
-- 7 Sunday; the part-time contract says how the hours fall, L3123-6).
alter table records
  add column employee_number text not null default '' check (char_length(employee_number) <= 20),
  add column permit_end date,
  add column work_days smallint[] check (work_days is null or (cardinality(work_days) between 1 and 7 and work_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])),
  -- What People last told the other tools about this record (events
  -- between tools): a change that tells nothing new is not told again.
  add column told text;
create unique index records_employee_number on records (employee_number) where employee_number <> '';

-- A change the person asks for their own record (address, emergency
-- contact): HR accepts it (the record changes) or declines it with a word.
-- The asked values live here until decided, then go (only the fields'
-- names stay in the journal).
create table record_requests (
  id bigint generated always as identity primary key,
  record_id bigint not null references records (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  changes jsonb not null,
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'waiting' check (status in ('waiting', 'accepted', 'declined', 'withdrawn')),
  answer text not null default '' check (char_length(answer) <= 300),
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index record_requests_waiting on record_requests (record_id) where status = 'waiting';
create index record_requests_status on record_requests (status, created_at);

-- Letters HR writes once with merge fields ({legalName}, {job}, {startDate}
-- …) and prints from a record: a certificat de travail, an attestation.
-- The two examples speak each reader's language until HR rewords them
-- (phrase), like the example checklists.
create table letters (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 8000),
  phrase text check (phrase in ('certificate', 'attestation')),
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table journal drop constraint journal_action_check;
alter table journal add constraint journal_action_check check (action in (
  'viewed', 'created', 'changed', 'linked', 'document_added', 'document_opened', 'document_removed', 'register_viewed', 'register_exported', 'profile_changed',
  'imported', 'change_asked', 'change_accepted', 'change_declined', 'letter_printed'));
