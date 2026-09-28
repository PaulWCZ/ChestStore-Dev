-- Hiring: jobs published on the careers page, the candidates who apply, and
-- the team's work on them (stages, notes, feedback). People of the team are
-- member ids (mbr_…), never names or addresses; 'erased' once the Chest
-- erased them. Candidates are not members: their name and address are the
-- candidate's own data, kept at most the retention (2 years after their last
-- activity by default, CNIL) and erased on request.

-- The careers page's settings: company name, intro, open or closed,
-- retention in months.
create table settings (
  key text primary key,
  value jsonb not null
);

create table jobs (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 120),
  team text not null default '' check (char_length(team) <= 80),
  place text not null default '' check (char_length(place) <= 120),
  contract text not null check (contract in ('permanent', 'fixed_term', 'internship', 'apprenticeship', 'freelance')),
  remote text not null check (remote in ('onsite', 'hybrid', 'remote')),
  description text not null default '' check (char_length(description) <= 20000),
  -- The language the job is written in (its page and emails to its candidates).
  language text not null default 'en' check (language in ('en', 'fr')),
  salary_min integer check (salary_min is null or salary_min between 0 and 100000000),
  salary_max integer check (salary_max is null or salary_max between 0 and 100000000),
  salary_currency text not null default 'EUR' check (salary_currency in ('EUR', 'GBP', 'USD', 'CHF', 'CAD')),
  salary_period text not null default 'year' check (salary_period in ('year', 'month', 'hour')),
  salary_shown boolean not null default true,
  state text not null default 'draft' check (state in ('draft', 'open', 'closed')),
  created_by text not null check (created_by ~ '^mbr_[a-z2-7]{26}$' or created_by = 'erased'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz,
  constraint salary_order check (salary_min is null or salary_max is null or salary_min <= salary_max)
);
create index jobs_state on jobs (state, opened_at desc);

-- A job's pipeline, in order. Exactly one stage of a job is "hired" (the
-- last by default); new candidates enter at the first.
create table stages (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null,
  hired boolean not null default false
);
create index stages_job on stages (job_id, position);
create unique index stages_one_hired on stages (job_id) where hired;

-- Who interviews for a job: they see its candidates and give feedback.
create table job_interviewers (
  job_id bigint not null references jobs (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  added_by text not null check (added_by ~ '^mbr_[a-z2-7]{26}$' or added_by = 'erased'),
  added_at timestamptz not null default now(),
  primary key (job_id, member_id)
);
create index job_interviewers_member on job_interviewers (member_id);

create table candidates (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs (id) on delete cascade,
  stage_id bigint not null references stages (id),
  status text not null default 'active' check (status in ('active', 'rejected')),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null default '' check (char_length(phone) <= 40),
  link text not null default '' check (char_length(link) <= 500),
  cover_letter text not null default '' check (char_length(cover_letter) <= 10000),
  -- careers: the public form; team: added by a recruiter (a referral…).
  source text not null check (source in ('careers', 'team')),
  added_by text check (added_by is null or added_by ~ '^mbr_[a-z2-7]{26}$' or added_by = 'erased'),
  -- The candidate's language: the careers page's when they applied.
  language text not null default 'en' check (language in ('en', 'fr')),
  consent_at timestamptz,
  cv_object text unique,
  cv_name text check (cv_name is null or char_length(cv_name) <= 200),
  cv_type text,
  cv_size bigint,
  stage_entered_at timestamptz not null default now(),
  reject_reason text check (reject_reason is null or reject_reason in ('experience', 'skills', 'salary', 'location', 'filled', 'withdrew', 'no_answer', 'other')),
  reject_note text check (reject_note is null or char_length(reject_note) <= 500),
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  -- The last contact or piece of work: the retention counts from here.
  last_activity_at timestamptz not null default now()
);
create index candidates_job on candidates (job_id, status, stage_id);
create index candidates_email on candidates (lower(email));
create index candidates_activity on candidates (last_activity_at);

-- Which recruiter has opened which candidate: the tile's number is the
-- applications a recruiter has not seen yet.
create table candidate_seen (
  candidate_id bigint not null references candidates (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  seen_at timestamptz not null default now(),
  primary key (candidate_id, member_id)
);
create index candidate_seen_member on candidate_seen (member_id);

create table notes (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references candidates (id) on delete cascade,
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$' or author = 'erased'),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index notes_candidate on notes (candidate_id, created_at);
create index notes_author on notes (author);

-- One feedback per person and candidate: a 1–4 rating, strengths, concerns,
-- a recommendation. Hidden from an interviewer until they gave theirs.
create table feedback (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references candidates (id) on delete cascade,
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$' or author = 'erased'),
  rating smallint not null check (rating between 1 and 4),
  strengths text not null default '' check (char_length(strengths) <= 3000),
  concerns text not null default '' check (char_length(concerns) <= 3000),
  recommendation text not null check (recommendation in ('strong_no', 'no', 'yes', 'strong_yes')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index feedback_one on feedback (candidate_id, author) where author <> 'erased';
create index feedback_author on feedback (author);

-- Who was asked for feedback on a candidate, and has not given it yet.
create table feedback_requests (
  candidate_id bigint not null references candidates (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  requested_by text not null check (requested_by ~ '^mbr_[a-z2-7]{26}$' or requested_by = 'erased'),
  requested_at timestamptz not null default now(),
  primary key (candidate_id, member_id)
);
create index feedback_requests_member on feedback_requests (member_id);

-- What happened to a candidate, in order: applied, moved, rejected, emailed…
-- actor: a member id, 'erased', or null (the candidate, or the tool).
create table activity (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references candidates (id) on delete cascade,
  actor text check (actor is null or actor ~ '^mbr_[a-z2-7]{26}$' or actor = 'erased'),
  kind text not null check (kind in ('applied', 'added', 'moved', 'rejected', 'restored', 'note', 'feedback', 'asked', 'emailed', 'cv')),
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_candidate on activity (candidate_id, created_at);
create index activity_actor on activity (actor);

-- The public form's counters (per visitor hash and hour, and 'all').
create table form_counts (
  key text not null,
  hour timestamptz not null,
  count integer not null,
  primary key (key, hour)
);

-- The events of the members' lifecycle already handled (events.handle):
-- the Chest delivers at least once.
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
