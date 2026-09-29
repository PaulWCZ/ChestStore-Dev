-- Candidates choose their own interview time. A recruiter sends a link:
-- the people who will meet them, a length, a range of days and hours; the
-- candidate's page offers the times when all of those people are free (by
-- the tool's own interviews), and the time they choose becomes an
-- interview like any other (email with an .ics, the interviewers' Chest
-- calendars).

create table interview_requests (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references candidates (id) on delete cascade,
  -- The link's secret is never stored: its SHA-256, base64url.
  token_hash text not null unique check (char_length(token_hash) = 43),
  minutes integer not null check (minutes in (15, 30, 45, 60, 90, 120, 180)),
  first_day date not null,
  last_day date not null,
  -- The hours offered each day, minutes after midnight in the Chest's zone.
  day_start integer not null check (day_start between 0 and 1439),
  day_end integer not null check (day_end between 1 and 1440),
  place text not null default '' check (char_length(place) <= 200),
  note text not null default '' check (char_length(note) <= 2000),
  created_by text not null check (created_by ~ '^mbr_[a-z2-7]{26}$' or created_by = 'erased'),
  created_at timestamptz not null default now(),
  interview_id bigint references interviews (id) on delete set null,
  booked_at timestamptz,
  cancelled_at timestamptz,
  constraint request_days check (last_day >= first_day and last_day <= first_day + 31),
  constraint request_hours check (day_end > day_start)
);
create index interview_requests_candidate on interview_requests (candidate_id, created_at);

create table interview_request_people (
  request_id bigint not null references interview_requests (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  primary key (request_id, member_id)
);
create index interview_request_people_member on interview_request_people (member_id);

alter table messages drop constraint messages_kind_check;
alter table messages add constraint messages_kind_check check (kind in ('message', 'rejection', 'interview', 'interview_cancelled', 'confirmation', 'interview_request'));

alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check check (kind in (
  'applied', 'added', 'moved', 'rejected', 'restored', 'note', 'feedback', 'asked', 'emailed', 'cv',
  'wrote', 'replied', 'interview', 'interview_moved', 'interview_cancelled', 'considered', 'imported', 'written_outside',
  'interview_link', 'interview_chosen', 'interview_link_cancelled'));
