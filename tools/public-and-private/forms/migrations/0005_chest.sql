-- Forms, fifth step: the package's guard of the public forms
-- (@argentic/chest-app, publicAction's bound) and its record of what the
-- Chest delivered.
--
-- chest_bounds counts a public action's calls a day, per visitor (the
-- address the Chest's front gives, else the browser's cookie), per form
-- and for everyone; chest_seen keeps the form tokens already used (each
-- serves once) and the events and schedule runs already handled.
-- form_counts (the tool's own counters before) and chest_events (its
-- record of events before) are no longer written; they stay for the
-- previous version, and go in a later step.
create table chest_bounds (
  scope text not null,
  visitor text not null,
  day date not null,
  count integer not null,
  primary key (scope, visitor, day)
);

create table chest_seen (
  id text primary key,
  at timestamptz not null default now()
);
