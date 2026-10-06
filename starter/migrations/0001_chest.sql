-- What the Chest delivered already: events and schedule runs come at least
-- once; seen (from @argentic/chest-app/db) skips one it sees again. Keep
-- this file whatever the tool becomes.
create table chest_seen (
  id text primary key,
  at timestamptz not null default now()
);

-- What a public action counted today, per browser and in all ("*"): its
-- bound (@argentic/chest-app's publicAction({ bound })). Rows older than
-- yesterday are removed as it goes.
create table chest_bounds (
  scope text not null,
  visitor text not null,
  day date not null,
  count integer not null,
  primary key (scope, visitor, day)
);
