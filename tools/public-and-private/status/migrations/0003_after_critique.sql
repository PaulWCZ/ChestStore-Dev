-- After the critique: texts in a second language, post-mortems, templates,
-- services for the team only, imports from Statuspage, heartbeats.

-- An incident's texts are written in `language` (the Chest's language when
-- it was posted; null for incidents posted before: read as the Chest's
-- language). An editor may add a version in `second_language` — its title
-- here, each update's text in updates.body_second — shown to visitors who
-- read that language.
alter table incidents add column language text check (language is null or language ~ '^[a-z]{2}$');
alter table incidents add column second_language text check (second_language is null or second_language ~ '^[a-z]{2}$');
alter table incidents add column title_second text check (title_second is null or char_length(title_second) between 1 and 160);
alter table incidents add check (second_language is null or second_language <> coalesce(language, ''));
alter table updates add column body_second text check (body_second is null or char_length(body_second) between 1 and 5000);
-- A correction of the second text is logged like one of the first.
alter table update_log add column second boolean not null default false;

-- A post-mortem ("what happened and what we changed") is an update of its
-- own step, after the incident is resolved: at most one visible per
-- incident; corrected and removed like any update, so it is logged too.
alter table updates drop constraint updates_status_check;
alter table updates add constraint updates_status_check check (status in ('investigating', 'identified', 'monitoring', 'resolved', 'postmortem', 'scheduled', 'in_progress', 'update', 'completed', 'cancelled'));
create unique index updates_one_postmortem on updates (incident_id) where status = 'postmortem' and removed_at is null;

-- An incident imported from another status page keeps the id it had there,
-- so importing the same file twice adds nothing.
alter table incidents add column source_id text check (source_id is null or char_length(source_id) between 1 and 80);
create unique index incidents_source on incidents (source_id) where source_id is not null;

-- Wording prepared in calm times ("Payments are slow"): a title, a text
-- (and their second version), the services and how badly.
create table templates (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  title_second text check (title_second is null or char_length(title_second) between 1 and 160),
  body_second text check (body_second is null or char_length(body_second) between 1 and 5000),
  states jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- A service the team follows but customers never see (the office network,
-- the intranet): shown on the members' status page only; an incident that
-- touches nothing else never reaches the public page, its feeds, its API or
-- its subscribers.
alter table components add column team_only boolean not null default false;

-- A heartbeat: a job of the company (a nightly backup, an import) calls a
-- secret address after each run; silence longer than `every` minutes (plus
-- a grace) is a failure, told to the editors like a failed check. token is
-- stored hashed (SHA-256, hex); the address is shown once.
create table heartbeats (
  component_id bigint primary key references components (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  every integer not null check (every between 5 and 10080),
  grace integer not null default 5 check (grace between 1 and 1440),
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  down_since timestamptz
);
