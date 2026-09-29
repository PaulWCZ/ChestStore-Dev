-- Busy times shared with the other tools of the Chest (Proposal (studio):
-- events between tools). Earlier versions keep working: new tables only.

-- What Booking last told the other tools of a host's busy times
-- (booking.busy): the snapshot's fingerprint, so an unchanged one is not
-- told again, and when it was told.
create table shared_busy (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  hash text not null check (char_length(hash) = 64),
  told_at timestamptz not null default now()
);

-- What another tool told Booking of a member's busy times (hiring.busy: the
-- interviews they are on): the latest snapshot of each tool for each
-- member — when it was taken (an older one arriving late is ignored), the
-- days it covers — and its busy spans, times only (never a candidate, a
-- title or a place). Nothing is offered on those times; nothing of them
-- is ever told again to another tool.
create table told_busy (
  source text not null check (source ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(source) <= 63),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  taken_at timestamptz not null,
  period tstzrange not null,
  primary key (source, member_id)
);

create table told_spans (
  source text not null,
  member_id text not null,
  span tstzrange not null check (not isempty(span)),
  foreign key (source, member_id) references told_busy (source, member_id) on delete cascade
);
create index told_spans_member on told_spans using gist (member_id, span);
create index told_spans_owner on told_spans (source, member_id);
