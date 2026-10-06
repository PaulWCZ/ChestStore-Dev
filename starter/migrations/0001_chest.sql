-- What the Chest delivered already: events and schedule runs come at least
-- once; seen (from @argentic/chest-app/db) skips one it sees again. Keep
-- this file whatever the tool becomes.
create table chest_seen (
  id text primary key,
  at timestamptz not null default now()
);
