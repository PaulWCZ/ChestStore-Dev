-- Timesheets 2: rates with a history (billable per project, per person and
-- per person on a project; cost per person), each week submitted and
-- approved, people's usual week, budget alerts, invoiced time, the time of
-- people who left before the Chest (imported), and the company's choices
-- for approvals and how hours are written. The previous version keeps
-- working on this schema: projects.rate_cents stays, and holds the
-- project's rate in force today.

-- Rates: an hourly rate from a day on (included), until the next one of
-- the same kind and target. An amount is computed with the rate in force on
-- the entry's day: a new rate never changes the past. A row without a rate
-- (rate_cents null) ends the one before it from that day.
--   bill + project_id                → the project's rate, for everyone
--   bill + member_id                 → a person's usual rate
--   bill + project_id and member_id  → a person's rate on that project
--   cost + member_id                 → what an hour of that person costs
create table rates (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('bill', 'cost')),
  project_id bigint references projects (id),
  member_id text check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  from_day date not null,
  rate_cents bigint check (rate_cents between 0 and 100000000),
  set_by text check (set_by ~ '^mbr_[a-z2-7]{26}$' or set_by = 'erased'),
  set_at timestamptz not null default now(),
  constraint rate_target check (
    (kind = 'bill' and (project_id is not null or member_id is not null))
    or (kind = 'cost' and project_id is null and member_id is not null))
);
create unique index rates_key on rates (kind, coalesce(project_id, 0), coalesce(member_id, ''), from_day);
create index rates_member on rates (member_id) where member_id is not null;

-- Every rate the previous version knew applied since always.
insert into rates (kind, project_id, from_day, rate_cents)
select 'bill', id, date '2000-01-01', rate_cents from projects where rate_cents is not null;

-- The rate in force for a person on a project on a day: theirs on that
-- project, else the project's, else their usual one; null without any.
create function bill_rate(person text, project bigint, on_day date) returns bigint language sql stable as $$
  select coalesce(
    (select rate_cents from rates where kind = 'bill' and project_id = project and member_id = person and from_day <= on_day order by from_day desc limit 1),
    (select rate_cents from rates where kind = 'bill' and project_id = project and member_id is null and from_day <= on_day order by from_day desc limit 1),
    (select rate_cents from rates where kind = 'bill' and project_id is null and member_id = person and from_day <= on_day order by from_day desc limit 1))
$$;
create function cost_rate(person text, on_day date) returns bigint language sql stable as $$
  select rate_cents from rates where kind = 'cost' and project_id is null and member_id = person and from_day <= on_day order by from_day desc limit 1
$$;

-- An entry keeps its own rates once they must never move again: invoiced,
-- imported with the old tool's rates, or its author's data erased.
alter table entries
  add column rates_fixed boolean not null default false,
  add column bill_rate_cents bigint check (bill_rate_cents between 0 and 100000000),
  add column cost_rate_cents bigint check (cost_rate_cents between 0 and 100000000),
  add column invoiced_at timestamptz,
  add column invoiced_by text check (invoiced_by ~ '^mbr_[a-z2-7]{26}$' or invoiced_by = 'erased');

-- People who left before the Chest, whose time came with an import: their
-- name as the old tool wrote it; their entries' author is 'imp_<id>'. They
-- are no members: nobody signs in as them, their time is read-only.
create table former_people (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create unique index former_people_name on former_people (lower(name));

alter table entries drop constraint entries_member_id_check;
alter table entries add constraint entries_member_id_check
  check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased' or member_id ~ '^imp_[1-9][0-9]{0,17}$');
create index entries_invoiced on entries (day) where deleted_at is null and invoiced_at is null and billable;

-- A person's week sent for approval: submitted (read-only for them until a
-- manager decides), approved (locked), or returned with a word.
create table weeks (
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  week date not null check (extract(isodow from week) = 1),
  status text not null check (status in ('submitted', 'approved', 'returned')),
  minutes integer not null default 0 check (minutes >= 0),
  submitted_at timestamptz not null default now(),
  decided_by text check (decided_by ~ '^mbr_[a-z2-7]{26}$' or decided_by = 'erased'),
  decided_at timestamptz,
  reason text not null default '' check (char_length(reason) <= 300),
  primary key (member_id, week)
);
create index weeks_status on weeks (status, week);

-- A person's usual week (their capacity), when it is not the company's.
create table people (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  week_minutes integer not null check (week_minutes between 0 and 6000)
);

-- The budget thresholds a project already crossed (80 and 100 %), so that
-- managers hear of each once; forgotten when the project falls back under.
create table budget_alerts (
  project_id bigint not null references projects (id),
  level integer not null check (level in (80, 100)),
  sent_at timestamptz not null default now(),
  primary key (project_id, level)
);

alter table settings
  add column approvals boolean not null default true,
  add column hours_style text not null default 'clock' check (hours_style in ('clock', 'decimal'));
