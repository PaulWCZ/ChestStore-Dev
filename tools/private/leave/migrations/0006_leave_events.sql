-- Round 5: what Rooms and People are told of approved leave (events between
-- tools: "leave.approved" / "leave.cancelled") follows every change — an
-- answer, a leave taken back, and a last day that cuts or cancels leave
-- (HR's, People's or the Chest's own) — and waits while the Chest cannot
-- take it.

-- Each absence the other tools were told stands, as they were told it:
-- raw is "from|to|fromHalf|toHalf" ('unknown' for leave approved before
-- this version: told again once, so a leave cut before it is put right).
-- No foreign key: what was told must be taken back whatever became of the
-- request.
create table shared_leave (
  request_id bigint primary key,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  raw text not null check (raw = 'unknown' or raw ~ '^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}\|(am|pm)\|(am|pm)$'),
  told_at timestamptz not null default now()
);

-- The events waiting to be published, and those published in the last day
-- (the key of each is "leave:<request>:<approved|cancelled>:<id>": the same
-- event tried again is one event for the Chest).
create table leave_outbox (
  id bigint generated always as identity primary key,
  type text not null check (type in ('leave.approved', 'leave.cancelled')),
  data jsonb not null check (octet_length(data::text) <= 1024),
  at timestamptz not null default now(),
  published_at timestamptz
);
create index leave_outbox_waiting on leave_outbox (id) where published_at is null;

insert into shared_leave (request_id, member_id, raw)
  select id, member_id, 'unknown' from requests
  where status = 'approved' and member_id ~ '^mbr_[a-z2-7]{26}$' and end_date >= current_date - 1;
