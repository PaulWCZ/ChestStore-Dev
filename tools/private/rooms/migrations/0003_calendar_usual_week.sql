-- Rooms, after the critique: the members' calendars, the usual week, lent
-- desks, rooms and areas kept for a group, and a booking's revisions.

-- ---------- The members' calendars (Proposal (studio): calendar) ----------
--
-- Each room booking and each day at the office is an event in the Chest's
-- calendar feed of the people concerned. A change writes the key of what
-- changed here, in the same transaction; the tool then puts (or removes)
-- each queued key, from what the database holds at that moment. A Chest
-- that does not answer leaves the key queued: nothing is lost, it is sent
-- on the next change or page read.
create table calendar_queue (
  key text primary key check (key ~ '^[A-Za-z0-9._:-]{1,64}$'),
  queued_at timestamptz not null default now()
);

-- Whether this Chest keeps calendars: unknown until asked, on, or off (a
-- Chest without the calendar: the tool then offers its .ics files only and
-- asks again at most once an hour).
alter table settings add column calendar text not null default 'unknown' check (calendar in ('unknown', 'on', 'off'));
alter table settings add column calendar_tried timestamptz;

-- A booking's changes, for the .ics file and the email sent to its guests
-- (SEQUENCE and DTSTAMP: a calendar replaces the older version).
alter table room_bookings add column revision integer not null default 0;
alter table room_bookings add column changed_at timestamptz not null default now();

-- What was booked before this version goes to the calendars too.
insert into calendar_queue (key)
select 'room:' || id from room_bookings where cancelled_at is null and upper(during) > now()
on conflict do nothing;
insert into calendar_queue (key)
select distinct 'day:' || member_id || ':' || to_char(day, 'YYYY-MM-DD') from (
  select member_id, day from presence where status = 'office' and day >= current_date
  union
  select member_id, day from desk_bookings where cancelled_at is null and upper(during) > now() and member_id <> 'erased'
) s
on conflict do nothing;

-- ---------- The usual week ----------
--
-- Where a member usually is on each working day. When a day comes within
-- the booking window, the tool says it for them (and books their usual
-- desk) — once: a day the person changed is theirs, never overwritten.
create table usual_week (
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  weekday integer not null check (weekday between 1 and 7),
  status text not null check (status in ('office', 'remote', 'off')),
  primary key (member_id, weekday)
);

-- The days the usual week was already applied to, per member.
create table usual_applied (
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  day date not null,
  primary key (member_id, day)
);

-- The desk booked on usual office days; whether a given desk is lent to
-- others on the days its holder is away (yes unless they say no).
alter table member_prefs add column usual_desk bigint references desks (id) on delete set null;
alter table member_prefs add column lend_desk boolean not null default true;

-- What the usual week said and booked (so changing it changes only that).
alter table presence add column usual boolean not null default false;
alter table desk_bookings add column usual boolean not null default false;

-- ---------- Lent desks ----------
--
-- A desk given to someone may be booked by another person on a day its
-- holder is remote or off: that booking says so, and is cancelled if the
-- desk changes hands.
alter table desk_bookings add column lent boolean not null default false;

-- ---------- Rooms and areas kept for a group ----------
--
-- A Chest group ("Sales", "Managers"): only its members (and admins) book
-- there. Null: everyone.
alter table rooms add column group_id text check (group_id is null or group_id ~ '^grp_[a-z2-7]{26}$');
alter table areas add column group_id text check (group_id is null or group_id ~ '^grp_[a-z2-7]{26}$');
