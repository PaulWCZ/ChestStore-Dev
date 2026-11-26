-- Polls, sixth step: the package's guard of the guest form
-- (@argentic/chest-app 0.1.0-studio.3, publicAction's bound).
--
-- chest_bounds counts a public action's calls a day, per visitor and for
-- everyone; chest_seen keeps the form tokens already used (each serves
-- once). guest_counts, the tool's own counters before, is no longer
-- written; it stays for the previous version, and goes in a later step.
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
