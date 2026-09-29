-- Busy times from outside Booking, and what hosts asked for next. Earlier
-- versions keep working: new tables, new columns with defaults.

-- A time the host blocks by hand ("Dentist", "Team lunch"): no booking in
-- it. Only the host sees the note.
create table blocks (
  id bigint generated always as identity primary key,
  member_id text not null references hosts (member_id) on delete cascade,
  span tstzrange not null check (not isempty(span)),
  note text not null default '' check (char_length(note) <= 80),
  created_at timestamptz not null default now()
);
create index blocks_host on blocks using gist (member_id, span);

-- The host's other calendars (Google, Outlook, Apple), by their secret
-- iCal address, read through the Chest's declared network (chest.json
-- "network"). The address is a secret: it is used to read, never shown
-- again in full, and deleted with the host.
create table calendars (
  id bigint generated always as identity primary key,
  member_id text not null references hosts (member_id) on delete cascade,
  url text not null check (char_length(url) between 12 and 2000),
  -- Where it comes from, to show ("calendar.google.com").
  provider text not null check (char_length(provider) <= 253),
  added_at timestamptz not null default now(),
  -- The last try, the last good read, and what went wrong since (null:
  -- nothing).
  tried_at timestamptz,
  read_at timestamptz,
  error text check (error in ('unreachable', 'refused', 'not_found', 'not_calendar', 'too_large')),
  events integer not null default 0,
  unique (member_id, url)
);

-- What those calendars say: busy from … to …, nothing else (no title, no
-- place, no person).
create table busy (
  calendar_id bigint not null references calendars (id) on delete cascade,
  member_id text not null,
  span tstzrange not null
);
create index busy_host on busy using gist (member_id, span);
create index busy_calendar on busy (calendar_id);

-- At most this many meetings a day for the host, all types together (0: no
-- limit); an email to the host with each booking's calendar file.
alter table hosts add column daily_max integer not null default 0 check (daily_max between 0 and 50);
alter table hosts add column email_me boolean not null default true;

-- A video call in a room of its own for each booking (the location is then
-- the address rooms are made under, "https://meet.jit.si/"); a payment link
-- shown to the guest once booked; other hosts who take this type too (any
-- of them who is free: round robin), member ids.
alter table types add column video_rooms boolean not null default false;
alter table types add column payment_link text not null default '' check (char_length(payment_link) <= 300);
alter table types add column pool jsonb not null default '[]'::jsonb
  check (jsonb_typeof(pool) = 'array' and jsonb_array_length(pool) <= 10);

-- The booking's own video room; who made it (the guest on the page, a host
-- for them, an import) and which member of the team, if a host; paid or
-- not when the type asks for a payment; the row of an imported file, so
-- importing again adds nothing twice.
alter table bookings add column video_link text not null default '' check (char_length(video_link) <= 400);
alter table bookings add column source text not null default 'page' check (source in ('page', 'host', 'import'));
alter table bookings add column booked_by text check (booked_by ~ '^mbr_[a-z2-7]{26}$');
alter table bookings add column payment_link text not null default '' check (char_length(payment_link) <= 300);
alter table bookings add column paid boolean not null default false;
alter table bookings add column import_ref text check (char_length(import_ref) <= 64);
create unique index bookings_import on bookings (member_id, import_ref) where import_ref is not null;
