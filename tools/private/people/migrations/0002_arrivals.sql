-- Arrivals told by other tools (Proposal (studio): events between tools):
-- someone hired in Hiring who is not a member yet. HR may start their
-- arrival checklist before they have access, then link the arrival to the
-- member once they get the tool. Linked, an arrival keeps no personal data
-- (only which hire became which member, so a repeated event changes
-- nothing); never linked, it is deleted 90 days after its start date (or
-- after it was told, without a date). The email a hire carries is never
-- stored.
create table arrivals (
  id bigint generated always as identity primary key,
  source text not null check (source in ('hiring')),
  ref text not null check (ref ~ '^[A-Za-z0-9._:-]{1,100}$'),
  status text not null default 'expected' check (status in ('expected', 'cancelled', 'linked')),
  name text not null default '' check (char_length(name) <= 120),
  job text not null default '' check (char_length(job) <= 80),
  team text not null default '' check (char_length(team) <= 60),
  place text not null default '' check (char_length(place) <= 60),
  start_date date,
  -- Their manager-to-be, chosen by HR when starting the checklist.
  manager_id text check (manager_id ~ '^mbr_[a-z2-7]{26}$'),
  hired_by text,
  member_id text check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  told_at timestamptz not null default now(),
  cancelled_at timestamptz,
  linked_at timestamptz,
  unique (source, ref),
  check ((status = 'linked') = (member_id is not null))
);

-- A checklist is about a member, or about an arrival not linked yet.
alter table journeys alter column person_id drop not null;
alter table journeys add column arrival_id bigint references arrivals (id) on delete cascade;
alter table journeys add constraint journeys_about check (person_id is not null or arrival_id is not null);
create index journeys_arrival on journeys (arrival_id) where arrival_id is not null;
