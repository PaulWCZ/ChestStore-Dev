-- Rooms: the company's offices (floors, areas, meeting rooms, desks), where
-- each member is which working day, and the bookings of desks and rooms.
--
-- No double booking is the database's job, not the code's: exclusion
-- constraints on time ranges (tstzrange) refuse two live bookings of the
-- same desk or room that overlap, whatever runs at the same moment. They
-- need btree_gist (the equality on ids inside a GiST index), an extension
-- PostgreSQL marks "trusted": the owner of the database may create it.
create extension if not exists btree_gist;

-- The rules of the office, one row.
create table settings (
  id boolean primary key default true check (id),
  -- How many days ahead a member may book (desks and rooms).
  days_ahead integer not null default 14 check (days_ahead between 1 and 365),
  -- At most this many desk days per member and week (Monday to Sunday); null: no limit.
  max_desk_days integer check (max_desk_days between 1 and 7),
  -- A weekly room booking repeats at most this many weeks.
  repeat_weeks integer not null default 12 check (repeat_weeks between 1 and 52),
  -- The hours of the rooms' day grid, in minutes after midnight (whole hours).
  day_start integer not null default 420 check (day_start between 0 and 1380 and day_start % 60 = 0),
  day_end integer not null default 1200 check (day_end between 60 and 1440 and day_end % 60 = 0),
  -- The working days (ISO: 1 = Monday … 7 = Sunday).
  weekdays integer[] not null default '{1,2,3,4,5}' check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'),
  -- Past bookings and presence are deleted after this many months.
  keep_months integer not null default 12 check (keep_months between 1 and 60),
  constraint day_window check (day_end > day_start)
);
insert into settings default values;

create table offices (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  address text not null default '' check (char_length(address) <= 200),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table floors (
  id bigint generated always as identity primary key,
  office_id bigint not null references offices (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position integer not null default 0
);
create index floors_office on floors (office_id);

-- A part of a floor where desks are: "Open space", "Quiet zone".
create table areas (
  id bigint generated always as identity primary key,
  floor_id bigint not null references floors (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position integer not null default 0
);
create index areas_floor on areas (floor_id);

-- A room that is removed while it has bookings is archived: its history stays.
create table rooms (
  id bigint generated always as identity primary key,
  floor_id bigint not null references floors (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  capacity integer not null check (capacity between 1 and 999),
  equipment text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 200),
  photo text,
  position integer not null default 0,
  archived_at timestamptz
);
create index rooms_floor on rooms (floor_id);

create table desks (
  id bigint generated always as identity primary key,
  area_id bigint not null references areas (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  features text[] not null default '{}',
  -- A desk given to one person for good: nobody else books it.
  assigned_to text check (assigned_to ~ '^mbr_[a-z2-7]{26}$'),
  position integer not null default 0,
  archived_at timestamptz
);
create index desks_area on desks (area_id);
create unique index desks_assigned on desks (assigned_to) where assigned_to is not null and archived_at is null;

-- Where a member is on a working day. No row: they did not say.
create table presence (
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  day date not null,
  status text not null check (status in ('office', 'remote', 'off')),
  office_id bigint references offices (id) on delete set null,
  primary key (member_id, day)
);
create index presence_day on presence (day, status);

-- The office a member works from, chosen once.
create table member_prefs (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  office_id bigint references offices (id) on delete set null
);

-- A desk for a day, a morning (before noon) or an afternoon, in the Chest's
-- time zone; during is that span as instants. A cancelled booking is kept a
-- day (for undo), then purged.
create table desk_bookings (
  id bigint generated always as identity primary key,
  desk_id bigint not null references desks (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  day date not null,
  part text not null default 'day' check (part in ('day', 'am', 'pm')),
  during tstzrange not null check (not isempty(during)),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text,
  -- Nobody else on this desk at the same time.
  constraint desk_taken exclude using gist (desk_id with =, during with &&) where (cancelled_at is null),
  -- One desk per person at a time.
  constraint desk_already exclude using gist (member_id with =, during with &&) where (cancelled_at is null and member_id <> 'erased')
);
create index desk_bookings_day on desk_bookings (day) where cancelled_at is null;
create index desk_bookings_member on desk_bookings (member_id, day);

-- The occurrences of a weekly booking share a series number.
create sequence room_series;

create table room_bookings (
  id bigint generated always as identity primary key,
  room_id bigint not null references rooms (id) on delete cascade,
  -- Who booked it (the organiser).
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  title text not null default '' check (char_length(title) <= 120),
  day date not null,
  during tstzrange not null check (not isempty(during)),
  series bigint,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text,
  constraint room_taken exclude using gist (room_id with =, during with &&) where (cancelled_at is null)
);
create index room_bookings_day on room_bookings (day) where cancelled_at is null;
create index room_bookings_member on room_bookings (member_id, day);
create index room_bookings_series on room_bookings (series) where series is not null;

-- The people invited to a room booking (told through the bell).
create table room_attendees (
  booking_id bigint not null references room_bookings (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  primary key (booking_id, member_id)
);
create index room_attendees_member on room_attendees (member_id);

-- The Chest's lifecycle events already handled (delivered at least once).
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
