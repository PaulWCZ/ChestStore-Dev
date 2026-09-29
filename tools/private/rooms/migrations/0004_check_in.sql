-- Check-in (the "quarter" schedule, Proposal (studio): schedules): a
-- reminder a quarter of an hour before a meeting, and — when an admin turns
-- it on — a room nobody checked in to is freed a quarter of an hour after
-- its start ("ghost meetings").
alter table settings add column check_in boolean not null default false;
alter table room_bookings add column checked_in_at timestamptz;
alter table room_bookings add column reminded_at timestamptz;
create index room_bookings_start on room_bookings (lower(during)) where cancelled_at is null;
