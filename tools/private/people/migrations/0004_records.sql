-- The HR side of People: arrivals recorded by hand, a departed manager's
-- place kept in the org chart, example steps that speak each reader's
-- language, extra profile fields, and the employee record (contract, staff
-- register, emergency contact, documents) with the journal of who read or
-- changed it.

-- Arrivals: also written by HR by hand ('manual'), with the work address
-- the newcomer will have (a company address, never a personal one; cleared
-- when linked, like everything else of an arrival).
alter table arrivals drop constraint arrivals_source_check;
alter table arrivals add constraint arrivals_source_check check (source in ('hiring', 'manual'));
alter table arrivals add column work_email text not null default '' check (char_length(work_email) <= 254);

-- A manager who left keeps their place above their reports, flagged, until
-- HR names someone else (manager_id still names the one who left).
alter table profiles add column manager_left boolean not null default false;

-- The steps of the example templates carry the key of their words, so each
-- reader sees them in their own language; rewording a step drops the key.
alter table template_items add column phrase text check (phrase ~ '^(onboarding|offboarding)\.[a-zA-Z]{1,30}$');
alter table journey_items add column phrase text check (phrase ~ '^(onboarding|offboarding)\.[a-zA-Z]{1,30}$');

-- Extra profile fields HR adds ("Languages", "T-shirt size"): filled by
-- the person (and HR), or by HR only. Removed ones are kept 30 days (undo).
create table fields (
  id bigint generated always as identity primary key,
  label text not null check (char_length(label) between 1 and 40),
  editor text not null default 'person' check (editor in ('person', 'hr')),
  position integer not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create table field_values (
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  field_id bigint not null references fields (id) on delete cascade,
  value text not null check (char_length(value) between 1 and 200),
  primary key (member_id, field_id)
);

-- The employee record, seen by HR and, read-only, by the employee. One per
-- person employed, whether or not they have the Chest (member_id null): the
-- staff register (registre unique du personnel, Code du travail L1221-13,
-- D1221-23) lists everyone. The legal name is written by HR as on the
-- contract: the register must still show it five years after they left,
-- after the Chest forgot them. Salary is not kept here (README).
create table records (
  id bigint generated always as identity primary key,
  member_id text unique check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  legal_name text not null check (char_length(legal_name) between 1 and 120),
  sex text check (sex in ('female', 'male')),
  birth_date date,
  nationality text not null default '' check (char_length(nationality) <= 60),
  job text not null default '' check (char_length(job) <= 80),
  qualification text not null default '' check (char_length(qualification) <= 120),
  contract text not null default 'permanent' check (contract in ('permanent', 'fixed_term', 'apprenticeship', 'professionalisation', 'internship', 'temporary', 'seconded')),
  working_time text not null default 'full' check (working_time in ('full', 'part')),
  hours numeric(4, 2) check (hours > 0 and hours <= 60),
  start_date date,
  trial_end date,
  contract_end date,
  end_date date,
  -- A foreign worker's work permit: its type and number.
  work_permit text not null default '' check (char_length(work_permit) <= 120),
  -- Temporary or seconded: the employer's name and address.
  agency text not null default '' check (char_length(agency) <= 300),
  -- An intern's tutor (a member) and where they are present.
  tutor_id text check (tutor_id ~ '^mbr_[a-z2-7]{26}$'),
  workplace text not null default '' check (char_length(workplace) <= 120),
  emergency_name text not null default '' check (char_length(emergency_name) <= 120),
  emergency_relation text not null default '' check (char_length(emergency_relation) <= 60),
  emergency_phone text not null default '' check (char_length(emergency_phone) <= 30),
  address text not null default '' check (char_length(address) <= 300),
  -- After an erasure: only what the register needs is kept, detached.
  erased_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index records_dates on records (start_date, id);

-- Documents of a record (contracts, amendments, certificates…): files kept
-- through the Chest (files), under records/<record>/, opened through a
-- fresh signed link each time.
create table record_documents (
  id bigint generated always as identity primary key,
  record_id bigint not null references records (id) on delete cascade,
  kind text not null check (kind in ('contract', 'amendment', 'certificate', 'identity', 'other')),
  name text not null check (char_length(name) between 1 and 120),
  object text not null unique,
  type text not null,
  size bigint not null,
  added_by text not null,
  added_at timestamptz not null default now()
);
create index record_documents_record on record_documents (record_id, added_at);

-- Who read or changed what: records (opened, changed, documents), the staff
-- register (read, downloaded), and HR's changes to people's job details.
-- Field names only, never their values. Kept two years.
create table journal (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null check (action in ('viewed', 'created', 'changed', 'linked', 'document_added', 'document_opened', 'document_removed', 'register_viewed', 'register_exported', 'profile_changed')),
  record_id bigint references records (id) on delete cascade,
  member_id text,
  fields text[] not null default '{}'
);
create index journal_record on journal (record_id, at) where record_id is not null;
create index journal_member on journal (member_id, at) where member_id is not null;
