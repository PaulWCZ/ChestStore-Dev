-- Rooms, round 3 of the critique: visitors (someone without a Chest
-- account coming to see a person of the company) and the reception's day.
--
-- A visit is announced by its host (a member) or by the reception (an
-- office manager, an admin): who comes (a name, a company), on which day,
-- at what time, to which office, to see whom. The reception marks the
-- arrival and the host hears it in the bell. The visitor's name and
-- company are the only data about someone outside the Chest: they are
-- seen by the host, whoever announced the visit and the reception, never
-- by other members, and they go with the past bookings (the rules'
-- "keep past bookings").
create table visits (
  id bigint generated always as identity primary key,
  office_id bigint references offices (id) on delete cascade,
  day date not null,
  -- Expected at, in minutes of the day (quarter hours), in the Chest's zone.
  at_minute integer not null check (at_minute between 0 and 1439),
  name text not null check (char_length(name) between 1 and 120),
  company text not null default '' check (char_length(company) <= 120),
  host text not null check (host ~ '^mbr_[a-z2-7]{26}$' or host = 'erased'),
  created_by text not null check (created_by ~ '^mbr_[a-z2-7]{26}$' or created_by = 'erased'),
  arrived_at timestamptz,
  arrived_by text check (arrived_by is null or arrived_by ~ '^mbr_[a-z2-7]{26}$' or arrived_by = 'erased'),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index visits_day on visits (day, office_id) where cancelled_at is null;
create index visits_host on visits (host, day);
