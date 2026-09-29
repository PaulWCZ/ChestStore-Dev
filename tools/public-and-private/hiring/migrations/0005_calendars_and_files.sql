-- The interviewers' other calendars, files sent to candidates, lunch.
-- Earlier versions keep working: new tables, new columns with defaults.

-- What another tool of the Chest told Hiring of a member's busy times
-- (Proposal (studio): events between tools — booking.busy, a host's
-- bookings, blocked times and Google/Outlook/Apple calendars): the latest
-- snapshot of each tool for each member — when it was taken (an older one
-- arriving late is ignored), the days it covers — and its spans, times
-- only. A candidate is never offered those times; nothing of them is ever
-- told again to another tool.
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

-- What Hiring last told the other tools of a member's interviews
-- (hiring.busy): the snapshot's fingerprint, so an unchanged one is not
-- told again.
create table shared_busy (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  hash text not null check (char_length(hash) = 64),
  told_at timestamptz not null default now()
);

-- A link to choose an interview time leaves out lunch (12:00–14:00 in the
-- Chest's zone) unless the recruiter asks for it. Links made before stay
-- as they were.
alter table interview_requests add column skip_lunch boolean not null default false;

-- A template may carry files (the offer letter): each a file of the
-- tool's (templates/…), {file, name, type, size}. An email written to a
-- candidate keeps its files in messages.attachments (sent/…), like those
-- a candidate's answer brings (mail/…).
alter table templates add column attachments jsonb not null default '[]'
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);
