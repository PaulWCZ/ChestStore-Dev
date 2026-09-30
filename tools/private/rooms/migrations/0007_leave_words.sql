-- The latest word of the Leave tool per request (Proposal (studio): events
-- between tools). Events come at least once, not always in order: Leave
-- tells a shortened leave as leave.cancelled then leave.approved for the
-- days that remain (the same request, the same moment), and a cancellation
-- delivered after that approval must not take the remaining days back.
-- Each word is kept with when it happened (the event's occurredAt); an
-- older one delivered late changes nothing. Only the member (an id), the
-- request's reference, the time, whether it still stands and its last day.
create table leave_words (
  request text primary key check (request ~ '^[A-Za-z0-9._:-]{1,60}$'),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  told_at timestamptz not null,
  cancelled boolean not null,
  to_day date
);
create index leave_words_member on leave_words (member_id);
