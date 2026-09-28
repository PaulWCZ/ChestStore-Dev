-- Status: the company's public status page. Components (and groups of
-- components), incidents with their timeline of updates, planned
-- maintenance, and the people who asked to be told by email.

-- A component is something customers use ("Checkout"); a group gathers
-- components under one name ("Online shop"). One level only: a group holds
-- components, a component holds nothing.
create table components (
  id bigint generated always as identity primary key,
  kind text not null default 'component' check (kind in ('component', 'group')),
  parent_id bigint references components (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 200),
  position integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (parent_id is null or kind = 'component'),
  check (parent_id is null or parent_id <> id)
);
create index components_parent on components (parent_id, position);

-- An incident (something broke) or a planned maintenance. The status of an
-- incident is the one of its latest update; a maintenance is "scheduled"
-- until it is completed early or cancelled — "in progress" is read from
-- the clock, never stored.
create table incidents (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('incident', 'maintenance')),
  title text not null check (char_length(title) between 1 and 160),
  status text not null check (status in ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled', 'completed', 'cancelled')),
  -- incident: when the first update says it began; maintenance: the window's start.
  started_at timestamptz not null,
  -- maintenance: the window's end.
  ends_at timestamptz,
  -- incident: resolved; maintenance: completed early, or cancelled.
  resolved_at timestamptz,
  -- maintenance: post "started" and "completed" updates by themselves.
  auto_posts boolean not null default false,
  start_posted boolean not null default false,
  end_posted boolean not null default false,
  -- incident: entered after the fact (no bell, no email).
  backfilled boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by text,
  check ((kind = 'incident' and ends_at is null) or (kind = 'maintenance' and ends_at is not null and ends_at > started_at)),
  check ((kind = 'incident' and status in ('investigating', 'identified', 'monitoring', 'resolved')) or (kind = 'maintenance' and status in ('scheduled', 'completed', 'cancelled')))
);
create index incidents_started on incidents (started_at desc) where removed_at is null;
create index incidents_open on incidents (kind, status) where removed_at is null;

-- The components a maintenance takes down.
create table maintenance_components (
  incident_id bigint not null references incidents (id) on delete cascade,
  component_id bigint not null references components (id) on delete cascade,
  primary key (incident_id, component_id)
);

-- One entry of a timeline. posted_at is the time shown (a backfilled
-- incident's updates are in the past); author 'auto' is the tool itself (a
-- maintenance that started by the clock), 'erased' someone whose data was
-- erased — the text stays: it was public.
create table updates (
  id bigint generated always as identity primary key,
  incident_id bigint not null references incidents (id) on delete cascade,
  status text not null check (status in ('investigating', 'identified', 'monitoring', 'resolved', 'scheduled', 'in_progress', 'update', 'completed', 'cancelled')),
  body text not null check (char_length(body) between 1 and 5000),
  posted_at timestamptz not null,
  author text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  removed_at timestamptz,
  removed_by text
);
create index updates_incident on updates (incident_id, posted_at, id);

-- The state of each affected component as of an update of an incident: the
-- whole picture at that moment (a component left out is operational again).
create table update_states (
  update_id bigint not null references updates (id) on delete cascade,
  component_id bigint not null references components (id) on delete cascade,
  state text not null check (state in ('degraded', 'partial', 'major')),
  primary key (update_id, component_id)
);
create index update_states_component on update_states (component_id);

-- What was changed or removed, and by whom: a status page is evidence
-- (service credits), its history is never silently rewritten.
create table update_log (
  id bigint generated always as identity primary key,
  update_id bigint not null references updates (id) on delete cascade,
  action text not null check (action in ('edited', 'removed', 'restored')),
  previous_body text not null,
  actor text not null,
  at timestamptz not null default now()
);
create index update_log_update on update_log (update_id, at);

-- People who asked to be told by email. Only what the job needs: the
-- address, the language of the emails, the components they follow (null:
-- all). token opens their page (confirm, choose, unsubscribe): it grants
-- nothing else.
create table subscribers (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 3 and 254),
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  components bigint[],
  token text not null unique check (char_length(token) = 32),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirm_sent_at timestamptz
);
create unique index subscribers_email on subscribers (lower(email));

-- Emails to send about an update, one per subscriber: sent right after the
-- update is posted, the rest by the "updates" schedule when the Chest's
-- daily quota stopped them.
create table mail_queue (
  id bigint generated always as identity primary key,
  subscriber_id bigint not null references subscribers (id) on delete cascade,
  update_id bigint not null references updates (id) on delete cascade,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  unique (subscriber_id, update_id)
);

-- The public form's counters: per visitor (a hash of their address) and
-- for everyone, per hour.
create table form_counts (
  key text not null,
  hour timestamptz not null,
  count integer not null default 0,
  primary key (key, hour)
);

create table settings (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value jsonb not null
);

create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
