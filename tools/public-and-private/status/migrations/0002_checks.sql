-- Checks run by the Chest (Proposal (studio): checks). An editor gives a
-- component a web address to watch; the Chest probes it and posts each
-- result. Nothing here is ever shown to customers as an incident by
-- itself: after three failures in a row the editors are told, and a person
-- decides.

-- The address watched for a component, and how. name is the check's name
-- at the Chest ("c-<component id>").
create table watches (
  component_id bigint primary key references components (id) on delete cascade,
  name text not null unique check (name ~ '^[a-z][a-z0-9-]{0,31}$'),
  url text not null check (char_length(url) between 9 and 2000),
  every integer not null default 5 check (every between 1 and 60),
  expect_status integer not null default 200 check (expect_status between 100 and 599),
  max_ms integer not null default 3000 check (max_ms between 100 and 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Each result the Chest posted, once (its id), kept 90 days.
create table check_results (
  id text primary key check (id ~ '^chk_[a-z2-7]{26}$'),
  component_id bigint not null references components (id) on delete cascade,
  at timestamptz not null,
  ok boolean not null,
  status integer,
  ms integer not null,
  error text check (error is null or error in ('timeout', 'dns', 'tls', 'refused', 'status', 'slow'))
);
create index check_results_component on check_results (component_id, at desc);

-- Where each watched component stands: down_since is set once three
-- results in a row failed (the editors were told), cleared when it answers
-- again (told once more).
create table check_states (
  component_id bigint primary key references components (id) on delete cascade,
  down_since timestamptz,
  changed_at timestamptz not null default now()
);
