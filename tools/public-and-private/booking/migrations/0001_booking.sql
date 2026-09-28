-- Booking: hosts (members who take bookings), their booking types and
-- hours, and the bookings visitors make. Hosts are member ids (mbr_…);
-- guests are people outside the company (a name and an email).
create extension if not exists btree_gist;

create table hosts (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  -- The address of their page: /<slug>.
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  zone text not null default 'Europe/Paris',
  -- Weekly hours: 7 lists (Sunday first) of [start, end] minutes.
  weekly jsonb not null,
  listed boolean not null default true,
  -- Lost access or left the Chest: their page takes no booking.
  away boolean not null default false,
  welcome text not null default '' check (char_length(welcome) <= 300),
  -- Their calendar feed (/feed/<token>.ics): only its SHA-256.
  feed_hash text unique,
  created_at timestamptz not null default now()
);

-- A date with other hours than the week's ([] = a day off).
create table overrides (
  member_id text not null references hosts (member_id) on delete cascade,
  day date not null,
  ranges jsonb not null,
  note text not null default '' check (char_length(note) <= 80),
  primary key (member_id, day)
);

create table types (
  id bigint generated always as identity primary key,
  member_id text not null references hosts (member_id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  duration integer not null check (duration between 5 and 480),
  interval integer not null check (interval between 5 and 480),
  -- Where: in person (an address), by phone (the host calls), a video
  -- link, or to agree.
  location_kind text not null check (location_kind in ('place', 'phone', 'video', 'other')),
  location text not null default '' check (char_length(location) <= 300),
  buffer_before integer not null default 0 check (buffer_before between 0 and 240),
  buffer_after integer not null default 0 check (buffer_after between 0 and 240),
  notice_minutes integer not null default 240 check (notice_minutes between 0 and 20160),
  window_days integer not null default 45 check (window_days between 1 and 365),
  color text not null default 'sky' check (color ~ '^[a-z]{1,16}$'),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (member_id, slug)
);

create table bookings (
  id bigint generated always as identity primary key,
  type_id bigint references types (id) on delete set null,
  member_id text not null,
  -- What the guest saw, kept even if the type changes later.
  title text not null,
  duration integer not null,
  location_kind text not null,
  location text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- The time taken, buffers included: two confirmed bookings of a host
  -- never overlap (the constraint below).
  blocked tstzrange not null,
  guest_name text not null check (char_length(guest_name) between 1 and 120),
  guest_email text not null check (char_length(guest_email) between 3 and 254),
  guest_note text not null default '' check (char_length(guest_note) <= 2000),
  -- For a phone call, the number the host calls.
  guest_phone text not null default '' check (char_length(guest_phone) <= 40),
  guest_zone text not null default 'Europe/Paris',
  guest_language text not null default 'en' check (guest_language ~ '^[a-z]{2}$'),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  -- The guest's manage link (/b/<secret>), looked up by its SHA-256. The
  -- secret itself is kept for the emails written later (the reminder): it
  -- opens this booking only, whose data is in this row already.
  secret_hash text not null unique,
  secret text not null,
  cancelled_by text check (cancelled_by in ('guest', 'host')),
  cancel_reason text not null default '' check (char_length(cancel_reason) <= 500),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  -- The reminder email, sent once the day before (schedule "reminders").
  reminded_at timestamptz,
  -- Moved by the guest: how many times (a booking is moved in place).
  moves integer not null default 0,
  constraint no_double_booking exclude using gist (member_id with =, blocked with &&) where (status = 'confirmed')
);
create index bookings_host on bookings (member_id, starts_at);
create index bookings_email on bookings (lower(guest_email));

-- The public booking form's counters (anti-abuse).
create table form_counts (
  key text not null,
  hour timestamptz not null,
  count integer not null default 0,
  primary key (key, hour)
);

create table settings (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value jsonb not null
);

create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
