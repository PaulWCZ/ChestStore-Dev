-- Round 4: approved leave in each person's Chest calendar feed (Proposal
-- (studio): "calendar"), and their busy times told to Booking (events
-- between tools: "leave.busy").

-- What was put in the Chest's calendar, so a change puts again and a leave
-- cancelled, refused after all, cut by a last day or erased is taken back.
-- key: "leave:<request id>" (the event's key at the Chest). No foreign key:
-- the request's event must be taken back whatever became of it.
-- raw: what the event is made of (its days, halves and person).
create table calendar_events (
  key text primary key check (key ~ '^leave:[1-9][0-9]{0,18}$'),
  raw text not null check (char_length(raw) <= 200),
  put_at timestamptz not null default now()
);

-- Whether the Chest took the last event ('on'), refused the calendar
-- ('off': asked again at most once an hour and every morning), or was
-- never asked ('unknown'): the home promises the calendar only when 'on'.
alter table settings
  add column calendar text not null default 'unknown' check (calendar in ('unknown', 'on', 'off')),
  add column calendar_at timestamptz;

-- The last busy times Leave told of each person (leave.busy, the snapshot
-- of lib/busy-snapshot.ts): its fingerprint, and whether it held nothing —
-- so the same times are told once, and someone with no leave is not told
-- "nothing" again every day.
create table shared_busy (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  empty boolean not null,
  told_at timestamptz not null
);
