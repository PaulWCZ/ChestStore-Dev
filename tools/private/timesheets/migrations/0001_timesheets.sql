-- Timesheets: time recorded on clients' projects. People are member ids
-- (mbr_…), never names; 'erased' stands for a person whose data was erased
-- (their time stays in the company's accounts, anonymous). Days are the
-- Chest's calendar days (its time zone), durations whole minutes.

-- The tool's settings: one row.
create table settings (
  id boolean primary key default true check (id),
  -- Everything up to this day (included) is locked: nobody changes it.
  locked_until date,
  locked_by text check (locked_by ~ '^mbr_[a-z2-7]{26}$' or locked_by = 'erased'),
  locked_at timestamptz,
  -- The Friday reminder (schedule "friday", a proposal of the SDK).
  reminder_enabled boolean not null default true,
  reminder_minutes integer not null default 2100 check (reminder_minutes between 60 and 4800)
);
insert into settings (id) values (true);

create table clients (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index clients_name on clients (lower(name));

create table projects (
  id bigint generated always as identity primary key,
  client_id bigint references clients (id),
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'teal',
  billable boolean not null default true,
  -- Hourly rate in the currency's minor unit (cents), none when null.
  rate_cents bigint check (rate_cents between 0 and 100000000),
  budget_kind text not null default 'none' check (budget_kind in ('none', 'hours', 'money')),
  budget_minutes integer check (budget_minutes between 1 and 6000000),
  budget_cents bigint check (budget_cents between 1 and 100000000000),
  -- Everyone may record time on it, or only the people named in project_people.
  everyone boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint budget_shape check (
    (budget_kind = 'none' and budget_minutes is null and budget_cents is null)
    or (budget_kind = 'hours' and budget_minutes is not null and budget_cents is null)
    or (budget_kind = 'money' and budget_cents is not null and budget_minutes is null))
);
create unique index projects_name on projects (coalesce(client_id, 0), lower(name));

create table tasks (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects (id),
  name text not null check (char_length(name) between 1 and 60),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index tasks_name on tasks (project_id, lower(name));

create table project_people (
  project_id bigint not null references projects (id),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  primary key (project_id, member_id)
);
create index project_people_member on project_people (member_id);

-- A piece of time: someone, a project (and a task), a day, minutes. From
-- the timer it also keeps when it started and ended. A deleted entry stays
-- 30 days (deleted_at) for "Undo", then is purged on a later request.
create table entries (
  id bigint generated always as identity primary key,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  project_id bigint not null references projects (id),
  task_id bigint references tasks (id),
  day date not null,
  minutes integer not null check (minutes between 1 and 1440),
  note text not null default '' check (char_length(note) <= 500),
  billable boolean not null,
  started_at timestamptz,
  ended_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'grid', 'timer', 'import')),
  -- An imported row's fingerprint: importing the same file twice adds nothing.
  import_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint times_in_order check (ended_at is null or started_at is null or ended_at > started_at)
);
create index entries_member_day on entries (member_id, day) where deleted_at is null;
create index entries_day on entries (day) where deleted_at is null;
create index entries_project on entries (project_id) where deleted_at is null;
create unique index entries_import on entries (import_key) where import_key is not null;

-- The rows someone keeps in a week's grid, even before any time is in them
-- (added, or copied from the week before). The week is its Monday.
create table week_rows (
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  week date not null check (extract(isodow from week) = 1),
  project_id bigint not null references projects (id),
  task_id bigint not null default 0,
  primary key (member_id, week, project_id, task_id)
);

-- The one running timer of each person.
create table timers (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  project_id bigint not null references projects (id),
  task_id bigint references tasks (id),
  note text not null default '' check (char_length(note) <= 500),
  started_at timestamptz not null
);

-- The events of the members' lifecycle already handled (events.handle):
-- the Chest delivers at least once.
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
